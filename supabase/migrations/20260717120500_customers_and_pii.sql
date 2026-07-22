-- ============================================================================
-- 0006 · customers (+ attribution) and private.customer_pii.
--
-- PRD §5 puts `passport_no` on Customer. It is NOT here. It lives in
-- private.customer_pii as ciphertext — see the PII section below.
-- ============================================================================

-- ── Phone normalisation (REQ-L3 dedupe) ─────────────────────────────────────
-- IMMUTABLE so it can back a generated column. Indian formats:
-- '+91 95673 24364', '095673 24364', '0091 95673 24364' and '9567324364' all
-- collapse to '919567324364'.
--
-- ⚠️ OPEN QUESTION — Kalari's existing customer list's format is unknown. This
-- handles the four common Indian spellings. Anything else (a foreign number
-- written without a country code — plausible for Gulf-based customers)
-- normalises to its bare digits, which is the honest answer: we cannot infer a
-- country we were never told. The importer surfaces conflicts to the operator
-- rather than silently merging two different people.
create or replace function public.normalise_phone_in(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when d = ''                               then null
    when left(d, 4) = '0091'                  then '91' || substr(d, 5)  -- 0091 95673 24364
    when left(d, 2) = '91' and length(d) = 12 then d                     -- +91 95673 24364
    when left(d, 1) = '0'  and length(d) = 11 then '91' || substr(d, 2)  -- 095673 24364
    when length(d) = 10                       then '91' || d             -- 95673 24364
    else d                                                               -- unknown → bare digits
  end
  from (select regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g') as d) x
$$;

comment on function public.normalise_phone_in(text) is
  'Indian phone → E.164 digits, for REQ-L3 dedupe. IMMUTABLE (backs a generated '
  'column). Unknown formats fall through to bare digits rather than guessing '
  'a country code.';

revoke all on function public.normalise_phone_in(text) from public, anon;

grant execute on function public.normalise_phone_in(text) to authenticated;

-- ── customers ───────────────────────────────────────────────────────────────
create table public.customers (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (length(btrim(name)) > 0),

  -- REQ-L5: "Phone is mandatory, email optional." The business runs on phone
  -- numbers and a lead without one is worthless.
  phone            text not null check (length(btrim(phone)) > 0),
  phone_alt        text,
  -- Generated, so it can never drift from `phone`. Backs the dedupe index.
  phone_e164       text generated always as (public.normalise_phone_in(phone)) stored,

  email            text,
  nationality      text,
  sponsor_company  text,
  source           text,

  assigned_user_id uuid references public.profiles(id) on delete restrict,

  -- ── Attribution (REQ-L6) ──────────────────────────────────────────────────
  -- "Capture attribution from day one." Google's offline conversion import needs
  -- the gclid present on the ORIGINAL click; Meta's CAPI needs the fbclid. If
  -- these are not captured from the first lead there is nothing to send back
  -- later and no history to backfill. Cost now: a few columns. Cost later:
  -- unrecoverable. These are write-once by PRIVILEGE (no update grant below),
  -- not merely by convention.
  gclid            text,
  fbclid           text,
  utm_source       text,
  utm_medium       text,
  utm_campaign     text,
  utm_content      text,
  utm_term         text,
  referrer         text,
  landing_page     text,

  -- ── Portal (REQ-SP1) ──────────────────────────────────────────────────────
  -- PRD §5 says `portal_token`. Storing the RAW token would mean anyone with
  -- read access to this table holds a working magic link for every customer —
  -- the token IS the credential. Store a SHA-256 hash; the raw token is shown
  -- once at issue and never persisted. Same reasoning as a password.
  portal_token_hash   bytea,
  portal_issued_at    timestamptz,
  portal_revoked_at   timestamptz,

  -- REQ-C8: "Wrong number flags the customer record."
  phone_flagged_at    timestamptz,
  email_flagged_at    timestamptz,

  archived_at      timestamptz,
  archived_by      uuid references public.profiles(id) on delete restrict,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid references public.profiles(id) on delete restrict
);

-- REQ-L3: "Deduplicate on phone number. Existing customer → attach a new case,
-- do not create a second customer record." Enforced, not merely intended.
create unique index customers_phone_uk
  on public.customers (phone_e164) where archived_at is null and phone_e164 is not null;

create index customers_assigned_idx
  on public.customers (assigned_user_id) where archived_at is null;

-- Success criterion #1: "Any customer findable in under 5 seconds by name or phone."
create index customers_name_idx
  on public.customers using gin (to_tsvector('simple', name)) where archived_at is null;

-- REQ-L7: "Leads and Won cases grouped by utm_source / referrer."
create index customers_source_idx
  on public.customers (utm_source, created_at desc) where archived_at is null;

create unique index customers_portal_token_uk
  on public.customers (portal_token_hash) where portal_token_hash is not null;

comment on column public.customers.phone_e164 is
  'Generated from phone via normalise_phone_in(). Backs the REQ-L3 dedupe index. '
  'Cannot drift from phone because it is not independently writable.';

comment on column public.customers.portal_token_hash is
  'SHA-256 of the portal token. The raw token is the credential and is never '
  'stored — shown once at issue (REQ-SP1).';

comment on column public.customers.gclid is
  'REQ-L6 — write-once by privilege. Required by Google offline conversion import; '
  'must be the gclid from the original click or attribution starts from zero.';

create trigger customers_touch
  before update on public.customers
  for each row execute function private.tg_touch_updated_at();

-- Audit. `portal_token_hash` is redacted: the audit log must not become a second
-- copy of a credential.
create trigger audit
  after insert or update or delete on public.customers
  for each row execute function private.tg_activity_log('portal_token_hash');

-- ── RLS + grants ────────────────────────────────────────────────────────────
alter table public.customers enable row level security;

revoke all on public.customers from public, anon, authenticated;

-- PRD §4: Employee sees "Only their assigned customers and cases".
create policy customers_select on public.customers
  for select to authenticated
  using (
    (select public.is_admin())
    or (assigned_user_id = (select auth.uid()) and (select public.is_active_user()))
  );

-- USING tests the OLD row → an employee cannot grab someone else's customer.
-- WITH CHECK tests the NEW row → an employee cannot hand one away (or steal one
-- by setting assigned_user_id to themselves). Both stated explicitly rather than
-- letting WITH CHECK silently inherit USING.
create policy customers_update on public.customers
  for update to authenticated
  using (
    (select public.is_admin())
    or (assigned_user_id = (select auth.uid()) and (select public.is_active_user()))
  )
  with check (
    (select public.is_admin())
    or (assigned_user_id = (select auth.uid()) and (select public.is_active_user()))
  );

create policy customers_insert on public.customers
  for insert to authenticated
  with check ( (select public.is_active_user()) );

grant select on public.customers to authenticated;

-- Attribution + portal columns are INSERTable but never UPDATEable. A missing
-- column privilege fails loudly (42501); a policy predicate can be silently
-- widened by a careless later migration. Privilege is the stronger guarantee.
grant insert (
  name, phone, phone_alt, email, nationality, sponsor_company, source,
  assigned_user_id, created_by,
  gclid, fbclid, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
  referrer, landing_page
) on public.customers to authenticated;

grant update (
  name, phone, phone_alt, email, nationality, sponsor_company, source,
  assigned_user_id, phone_flagged_at, email_flagged_at
) on public.customers to authenticated;

-- Deliberately absent from both: gclid, fbclid, utm_*, referrer, landing_page
-- (write-once), portal_token_hash / portal_issued_at / portal_revoked_at
-- (server-issued only), archived_at (soft-delete via RPC). No DELETE grant.

-- ============================================================================
-- PII — passport numbers
--
-- CLAUDE.md §4: "passport_no and uploaded documents are PII: encrypted at rest,
-- access logged."
--
-- ⚠️ VERIFIED ON THIS PROJECT (2026-07-17): pgsodium is NOT installed and its
-- Transparent Column Encryption is deprecated. It is deliberately not used.
--
-- Design: ciphertext only in Postgres, key only in Railway env (AES-256-GCM,
-- encrypted/decrypted in Node). A leaked service_role key is therefore NOT
-- sufficient to read a passport — which would not be true of pgcrypto with a
-- key held in the database or in Vault, since both live in the same backup.
--
-- ⚠️ KEY ESCROW IS MANDATORY. Lose PII_ENCRYPTION_KEY and every passport is
-- unrecoverable from every backup and every PITR restore, permanently.
--
-- Separate TABLE rather than a column-level REVOKE on customers: with column
-- grants, any `select *` from the client throws 42501 and you spend the project
-- fighting your own query builder. With separation, `select *` on customers is
-- safe by construction.
-- ============================================================================

create table private.customer_pii (
  customer_id            uuid primary key
                           references public.customers(id) on delete restrict,

  -- AES-256-GCM: iv || ciphertext || authTag. Encrypted in Node, never in PG.
  passport_no_ciphertext bytea not null,

  -- Keyed HMAC-SHA256 over the normalised passport + a server-side pepper.
  -- A blind index: exact-match lookup without decrypting. Peppered because a
  -- bare hash of a passport number is trivially brute-forced (the keyspace is
  -- tiny and structured).
  passport_no_hash       bytea not null,

  key_version            smallint not null default 1,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  created_by             uuid references public.profiles(id) on delete restrict
);

create index customer_pii_hash_idx on private.customer_pii (passport_no_hash);

create trigger customer_pii_touch
  before update on private.customer_pii
  for each row execute function private.tg_touch_updated_at();

-- Every read of a passport is logged. Triggers do not fire on SELECT, so a
-- logged read MUST go through a function — this is the only way to make
-- "access logged" a database guarantee rather than a remember-to-call-the-logger
-- convention.
create table private.pii_access_log (
  id          bigint generated always as identity primary key,
  customer_id uuid not null references public.customers(id) on delete restrict,
  user_id     uuid references public.profiles(id) on delete restrict,
  actor_kind  public.actor_kind not null,
  purpose     text not null check (length(btrim(purpose)) > 0),
  occurred_at timestamptz not null default now(),
  request_id  text
);

create index pii_access_log_customer_idx
  on private.pii_access_log (customer_id, occurred_at desc);

create index pii_access_log_user_idx
  on private.pii_access_log (user_id, occurred_at desc);

-- No RLS needed: `private` is not in PostgREST's exposed schemas and neither
-- anon nor authenticated hold USAGE on it (verified: nspacl = {postgres=UC,
-- service_role=U}). These tables are unreachable over the API by construction.
-- The guard script only requires RLS on `public` tables, correctly.
revoke all on private.customer_pii   from public, anon, authenticated;

revoke all on private.pii_access_log from public, anon, authenticated;

comment on table private.customer_pii is
  'Passport ciphertext. Key lives in Railway env, never in Postgres. Read only '
  'via public.read_customer_passport(), which cannot return ciphertext without '
  'first writing private.pii_access_log.';
