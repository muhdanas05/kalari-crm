-- ============================================================================
-- 0005 · Service catalogue — services + line_item_rules.
--
-- CLAUDE.md §4: "Pricing resolves from four parameters — not ten hardcoded
-- templates." This is the rate STORE; lib/pricing/engine.ts is the RESOLVER.
-- The seed in 0011 is generated from lib/pricing/catalogue.ts so the TS and SQL
-- rate tables cannot drift.
-- ============================================================================

-- ── Fix carried forward from 0001/0004 ──────────────────────────────────────
-- today_kolkata() shipped with Postgres' default `EXECUTE TO PUBLIC` because its
-- revoke was lost when the RLS-helper block moved out of 0001 into 0004.
-- Verified live: proacl was `{=X/postgres,anon=X,...}`. Benign — the function
-- returns today's date, which anon could get from now() anyway — but it
-- contradicted the stated intent, so it is closed here rather than left as a
-- lie in the comments. Forward-only: fixed in a new migration, never by editing
-- an applied one (CLAUDE.md §9).
revoke all on function public.today_kolkata() from public, anon;

grant execute on function public.today_kolkata() to authenticated;

-- ── services ────────────────────────────────────────────────────────────────
create table public.services (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) > 0),

  -- The four dimensions. NULL means "this dimension does not apply to this
  -- family" — e.g. Family has no CAT2/CAT3, Temp Permit has none at all.
  family      public.service_family    not null,
  category    public.service_category,
  location    public.service_location,
  type        public.service_type,

  active      boolean not null default true,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- NULLS NOT DISTINCT (PG15+; this project runs 17.6, verified) makes the
  -- 4-tuple genuinely unique. Under default NULLS DISTINCT you could insert
  -- ('temp_permit',null,null,null) a hundred times.
  constraint services_dims_uk
    unique nulls not distinct (family, category, location, type),

  -- Dimension applicability. Mirrors DIMENSIONS + applicableDimensions() in
  -- lib/pricing/engine.ts EXACTLY. If these two ever disagree, a service is
  -- either unreachable from the UI or unrepresentable in the DB.
  constraint services_dims_ck check (
    case family
      -- Air ticketing: domestic/international only. No category, no new/renew.
      when 'ticketing' then
        category is null and type is null and location is not null
      -- Holiday packages & tours: domestic/international only.
      when 'holiday' then
        category is null and type is null and location is not null
      -- Haj & Umrah: the programme IS the category (haj | umrah). standard/
      -- premium tiers are reserved enum values — widening this branch requires
      -- a migration AND confirmed package tiers from Kalari, not a guess.
      when 'haj_umrah' then
        category in ('haj', 'umrah') and type is null and location is null
      -- Visa services: new/renew only. Destination is free-form on the case,
      -- not a pricing dimension, until Kalari confirms per-country rates.
      when 'visa' then
        category is null and type is not null and location is null
      -- Passport services: new/renew only.
      when 'passport' then
        category is null and type is not null and location is null
      -- Hotel reservations: flat service fee, no dimensions.
      when 'hotel' then
        category is null and type is null and location is null
    end
  )
);

create index services_lookup_idx
  on public.services (family, category, location, type) where archived_at is null;

comment on constraint services_dims_ck on public.services is
  'Dimension applicability, mirroring lib/pricing/engine.ts applicableDimensions(). '
  'The haj_umrah branch admits only haj|umrah; standard/premium tiers must be '
  'widened by migration once Kalari confirms real package tiers — not a guess.';

-- ── line_item_rules ─────────────────────────────────────────────────────────
create table public.line_item_rules (
  id          uuid primary key default gen_random_uuid(),
  service_id  uuid not null references public.services(id) on delete restrict,

  label       text not null check (length(btrim(label)) > 0),

  -- Integer paise. NEVER numeric, NEVER float (CLAUDE.md §4). numeric(12,2)
  -- silently rounds on assignment — 74.9995 becomes 75.00 with no error. An
  -- integer cannot silently round; any fractional paise forces an explicit,
  -- testable decision. scripts/guard-money-columns.mjs fails the build on any
  -- money column that is numeric/float or lacks the _paise suffix.
  rate_paise   bigint not null check (rate_paise >= 0),

  qty_rule    public.qty_rule not null,
  sort_order  integer not null check (sort_order > 0),

  active      boolean not null default true,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- The resolver throws on two rules matching one key at the same sort position
  -- (it would silently pick one). Enforce the same invariant in the DB.
  constraint line_item_rules_order_uk unique (service_id, sort_order)
);

create index line_item_rules_service_idx
  on public.line_item_rules (service_id, sort_order) where archived_at is null;

comment on column public.line_item_rules.rate_paise is
  'Integer paise. 1 INR = 100 paise. INR 1,284.77 is stored as 128477.';

comment on table public.line_item_rules is
  'The rate STORE. lib/pricing/engine.ts is the resolver. REQ-I7: admin-editable; '
  'rate changes never alter already-issued invoices, because issue_invoice '
  'snapshots rate_paise onto invoice_lines.';

-- ── updated_at ──────────────────────────────────────────────────────────────
create trigger services_touch
  before update on public.services
  for each row execute function private.tg_touch_updated_at();

create trigger line_item_rules_touch
  before update on public.line_item_rules
  for each row execute function private.tg_touch_updated_at();

-- ── Audit ───────────────────────────────────────────────────────────────────
-- Catalogue rate changes are the second-highest-value audit target after money
-- itself, and design 12 ("Service Catalogue") already promises a change history.
create trigger audit
  after insert or update or delete on public.services
  for each row execute function private.tg_activity_log();

create trigger audit
  after insert or update or delete on public.line_item_rules
  for each row execute function private.tg_activity_log();

-- ── RLS + grants ────────────────────────────────────────────────────────────
-- VERIFIED: fresh public tables grant anon+authenticated arwdDxtm and ship with
-- RLS OFF. Both corrected in the same migration that creates the table.
alter table public.services        enable row level security;

alter table public.line_item_rules enable row level security;

revoke all on public.services        from public, anon, authenticated;

revoke all on public.line_item_rules from public, anon, authenticated;

-- Everyone active reads the catalogue: employees need it to generate invoices.
create policy services_select on public.services
  for select to authenticated
  using ( (select public.is_active_user()) );

create policy line_item_rules_select on public.line_item_rules
  for select to authenticated
  using ( (select public.is_active_user()) );

-- REQ-I7: "Admin-only catalogue rate editor."
create policy services_admin_write on public.services
  for all to authenticated
  using      ( (select public.is_admin()) )
  with check ( (select public.is_admin()) );

create policy line_item_rules_admin_write on public.line_item_rules
  for all to authenticated
  using      ( (select public.is_admin()) )
  with check ( (select public.is_admin()) );

grant select on public.services        to authenticated;

grant select on public.line_item_rules to authenticated;

-- Admin writes need the privilege as well as the policy. No DELETE: soft-delete
-- only, so a rate that appears on an issued invoice can always be explained.
grant insert, update on public.services        to authenticated;

grant insert, update on public.line_item_rules to authenticated;
