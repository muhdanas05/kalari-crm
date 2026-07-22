-- ============================================================================
-- 0014 · Seed pipelines, stages, and the per-service stage paths (REQ-P2).
--
-- This is the migration that makes the board factually correct for all 11
-- services instead of one family. Idempotent.
--
-- ⚠️ The stage paths below are SENSIBLE DEFAULTS for a travel agency, designed
-- from kalaritravels.in's service list. They are FLAGGED FOR CONFIRMATION with
-- Kalari's operations person — a 30-minute review — before go-live. Changing a
-- path after first deploy is a forward-only migration on stage_applicability.
-- ============================================================================

insert into public.pipelines (key, name, sort_order) values
  ('sales',      'Sales',      1),
  ('processing', 'Processing', 2),
  ('renewal',    'Renewal',    3)
on conflict (key) do update set name = excluded.name;

-- ── Sales ───────────────────────────────────────────────────────────────────
insert into public.stages (pipeline_id, key, name, sort_order, is_terminal)
select p.id, v.key, v.name, v.sort_order, v.is_terminal
from public.pipelines p, (values
  ('new_enquiry', 'New Enquiry', 1, false),
  ('contacted',   'Contacted',   2, false),
  ('quoted',      'Quoted',      3, false),
  ('won',         'Won',         4, true),
  ('lost',        'Lost',        5, true)
) as v(key, name, sort_order, is_terminal)
where p.key = 'sales'
on conflict (pipeline_id, key) do update set name = excluded.name;

-- ── Processing ──────────────────────────────────────────────────────────────
-- The full superset across all six families. Which of these a given case
-- actually shows is decided by stage_applicability below — NOT by this list.
-- Global sort_order is arranged so every family's path is monotonic:
--   ticketing:  pnr_hold(1) → ticket_issued(9) → complete(17)
--   holiday:    itinerary_final(2) → bookings_confirmed(7) → docs_shared(10)
--               → travelling(15) → complete(17)
--   haj_umrah:  docs_collected(3) → visa_processing(5) → group_allocated(8)
--               → departed(16) → complete(17)
--   visa:       docs_collected(3) → submitted(6) → visa_received(11) → complete(17)
--   passport:   docs_collected(3) → appointment(4) → submitted(6)
--               → dispatched(12) → complete(17)
--   hotel:      booking_confirmed(13) → voucher_sent(14) → complete(17)
insert into public.stages (pipeline_id, key, name, sort_order, is_terminal)
select p.id, v.key, v.name, v.sort_order, v.is_terminal
from public.pipelines p, (values
  ('pnr_hold',          'PNR Held',                     1, false),  -- ticketing only
  ('itinerary_final',   'Itinerary Final',              2, false),  -- holiday only
  ('docs_collected',    'Docs Collected',               3, false),  -- haj_umrah + visa + passport
  ('appointment',       'PSK Appointment',              4, false),  -- passport only
  ('visa_processing',   'Visa Processing',              5, false),  -- haj_umrah only
  ('submitted',         'Submitted',                    6, false),  -- visa + passport
  ('bookings_confirmed','Bookings Confirmed',           7, false),  -- holiday only
  ('group_allocated',   'Group & Departure Allocated',  8, false),  -- haj_umrah only
  ('ticket_issued',     'Ticket Issued',                9, false),  -- ticketing only
  ('docs_shared',       'Travel Docs Shared',          10, false),  -- holiday only
  ('visa_received',     'Visa Received',               11, false),  -- visa only
  ('dispatched',        'Passport Dispatched',         12, false),  -- passport only
  ('booking_confirmed', 'Booking Confirmed',           13, false),  -- hotel only
  ('voucher_sent',      'Voucher Sent',                14, false),  -- hotel only
  ('travelling',        'Travelling',                  15, false),  -- holiday only
  ('departed',          'Departed',                    16, false),  -- haj_umrah only
  ('complete',          'Complete',                    17, true)
) as v(key, name, sort_order, is_terminal)
where p.key = 'processing'
on conflict (pipeline_id, key) do update set name = excluded.name;

-- ── Renewal ─────────────────────────────────────────────────────────────────
-- Serves visa and passport renewals — the repeat-business engine.
insert into public.stages (pipeline_id, key, name, sort_order, is_terminal)
select p.id, v.key, v.name, v.sort_order, v.is_terminal
from public.pipelines p, (values
  ('due_soon',   'Due Soon',   1, false),
  ('contacted',  'Contacted',  2, false),
  ('in_process', 'In Process', 3, false),
  ('renewed',    'Renewed',    4, true)
) as v(key, name, sort_order, is_terminal)
where p.key = 'renewal'
on conflict (pipeline_id, key) do update set name = excluded.name;

-- ── STAGE APPLICABILITY — the whole point ───────────────────────────────────
-- Built by rule from each service's family, so it cannot drift from the
-- catalogue. A stage absent here is HIDDEN for that service.
do $$
declare
  v_processing uuid;
begin
  select id into v_processing from public.pipelines where key = 'processing';

  delete from public.stage_applicability
  where stage_id in (select id from public.stages where pipeline_id = v_processing);

  insert into public.stage_applicability (service_id, stage_id, sort_order)
  select sv.id, st.id, st.sort_order
  from public.services sv
  join public.stages st on st.pipeline_id = v_processing
  where
    case sv.family
      -- ── Air ticketing: hold the PNR, issue the ticket, done.
      when 'ticketing' then
        st.key in ('pnr_hold','ticket_issued','complete')

      -- ── Holiday packages: itinerary → confirm bookings → share travel
      -- docs → customer travels → complete.
      when 'holiday' then
        st.key in ('itinerary_final','bookings_confirmed','docs_shared',
                   'travelling','complete')

      -- ── Haj & Umrah: documents → pilgrimage visa → group/departure
      -- allocation → departed → complete.
      when 'haj_umrah' then
        st.key in ('docs_collected','visa_processing','group_allocated',
                   'departed','complete')

      -- ── Visa services: documents → submitted to consulate → visa
      -- received → complete.
      when 'visa' then
        st.key in ('docs_collected','submitted','visa_received','complete')

      -- ── Passport services: documents → PSK appointment → submitted →
      -- passport dispatched → complete.
      when 'passport' then
        st.key in ('docs_collected','appointment','submitted','dispatched',
                   'complete')

      -- ── Hotel reservations: confirm → voucher → done.
      when 'hotel' then
        st.key in ('booking_confirmed','voucher_sent','complete')

      else false
    end
  on conflict (service_id, stage_id) do nothing;
end $$;

-- ── Assert the applicability is actually right ──────────────────────────────
-- A silent mis-seed here would make the board wrong for most services, which
-- is the exact failure REQ-P2 exists to prevent. Fail the migration instead.
do $$
declare
  v_bad text;
begin
  -- Hotel must never see consulate stages.
  select string_agg(distinct sv.name, ', ') into v_bad
  from public.stage_applicability sa
  join public.services sv on sv.id = sa.service_id
  join public.stages st on st.id = sa.stage_id
  where sv.family = 'hotel'
    and st.key in ('docs_collected','visa_processing','submitted','visa_received');
  if v_bad is not null then
    raise exception 'REQ-P2 violated: hotel services have consulate stages: %', v_bad;
  end if;

  -- Ticketing must never see holiday stages.
  select string_agg(distinct sv.name, ', ') into v_bad
  from public.stage_applicability sa
  join public.services sv on sv.id = sa.service_id
  join public.stages st on st.id = sa.stage_id
  where sv.family = 'ticketing'
    and st.key in ('itinerary_final','bookings_confirmed','docs_shared','travelling');
  if v_bad is not null then
    raise exception 'REQ-P2 violated: ticketing services have holiday stages: %', v_bad;
  end if;

  -- Every Haj/Umrah service must include the pilgrimage visa step.
  select string_agg(sv.name, ', ') into v_bad
  from public.services sv
  where sv.family = 'haj_umrah'
    and not exists (
      select 1 from public.stage_applicability sa
      join public.stages st on st.id = sa.stage_id
      where sa.service_id = sv.id and st.key = 'visa_processing');
  if v_bad is not null then
    raise exception 'REQ-P2 violated: haj_umrah services missing Visa Processing: %', v_bad;
  end if;

  -- Every service must reach Complete, or its cases can never close.
  select string_agg(sv.name, ', ') into v_bad
  from public.services sv
  where not exists (
    select 1 from public.stage_applicability sa
    join public.stages st on st.id = sa.stage_id
    where sa.service_id = sv.id and st.key = 'complete');
  if v_bad is not null then
    raise exception 'REQ-P2 violated: these services cannot reach Complete: %', v_bad;
  end if;

  -- Every service must have SOME path, or its cases are unmovable.
  select string_agg(sv.name, ', ') into v_bad
  from public.services sv
  where not exists (select 1 from public.stage_applicability sa where sa.service_id = sv.id);
  if v_bad is not null then
    raise exception 'these services have no stage path at all: %', v_bad;
  end if;

  raise notice 'REQ-P2 stage applicability verified for all services';
end $$;
