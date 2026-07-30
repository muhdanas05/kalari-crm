-- ============================================================================
-- 0032 · Single-admin mode, part 2 of 2: drop the now-unreferenced columns.
--
-- 0031 already rewrote every policy and function that read assigned_user_id
-- on customers/cases or in_assignment_pool on profiles — this migration is
-- purely mechanical: nothing left depends on what it removes.
--
-- call_tasks.assigned_user_id is KEPT (see 0031's header) — the call-queue UI
-- still reads it for the due-date/assignment display, and with one admin it
-- always resolves to them. Dropping it would be churn with no payoff.
--
-- The `user_role` enum and `profiles.role` column are also KEPT — recreating
-- an enum used by a NOT NULL column with a default, to shrink it from
-- ('admin','employee') to just ('admin'), is real surgery (rewrite the
-- column type, backfill, drop the old type, rename the new one) for zero
-- user-facing benefit: nothing in the app offers 'employee' as a choice after
-- 0031's TypeScript companion changes ship. The single row stays role='admin'
-- forever, enforced by the fact that nothing ever writes anything else.
-- ============================================================================

-- ── Two policies 0031 missed ────────────────────────────────────────────
-- invoices_select and invoice_drafts_all join to customers.assigned_user_id
-- directly rather than through can_access_customer() — caught by Postgres
-- refusing the column drop below ("other objects depend on it"), not by the
-- earlier review. Collapsed to admin-only, same as everything else in 0031.
drop policy if exists invoices_select on public.invoices;

create policy invoices_select on public.invoices
  for select to authenticated
  using ( (select public.is_admin()) );

drop policy if exists invoice_drafts_all on public.invoice_drafts;

create policy invoice_drafts_all on public.invoice_drafts
  for all to authenticated
  using      ( (select public.is_admin()) )
  with check ( (select public.is_admin()) );

-- ── Two functions 0031 half-fixed ───────────────────────────────────────
-- 0031 removed the load-balancing LOGIC from create_lead() and
-- ensure_call_task(), but their bodies still WRITE/READ
-- customers.assigned_user_id and cases.assigned_user_id — columns this
-- migration is about to drop. A plpgsql function body is not tracked as a
-- view-style dependency, so `drop column` would have succeeded and left both
-- functions broken at the next call (the first new lead, the first automated
-- chase) rather than failing loudly now. Caught by grepping every function's
-- source for the column names before dropping, not by the earlier review.

-- create_lead(): drop first — the RETURNS TABLE shape changes (assigned_to
-- goes with the column it reported; neither TS caller reads it — checked).
drop function if exists public.create_lead(
  text, text, text, uuid, text, text, text, text, text, text, text, text, text, text, text
);

create or replace function public.create_lead(
  p_name         text,
  p_phone        text,
  p_email        text default null,
  p_service_id   uuid default null,
  p_source       text default null,
  p_message      text default null,
  p_gclid        text default null,
  p_fbclid       text default null,
  p_utm_source   text default null,
  p_utm_medium   text default null,
  p_utm_campaign text default null,
  p_utm_content  text default null,
  p_utm_term     text default null,
  p_referrer     text default null,
  p_landing_page text default null
)
returns table (customer_id uuid, case_id uuid, is_new_customer boolean)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_customer uuid;
  v_case     uuid;
  v_is_new   boolean := false;
  v_e164     text;
  v_pipeline uuid;
  v_stage    uuid;
begin
  if coalesce(trim(p_name), '') = '' or coalesce(trim(p_phone), '') = '' then
    raise exception 'name and phone are required' using errcode = '23514';
  end if;

  v_e164 := public.normalise_phone_in(p_phone);

  select id into v_customer
    from public.customers
   where phone_e164 = v_e164 and archived_at is null
   limit 1;

  if v_customer is null then
    v_is_new := true;

    insert into public.customers (
      name, phone, email, source,
      gclid, fbclid, utm_source, utm_medium, utm_campaign,
      utm_content, utm_term, referrer, landing_page
    ) values (
      trim(p_name), trim(p_phone), nullif(trim(p_email), ''),
      coalesce(p_source, 'website'),
      p_gclid, p_fbclid, p_utm_source, p_utm_medium, p_utm_campaign,
      p_utm_content, p_utm_term, p_referrer, p_landing_page
    )
    returning id into v_customer;
  end if;

  select pl.id, s.id into v_pipeline, v_stage
    from public.pipelines pl
    join public.stages s on s.pipeline_id = pl.id
   where pl.key = 'sales' and s.key = 'new_enquiry'
   limit 1;

  insert into public.cases (
    customer_id, service_id, pipeline_id, stage_id,
    status, opened_at, stage_entered_at, pax_adults, pax_children
  ) values (
    v_customer, p_service_id, v_pipeline, v_stage,
    'open', now(), now(), 1, 0
  )
  returning id into v_case;

  if coalesce(trim(p_message), '') <> '' then
    insert into public.events (type, entity, entity_id, customer_id, case_id, payload, dedupe_key)
    values ('lead.created', 'case', v_case, v_customer, v_case,
            jsonb_build_object('message', p_message, 'source', p_source),
            'lead.note:' || v_case::text)
    on conflict (dedupe_key) do nothing;
  end if;

  return query select v_customer, v_case, v_is_new;
end $$;

comment on function public.create_lead is
  'The single intake path — website form AND manual entry. Creates customer '
  '(dedup on phone) + Sales case. Single-admin mode: no assignment concept '
  'at all (0032) — there is exactly one profile and every RLS policy already '
  'resolves to "is this the admin".';

-- The website posts as service_role (bearer-token authed in the route); manual
-- entry calls it as the signed-in user.
grant execute on function public.create_lead(
  text, text, text, uuid, text, text,
  text, text, text, text, text, text, text, text, text
) to authenticated, service_role;

-- ensure_call_task(): same signature as 0031 (returns boolean), so a plain
-- create or replace supersedes it — no drop needed. Reads NOTHING from
-- customers.assigned_user_id anymore; every task simply goes to the one
-- profile. Explicit, not a coalesce-with-a-fallback: there is no other case.
create or replace function private.ensure_call_task(
  p_customer_id  uuid,
  p_reason       public.call_reason,
  p_priority     public.call_priority,
  p_context      text,
  p_dedupe_key   text,
  p_case_id      uuid default null,
  p_invoice_id   uuid default null,
  p_due_on       date default null
)
returns boolean
language sql
volatile
security definer
set search_path = ''
as $$
  with ins as (
    insert into public.call_tasks (
      customer_id, case_id, invoice_id, assigned_user_id,
      reason, priority, context_line, due_on, dedupe_key
    )
    select
      p_customer_id, p_case_id, p_invoice_id,
      (select id from public.profiles limit 1),
      p_reason, p_priority, p_context,
      coalesce(p_due_on, public.today_kolkata()), p_dedupe_key
    where exists (
      select 1 from public.customers cu
      where cu.id = p_customer_id and cu.archived_at is null
    )
    on conflict (dedupe_key) do nothing
    returning 1
  )
  select exists (select 1 from ins);
$$;

-- ── cases_board_v: drop before the column it selects from disappears ───────
drop view if exists public.cases_board_v;

create view public.cases_board_v with (security_invoker = true) as
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
  greatest((public.today_kolkata() - c.stage_entered_at::date), 0) as days_in_stage,
  ((public.today_kolkata() - c.stage_entered_at::date) > 7) as is_stuck,
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

-- ── Drop the columns ─────────────────────────────────────────────────────
alter table public.customers drop column if exists assigned_user_id;

alter table public.cases     drop column if exists assigned_user_id;

alter table public.profiles  drop column if exists in_assignment_pool;

-- Indexes built on the dropped columns go with them (cases_assigned_idx and
-- profiles_pool_idx are attached to columns that no longer exist, so
-- `drop column` already removed them — these are belt-and-braces in case an
-- index was ever detached from its column by hand).
drop index if exists public.customers_assigned_idx;

drop index if exists public.cases_assigned_idx;

drop index if exists public.profiles_pool_idx;

-- ── Assertions ────────────────────────────────────────────────────────────
do $$
declare v_leftover integer;
begin
  select count(*) into v_leftover
  from information_schema.columns
  where table_schema = 'public'
    and ((table_name in ('customers','cases') and column_name = 'assigned_user_id')
      or (table_name = 'profiles' and column_name = 'in_assignment_pool'));

  if v_leftover <> 0 then
    raise exception 'single-admin drop: % column(s) still present, expected 0', v_leftover;
  end if;

  raise notice 'single-admin drop ok: customers/cases.assigned_user_id and '
    'profiles.in_assignment_pool are gone';
end $$;
