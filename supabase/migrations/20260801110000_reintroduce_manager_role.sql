-- Reintroduces a second role — "manager" (the `employee` enum value, kept
-- from the original schema; only the label changes) — after this session's
-- earlier single-admin removal. Not a revert: single-admin mode assumed
-- exactly one person forever, and that's no longer true.
--
-- The shape asked for: a manager sees everything operational (customers,
-- cases, pipeline, calls, invoices, payments) but NOT money-out (expenses /
-- the Accounts book) and not backend configuration (catalogue, pipeline
-- stages, integrations, automation rules, user management) — those already
-- sit behind admin-only RLS/requireAdmin() and are untouched here.
--
-- can_access_customer() is the one function to widen: call_logs,
-- email_consent, email_log, email_queue and events all gate through it, so
-- fixing it here fixes all of them at once rather than five separate
-- policies. The direct is_admin()-only policies on customers/cases/
-- case_documents/call_tasks/invoices/invoice_drafts don't route through it
-- and need their own widening.

create or replace function public.can_access_customer(p_customer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select public.is_active_user());
$$;

comment on function public.can_access_customer is
  'Any active user (admin or manager) may access any customer — there is no '
  'per-row ownership left to restrict by. Money (expenses) and backend '
  'config stay admin-only via their own policies, untouched by this.';

-- ── Widen the direct is_admin()-only policies to any active user ───────────

drop policy if exists customers_select on public.customers;
create policy customers_select on public.customers
  for select to authenticated using ( (select public.is_active_user()) );

drop policy if exists customers_update on public.customers;
create policy customers_update on public.customers
  for update to authenticated
  using ( (select public.is_active_user()) )
  with check ( (select public.is_active_user()) );

drop policy if exists cases_select on public.cases;
create policy cases_select on public.cases
  for select to authenticated using ( (select public.is_active_user()) );

drop policy if exists cases_update on public.cases;
create policy cases_update on public.cases
  for update to authenticated
  using ( (select public.is_active_user()) )
  with check ( (select public.is_active_user()) );

drop policy if exists case_documents_select on public.case_documents;
create policy case_documents_select on public.case_documents
  for select to authenticated using ( (select public.is_active_user()) );

drop policy if exists case_documents_update on public.case_documents;
create policy case_documents_update on public.case_documents
  for update to authenticated
  using ( (select public.is_active_user()) )
  with check ( (select public.is_active_user()) );

drop policy if exists call_tasks_select on public.call_tasks;
create policy call_tasks_select on public.call_tasks
  for select to authenticated using ( (select public.is_active_user()) );

drop policy if exists invoices_select on public.invoices;
create policy invoices_select on public.invoices
  for select to authenticated using ( (select public.is_active_user()) );

drop policy if exists invoice_drafts_all on public.invoice_drafts;
create policy invoice_drafts_all on public.invoice_drafts
  for all to authenticated
  using ( (select public.is_active_user()) )
  with check ( (select public.is_active_user()) );

-- ── ensure_call_task(): "the one profile" is ambiguous with a second user ──
-- Was written when exactly one profile row could ever exist. Pin it to the
-- admin specifically so call-task assignment doesn't silently start picking
-- whichever profile happens to sort first once a manager exists — the call
-- queue itself is shared and unfiltered by assignee either way, so this is
-- display-only, but it should still be deterministic.
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
      (select id from public.profiles where role = 'admin' limit 1),
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

-- ── admin_set_user(): role is back, as a trailing default param ────────────
-- Adding rather than replacing the 2-param signature — this IS a different
-- overload to Postgres, but nothing currently calls the old one outside this
-- file's own history, so no drop is needed, just the new default-bearing
-- version taking over calls that omit it.
create or replace function public.admin_set_user(
  p_user_id uuid,
  p_active  boolean default null,
  p_role    public.user_role default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not (select public.is_admin()) then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() and (p_active is false or p_role = 'employee') then
    raise exception 'you cannot demote or deactivate yourself' using errcode = '42501';
  end if;

  update public.profiles
     set active = coalesce(p_active, active),
         role   = coalesce(p_role, role)
   where id = p_user_id;
  if not found then
    raise exception 'user % not found', p_user_id using errcode = 'P0002';
  end if;
  -- profiles_require_active_admin (a deferred constraint trigger) still
  -- refuses at commit if this was the last admin — unchanged, still the
  -- real backstop.
end $$;

revoke all on function public.admin_set_user(uuid, boolean, public.user_role) from public, anon;
grant execute on function public.admin_set_user(uuid, boolean, public.user_role) to authenticated;
