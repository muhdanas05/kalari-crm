-- ============================================================================
-- The stuck-case clock was 5.5 hours out.
--
-- cases_board_v computed:
--     public.today_kolkata() - c.stage_entered_at::date
--
-- today_kolkata() is (now() at time zone 'Asia/Kolkata')::date -- correct.
-- But `stage_entered_at::date` casts a timestamptz using the SESSION TimeZone,
-- which on Supabase/PostgREST is UTC. So the two sides of the subtraction are
-- measured in different zones.
--
-- Consequence: any stage move between 18:30 and 23:59 IST is 00:00-05:29 UTC
-- the NEXT day... no -- it is still the SAME UTC day, which is the PREVIOUS
-- Kolkata day. So the row reads days_in_stage = 1 the instant it is moved, and
-- is_stuck (> 7) trips roughly 5.5 hours early on the 8th day.
--
-- That figure is not cosmetic: it drives the `case.stuck` automation, the
-- stuck-case dedupe bucket (days_in_stage / 7), the dashboard's stuck tile and
-- the board card. An early or inflated clock means a customer gets chased on
-- the wrong day.
--
-- Fix: convert the timestamp to Kolkata before taking its date, so both sides
-- of the subtraction are Kolkata dates. CLAUDE.md: "Everything is Asia/Kolkata."
--
-- The view is otherwise reproduced verbatim from 20260731100100 -- create or
-- replace cannot patch two expressions in place.
-- ============================================================================

create or replace view public.cases_board_v with (security_invoker = true) as
select
  c.id,
  c.customer_id,
  c.pipeline_id,
  c.stage_id,
  c.service_id,
  c.status,
  c.opened_at,
  c.stage_entered_at,
  c.visa_issue_date,
  c.pax_adults,
  c.pax_children,
  cu.name  as customer_name,
  cu.phone as customer_phone,
  sv.name  as service_name,
  st.name  as stage_name,
  st.sort_order as stage_sort,
  p.name   as pipeline_name,
  -- REQ-P3 / success criterion #5: "No case sits in a stage for more than
  -- 7 days without someone being told."
  greatest(
    (public.today_kolkata() - (c.stage_entered_at at time zone 'Asia/Kolkata')::date),
    0
  ) as days_in_stage,
  ((public.today_kolkata() - (c.stage_entered_at at time zone 'Asia/Kolkata')::date) > 7)
    as is_stuck,
  -- The card's own path: ONLY the stages its service uses (REQ-P2).
  coalesce((
    select jsonb_agg(jsonb_build_object('id', s2.id, 'name', s2.name, 'sort', sa.sort_order)
                     order by sa.sort_order)
    from public.stage_applicability sa
    join public.stages s2 on s2.id = sa.stage_id
    where sa.service_id = c.service_id
  ), '[]'::jsonb) as stage_path,
  -- Money on the card, so the board answers "who owes us" without a second trip.
  coalesce((
    select sum(iv.outstanding_paise) from public.invoices_v iv
    where iv.case_id = c.id and iv.lifecycle = 'issued'
  ), 0)::bigint as outstanding_paise
from public.cases c
join public.customers cu on cu.id = c.customer_id
join public.stages st    on st.id = c.stage_id
join public.pipelines p  on p.id  = c.pipeline_id
left join public.services sv on sv.id = c.service_id
where c.archived_at is null;

revoke all on public.cases_board_v from public, anon, authenticated;

grant select on public.cases_board_v to authenticated;
