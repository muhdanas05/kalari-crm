-- ============================================================================
-- 0016 · The call list view + the automation rule engine.
--
-- Rule EVALUATION runs in SQL; dispatch/render/send runs in TypeScript.
--
-- Why the split: every rule here is a set query over rows the database already
-- has ("invoices overdue past due_date", "cases whose stage_entered_at is older
-- than 7 days", "visa_issue_date + 22 months"). Doing that in SQL means no
-- network, no egress, and no N+1.
--
-- But the real reason is §4: "Automations never send." Here that is STRUCTURAL,
-- not a convention someone must remember — these functions physically cannot
-- send anything. They can only insert into `events`. The dispatcher, which is
-- the only thing that knows what a template is, lives in TypeScript where it can
-- be read and tested.
-- ============================================================================

-- ── call_list_v — the employee's home screen, in one query ──────────────────
--
-- context_line is stored, not joined, so this view stays cheap: it is opened on
-- a phone, on mobile data, several times an hour.
create view public.call_list_v with (security_invoker = true) as
select
  t.id,
  t.customer_id,
  t.case_id,
  t.invoice_id,
  t.assigned_user_id,
  t.reason,
  t.priority,
  t.context_line,
  t.due_on,
  t.attempts,
  t.status,
  c.name  as customer_name,
  c.phone as customer_phone,
  c.phone_flagged_at is not null as phone_flagged,
  p.name  as assignee_name,
  (t.due_on <= public.today_kolkata()) as is_due,
  greatest(public.today_kolkata() - t.due_on, 0) as days_late,
  -- Priority then due date (§5.7). Encoded here so every caller sorts the same.
  (case t.priority when 'high' then 1 when 'medium' then 2 else 3 end) as priority_rank
from public.call_tasks t
join public.customers c on c.id = t.customer_id
left join public.profiles p on p.id = t.assigned_user_id
where t.status = 'open';

comment on view public.call_list_v is
  'My Call List. Priority then due date, with the number, the reason and one '
  'line of context already rendered — §5.7.';

-- ── Helper: raise a call task, idempotently ─────────────────────────────────
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
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.call_tasks (
    customer_id, case_id, invoice_id, assigned_user_id,
    reason, priority, context_line, due_on, dedupe_key
  )
  select
    p_customer_id, p_case_id, p_invoice_id,
    -- The task goes to whoever owns the customer; unowned falls to an admin.
    coalesce(
      cu.assigned_user_id,
      (select id from public.profiles
        where role = 'admin' and active and archived_at is null limit 1)
    ),
    p_reason, p_priority, p_context,
    coalesce(p_due_on, public.today_kolkata()), p_dedupe_key
  from public.customers cu
  where cu.id = p_customer_id and cu.archived_at is null
  on conflict (dedupe_key) do nothing;
$$;

-- ── The rules ───────────────────────────────────────────────────────────────

create or replace function public.run_automation_rules()
returns table (rule text, events_emitted integer, tasks_raised integer)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_today date := public.today_kolkata();
  v_n     integer;
  v_t     integer;
  v_cfg   jsonb;
  v_on    boolean;
begin
  -- ── Invoice overdue → email + a HIGH call task (§5.10) ────────────────────
  select enabled, config into v_on, v_cfg
    from public.automation_settings where key = 'rule.invoice_overdue';
  if coalesce(v_on, false) then
    with due as (
      select i.id, i.customer_id, i.number, i.outstanding_paise, i.days_overdue
        from public.invoices_v i
       where i.lifecycle = 'issued'
         and i.display_status = 'overdue'
    ), ins as (
      insert into public.events (type, entity, entity_id, customer_id, payload, dedupe_key)
      select 'invoice.overdue', 'invoice', d.id, d.customer_id,
             jsonb_build_object('number', d.number,
                                'outstanding_paise', d.outstanding_paise,
                                'days_overdue', d.days_overdue),
             -- Re-keyed by the DAY bucket, so an invoice that stays overdue
             -- re-notifies on a cadence rather than once, forever, or every tick.
             'invoice.overdue:' || d.id::text || ':' || (d.days_overdue / 7)::text
        from due d
      on conflict (dedupe_key) do nothing
      returning 1
    )
    select count(*) into v_n from ins;

    -- The bridge: money owed becomes a human call. The context line is rendered
    -- here, once, exactly as §5.7 describes it.
    with due as (
      select i.id, i.customer_id, i.outstanding_paise, i.days_overdue
        from public.invoices_v i
       where i.lifecycle = 'issued' and i.display_status = 'overdue'
    )
    select count(*) into v_t from (
      select private.ensure_call_task(
        d.customer_id, 'payment_chase', 'high',
        'INR ' || to_char(d.outstanding_paise / 100.0, 'FM999,999,990.00')
          || ' outstanding, ' || d.days_overdue || ' days overdue',
        'payment_chase:' || d.id::text || ':' || (d.days_overdue / 7)::text,
        null, d.id, v_today
      ) from due d
    ) x;

    rule := 'invoice.overdue'; events_emitted := v_n; tasks_raised := v_t;
    return next;
  end if;

  -- ── Case stuck > N days → tell the admin, raise a task (§3.15) ────────────
  select enabled, config into v_on, v_cfg
    from public.automation_settings where key = 'rule.case_stuck';
  if coalesce(v_on, false) then
    with stuck as (
      select c.id, c.customer_id, c.customer_name, c.stage_name, c.days_in_stage
        from public.cases_board_v c
       where c.is_stuck and c.status = 'open'
    ), ins as (
      insert into public.events (type, entity, entity_id, customer_id, case_id, payload, dedupe_key)
      select 'case.stuck', 'case', s.id, s.customer_id, s.id,
             jsonb_build_object('stage', s.stage_name, 'days', s.days_in_stage),
             'case.stuck:' || s.id::text || ':' || (s.days_in_stage / 7)::text
        from stuck s
      on conflict (dedupe_key) do nothing
      returning 1
    )
    select count(*) into v_n from ins;

    with stuck as (
      select c.id, c.customer_id, c.stage_name, c.days_in_stage
        from public.cases_board_v c
       where c.is_stuck and c.status = 'open'
    )
    select count(*) into v_t from (
      select private.ensure_call_task(
        s.customer_id, 'case_unblock', 'medium',
        'Stuck at ' || s.stage_name || ' for ' || s.days_in_stage || ' days',
        'case_unblock:' || s.id::text || ':' || (s.days_in_stage / 7)::text,
        s.id, null, v_today
      ) from stuck s
    ) x;

    rule := 'case.stuck'; events_emitted := v_n; tasks_raised := v_t;
    return next;
  end if;

  -- ── Renewal at 22 months — the highest-value rule (§5.10) ─────────────────
  --
  -- "Every past customer becomes repeat business without anyone remembering to
  -- chase them." It fires only when visa_issue_date was captured at Stamping,
  -- which is exactly why §3.16 makes that field required to exit Stamping.
  select enabled, config into v_on, v_cfg
    from public.automation_settings where key = 'rule.renewal_due';
  if coalesce(v_on, false) then
    with due as (
      select c.id, c.customer_id, c.visa_issue_date,
             (c.visa_issue_date + make_interval(months => (v_cfg->>'months')::int))::date as due_date
        from public.cases c
       where c.visa_issue_date is not null
         and c.archived_at is null
         and (c.visa_issue_date + make_interval(months => (v_cfg->>'months')::int))::date <= v_today
    ), ins as (
      insert into public.events (type, entity, entity_id, customer_id, case_id, payload, dedupe_key)
      select 'renewal.due', 'case', d.id, d.customer_id, d.id,
             jsonb_build_object('visa_issue_date', d.visa_issue_date, 'due_date', d.due_date),
             'renewal.due:' || d.id::text
        from due d
      on conflict (dedupe_key) do nothing
      returning 1
    )
    select count(*) into v_n from ins;

    with due as (
      select c.id, c.customer_id, c.visa_issue_date
        from public.cases c
       where c.visa_issue_date is not null and c.archived_at is null
         and (c.visa_issue_date + make_interval(months => (v_cfg->>'months')::int))::date <= v_today
    )
    select count(*) into v_t from (
      select private.ensure_call_task(
        d.customer_id, 'renewal', 'medium',
        'Visa issued ' || to_char(d.visa_issue_date, 'Mon YYYY') || ' — due for renewal',
        'renewal:' || d.id::text, d.id, null, v_today
      ) from due d
    ) x;

    rule := 'renewal.due'; events_emitted := v_n; tasks_raised := v_t;
    return next;
  end if;

  -- ── Quote unanswered N days (§5.10) ───────────────────────────────────────
  select enabled, config into v_on, v_cfg
    from public.automation_settings where key = 'rule.quote_unanswered';
  if coalesce(v_on, false) then
    with q as (
      select c.id, c.customer_id, c.stage_entered_at
        from public.cases c
        join public.stages s on s.id = c.stage_id
       where s.key = 'quoted' and c.status = 'open' and c.archived_at is null
         and c.stage_entered_at < now() - make_interval(days => (v_cfg->>'after_days')::int)
    ), ins as (
      insert into public.events (type, entity, entity_id, customer_id, case_id, payload, dedupe_key)
      select 'quote.unanswered', 'case', q.id, q.customer_id, q.id, '{}'::jsonb,
             'quote.unanswered:' || q.id::text
        from q
      on conflict (dedupe_key) do nothing
      returning 1
    )
    select count(*) into v_n from ins;

    select count(*) into v_t from (
      select private.ensure_call_task(
        q.customer_id, 'quote_followup', 'medium',
        'Quoted ' || extract(day from now() - q.stage_entered_at)::int || ' days ago, no answer',
        'quote_followup:' || q.id::text, q.id, null, v_today
      )
      from (
        select c.id, c.customer_id, c.stage_entered_at
          from public.cases c join public.stages s on s.id = c.stage_id
         where s.key = 'quoted' and c.status = 'open' and c.archived_at is null
           and c.stage_entered_at < now() - make_interval(days => (v_cfg->>'after_days')::int)
      ) q
    ) x;

    rule := 'quote.unanswered'; events_emitted := v_n; tasks_raised := v_t;
    return next;
  end if;

  -- ── Documents outstanding N days (§5.7) ───────────────────────────────────
  select enabled, config into v_on, v_cfg
    from public.automation_settings where key = 'rule.docs_missing';
  if coalesce(v_on, false) then
    with d as (
      select cd.case_id, c.customer_id, count(*) as n
        from public.case_documents cd
        join public.cases c on c.id = cd.case_id
       where cd.state = 'outstanding'
         and cd.outstanding_since < now() - make_interval(days => (v_cfg->>'after_days')::int)
         and c.status = 'open'
       group by cd.case_id, c.customer_id
    ), ins as (
      insert into public.events (type, entity, entity_id, customer_id, case_id, payload, dedupe_key)
      select 'docs.missing', 'case', d.case_id, d.customer_id, d.case_id,
             jsonb_build_object('count', d.n), 'docs.missing:' || d.case_id::text
        from d
      on conflict (dedupe_key) do nothing
      returning 1
    )
    select count(*) into v_n from ins;

    select count(*) into v_t from (
      select private.ensure_call_task(
        d.customer_id, 'doc_collection', 'high',
        d.n || ' document' || case when d.n = 1 then '' else 's' end || ' still outstanding',
        'doc_collection:' || d.case_id::text, d.case_id, null, v_today
      )
      from (
        select cd.case_id, c.customer_id, count(*) as n
          from public.case_documents cd
          join public.cases c on c.id = cd.case_id
         where cd.state = 'outstanding'
           and cd.outstanding_since < now() - make_interval(days => (v_cfg->>'after_days')::int)
           and c.status = 'open'
         group by cd.case_id, c.customer_id
      ) d
    ) x;

    rule := 'docs.missing'; events_emitted := v_n; tasks_raised := v_t;
    return next;
  end if;

  -- ── Unreachable: no email on file → the chase can only ever be a call ─────
  --
  -- §5.6: "Hard bounce, or no email on file → flag the customer and raise a
  -- CallTask. This is the bridge: email failure becomes a human call, not a
  -- silent drop." Answering OQ10 in the product rather than in a spreadsheet.
  with unreachable as (
    select distinct i.customer_id, c.name
      from public.invoices_v i
      join public.customers c on c.id = i.customer_id
     where i.lifecycle = 'issued'
       and i.outstanding_paise > 0
       and (c.email is null or c.email_flagged_at is not null)
       and c.archived_at is null
  )
  select count(*) into v_t from (
    select private.ensure_call_task(
      u.customer_id, 'unreachable', 'high',
      'No working email on file — money owed can only be chased by phone',
      'unreachable:' || u.customer_id::text, null, null, v_today
    ) from unreachable u
  ) x;
  rule := 'unreachable'; events_emitted := 0; tasks_raised := v_t;
  return next;

  -- ── Promises that came good close themselves (§5.7) ───────────────────────
  update public.call_tasks t
     set status = 'auto_closed', closed_at = now(), updated_at = now()
   where t.status = 'open'
     and t.reason = 'promise_due'
     and t.invoice_id is not null
     and exists (
       select 1 from public.invoices_v i
        where i.id = t.invoice_id and i.outstanding_paise <= 0
     );
  get diagnostics v_n = row_count;
  rule := 'promise.auto_closed'; events_emitted := v_n; tasks_raised := 0;
  return next;

  return;
end $$;

comment on function public.run_automation_rules is
  'Every rule writes an Event and/or a CallTask. It CANNOT send — that is the '
  'seam (§4). Idempotent via events.dedupe_key + call_tasks.dedupe_key, so it '
  'is safe to run every 15 minutes forever.';

revoke all on function public.run_automation_rules() from public, anon, authenticated;
grant execute on function public.run_automation_rules() to service_role;

grant select on public.call_list_v to authenticated;
