-- ============================================================================
-- 0013 · Pipelines, stages, cases, and STAGE APPLICABILITY.
--
-- The Processing pipeline holds the superset of stages across all six
-- service families (ticketing, holiday, haj_umrah, visa, passport, hotel).
--
-- ⚠️ NO SINGLE LINEAR PATH IS RIGHT FOR ALL 11 SERVICES. Stages are declared
-- PER SERVICE and HIDDEN, not skipped (REQ-P2):
--   • Ticketing → PNR Held → Ticket Issued → Complete
--   • Holiday   → Itinerary → Bookings → Docs Shared → Travelling → Complete
--   • Haj/Umrah → Docs → Visa Processing → Group Allocated → Departed → Complete
--   • Visa      → Docs → Submitted → Visa Received → Complete
--   • Passport  → Docs → PSK Appointment → Submitted → Dispatched → Complete
--   • Hotel     → Booking Confirmed → Voucher Sent → Complete
--
-- PRD §11: "REQ-P2 built in Phase 2, not retrofitted." The PRD calls this "the
-- single most commonly underestimated requirement in this build", so the
-- applicability is a TABLE with a foreign key — not an `if` in a component that
-- someone will forget.
-- ============================================================================

create table public.pipelines (
  id         uuid primary key default gen_random_uuid(),
  key        text not null unique,
  name       text not null,
  sort_order integer not null,
  created_at timestamptz not null default now()
);

create table public.stages (
  id          uuid primary key default gen_random_uuid(),
  pipeline_id uuid not null references public.pipelines(id) on delete restrict,
  key         text not null,
  name        text not null,
  sort_order  integer not null,
  -- Terminal stages end the case (Won/Lost/Complete/Renewed).
  is_terminal boolean not null default false,
  created_at  timestamptz not null default now(),

  constraint stages_key_uk   unique (pipeline_id, key),
  constraint stages_order_uk unique (pipeline_id, sort_order),
  -- Enables the composite FK on cases below: a case's stage can then never
  -- belong to a different pipeline. Declarative, no trigger.
  constraint stages_id_pipeline_uk unique (id, pipeline_id)
);

create table public.cases (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references public.customers(id) on delete restrict,
  service_id   uuid references public.services(id) on delete restrict,

  pipeline_id  uuid not null references public.pipelines(id) on delete restrict,
  stage_id     uuid not null,

  assigned_user_id uuid references public.profiles(id) on delete restrict,
  status       text not null default 'open' check (status in ('open', 'won', 'lost', 'complete')),

  opened_at        timestamptz not null default now(),
  -- REQ-P3: resets on every move. Drives the stuck-case alerts (>7 days).
  -- Trigger-maintained and NOT client-writable, so it cannot be forged.
  stage_entered_at timestamptz not null default now(),
  expected_completion date,

  -- REQ-AU3: the renewal engine needs this or it never fires. PRD §11 calls it
  -- "a data-entry dependency that silently kills the highest-value feature".
  -- Captured at Stamping.
  visa_issue_date  date,

  pax_adults   integer not null default 1 check (pax_adults >= 0),
  pax_children integer not null default 0 check (pax_children >= 0),

  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references public.profiles(id) on delete restrict,

  -- The composite FK: stage must belong to this case's pipeline.
  constraint cases_stage_fk foreign key (stage_id, pipeline_id)
    references public.stages (id, pipeline_id),
  constraint cases_pax_ck check (pax_adults + pax_children >= 1)
);

create index cases_pipeline_idx on public.cases (pipeline_id, stage_id) where archived_at is null;

create index cases_assigned_idx on public.cases (assigned_user_id) where archived_at is null;

create index cases_customer_idx on public.cases (customer_id);

create index cases_stuck_idx    on public.cases (stage_entered_at) where archived_at is null;

-- ── Stage applicability (REQ-P2) ────────────────────────────────────────────
-- Which stages apply to which service. A row here means "this stage is part of
-- this service's path". Absent = the stage is HIDDEN for that service, not
-- merely skippable.
create table public.stage_applicability (
  service_id uuid not null references public.services(id) on delete restrict,
  stage_id   uuid not null references public.stages(id) on delete restrict,
  sort_order integer not null,
  primary key (service_id, stage_id)
);

create index stage_applicability_service_idx on public.stage_applicability (service_id, sort_order);

comment on table public.stage_applicability is
  'REQ-P2 — the per-service stage path. Without this the Visa Processing board is '
  'factually wrong for 5 of the 10 services. A case can only be moved to a stage '
  'that appears here for its service; enforced by trigger, not by the UI.';

-- ── The applicability guard ─────────────────────────────────────────────────
-- The UI dims non-applicable columns and refuses the drop. That is a courtesy.
-- THIS is the guarantee: a case physically cannot enter a stage outside its
-- service's declared path, however the write arrives.
create or replace function private.tg_case_stage_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ok boolean;
  v_stage text;
  v_service text;
begin
  -- No service means no declared path (e.g. a Sales enquiry before the service
  -- is known). Nothing to enforce.
  if NEW.service_id is null then
    if TG_OP = 'UPDATE' and NEW.stage_id is distinct from OLD.stage_id then
      NEW.stage_entered_at := now();
    end if;
    return NEW;
  end if;

  select exists (
    select 1 from public.stage_applicability sa
    where sa.service_id = NEW.service_id and sa.stage_id = NEW.stage_id
  ) into v_ok;

  if not v_ok then
    select s.name into v_stage   from public.stages s   where s.id = NEW.stage_id;
    select sv.name into v_service from public.services sv where sv.id = NEW.service_id;
    raise exception
      '"%" is not a stage in the % path — it is hidden for this service, not skipped (REQ-P2)',
      coalesce(v_stage, '?'), coalesce(v_service, '?')
      using errcode = '23514';
  end if;

  -- REQ-P3: stage_entered_at resets on every move, and only on a real move.
  -- Set here rather than trusting the client, which has no update grant on it.
  if TG_OP = 'UPDATE' and NEW.stage_id is distinct from OLD.stage_id then
    NEW.stage_entered_at := now();
  end if;

  return NEW;
end $$;

create trigger cases_stage_guard
  before insert or update on public.cases
  for each row execute function private.tg_case_stage_guard();

create trigger cases_touch
  before update on public.cases
  for each row execute function private.tg_touch_updated_at();

create trigger audit
  after insert or update or delete on public.cases
  for each row execute function private.tg_activity_log();

-- ── RLS + grants ────────────────────────────────────────────────────────────
alter table public.pipelines           enable row level security;

alter table public.stages              enable row level security;

alter table public.cases               enable row level security;

alter table public.stage_applicability enable row level security;

revoke all on public.pipelines           from public, anon, authenticated;

revoke all on public.stages              from public, anon, authenticated;

revoke all on public.cases               from public, anon, authenticated;

revoke all on public.stage_applicability from public, anon, authenticated;

-- Reference data: everyone active reads it.
create policy pipelines_select on public.pipelines
  for select to authenticated using ( (select public.is_active_user()) );

create policy stages_select on public.stages
  for select to authenticated using ( (select public.is_active_user()) );

create policy stage_applicability_select on public.stage_applicability
  for select to authenticated using ( (select public.is_active_user()) );

-- PRD §6.4 REQ-P5: "Employees see only their own cards. Admin sees all."
create policy cases_select on public.cases
  for select to authenticated
  using (
    (select public.is_admin())
    or (assigned_user_id = (select auth.uid()) and (select public.is_active_user()))
  );

create policy cases_insert on public.cases
  for insert to authenticated
  with check ( (select public.is_active_user()) );

create policy cases_update on public.cases
  for update to authenticated
  using (
    (select public.is_admin())
    or (assigned_user_id = (select auth.uid()) and (select public.is_active_user()))
  )
  with check (
    (select public.is_admin())
    or (assigned_user_id = (select auth.uid()) and (select public.is_active_user()))
  );

grant select on public.pipelines           to authenticated;

grant select on public.stages              to authenticated;

grant select on public.stage_applicability to authenticated;

grant select on public.cases               to authenticated;

-- Column grants: stage_entered_at and opened_at are trigger-maintained and
-- deliberately absent, so a client cannot forge how long a case has been stuck.
grant insert (customer_id, service_id, pipeline_id, stage_id, assigned_user_id,
              status, expected_completion, visa_issue_date, pax_adults,
              pax_children, created_by) on public.cases to authenticated;

grant update (service_id, stage_id, assigned_user_id, status,
              expected_completion, visa_issue_date, pax_adults, pax_children)
  on public.cases to authenticated;

-- No DELETE anywhere: soft-delete only.

-- ── The board view ──────────────────────────────────────────────────────────
-- Everything the kanban needs in one query, including the per-card stage PATH
-- (so each card renders only its own applicable stages) and the stuck flag.
create view public.cases_board_v with (security_invoker = true) as
select
  c.id,
  c.customer_id,
  c.pipeline_id,
  c.stage_id,
  c.service_id,
  c.assigned_user_id,
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
  pr.name  as assignee_name,
  -- REQ-P3 / PRD success criterion #5: "No case sits in a stage for more than
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
left join public.profiles pr on pr.id = c.assigned_user_id
where c.archived_at is null;

revoke all on public.cases_board_v from public, anon, authenticated;

grant select on public.cases_board_v to authenticated;

-- ── Now that cases exist, wire the invoice FK that Phase 1 deferred ─────────
-- Phase 1 invoices genuinely had no case (the generator is customer + service),
-- so those rows keep case_id NULL truthfully. New ones can link.
alter table public.invoices
  add constraint invoices_case_fk foreign key (case_id)
  references public.cases(id) on delete restrict;

alter table public.invoice_drafts
  add constraint invoice_drafts_case_fk foreign key (case_id)
  references public.cases(id) on delete restrict;
