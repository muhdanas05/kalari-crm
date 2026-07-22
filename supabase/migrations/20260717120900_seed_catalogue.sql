-- ============================================================================
-- Seed · the service catalogue — Kalari Tours and Travels.
--
-- ⚠️⚠️ ALL RATES ARE UNCONFIRMED PLACEHOLDERS ⚠️⚠️
-- No rate below has been confirmed by Kalari. Every figure is a deliberately
-- round number that LOOKS like a placeholder (₹500, ₹1,000, ₹2,000 …) so a
-- real-looking rate can never be mistaken for a confirmed one. Surfaced in-app
-- on /admin/catalogue. Get written confirmation before the first real invoice —
-- issued invoices are immutable, so a wrong rate becomes a permanent
-- credit-note trail. (CLAUDE.md: never invent rates.)
--
-- gst_bp is 0 on every line: India GST treatment differs per service (tour
-- operator 5% no-ITC, air-agent commission basis under rule 32(3), hotel
-- slabs). That is an accountant's answer, not a developer's guess. The
-- per-line gst_bp override exists for when it arrives.
--
-- Reference data is seeded via MIGRATION, not seed.sql, because it must exist
-- identically in every environment. Asserted by
-- lib/pricing/__tests__/totals.test.ts, which pins all 11 placeholder totals.
--
-- Idempotent: safe to re-run.
-- ============================================================================

-- ── The 11 services ─────────────────────────────────────────────────────────
insert into public.services (name, family, category, location, type) values
  ('Air Ticketing · Domestic',       'ticketing', null,    'domestic',      null),
  ('Air Ticketing · International',  'ticketing', null,    'international', null),
  ('Holiday Package · Domestic',     'holiday',   null,    'domestic',      null),
  ('Holiday Package · International','holiday',   null,    'international', null),
  ('Haj Package',                    'haj_umrah', 'haj',   null,            null),
  ('Umrah Package',                  'haj_umrah', 'umrah', null,            null),
  ('Visa Service · New',             'visa',      null,    null,            'new'),
  ('Visa Service · Renewal',         'visa',      null,    null,            'renew'),
  ('Passport Service · New',         'passport',  null,    null,            'new'),
  ('Passport Service · Renewal',     'passport',  null,    null,            'renew'),
  ('Hotel Reservation',              'hotel',     null,    null,            null)
on conflict (family, category, location, type) do update set name = excluded.name;

-- ── Line item rules (rate_paise: integer paise, 1 INR = 100 paise) ──────────
-- Fares, hotel room rates and package land costs are NOT modelled yet — only
-- Kalari's own service fees. Whether tickets/hotels are invoiced with the fare
-- as a pass-through line is an open question for Kalari; it changes line
-- design materially and must not be guessed.
insert into public.line_item_rules (service_id, label, rate_paise, qty_rule, sort_order)
select s.id, v.label, v.rate_paise, v.qty_rule::public.qty_rule, v.sort_order
from (values
  -- family, category, location, type, label, rate_paise, qty_rule, sort_order
  ('ticketing', null,    'domestic',      null,    'Ticketing Service Charge',        50000, 'per_person',    1),
  ('ticketing', null,    'international', null,    'Ticketing Service Charge',       100000, 'per_person',    1),
  ('holiday',   null,    'domestic',      null,    'Package Planning Fee',           200000, 'once_per_file', 1),
  ('holiday',   null,    'domestic',      null,    'Per-Traveller Service Charge',   100000, 'per_person',    2),
  ('holiday',   null,    'international', null,    'Package Planning Fee',           500000, 'once_per_file', 1),
  ('holiday',   null,    'international', null,    'Per-Traveller Service Charge',   200000, 'per_person',    2),
  ('haj_umrah', 'haj',   null,            null,    'Haj Processing Fee',             500000, 'per_person',    1),
  ('haj_umrah', 'umrah', null,            null,    'Umrah Processing Fee',           300000, 'per_person',    1),
  ('visa',      null,    null,            'new',   'Visa Processing Fee',            200000, 'per_person',    1),
  ('visa',      null,    null,            'new',   'Service Charge',                 100000, 'per_person',    2),
  ('visa',      null,    null,            'renew', 'Visa Renewal Processing',        150000, 'per_person',    1),
  ('visa',      null,    null,            'renew', 'Service Charge',                 100000, 'per_person',    2),
  ('passport',  null,    null,            'new',   'Passport Application Assistance',150000, 'per_person',    1),
  ('passport',  null,    null,            'renew', 'Passport Renewal Assistance',    100000, 'per_person',    1),
  ('hotel',     null,    null,            null,    'Hotel Booking Fee',               50000, 'once',          1)
) as v(family, category, location, type, label, rate_paise, qty_rule, sort_order)
join public.services s
  on  s.family   =  v.family::public.service_family
  and s.category is not distinct from v.category::public.service_category
  and s.location is not distinct from v.location::public.service_location
  and s.type     is not distinct from v.type::public.service_type
on conflict (service_id, sort_order) do update
  set label = excluded.label, rate_paise = excluded.rate_paise, qty_rule = excluded.qty_rule;

-- ── Assertions: fail the migration if the seed did not land ────────────────
do $$
declare v_services integer; v_rules integer;
begin
  select count(*) into v_services from public.services;
  select count(*) into v_rules    from public.line_item_rules;
  if v_services <> 11 then
    raise exception 'seed: expected 11 services, found %', v_services;
  end if;
  if v_rules <> 15 then
    raise exception 'seed: expected 15 line item rules, found %', v_rules;
  end if;
  raise notice 'seed ok: % services, % rules', v_services, v_rules;
end $$;

-- ── The placeholder totals, asserted against the SEEDED data ────────────────
-- CLAUDE.md: "Any change to a pricing table requires a passing test asserting
-- the total." Vitest asserts the TS engine; this asserts the database. Totals
-- are the single-pax (qty = 1) basis, same convention as the TS golden tests.
-- These pins exist so a drift is LOUD — when Kalari's real rates arrive, update
-- the fixture, the seed and these pins together, never one alone.
do $$
declare r record; v_total_paise bigint;
begin
  for r in
    select * from (values
      ('ticketing', null,    'domestic',      null,     50000),
      ('ticketing', null,    'international', null,    100000),
      ('holiday',   null,    'domestic',      null,    300000),
      ('holiday',   null,    'international', null,    700000),
      ('haj_umrah', 'haj',   null,            null,    500000),
      ('haj_umrah', 'umrah', null,            null,    300000),
      ('visa',      null,    null,            'new',   300000),
      ('visa',      null,    null,            'renew', 250000),
      ('passport',  null,    null,            'new',   150000),
      ('passport',  null,    null,            'renew', 100000),
      ('hotel',     null,    null,            null,     50000)
    ) as t(family, category, location, type, expected_paise)
  loop
    select coalesce(sum(li.rate_paise), 0) into v_total_paise
    from public.line_item_rules li
    join public.services s on s.id = li.service_id
    where s.family   =  r.family::public.service_family
      and s.category is not distinct from r.category::public.service_category
      and s.location is not distinct from r.location::public.service_location
      and s.type     is not distinct from r.type::public.service_type;
    if v_total_paise <> r.expected_paise then
      raise exception '% % % %: expected % paise, seeded data sums to %',
        r.family, coalesce(r.category, '-'), coalesce(r.location, '-'),
        coalesce(r.type, '-'), r.expected_paise, v_total_paise;
    end if;
  end loop;
  raise notice 'all 11 placeholder totals verified against seeded data';
end $$;
