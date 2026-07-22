-- ============================================================================
-- 0023 · Call queue management: assign, create manually, report.
--
-- The brief:
--   "we can assign calls also either to employees or call manually also and
--    then i need a report also on which guy has done how many follow ups"
-- ============================================================================

-- ── Assign / reassign a call task ───────────────────────────────────────────
create or replace function public.assign_call_task(
  p_task_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ok boolean;
begin
  -- Reassignment is an admin act. An employee moving their own chase list onto
  -- someone else's is exactly the behaviour the call dashboard exists to catch.
  if not (select public.is_admin()) then
    raise exception 'only an admin can reassign a call' using errcode = '42501';
  end if;

  select (p.active and p.archived_at is null) into v_ok
    from public.profiles p where p.id = p_user_id;

  if not coalesce(v_ok, false) then
    raise exception 'cannot assign work to an inactive user' using errcode = '23514';
  end if;

  update public.call_tasks
     set assigned_user_id = p_user_id, updated_at = now()
   where id = p_task_id and status = 'open';

  if not found then
    raise exception 'no open call task %', p_task_id using errcode = 'P0002';
  end if;
end $$;

-- ── Create a call task by hand ──────────────────────────────────────────────
--
-- The queue is normally machine-generated, but a human always needs the escape
-- hatch: "call this person, here's why". Without it, staff keep a second list on
-- paper and the reporting stops describing reality.
create or replace function public.create_call_task(
  p_customer_id uuid,
  p_context     text,
  p_priority    public.call_priority default 'medium',
  p_due_on      date default null,
  p_assign_to   uuid default null,
  p_case_id     uuid default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id  uuid;
begin
  if v_uid is null or not (select public.is_active_user()) then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not (select public.can_access_customer(p_customer_id)) then
    raise exception 'not authorised for this customer' using errcode = '42501';
  end if;
  if coalesce(trim(p_context), '') = '' then
    raise exception 'a call task needs a reason' using errcode = '23514';
  end if;

  insert into public.call_tasks (
    customer_id, case_id, assigned_user_id, reason, priority,
    context_line, due_on, dedupe_key
  ) values (
    p_customer_id, p_case_id,
    -- Default to whoever created it: a manual task with no owner is a task
    -- nobody does.
    coalesce(p_assign_to, v_uid),
    'quote_followup', p_priority, trim(p_context),
    coalesce(p_due_on, public.today_kolkata()),
    -- No dedupe on manual tasks: if a human asks twice, they mean twice.
    null
  )
  returning id into v_id;

  return v_id;
end $$;

-- ── Follow-up report ────────────────────────────────────────────────────────
--
-- "which guy has done how many follow ups"
--
-- Deliberately reports the OUTCOME MIX, not just a count. A leaderboard of raw
-- call volume rewards exactly the behaviour §5.7 wants to catch: "if someone
-- marks everything 'no answer' in four seconds, this surfaces it." Volume with
-- a zero reach rate is the signal, and you cannot see it from a total.
create or replace function public.call_report(p_days integer default 7)
returns table (
  user_id            uuid,
  user_name          text,
  calls              bigint,
  reached            bigint,
  promised           bigint,
  no_answer          bigint,
  wrong_number       bigint,
  reach_pct          numeric,   -- 0-100 percentage, not money
  avg_seconds        numeric,
  open_tasks         bigint,
  overdue_tasks      bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with window_logs as (
    select l.* from public.call_logs l
     where l.occurred_at >= now() - make_interval(days => p_days)
  )
  select
    p.id,
    p.name,
    count(w.id)                                                    as calls,
    count(*) filter (where w.outcome = 'reached_resolved')         as reached,
    count(*) filter (where w.outcome = 'promised_payment')         as promised,
    count(*) filter (where w.outcome in ('no_answer','busy','switched_off')) as no_answer,
    count(*) filter (where w.outcome = 'wrong_number')             as wrong_number,
    case when count(w.id) = 0 then 0
         else round(
           100.0 * count(*) filter (
             where w.outcome in ('reached_resolved','promised_payment')
           ) / count(w.id), 0)
    end                                                            as reach_pct,
    round(avg(w.duration_seconds), 0)                              as avg_seconds,
    (select count(*) from public.call_tasks t
      where t.assigned_user_id = p.id and t.status = 'open')       as open_tasks,
    (select count(*) from public.call_tasks t
      where t.assigned_user_id = p.id and t.status = 'open'
        and t.due_on < public.today_kolkata())                       as overdue_tasks
  from public.profiles p
  left join window_logs w on w.user_id = p.id
  where p.active and p.archived_at is null
  group by p.id, p.name
  order by calls desc, p.name;
$$;

comment on function public.call_report is
  'Follow-ups per employee. Reports the outcome MIX, not a leaderboard of raw '
  'volume — volume with a zero reach rate is the thing worth seeing (§5.7).';

revoke all on function public.assign_call_task(uuid, uuid) from public, anon;
revoke all on function public.create_call_task(uuid, text, public.call_priority, date, uuid, uuid) from public, anon;
revoke all on function public.call_report(integer) from public, anon;

grant execute on function public.assign_call_task(uuid, uuid) to authenticated;
grant execute on function public.create_call_task(uuid, text, public.call_priority, date, uuid, uuid) to authenticated;
grant execute on function public.call_report(integer) to authenticated;

-- ── The History feed ────────────────────────────────────────────────────────
--
-- The brief: "history tabs for overall logs and in logs i want detailed info
-- errors and those type of things ... i want alerts also on errors occured".
--
-- One union so the tab is one query and one sort. Everything that happened, in
-- order, with failures marked — because a log you have to cross-reference three
-- screens to read is a log nobody reads.
-- NOTE: activity_log.id is bigint; events/email_log/call_logs are uuid. A union
-- of those is a type error (42804), so every id is cast to text. The feed is a
-- mixed bag by nature — a text id says so honestly, and nothing joins on it.
create view public.history_v with (security_invoker = true) as
  -- Data changes (append-only, trigger-written)
  select
    a.id::text as id,
    a.occurred_at,
    'activity'                                     as source,
    a.entity,
    a.entity_id,
    null::uuid                                     as customer_id,
    a.action::text                                 as action,
    a.actor_kind::text                             as actor_kind,
    a.user_id,
    coalesce(array_to_string(a.changed_keys, ', '), '') as detail,
    false                                          as is_error,
    null::text                                     as error_text
  from public.activity_log a

  union all

  -- Automations
  select
    e.id::text,
    e.occurred_at,
    'automation',
    e.entity,
    e.entity_id,
    e.customer_id,
    e.type::text,
    'system',
    null::uuid,
    coalesce(e.processed_result::text, 'pending'),
    (e.processed_result ? 'error') or (e.processed_at is null and e.attempts > 1),
    e.processed_result ->> 'error'
  from public.events e

  union all

  -- Email
  select
    l.id::text,
    l.occurred_at,
    'email',
    'customer',
    l.customer_id,
    l.customer_id,
    coalesce(l.template_key, 'email'),
    'system',
    null::uuid,
    l.subject,
    l.status = 'failed' or l.bounced_at is not null,
    coalesce(l.error, case when l.bounced_at is not null then 'bounced: ' || coalesce(l.bounce_type,'') end)
  from public.email_log l

  union all

  -- Calls
  select
    c.id::text,
    c.occurred_at,
    'call',
    'customer',
    c.customer_id,
    c.customer_id,
    c.outcome::text,
    'user',
    c.user_id,
    coalesce(c.notes, ''),
    c.outcome = 'wrong_number',
    null
  from public.call_logs c;

comment on view public.history_v is
  'Everything that happened, one feed, failures flagged. security_invoker, so '
  'an employee sees only their own customers here too.';

grant select on public.history_v to authenticated;
