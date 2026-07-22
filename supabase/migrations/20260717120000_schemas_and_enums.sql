-- ============================================================================
-- 0001 · Schemas, enums, and the timezone helper.
--
-- Everything else depends on this. Forward-only: never edit an applied
-- migration (CLAUDE.md §9).
--
-- The RLS helpers (is_admin / is_active_user) are NOT here: they read
-- public.profiles, and `language sql` bodies are validated eagerly at CREATE
-- time, so they cannot exist before that table. They live in 0004, after both
-- profiles and activity_log. Order here follows the real dependency graph:
--   0001 enums → 0002 profiles → 0003 activity_log (FK→profiles) → 0004 helpers+policies
--
-- ⚠️ VERIFIED AGAINST THIS PROJECT (PG 17.6) ON 2026-07-17:
--    A freshly created table in `public` is granted to anon and authenticated
--    as `arwdDxtm` — INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES,
--    TRIGGER, MAINTAIN — and ships with `relrowsecurity = false`.
--
--    That means a new public table is WORLD-WRITABLE BY ANONYMOUS USERS until
--    RLS is enabled and grants are revoked. Every REVOKE in these migrations is
--    load-bearing, not decorative. scripts/guard-money-columns.mjs fails the
--    build if any public table misses `enable row level security`.
-- ============================================================================

-- ── Schemas ─────────────────────────────────────────────────────────────────
-- `private` is NOT added to PostgREST's exposed schemas, so nothing in it is
-- addressable over the API and it never appears in generated types. It holds
-- trigger functions, the invoice counter, and encrypted PII.
create schema if not exists private;

revoke all on schema private from public, anon, authenticated;

grant usage on schema private to postgres, service_role;

-- ── Enums ───────────────────────────────────────────────────────────────────
-- NOTE (permanent decision under forward-only migrations): `ALTER TYPE … ADD
-- VALUE` cannot be used in the same transaction that then USES the new value,
-- and Supabase runs each migration file in one transaction. So adding an enum
-- value later always costs two migrations. Enums are used only where the domain
-- is genuinely closed; `source` and `nationality` stay lookup tables.

do $$ begin
  create type public.user_role as enum ('admin', 'employee');
exception when duplicate_object then null; end $$;

-- PRD REQ-PM1: "method (cash / transfer / cheque)". Three, not four. No card —
-- online payments are explicitly out of scope (CLAUDE.md §5).
do $$ begin
  create type public.payment_method as enum ('cash', 'transfer', 'cheque');
exception when duplicate_object then null; end $$;

-- Invoice lifecycle is a DECISION someone made, so it is stored.
-- Payment status and overdue are DERIVED and are never stored — see the
-- invoices_v view. REQ-PM2: "Never hand-set." The guarantee is that there is no
-- settable column to hand-set.
do $$ begin
  create type public.invoice_lifecycle as enum ('issued', 'void');
exception when duplicate_object then null; end $$;

-- Credit notes ship after Phase 1, but the discriminator lands NOW: retrofitting
-- a doc_type onto a populated immutable ledger under forward-only migrations is
-- genuinely unpleasant.
do $$ begin
  create type public.doc_type as enum ('invoice', 'credit_note');
exception when duplicate_object then null; end $$;

-- The four pricing dimensions (CLAUDE.md §4). Pricing resolves from these —
-- it is NOT eleven hardcoded templates.
--
-- Kalari's six service families (from kalaritravels.in):
--   ticketing  — air ticket booking (domestic / international)
--   holiday    — holiday packages & curated tours (domestic / international)
--   haj_umrah  — Haj & Umrah packages (category = haj | umrah)
--   visa       — Gulf & global visa services (new / renew)
--   passport   — passport services (new / renew)
--   hotel      — hotel reservations (no dimensions)
do $$ begin
  create type public.service_family as enum
    ('ticketing', 'holiday', 'haj_umrah', 'visa', 'passport', 'hotel');
exception when duplicate_object then null; end $$;

-- Category doubles as the programme/tier axis. haj/umrah are live; standard/
-- premium are RESERVED for when Kalari confirms real package tiers — adding an
-- enum value later costs two migrations (see NOTE above), so they land now.
do $$ begin
  create type public.service_category as enum ('haj', 'umrah', 'standard', 'premium');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.service_location as enum ('domestic', 'international');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.service_type as enum ('new', 'renew');
exception when duplicate_object then null; end $$;

-- How a line's qty is derived. Mirrors lib/pricing/catalogue.ts QtyRule exactly.
-- ⛔ OPEN QUESTION (Kalari): whether children count as full pax for Haj/Umrah
-- and holiday pricing may force this enum to grow (per_adult / per_child).
-- Recorded as a known risk: enum values are hard to remove under forward-only
-- migrations.
do $$ begin
  create type public.qty_rule as enum ('once', 'once_per_file', 'per_person');
exception when duplicate_object then null; end $$;

-- Who performed an audited write. `service_role` JWTs carry no `sub`, so
-- auth.uid() is NULL for them — without this discriminator the audit trail
-- cannot distinguish "cron did it" from "we lost the actor".
do $$ begin
  create type public.actor_kind as enum ('user', 'service', 'system', 'portal');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.audit_action as enum ('insert', 'update', 'delete');
exception when duplicate_object then null; end $$;

-- ── Timezone ────────────────────────────────────────────────────────────────
-- CLAUDE.md §4: "Timezone is Asia/Kolkata, everywhere. No naive datetimes."
-- Every stored instant is timestamptz. Every CALENDAR DATE decision goes
-- through this function. Never depend on the session timezone — it is invisible
-- state that differs between a laptop, CI, and Railway.
create or replace function public.today_kolkata()
returns date
language sql
stable
set search_path = ''
as $$ select (now() at time zone 'Asia/Kolkata')::date $$;

comment on function public.today_kolkata() is
  'The current calendar date in Asia/Kolkata. All date logic must route through this.';
