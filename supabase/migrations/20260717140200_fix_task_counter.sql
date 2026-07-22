-- ============================================================================
-- 0017 · Fix: run_automation_rules() reported tasks it did not raise.
--
-- ensure_call_task() returned void, so the callers counted their INPUT rows:
--
--   select count(*) from (select private.ensure_call_task(...) from due d) x
--
-- `on conflict do nothing` meant the second run inserted nothing, but the count
-- still reported 4. Verified against the tables: events correctly fell to 0 on a
-- re-run while tasks_raised stayed at 4 — no duplicate rows were created, but
-- the number was a lie.
--
-- That matters more than it looks. This function's return value is what a human
-- reads in the cron log to decide whether the automation layer is working. A
-- counter that reports steady activity while doing nothing is worse than no
-- counter: it manufactures false confidence.
--
-- Fix: return whether a row was actually inserted, and sum that.
--
-- The return type changes void -> boolean, which `create or replace` refuses
-- (42P13: "cannot change return type of existing function"). Drop first.
-- ============================================================================

drop function if exists private.ensure_call_task(
  uuid, public.call_reason, public.call_priority, text, text, uuid, uuid, date
);

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
returns boolean          -- true when a task was actually raised
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
      coalesce(
        cu.assigned_user_id,
        (select id from public.profiles
          where role = 'admin' and active and archived_at is null limit 1)
      ),
      p_reason, p_priority, p_context,
      coalesce(p_due_on, public.today_kolkata()), p_dedupe_key
    from public.customers cu
    where cu.id = p_customer_id and cu.archived_at is null
    on conflict (dedupe_key) do nothing
    returning 1
  )
  select exists (select 1 from ins);
$$;

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
       where i.lifecycle = 'issued' and i.display_status = 'overdue'
    ), ins as (
      insert into public.events (type, entity, entity_id, customer_id, payload, dedupe_key)
      select 'invoice.overdue', 'invoice', d.id, d.customer_id,
             jsonb_build_object('number', d.number,
                                'outstanding_paise', d.outstanding_paise,
                                'days_overdue', d.days_overdue),
             'invoice.overdue:' || d.id::text || ':' || (d.days_overdue / 7)::text
        from due d
      on conflict (dedupe_key) do nothing
      returning 1
    )
    select count(*) into v_n from ins;

    select count(*) filter (where raised) into v_t from (
      select private.ensure_call_task(
        d.customer_id, 'payment_chase', 'high',
        'INR ' || to_char(d.outstanding_paise / 100.0, 'FM999,999,990.00')
          || ' outstanding, ' || d.days_overdue || ' days overdue',
        'payment_chase:' || d.id::text || ':' || (d.days_overdue / 7)::text,
        null, d.id, v_today
      ) as raised
      from public.invoices_v d
      where d.lifecycle = 'issued' and d.display_status = 'overdue'
    ) x;

    rule := 'invoice.overdue'; events_emitted := v_n; tasks_raised := v_t;
    return next;
  end if;

  -- ── Case stuck > N days ───────────────────────────────────────────────────
  select enabled, config into v_on, v_cfg
    from public.automation_settings where key = 'rule.case_stuck';
  if coalesce(v_on, false) then
    with stuck as (
      select c.id, c.customer_id, c.stage_name, c.days_in_stage
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

    select count(*) filter (where raised) into v_t from (
      select private.ensure_call_task(
        c.customer_id, 'case_unblock', 'medium',
        'Stuck at ' || c.stage_name || ' for ' || c.days_in_stage || ' days',
        'case_unblock:' || c.id::text || ':' || (c.days_in_stage / 7)::text,
        c.id, null, v_today
      ) as raised
      from public.cases_board_v c
      where c.is_stuck and c.status = 'open'
    ) x;

    rule := 'case.stuck'; events_emitted := v_n; tasks_raised := v_t;
    return next;
  end if;

  -- ── Renewal at 22 months ──────────────────────────────────────────────────
  select enabled, config into v_on, v_cfg
    from public.automation_settings where key = 'rule.renewal_due';
  if coalesce(v_on, false) then
    with due as (
      select c.id, c.customer_id, c.visa_issue_date,
             (c.visa_issue_date + make_interval(months => (v_cfg->>'months')::int))::date as due_date
        from public.cases c
       where c.visa_issue_date is not null and c.archived_at is null
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

    select count(*) filter (where raised) into v_t from (
      select private.ensure_call_task(
        c.customer_id, 'renewal', 'medium',
        'Visa issued ' || to_char(c.visa_issue_date, 'Mon YYYY') || ' — due for renewal',
        'renewal:' || c.id::text, c.id, null, v_today
      ) as raised
      from public.cases c
      where c.visa_issue_date is not null and c.archived_at is null
        and (c.visa_issue_date + make_interval(months => (v_cfg->>'months')::int))::date <= v_today
    ) x;

    rule := 'renewal.due'; events_emitted := v_n; tasks_raised := v_t;
    return next;
  end if;

  -- ── Quote unanswered N days ───────────────────────────────────────────────
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

    select count(*) filter (where raised) into v_t from (
      select private.ensure_call_task(
        q.customer_id, 'quote_followup', 'medium',
        'Quoted ' || extract(day from now() - q.stage_entered_at)::int || ' days ago, no answer',
        'quote_followup:' || q.id::text, q.id, null, v_today
      ) as raised
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

  -- ── Documents outstanding N days ──────────────────────────────────────────
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

    select count(*) filter (where raised) into v_t from (
      select private.ensure_call_task(
        d.customer_id, 'doc_collection', 'high',
        d.n || ' document' || case when d.n = 1 then '' else 's' end || ' still outstanding',
        'doc_collection:' || d.case_id::text, d.case_id, null, v_today
      ) as raised
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

  -- ── Unreachable: no working email + money owed → it can only be a call ────
  select count(*) filter (where raised) into v_t from (
    select private.ensure_call_task(
      u.customer_id, 'unreachable', 'high',
      'No working email on file — money owed can only be chased by phone',
      'unreachable:' || u.customer_id::text, null, null, v_today
    ) as raised
    from (
      select distinct i.customer_id
        from public.invoices_v i
        join public.customers c on c.id = i.customer_id
       where i.lifecycle = 'issued' and i.outstanding_paise > 0
         and (c.email is null or c.email_flagged_at is not null)
         and c.archived_at is null
    ) u
  ) x;
  rule := 'unreachable'; events_emitted := 0; tasks_raised := v_t;
  return next;

  -- ── Promises that came good close themselves ──────────────────────────────
  update public.call_tasks t
     set status = 'auto_closed', closed_at = now(), updated_at = now()
   where t.status = 'open' and t.reason = 'promise_due' and t.invoice_id is not null
     and exists (
       select 1 from public.invoices_v i
        where i.id = t.invoice_id and i.outstanding_paise <= 0
     );
  get diagnostics v_n = row_count;
  rule := 'promise.auto_closed'; events_emitted := v_n; tasks_raised := 0;
  return next;

  return;
end $$;

revoke all on function public.run_automation_rules() from public, anon, authenticated;
grant execute on function public.run_automation_rules() to service_role;
