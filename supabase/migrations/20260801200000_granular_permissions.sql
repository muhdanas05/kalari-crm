-- Per-page permissions, not a fixed two-tier role. "Need indepth options to
-- select each tab — which he can see, which he cant, not this generic."
--
-- profiles.role stays (admin is still special: the last-admin lockout guard,
-- back-dating, and "sees literally everything regardless of the list" all
-- key off it). What's new is profiles.permissions — an explicit array of
-- page keys a non-admin profile can see. Admin ignores this column entirely
-- (has_permission() short-circuits true for them); a manager's access is
-- exactly the set in this array, checked page by page.
alter table public.profiles
  add column permissions text[] not null default '{}';

comment on column public.profiles.permissions is
  'Page keys a non-admin profile may see — checked by has_permission(). '
  'Ignored for admin, who sees everything regardless. Data, not code: which '
  'pages exist is a fixed list in TypeScript (lib/auth/pages.ts); which of '
  'them THIS person can see is this array.';

create or replace function public.has_permission(p_page text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.role = 'admin' or p.permissions @> array[p_page]
       from public.profiles p
      where p.id = auth.uid() and p.active and p.archived_at is null),
    false
  );
$$;

comment on function public.has_permission is
  'True for admin unconditionally, or a non-admin whose permissions array '
  'contains this page key. False for a deactivated/archived/unknown user — '
  'fails closed, same as is_active_user().';

revoke all on function public.has_permission(text) from public, anon;
grant execute on function public.has_permission(text) to authenticated;

-- Existing manager(s) keep exactly today's access — everything but Accounts
-- and backend config — expressed explicitly now instead of implicitly via
-- role alone, so the SAME rows work whether the checkbox UI is used to grant
-- them individually or not.
update public.profiles
   set permissions = array[
     'dashboard','pipeline','customers','suppliers','calls',
     'quotations','invoices','payments','history'
   ]
 where role = 'employee';

grant update (permissions) on public.profiles to authenticated;
