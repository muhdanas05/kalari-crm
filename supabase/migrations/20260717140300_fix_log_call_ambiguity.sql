-- ============================================================================
-- 0018 · Fix: log_call() raised 42702 on every single call.
--
--   ERROR: column reference "attempts" is ambiguous
--   DETAIL: It could refer to either a PL/pgSQL variable or a table column.
--
-- `returns table (..., attempts integer)` declares `attempts` as an OUT
-- variable, which then collides with public.call_tasks.attempts inside
-- `set attempts = attempts + 1`. Postgres refuses rather than guessing — which
-- is the right call, and it means the whole call queue was dead on arrival.
--
-- Two fixes, both applied:
--   1. Alias the table (`update public.call_tasks t ... t.attempts + 1`) so the
--      right-hand side is unambiguous.
--   2. Rename the OUT columns away from column names entirely. Relying on an
--      alias to dodge a name collision works until the next person edits the
--      function; not having the collision is better.
--
-- Caught by exercising the function against real rows, not by reading it. It
-- typechecked, it deployed, and it would have failed on the first real call.
-- ============================================================================

drop function if exists public.log_call(
  uuid, public.call_outcome, text, date, date, integer
);

create or replace function public.log_call(
  p_task_id     uuid,
  p_outcome     public.call_outcome,
  p_notes       text default null,
  p_promised_on date default null,
  p_callback_on date default null,
  p_duration_seconds integer default null
)
returns table (
  out_status   public.call_task_status,
  out_due_on   date,
  out_attempts integer
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_task     public.call_tasks%rowtype;
  v_uid      uuid := (select auth.uid());
  v_status   public.call_task_status;
  v_due      date;
  v_attempts integer;
  v_admin    uuid;
begin
  if v_uid is null or not (select public.is_active_user()) then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- FOR UPDATE: two devices logging the same task must not both increment from
  -- the same starting count.
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

  v_attempts := v_task.attempts + 1;
  v_status   := 'done';
  v_due      := v_task.due_on;

  case p_outcome
    -- Didn't reach: requeue +1 day; after 3 attempts escalate AND STOP.
    -- Stopping is the point — a queue that never gives up is a queue nobody
    -- trusts, and §5.7 says "escalates to you" precisely so it leaves the
    -- employee's list.
    when 'no_answer', 'busy', 'switched_off' then
      if v_attempts >= 3 then
        v_status := 'escalated';
      else
        v_status := 'open';
        v_due    := (select public.today_kolkata()) + 1;
      end if;

    when 'needs_callback' then
      v_status := 'open';
      v_due    := coalesce(p_callback_on, (select public.today_kolkata()) + 1);

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

    when 'wrong_number' then
      v_status := 'done';
      update public.customers c set phone_flagged_at = now()
       where c.id = v_task.customer_id and c.phone_flagged_at is null;

      select p.id into v_admin from public.profiles p
       where p.role = 'admin' and p.active and p.archived_at is null
       limit 1;

      insert into public.call_tasks (
        customer_id, reason, priority, context_line, due_on,
        assigned_user_id, dedupe_key
      ) values (
        v_task.customer_id, 'wrong_number_admin', 'high',
        'Wrong number reported — needs a correct contact',
        (select public.today_kolkata()), v_admin,
        'wrong_number_admin:' || v_task.customer_id::text
      )
      on conflict (dedupe_key) do nothing;

    else
      v_status := 'done';
  end case;

  update public.call_tasks t
     set status     = v_status,
         attempts   = v_attempts,
         due_on     = v_due,
         updated_at = now(),
         closed_at  = case when v_status in ('done', 'escalated') then now() end
   where t.id = p_task_id;

  out_status   := v_status;
  out_due_on   := v_due;
  out_attempts := v_attempts;
  return next;
end $$;

comment on function public.log_call is
  'The §5.7 requeue rules in one transaction: no-answer +1 day, 3 attempts then '
  'escalate and STOP, promise creates a dated auto-closing task, wrong number '
  'flags the customer and raises an admin task. FOR UPDATE so two devices '
  'logging the same task cannot both increment from the same count.';

grant execute on function public.log_call(uuid, public.call_outcome, text, date, date, integer)
  to authenticated;
