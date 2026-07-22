-- ============================================================================
-- 0015 · The Event seam, the call queue, document checklists.
--
-- ARCHITECTURE.md §4: "Automations never send. They write an Event. A
-- dispatcher reads events, resolves recipient + template, renders, queues, and
-- hands to an adapter."
--
-- This migration builds everything downstream of that seam EXCEPT email, which
-- lands next. That order is deliberate: §4's design test says "the CRM must be
-- fully usable with email switched off entirely — everything degrades to the
-- call queue." Building calls first means the test is satisfied structurally
-- rather than retrofitted, and it means OQ10 ("what % of customers have a usable
-- email address?") cannot invalidate the work.
-- ============================================================================

-- ── Enums ───────────────────────────────────────────────────────────────────

create type public.event_type as enum (
  'lead.created',
  'case.stage_changed',
  'case.completed',
  'case.stuck',
  'docs.missing',
  'quote.unanswered',
  'invoice.issued',
  'invoice.unpaid',
  'invoice.overdue',
  'payment.received',
  'renewal.due',
  'reengagement.due',
  'email.failed'
);

create type public.call_reason as enum (
  'payment_chase',
  'doc_collection',
  'unreachable',
  'quote_followup',
  'case_unblock',
  'renewal',
  'reengagement',
  'promise_due',
  'wrong_number_admin'
);

create type public.call_priority as enum ('high', 'medium', 'low');

create type public.call_task_status as enum ('open', 'done', 'escalated', 'auto_closed');

-- §5.7's outcome list, verbatim. "Didn't reach" is four of these, which is why
-- the Log Call sheet makes them one tap each.
create type public.call_outcome as enum (
  'reached_resolved',
  'promised_payment',
  'needs_callback',
  'no_answer',
  'busy',
  'switched_off',
  'wrong_number',
  'refused'
);

create type public.doc_state as enum ('outstanding', 'received', 'waived');

-- ── events — the seam ───────────────────────────────────────────────────────

create table public.events (
  id           uuid primary key default gen_random_uuid(),
  type         public.event_type not null,

  entity       text not null,
  entity_id    uuid not null,
  customer_id  uuid references public.customers(id) on delete cascade,
  case_id      uuid references public.cases(id) on delete cascade,

  payload      jsonb not null default '{}'::jsonb,
  occurred_at  timestamptz not null default now(),

  -- The idempotency key for the WHOLE automation layer. A rule can run every 15
  -- minutes forever and still emit each event exactly once, because it inserts
  -- `on conflict (dedupe_key) do nothing`. Without this, "reminder every 3 days,
  -- max 5" needs state nobody wants to keep.
  -- Shape: '<type>:<entity_id>:<discriminator>' e.g. 'invoice.unpaid:<id>:3'.
  dedupe_key   text unique,

  processed_at     timestamptz,
  processed_result jsonb,
  attempts         integer not null default 0
);

-- The dispatcher's only query: unprocessed, oldest first. Partial, so the index
-- stays the size of the backlog rather than the size of history.
create index events_unprocessed_idx
  on public.events (occurred_at) where processed_at is null;
create index events_customer_idx on public.events (customer_id);

comment on table public.events is
  'The integration seam. Everything that happens writes one. Automations NEVER '
  'send — they write here, and a dispatcher decides what that means. This is why '
  'the channel could go email -> SMS -> WhatsApp without touching business logic.';
comment on column public.events.dedupe_key is
  'unique + `on conflict do nothing` makes every automation rule idempotent.';

-- ── call_tasks — the chase queue ────────────────────────────────────────────

create table public.call_tasks (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references public.customers(id) on delete cascade,
  case_id      uuid references public.cases(id) on delete set null,
  invoice_id   uuid references public.invoices(id) on delete set null,
  event_id     uuid references public.events(id) on delete set null,

  assigned_user_id uuid references public.profiles(id) on delete set null,

  reason       public.call_reason not null,
  priority     public.call_priority not null default 'medium',

  -- Rendered AT CREATION, not at read time: "INR 2,340 outstanding, 12 days
  -- overdue" (SOW §02.H). The call list is then one query with no joins and no
  -- N+1 — it is opened on a phone, on mobile data, standing outside an office.
  -- It is a snapshot by design; the task is a record of why we called *then*.
  context_line text not null,

  due_on       date not null default (public.today_kolkata()),
  attempts     integer not null default 0,
  status       public.call_task_status not null default 'open',

  -- §5.7: a promised payment creates a dated task that auto-closes if the
  -- payment arrives first. This is the date that closes it.
  auto_close_on date,

  dedupe_key   text unique,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  closed_at    timestamptz
);

create index call_tasks_queue_idx
  on public.call_tasks (assigned_user_id, due_on, priority)
  where status = 'open';
create index call_tasks_customer_idx on public.call_tasks (customer_id);

comment on table public.call_tasks is
  'The system decides who needs calling and why; a human calls and logs it. '
  'This is the accountability the owner wanted from unified WhatsApp, delivered '
  'without a telecom regulator in the critical path.';

-- ── call_logs — what actually happened ──────────────────────────────────────

create table public.call_logs (
  id            uuid primary key default gen_random_uuid(),
  call_task_id  uuid references public.call_tasks(id) on delete set null,
  customer_id   uuid not null references public.customers(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete restrict,

  outcome       public.call_outcome not null,
  notes         text,

  -- §5.7: "Duration is a manual, optional field. No call recording, no
  -- telephony" — that would drag back the regulatory problem this design exists
  -- to avoid.
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),

  promised_on   date,   -- set when outcome = 'promised_payment'
  callback_on   date,   -- set when outcome = 'needs_callback'

  occurred_at   timestamptz not null default now(),

  -- A promise with no date is not a promise.
  constraint call_logs_promise_ck check (
    outcome <> 'promised_payment' or promised_on is not null
  ),
  constraint call_logs_callback_ck check (
    outcome <> 'needs_callback' or callback_on is not null
  )
);

create index call_logs_customer_idx on public.call_logs (customer_id, occurred_at desc);
create index call_logs_user_day_idx on public.call_logs (user_id, occurred_at desc);

-- ── Document checklists ─────────────────────────────────────────────────────

-- The catalogue: which documents each stage of each service requires.
create table public.doc_checklist (
  id          uuid primary key default gen_random_uuid(),
  service_id  uuid not null references public.services(id) on delete cascade,
  stage_id    uuid not null references public.stages(id) on delete cascade,
  label       text not null,
  required    boolean not null default true,
  sort_order  integer not null default 1,
  archived_at timestamptz,
  constraint doc_checklist_uk unique (service_id, stage_id, label)
);

-- Per-case state.
--
-- ARCHITECTURE names only DocChecklist, but §5.7 needs "documents outstanding 3
-- days" and §5.8 needs the portal to show "documents outstanding" for THIS
-- customer. Both are per-case facts, not catalogue facts, so they need a row.
-- Flagged as an addition beyond the spec's literal wording.
create table public.case_documents (
  id           uuid primary key default gen_random_uuid(),
  case_id      uuid not null references public.cases(id) on delete cascade,
  checklist_id uuid references public.doc_checklist(id) on delete set null,
  label        text not null,
  state        public.doc_state not null default 'outstanding',

  -- Drives "documents outstanding 3 days" (§5.7). Set on entry to the stage.
  outstanding_since timestamptz not null default now(),
  received_at  timestamptz,
  updated_by   uuid references public.profiles(id) on delete set null,
  updated_at   timestamptz not null default now(),

  constraint case_documents_uk unique (case_id, label)
);

create index case_documents_case_idx on public.case_documents (case_id);
create index case_documents_outstanding_idx
  on public.case_documents (outstanding_since) where state = 'outstanding';

-- ── integration_requests (SOW §02.K) ────────────────────────────────────────

create table public.integration_requests (
  id           uuid primary key default gen_random_uuid(),
  integration  text not null check (integration in ('google_ads', 'meta_ads', 'instagram')),
  requested_by uuid not null references public.profiles(id) on delete restrict,
  note         text,
  status       text not null default 'requested'
                 check (status in ('requested', 'contacted', 'closed')),
  requested_at timestamptz not null default now(),
  notified_at  timestamptz
);

comment on table public.integration_requests is
  'The TABS are in scope; the integrations are not. The Request button writes '
  'here and notifies 7Gence — so "Requested" is a fact, not a placeholder toast.';

-- ── automation_settings ─────────────────────────────────────────────────────
--
-- Replaces the demo-flag systems the frontend used to carry (localStorage
-- booleans that were explicitly "NOT a permissions system"). Backs §5.10's
-- "every automation individually toggleable", the admin kill switch, and
-- sandbox mode.
create table public.automation_settings (
  key        text primary key,
  enabled    boolean not null default true,
  config     jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

insert into public.automation_settings (key, enabled, config) values
  ('email.enabled',           false, '{"note":"Master switch. OFF until SPF/DKIM/DMARC are verified on Kalari''s domain (kalaritravels.in). With this off the dispatcher routes to call tasks — that is the design test in §4, not a degraded mode."}'),
  ('email.sandbox',           true,  '{"note":"Route every send to email_log instead of a provider. Non-negotiable per §5.6."}'),
  ('rule.stage_changed',      true,  '{}'),
  ('rule.invoice_unpaid',     true,  '{"every_days":3,"max":5}'),
  ('rule.invoice_overdue',    true,  '{}'),
  ('rule.quote_unanswered',   true,  '{"after_days":3}'),
  ('rule.case_stuck',         true,  '{"after_days":7}'),
  ('rule.docs_missing',       true,  '{"after_days":3}'),
  ('rule.renewal_due',        true,  '{"months":22}'),
  ('rule.reengagement',       true,  '{"days":[30,60]}'),
  ('rule.daily_digest',       true,  '{"at":"08:00"}')
on conflict (key) do nothing;

-- ── log_call() — the requeue rules, in one transaction ──────────────────────
--
-- §5.7's rules live here, not in the client. An employee logs a call standing
-- outside a government office on bad mobile data; if the attempt counter or the
-- requeue lived in the browser, a dropped connection would corrupt it. One RPC,
-- one transaction, one truth.
create or replace function public.log_call(
  p_task_id     uuid,
  p_outcome     public.call_outcome,
  p_notes       text default null,
  p_promised_on date default null,
  p_callback_on date default null,
  p_duration_seconds integer default null
)
returns table (task_status public.call_task_status, next_due_on date, attempts integer)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_task    public.call_tasks%rowtype;
  v_uid     uuid := (select auth.uid());
  v_status  public.call_task_status;
  v_due     date;
begin
  if v_uid is null or not (select public.is_active_user()) then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_task from public.call_tasks where id = p_task_id for update;
  if not found then
    raise exception 'call task % not found', p_task_id using errcode = 'P0002';
  end if;

  if not (select public.can_access_customer(v_task.customer_id)) then
    raise exception 'not authorised for this customer' using errcode = '42501';
  end if;

  if v_task.status <> 'open' then
    raise exception 'call task % is already %', p_task_id, v_task.status
      using errcode = '23514';
  end if;

  insert into public.call_logs (
    call_task_id, customer_id, user_id, outcome, notes,
    promised_on, callback_on, duration_seconds
  ) values (
    p_task_id, v_task.customer_id, v_uid, p_outcome, nullif(p_notes, ''),
    p_promised_on, p_callback_on, p_duration_seconds
  );

  v_status := 'done';
  v_due    := v_task.due_on;

  case p_outcome
    -- Didn't reach: requeue +1 day, and after 3 attempts stop and escalate.
    -- "Stop" matters — a queue that never gives up is a queue nobody trusts.
    when 'no_answer', 'busy', 'switched_off' then
      if v_task.attempts + 1 >= 3 then
        v_status := 'escalated';
      else
        v_status := 'open';
        v_due    := (select public.today_kolkata()) + 1;
      end if;

    when 'needs_callback' then
      v_status := 'open';
      v_due    := coalesce(p_callback_on, (select public.today_kolkata()) + 1);

    -- A promise creates a NEW dated task that auto-closes if the money lands
    -- first. The original closes: it did its job.
    when 'promised_payment' then
      v_status := 'done';
      insert into public.call_tasks (
        customer_id, case_id, invoice_id, assigned_user_id, reason, priority,
        context_line, due_on, auto_close_on, dedupe_key
      ) values (
        v_task.customer_id, v_task.case_id, v_task.invoice_id,
        v_task.assigned_user_id, 'promise_due', 'high',
        'Promised payment on ' || to_char(p_promised_on, 'DD Mon YYYY'),
        p_promised_on, p_promised_on,
        'promise_due:' || coalesce(v_task.invoice_id::text, v_task.customer_id::text)
          || ':' || p_promised_on::text
      )
      on conflict (dedupe_key) do nothing;

    -- A wrong number is a data-quality fact about the customer, not just an
    -- outcome. Flag them so they stop silently failing every future chase.
    when 'wrong_number' then
      v_status := 'done';
      update public.customers set phone_flagged_at = now()
       where id = v_task.customer_id and phone_flagged_at is null;

      insert into public.call_tasks (
        customer_id, reason, priority, context_line, due_on,
        assigned_user_id, dedupe_key
      )
      select v_task.customer_id, 'wrong_number_admin', 'high',
             'Wrong number reported — needs a correct contact',
             (select public.today_kolkata()),
             p.id,
             'wrong_number_admin:' || v_task.customer_id::text
        from public.profiles p
       where p.role = 'admin' and p.active and p.archived_at is null
       limit 1
      on conflict (dedupe_key) do nothing;

    else
      v_status := 'done';
  end case;

  update public.call_tasks
     set status     = v_status,
         attempts   = attempts + 1,
         due_on     = v_due,
         updated_at = now(),
         closed_at  = case when v_status in ('done','escalated') then now() else null end
   where id = p_task_id;

  return query
    select v_status, v_due, v_task.attempts + 1;
end $$;

comment on function public.log_call is
  'The §5.7 requeue rules in one transaction: no-answer +1 day, 3 attempts then '
  'escalate and STOP, promise creates a dated auto-closing task, wrong number '
  'flags the customer and raises an admin task.';

-- ── Triggers ────────────────────────────────────────────────────────────────

create trigger call_tasks_touch
  before update on public.call_tasks
  for each row execute function private.tg_touch_updated_at();

create trigger case_documents_touch
  before update on public.case_documents
  for each row execute function private.tg_touch_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────────
--
-- Mirrors `cases`: admin sees everything, an employee sees only their own.
-- Note every helper is wrapped as `(select public.is_admin())` so the planner
-- hoists it to an InitPlan — once per statement, not once per row.

alter table public.events               enable row level security;
alter table public.call_tasks           enable row level security;
alter table public.call_logs            enable row level security;
alter table public.doc_checklist        enable row level security;
alter table public.case_documents       enable row level security;
alter table public.integration_requests enable row level security;
alter table public.automation_settings  enable row level security;

revoke all on public.events               from public, anon, authenticated;
revoke all on public.call_tasks           from public, anon, authenticated;
revoke all on public.call_logs            from public, anon, authenticated;
revoke all on public.doc_checklist        from public, anon, authenticated;
revoke all on public.case_documents       from public, anon, authenticated;
revoke all on public.integration_requests from public, anon, authenticated;
revoke all on public.automation_settings  from public, anon, authenticated;

-- events: read-only to humans. Only the rules (SQL, as definer) and the
-- dispatcher (service_role) write here — an event nobody emitted is a lie about
-- what happened.
create policy events_select on public.events for select to authenticated
  using ((select public.is_admin()) or (select public.can_access_customer(customer_id)));

create policy call_tasks_select on public.call_tasks for select to authenticated
  using ((select public.is_admin())
         or (assigned_user_id = (select auth.uid()) and (select public.is_active_user())));

-- No direct insert/update: log_call() owns the state machine. A client that
-- could UPDATE call_tasks could set attempts = 0 forever.
create policy call_logs_select on public.call_logs for select to authenticated
  using ((select public.is_admin()) or (select public.can_access_customer(customer_id)));

create policy doc_checklist_select on public.doc_checklist for select to authenticated
  using ((select public.is_active_user()));

create policy case_documents_select on public.case_documents for select to authenticated
  using ((select public.is_admin())
         or exists (select 1 from public.cases c
                     where c.id = case_documents.case_id
                       and c.assigned_user_id = (select auth.uid())));

create policy case_documents_update on public.case_documents for update to authenticated
  using ((select public.is_admin())
         or exists (select 1 from public.cases c
                     where c.id = case_documents.case_id
                       and c.assigned_user_id = (select auth.uid())));

create policy integration_requests_admin on public.integration_requests
  for all to authenticated using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy automation_settings_select on public.automation_settings
  for select to authenticated using ((select public.is_active_user()));
create policy automation_settings_admin on public.automation_settings
  for update to authenticated using ((select public.is_admin()))
  with check ((select public.is_admin()));

grant select on public.events               to authenticated;
grant select on public.call_tasks           to authenticated;
grant select on public.call_logs            to authenticated;
grant select on public.doc_checklist        to authenticated;
grant select, update (state, received_at, updated_by) on public.case_documents to authenticated;
grant select, insert on public.integration_requests to authenticated;
grant select on public.automation_settings  to authenticated;
grant update (enabled, config, updated_by, updated_at) on public.automation_settings to authenticated;

grant execute on function public.log_call(uuid, public.call_outcome, text, date, date, integer)
  to authenticated;
