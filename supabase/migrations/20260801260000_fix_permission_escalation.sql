-- ============================================================================
-- SECURITY FIX: a manager could grant themselves every permission.
--
-- 20260801200000_granular_permissions.sql ended with:
--     grant update (permissions) on public.profiles to authenticated;
--
-- and profiles_self_update (20260717120300) allows
--     for update using (id = auth.uid()) with check (id = auth.uid())
--
-- Together those mean any authenticated user can PATCH their OWN profile row's
-- permissions array directly against PostgREST, using nothing but the anon key
-- that ships in every browser bundle and their own session JWT. No server
-- action involved, so requireAdmin() in setUserPermissions() never runs.
--
-- VERIFIED EXPLOITABLE before this migration: a manager seeded with
-- permissions = ['calls'] granted itself
-- ['accounts','invoices','admin_logs','admin_catalogue','admin_stages',
--  'automations','admin_integrations'] and then successfully SELECTed rows
-- from public.expenses -- the company money-out book that the whole two-role
-- split exists to keep away from managers.
--
-- This defeated the exact thing 20260801230000 said it was preserving:
--   "profiles itself is the one deliberate exception: user management stays
--    is_admin()-only regardless -- granting a manager the ability to edit
--    permissions would let them grant themselves more."
-- The intent was right; the column grant undid it.
--
-- Fix, matching the convention 20260717120300:107-111 already set for role/
-- active/archived_at: sensitive profile columns lean on the PRIVILEGE, not on
-- a policy predicate, and move only through a security-definer RPC. A missing
-- column privilege fails loudly with 42501; a policy can be silently widened
-- by a careless later migration.
-- ============================================================================

revoke update (permissions) on public.profiles from authenticated;

-- The admin path now goes through here instead of a direct table update, the
-- same shape as admin_set_user(). Definer, so it does not need the revoked
-- grant; is_admin() is the gate.
create or replace function public.admin_set_permissions(
  p_user_id     uuid,
  p_permissions text[]
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not (select public.is_admin()) then
    raise exception 'admin only' using errcode = '42501';
  end if;

  -- An admin's own permissions array is never read (has_permission short-
  -- circuits true for role='admin'), so letting one edit their own here would
  -- be a confusing no-op rather than a risk -- but refusing keeps the mental
  -- model simple: this RPC is for granting MANAGERS access.
  if p_user_id = (select auth.uid()) then
    raise exception 'an admin already sees everything; nothing to grant'
      using errcode = '23514';
  end if;

  update public.profiles
     set permissions = coalesce(p_permissions, '{}')
   where id = p_user_id;

  if not found then
    raise exception 'user % not found', p_user_id using errcode = 'P0002';
  end if;
end $$;

revoke all on function public.admin_set_permissions(uuid, text[]) from public, anon;

grant execute on function public.admin_set_permissions(uuid, text[]) to authenticated;
