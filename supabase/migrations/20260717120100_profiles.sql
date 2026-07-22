-- ============================================================================
-- 0002 · profiles — the app-side identity record.
--
-- Table + integrity only. RLS is ENABLED here (deny-all until 0004 adds
-- policies — the safe direction to fail), but the policies themselves need
-- public.is_admin(), which needs this table to exist first. The audit trigger
-- likewise waits for 0003. See the ordering note in 0001.
--
-- PRD §5 lists `User(… password_hash …)`. Under Supabase Auth that column
-- belongs to auth.users and is deliberately NOT reproduced here — storing a
-- second password hash would be a liability with no purpose.
--
-- PRD §4: exactly two roles. No self-signup — Admin creates users.
-- ============================================================================

create table public.profiles (
  id                 uuid primary key references auth.users(id) on delete restrict,
  name               text not null check (length(btrim(name)) > 0),
  -- Plain text, not citext: citext is not installed on this project (verified
  -- 2026-07-17) and pulling in an extension for one column isn't worth it.
  -- Case-insensitivity comes from the lower() unique index below. auth.users.email
  -- remains the authority for login; this is a denormalised convenience copy.
  email              text,
  role               public.user_role not null default 'employee',

  -- active = the revocation switch. is_admin()/is_active_user() read it live,
  -- so flipping it cuts access on the caller's very next statement.
  active             boolean not null default true,

  -- REQ-A3: Admin can remove a user from the assignment pool (leave, absence)
  -- WITHOUT deactivating the account. Two distinct concepts, two columns.
  in_assignment_pool boolean not null default true,

  -- Soft delete. No role holds DELETE on any table in this schema: a hard
  -- delete would erase the very row the audit trail describes, and PRD §4's
  -- "Admin: All CRUD" cannot coexist with a complete before/after trail.
  -- ⚠️ This contradicts the PRD's wording and needs the owner's sign-off.
  archived_at        timestamptz,
  archived_by        uuid references public.profiles(id) on delete restrict,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create unique index profiles_email_uk
  on public.profiles (lower(email)) where archived_at is null and email is not null;

create index profiles_pool_idx
  on public.profiles (role, active, in_assignment_pool) where archived_at is null;

comment on column public.profiles.active is
  'Revocation switch. Read live by is_admin()/is_active_user() rather than from a '
  'JWT claim, so deactivation is immediate rather than deferred to token refresh.';

comment on column public.profiles.in_assignment_pool is
  'REQ-A3 — excluded from auto-assignment without deactivating the account.';

-- ── updated_at ──────────────────────────────────────────────────────────────
create or replace function private.tg_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  NEW.updated_at := now();
  return NEW;
end $$;

create trigger profiles_touch
  before update on public.profiles
  for each row execute function private.tg_touch_updated_at();

-- ── Guard: never strand the CRM without an admin ────────────────────────────
-- Locking the owner out of their own system is a plausible Tuesday. This is a
-- CONSTRAINT trigger so it fires once at COMMIT, after multi-row statements
-- have settled, rather than mid-statement on a transient state.
create or replace function private.tg_require_active_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.profiles
    where role = 'admin' and active and archived_at is null
  ) then
    raise exception
      'Refusing: this would leave the CRM with no active admin.'
      using errcode = '23514';
  end if;
  return null;
end $$;

create constraint trigger profiles_require_active_admin
  after update or delete on public.profiles
  deferrable initially deferred
  for each row execute function private.tg_require_active_admin();

-- ── Lock it down immediately ────────────────────────────────────────────────
-- VERIFIED on this project (PG 17.6, 2026-07-17): a fresh public table grants
-- anon + authenticated `arwdDxtm` (INSERT/SELECT/UPDATE/DELETE/TRUNCATE/…) and
-- ships with RLS OFF. Both facts must be corrected in the SAME migration that
-- creates the table — never in a later "policies" migration, because that is
-- exactly how a table ships world-writable.
--
-- RLS on + zero policies = deny-all for `authenticated`. That is the safe
-- direction to fail. Policies arrive in 0004 once is_admin() exists.
alter table public.profiles enable row level security;

revoke all on public.profiles from public, anon, authenticated;

-- Audit trigger and RLS policies are attached in 0003 / 0004 respectively.;
