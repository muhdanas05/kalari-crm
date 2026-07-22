-- ============================================================================
-- 0004 · RLS helper functions + the policies that depend on them.
--
-- These could not live in 0001: `language sql` function bodies are validated
-- EAGERLY at CREATE time, so a helper that selects from public.profiles cannot
-- be created before that table exists. (Discovered by an actual failed push,
-- not assumed.) The fix is correct ordering, not `check_function_bodies = off`
-- and not plpgsql — see the note on inlining below.
-- ============================================================================

-- ── RLS helpers ─────────────────────────────────────────────────────────────
-- These live in `public`, not `private`, on purpose: RLS policy expressions are
-- evaluated as the INVOKER, so a helper in `private` would require granting
-- `authenticated` USAGE on that schema — defeating the point of hiding it.
-- These leak nothing: they only tell you about yourself.
--
-- `security definer` is a CORRECTNESS requirement, not an optimisation. A policy
-- on `profiles` containing a plain `select role from public.profiles …` raises
-- `42P17: infinite recursion detected in policy for relation "profiles"`. A
-- DEFINER function bypasses RLS on the table it reads, so there is no recursion.
--
-- `language sql` (not plpgsql) is deliberate: only SQL functions can be INLINED
-- by the planner, which is what lets `(select public.is_admin())` be hoisted to
-- an InitPlan — evaluated ONCE PER STATEMENT instead of once per row. plpgsql
-- would be a black box and would re-run per row. Every call site must therefore
-- wrap it as `(select public.is_admin())`, never a bare `public.is_admin()`.
--
-- `set search_path = ''` forces fully-qualified names and blocks search_path
-- hijacking of a definer function. pg_catalog is still searched implicitly, so
-- now()/to_jsonb() resolve fine.

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.active
      and p.archived_at is null
  )
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.active
      and p.archived_at is null
      and p.role = 'admin'
  )
$$;

comment on function public.is_admin() is
  'True if the caller is an active, non-archived admin. Read LIVE from profiles '
  'rather than from a JWT claim, so that deactivating or demoting a user takes '
  'effect on their very next statement instead of at the next token refresh '
  '(~1h). At 9 users one hoisted index lookup per statement is free; the '
  'staleness window of a JWT claim is not worth trading for it.';

-- ⚠️ Do NOT `alter table public.profiles force row level security`. The DEFINER
-- helpers rely on the table owner's RLS exemption; forcing RLS breaks them and
-- the recursion returns.

-- PostgreSQL grants EXECUTE to PUBLIC on new functions by default, and this
-- project's default ACLs additionally grant `anon` EXECUTE (verified). Not
-- optional.
revoke all on function public.is_active_user() from public, anon;

revoke all on function public.is_admin() from public, anon;

grant execute on function public.is_active_user() to authenticated;

grant execute on function public.is_admin() to authenticated;

-- ── profiles policies (deferred from 0002) ──────────────────────────────────
-- Everyone active can read the roster: employee names back "assigned to" labels
-- and the admin workload view. Nothing sensitive lives on this table.
create policy profiles_select on public.profiles
  for select to authenticated
  using ( (select public.is_active_user()) );

-- A user may edit their OWN display name. USING tests the old row, WITH CHECK
-- the new one — both are stated explicitly rather than letting WITH CHECK
-- silently inherit USING.
create policy profiles_self_update on public.profiles
  for update to authenticated
  using      ( id = (select auth.uid()) )
  with check ( id = (select auth.uid()) );

create policy profiles_admin_update on public.profiles
  for update to authenticated
  using      ( (select public.is_admin()) )
  with check ( (select public.is_admin()) );

grant select on public.profiles to authenticated;

-- Column-level grant. `role`, `active`, `in_assignment_pool` and `archived_at`
-- are NOT updatable by any client under any policy — they move only through
-- public.admin_set_user(). A missing column privilege fails LOUDLY with 42501;
-- a policy predicate can be silently widened by a careless later migration.
-- Privilege is the stronger guarantee, so the sensitive columns lean on it.
grant update (name) on public.profiles to authenticated;

-- No INSERT grant: profile creation is server-only, paired with the Auth Admin
-- API under the service key (PRD §4: "No self-signup — Admin creates users").
-- No DELETE grant anywhere: soft-delete only, so the audit trail survives.

-- ── activity_log policy (deferred from 0003) ────────────────────────────────
-- Admin reads everything. Employees deliberately get NO policy here: a per-row
-- "is this entity mine" predicate is an expensive join and would leak history
-- across reassignment. They read scoped history through a definer function
-- instead, added alongside the customer profile UI.
create policy activity_log_admin_select on public.activity_log
  for select to authenticated
  using ( (select public.is_admin()) );
