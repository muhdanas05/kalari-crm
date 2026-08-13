-- ============================================================================
-- Every scheduled chase raised TWO identical call tasks.
--
-- run_automation_rules() does both halves itself: it inserts the event AND
-- calls private.ensure_call_task() with a key like
--     'payment_chase:<invoice_id>:<week>'
-- The same cron tick then dispatches that event, and DISPATCH_RULES marks
-- invoice.overdue / case.stuck / docs.missing / quote.unanswered / renewal.due
-- as call `when: "always"`, so the TypeScript dispatcher raises a SECOND task
-- with a key of
--     'payment_chase:<event_id>'
--
-- Those two key spaces can never collide, so `on conflict (dedupe_key) do
-- nothing` -- the thing that is supposed to make all of this idempotent --
-- protects nothing across them. The employee's call list showed every overdue
-- invoice, every stuck case and every doc chase TWICE, and the customer got
-- rung twice.
--
-- Fix: dedupe on MEANING as well as on key. A second open task for the same
-- (customer, reason, case, invoice) is by definition the same piece of work,
-- whichever path raised it and whatever key it carries. This is deliberately
-- belt-and-braces rather than deleting one of the two call sites: the key
-- check still does the cheap work, and this catches any future caller that
-- invents a third key format for the same job.
--
-- Distinct invoices still raise distinct tasks -- p_invoice_id differs, so the
-- guard does not match. Two overdue invoices for one customer are two calls,
-- which is correct.
--
-- `is not distinct from` rather than `=` so NULL case/invoice ids compare as
-- equal; `= null` would be NULL and the guard would never fire for the
-- customer-level reasons (unreachable, reengagement).
-- ============================================================================

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
      (select id from public.profiles where role = 'admin' limit 1),
      p_reason, p_priority, p_context,
      coalesce(p_due_on, public.today_kolkata()), p_dedupe_key
    where exists (
      select 1 from public.customers cu
      where cu.id = p_customer_id and cu.archived_at is null
    )
    -- The new guard: the same work is not already sitting open.
    and not exists (
      select 1 from public.call_tasks t
      where t.customer_id = p_customer_id
        and t.reason      = p_reason
        and t.case_id     is not distinct from p_case_id
        and t.invoice_id  is not distinct from p_invoice_id
        and t.status      = 'open'
    )
    on conflict (dedupe_key) do nothing
    returning 1
  )
  select exists (select 1 from ins);
$$;

comment on function private.ensure_call_task is
  'Raises a call task, idempotently. Two layers: the unique dedupe_key, and a '
  'semantic check that no OPEN task for the same (customer, reason, case, '
  'invoice) already exists -- the second exists because run_automation_rules() '
  'and the TypeScript dispatcher both raise tasks under different key formats '
  'and were producing duplicates.';
