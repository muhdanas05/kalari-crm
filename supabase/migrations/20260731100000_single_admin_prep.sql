-- ============================================================================
-- 0031 · Single-admin mode, part 1 of 2: collapse every employee-aware policy
--        and function to admin-only, while assigned_user_id and the employee
--        enum value still physically exist.
--
-- Kalari runs one person. "Employee" and the whole assignment/load-balancing
-- machinery was scaffolding for the UAE firm this template came from — a
-- 6-person office where "which employee does this customer belong to" was a
-- real question. It never was here.
--
-- Two migrations, in this order, because dropping a column a policy still
-- references, or a value a column still holds, fails outright. This one
-- rewrites every USING/WITH CHECK clause and every function body down to
-- is_admin()-only; 0032 drops the now-unreferenced columns.
--
-- What is DELIBERATELY NOT touched, and why:
--   • is_active_user() / the `active`+`archived_at` gate — this is account
--     revocation, orthogonal to the employee/admin split. Still meaningful
--     with one admin: it's how a compromised session gets shut off.
--   • tg_require_active_admin() — the lockout guard. Matters MORE now, not
--     less: it is the only thing standing between a mistake and a CRM with
--     nobody able to sign in.
--   • The `user_role` enum and `profiles.role` column themselves. Recreating
--     an enum used by a NOT NULL column with a default (to shrink it to just
--     'admin') is real surgery for zero user-facing benefit — nothing in the
--     app offers 'employee' as a choice after this pair of migrations lands.
--     The single row stays role='admin' forever; that fact is now asserted
--     structurally by every policy below, not by the enum's shape.
--   • call_tasks.assigned_user_id — kept. The call-queue UI's due-date and
--     assignment display reads it, it's harmless with one admin (every task
--     resolves to them), and dropping it is churn with no payoff.
-- ============================================================================

-- ── customers ────────────────────────────────────────────────────────────
drop policy if exists customers_select on public.customers;

create policy customers_select on public.customers
  for select to authenticated
  using ( (select public.is_admin()) );

drop policy if exists customers_update on public.customers;

create policy customers_update on public.customers
  for update to authenticated
  using      ( (select public.is_admin()) )
  with check ( (select public.is_admin()) );

-- ── cases ────────────────────────────────────────────────────────────────
drop policy if exists cases_select on public.cases;

create policy cases_select on public.cases
  for select to authenticated
  using ( (select public.is_admin()) );

drop policy if exists cases_update on public.cases;

create policy cases_update on public.cases
  for update to authenticated
  using      ( (select public.is_admin()) )
  with check ( (select public.is_admin()) );

-- ── call_tasks ───────────────────────────────────────────────────────────
drop policy if exists call_tasks_select on public.call_tasks;

create policy call_tasks_select on public.call_tasks
  for select to authenticated
  using ( (select public.is_admin()) );

-- ── case_documents ───────────────────────────────────────────────────────
drop policy if exists case_documents_select on public.case_documents;

create policy case_documents_select on public.case_documents
  for select to authenticated
  using ( (select public.is_admin()) );

drop policy if exists case_documents_update on public.case_documents;

create policy case_documents_update on public.case_documents
  for update to authenticated
  using ( (select public.is_admin()) );

-- ── can_access_customer() ───────────────────────────────────────────────
-- Every RPC and policy that calls this (issue_invoice, record_payment,
-- read_customer_passport, the email_queue/email_log/events/call_logs
-- policies, …) collapses to "is this the admin" automatically — nothing else
-- needs editing.
create or replace function public.can_access_customer(p_customer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select public.is_admin())
$$;

-- ── archive_case() ──────────────────────────────────────────────────────
-- The assignee-OR branch was hand-inlined here, not expressed as a policy —
-- easy to miss in a diff, so it gets its own block.
create or replace function public.archive_case(p_case_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_case public.cases%rowtype; v_invoices integer;
begin
  select * into v_case from public.cases where id = p_case_id;
  if not found then
    raise exception 'case % not found', p_case_id using errcode = 'P0002';
  end if;

  select count(*) into v_invoices
  from public.invoices where case_id = p_case_id and lifecycle = 'issued';

  if v_invoices > 0 and not (select public.is_admin()) then
    raise exception
      'this case has % issued invoice(s) — archiving it is admin-only', v_invoices
      using errcode = '42501';
  elsif not (select public.is_admin()) then
    raise exception 'not authorised to archive this case' using errcode = '42501';
  end if;

  update public.cases
     set archived_at = now()
   where id = p_case_id and archived_at is null;
end $$;

-- ── admin_set_user() ────────────────────────────────────────────────────
-- Drops the role/pool params — nobody is left to promote, demote or
-- load-balance. `active` (revocation) is the only knob that still means
-- anything. Original signature was (uuid, user_role, boolean, boolean); the
-- explicit drop is required because a narrower parameter list is a different
-- overload as far as Postgres is concerned, not a replacement.
drop function if exists public.admin_set_user(uuid, public.user_role, boolean, boolean);

create or replace function public.admin_set_user(
  p_user_id uuid,
  p_active  boolean default null
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
  -- Locking the owner out of their own CRM is a plausible Tuesday. The
  -- constraint trigger on profiles catches the last-admin case at commit;
  -- this catches the more common self-inflicted one with a clearer message.
  if p_user_id = auth.uid() and p_active is false then
    raise exception 'you cannot deactivate yourself' using errcode = '42501';
  end if;

  update public.profiles
     set active = coalesce(p_active, active)
   where id = p_user_id;
  if not found then
    raise exception 'user % not found', p_user_id using errcode = 'P0002';
  end if;
end $$;

revoke all on function public.admin_set_user(uuid, boolean) from public, anon;

grant execute on function public.admin_set_user(uuid, boolean) to authenticated;

-- ── create_lead(): delete the load-balancing block ──────────────────────
-- Nothing to balance across with one person. v_assignee is simply the sole
-- admin, looked up once — the last place this migration pair writes the
-- literal role = 'admin' before 0032 removes the concept from the schema's
-- vocabulary entirely (call_tasks keeps the column, but stops branching on
-- role to fill it — see ensure_call_task below).
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
returns table (customer_id uuid, case_id uuid, is_new_customer boolean, assigned_to uuid)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_customer uuid;
  v_case     uuid;
  v_is_new   boolean := false;
  v_assignee uuid;
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

  -- The one admin, full stop. No pool, no load-balancing, no round-robin.
  select id into v_assignee from public.profiles limit 1;

  if v_customer is null then
    v_is_new := true;

    insert into public.customers (
      name, phone, email, source, assigned_user_id,
      gclid, fbclid, utm_source, utm_medium, utm_campaign,
      utm_content, utm_term, referrer, landing_page
    ) values (
      trim(p_name), trim(p_phone), nullif(trim(p_email), ''),
      coalesce(p_source, 'website'), v_assignee,
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
    customer_id, service_id, pipeline_id, stage_id, assigned_user_id,
    status, opened_at, stage_entered_at, pax_adults, pax_children
  ) values (
    v_customer, p_service_id, v_pipeline, v_stage, v_assignee,
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

  return query select v_customer, v_case, v_is_new, v_assignee;
end $$;

comment on function public.create_lead is
  'The single intake path — website form AND manual entry. Creates customer '
  '(dedup on phone) + Sales case, assigned to the sole admin. Single-admin '
  'mode: no pool, no load-balancing (0031).';

-- ── ensure_call_task(): drop the admin-fallback branch ──────────────────
-- coalesce(owner, admin-fallback) was there because a customer could be
-- unowned. With one admin every customer's assigned_user_id already IS the
-- admin (create_lead sets it unconditionally above), so the coalesce and its
-- role-lookup subquery are dead weight, not a safety net. Same shape as
-- 20260717140200's definition — dropped and recreated because the RETURNS
-- boolean signature must match exactly for `create or replace` to apply.
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
      p_customer_id, p_case_id, p_invoice_id, cu.assigned_user_id,
      p_reason, p_priority, p_context,
      coalesce(p_due_on, public.today_kolkata()), p_dedupe_key
    from public.customers cu
    where cu.id = p_customer_id and cu.archived_at is null
    on conflict (dedupe_key) do nothing
    returning 1
  )
  select exists (select 1 from ins);
$$;

-- ── log_call() ────────────────────────────────────────────────────────────
-- Deliberately UNTOUCHED. Its authorization already goes through
-- can_access_customer() (rewritten above to is_admin()-only), so it collapses
-- correctly with zero edits. Its wrong_number branch still looks up
-- `where role = 'admin' … limit 1` — that continues to return the correct
-- (only) row and is left as-is rather than rewritten for cosmetic reasons on
-- a working, load-bearing function with a documented history of a subtle bug
-- (0018 — ambiguous column reference). Not worth the risk for no behavior
-- change.

-- ── Assertions ────────────────────────────────────────────────────────────
do $$
declare v_profiles integer; v_role text;
begin
  select count(*) into v_profiles from public.profiles;
  if v_profiles <> 1 then
    raise exception
      'single-admin migration expects exactly 1 profile row, found % — stop and '
      'check for leftover test accounts before continuing to 0032', v_profiles;
  end if;

  select role::text into v_role from public.profiles limit 1;
  if v_role <> 'admin' then
    raise exception 'the sole profile row must be role=admin, found %', v_role;
  end if;

  raise notice 'single-admin prep ok: 1 profile, role=admin, all policies collapsed';
end $$;
