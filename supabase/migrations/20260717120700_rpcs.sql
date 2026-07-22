-- ============================================================================
-- 0008 · The RPC seam.
--
-- An operation becomes a security-definer RPC when it (a) touches money,
-- (b) needs multi-statement atomicity, (c) needs a cross-row invariant RLS
-- cannot express, or (d) crosses the RLS boundary. Everything else stays a
-- direct table write with RLS + column grants — customers and drafts need no
-- RPCs at all.
--
-- EVERY function here: security definer · set search_path = '' · revoke from
-- public+anon · and an EXPLICIT authorization check as the first statement.
-- DEFINER means RLS already did nothing for you.
-- ============================================================================

-- ── can_access_customer ─────────────────────────────────────────────────────
create or replace function public.can_access_customer(p_customer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select public.is_admin())
      or exists (
        select 1 from public.customers c
        where c.id = p_customer_id
          and c.assigned_user_id = (select auth.uid())
          and (select public.is_active_user())
      )
$$;

revoke all on function public.can_access_customer(uuid) from public, anon;

grant execute on function public.can_access_customer(uuid) to authenticated;

-- ── issue_invoice ───────────────────────────────────────────────────────────
-- Turns a draft into an immutable, numbered document.
--
-- p_expected_total_paise comes from the TypeScript engine. SQL re-sums the lines
-- independently; a mismatch raises. That is the drift tripwire between the two
-- implementations of money math — it fires LOUDLY at issue rather than silently
-- on a PDF that has already reached a customer.
create or replace function public.issue_invoice(
  p_draft_id            uuid,
  p_expected_total_paise bigint,
  p_issue_date          date default null,
  p_idempotency_key     text default null
)
returns table (invoice_id uuid, number text, total_paise bigint)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_draft      public.invoice_drafts%rowtype;
  v_uid        uuid := auth.uid();
  v_series     text;
  v_seq        bigint;
  v_issue      date;
  v_due        date;
  v_overdue_n  integer;
  v_subtotal_paise   bigint := 0;
  v_gst_paise        bigint := 0;
  v_id         uuid;
  v_existing   public.invoices%rowtype;
  v_line       jsonb;
  v_no         integer := 0;
  v_svc_name   text;
begin
  -- 1. Authorization. DEFINER bypassed RLS, so this is not optional.
  if v_uid is null or not (select public.is_active_user()) then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_draft from public.invoice_drafts where id = p_draft_id;
  if not found then
    raise exception 'draft % not found', p_draft_id using errcode = 'P0002';
  end if;

  if not (select public.can_access_customer(v_draft.customer_id)) then
    raise exception 'not authorised for this customer' using errcode = '42501';
  end if;

  -- 2. Idempotency. Survives double-clicks and client retries: returns the
  --    invoice that already exists instead of issuing a second one.
  if p_idempotency_key is not null then
    select * into v_existing from public.invoices
    where customer_id = v_draft.customer_id and idempotency_key = p_idempotency_key;
    if found then
      return query select v_existing.id, v_existing.number, v_existing.total_paise;
      return;
    end if;
  end if;

  if v_draft.issued_invoice_id is not null then
    raise exception 'draft % is already issued as %', p_draft_id, v_draft.issued_invoice_id
      using errcode = '23505';
  end if;

  -- 3. Lines must exist and be arithmetically exact.
  if jsonb_typeof(v_draft.lines) <> 'array' or jsonb_array_length(v_draft.lines) = 0 then
    raise exception 'cannot issue an invoice with no lines' using errcode = '23514';
  end if;

  for v_line in select * from jsonb_array_elements(v_draft.lines) loop
    if (v_line ->> 'qty')::integer <= 0 then
      raise exception 'line "%": qty must be > 0', v_line ->> 'label' using errcode = '23514';
    end if;
    if (v_line ->> 'rate_paise')::bigint < 0 then
      raise exception 'line "%": rate cannot be negative', v_line ->> 'label' using errcode = '23514';
    end if;
    v_subtotal_paise := v_subtotal_paise + ((v_line ->> 'qty')::bigint * (v_line ->> 'rate_paise')::bigint);
    v_gst_paise := v_gst_paise + coalesce(round(
      (((v_line ->> 'qty')::bigint * (v_line ->> 'rate_paise')::bigint)::numeric
        * coalesce((v_line ->> 'gst_bp')::integer, 0)) / 10000), 0);
  end loop;

  -- 4. The drift tripwire.
  if (v_subtotal_paise + v_gst_paise) is distinct from p_expected_total_paise then
    raise exception
      'total mismatch: client says % paise, database computes % paise. Refusing to issue.',
      p_expected_total_paise, v_subtotal_paise + v_gst_paise using errcode = '23514';
  end if;

  -- 5. Dates. Asia/Kolkata, always (CLAUDE.md §4).
  v_issue := coalesce(p_issue_date, public.today_kolkata());
  if v_issue > public.today_kolkata() then
    raise exception 'cannot issue an invoice dated in the future' using errcode = '23514';
  end if;
  if v_issue < public.today_kolkata() and not (select public.is_admin()) then
    raise exception 'back-dating an invoice is admin-only' using errcode = '42501';
  end if;

  -- OQ8 [ASSUMPTION] — due_date snapshotted at issue, default 7 days.
  select coalesce(nullif(current_setting('app.invoice_overdue_days', true), ''), '7')::integer
    into v_overdue_n;
  v_due := v_issue + v_overdue_n;

  -- Indian financial-year series (April–March): July 2026 → 'INV-2026-27'.
  -- Derived from v_issue (not today) so a back-dated invoice lands in the FY it
  -- belongs to. Must mirror public.current_invoice_series().
  v_series := case
    when extract(month from v_issue) >= 4 then
      'INV-' || to_char(v_issue, 'YYYY') || '-' || to_char(v_issue + interval '1 year', 'YY')
    else
      'INV-' || to_char(v_issue - interval '1 year', 'YYYY') || '-' || to_char(v_issue, 'YY')
  end;

  -- Number order must not contradict date order within a series.
  if exists (select 1 from public.invoices
             where series = v_series and issue_date > v_issue and doc_type = 'invoice') then
    raise exception 'issue_date % precedes an existing invoice in series % — '
      'numbers would not follow dates', v_issue, v_series using errcode = '23514';
  end if;

  select s.name into v_svc_name from public.services s where s.id = v_draft.service_id;

  -- 6. Number allocated LAST, so the counter row is locked for the shortest
  --    possible time and a failure above never burns a number.
  v_seq := private.next_invoice_seq(v_series);

  insert into public.invoices (
    doc_type, customer_id, case_id, service_id, service_name,
    pax_adults, pax_children, series, seq, issue_date, due_date,
    subtotal_paise, gst_paise, total_paise, amount_note,
    issued_by, idempotency_key
  ) values (
    'invoice', v_draft.customer_id, v_draft.case_id, v_draft.service_id,
    coalesce(v_svc_name, 'Custom'),
    v_draft.pax_adults, v_draft.pax_children, v_series, v_seq, v_issue, v_due,
    v_subtotal_paise, v_gst_paise, v_subtotal_paise + v_gst_paise, v_draft.amount_note,
    v_uid, p_idempotency_key
  ) returning id into v_id;

  for v_line in select * from jsonb_array_elements(v_draft.lines) loop
    v_no := v_no + 1;
    insert into public.invoice_lines (
      invoice_id, line_no, label, qty, rate_paise, catalogue_rate_paise,
      amount_paise, gst_bp, gst_paise
    ) values (
      v_id, v_no, v_line ->> 'label',
      (v_line ->> 'qty')::integer,
      (v_line ->> 'rate_paise')::bigint,
      nullif(v_line ->> 'catalogue_rate_paise', '')::bigint,
      (v_line ->> 'qty')::bigint * (v_line ->> 'rate_paise')::bigint,
      coalesce((v_line ->> 'gst_bp')::integer, 0),
      coalesce(round((((v_line ->> 'qty')::bigint * (v_line ->> 'rate_paise')::bigint)::numeric
        * coalesce((v_line ->> 'gst_bp')::integer, 0)) / 10000), 0)
    );
  end loop;

  update public.invoice_drafts set issued_invoice_id = v_id where id = p_draft_id;

  return query select v_id, i.number, i.total_paise from public.invoices i where i.id = v_id;
end $$;

revoke all on function public.issue_invoice(uuid, bigint, date, text) from public, anon;

grant execute on function public.issue_invoice(uuid, bigint, date, text) to authenticated;

-- ── attach_invoice_pdf ──────────────────────────────────────────────────────
create or replace function public.attach_invoice_pdf(p_invoice_id uuid, p_path text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_customer uuid;
begin
  select customer_id into v_customer from public.invoices where id = p_invoice_id;
  if not found then
    raise exception 'invoice % not found', p_invoice_id using errcode = 'P0002';
  end if;
  if not (select public.can_access_customer(v_customer)) then
    raise exception 'not authorised' using errcode = '42501';
  end if;
  update public.invoices set pdf_path = p_path where id = p_invoice_id;
end $$;

revoke all on function public.attach_invoice_pdf(uuid, text) from public, anon;

grant execute on function public.attach_invoice_pdf(uuid, text) to authenticated;

-- ── record_payment ──────────────────────────────────────────────────────────
create or replace function public.record_payment(
  p_invoice_id      uuid,
  p_amount_paise     bigint,
  p_method          public.payment_method,
  p_paid_on         date default null,
  p_reference       text default null,
  p_idempotency_key text default null
)
returns table (payment_id uuid, paid_paise bigint, outstanding_paise bigint)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_inv   public.invoices%rowtype;
  v_paid_paise  bigint;
  v_uid   uuid := auth.uid();
  v_id    uuid;
begin
  if v_uid is null or not (select public.is_active_user()) then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- LOCK THE INVOICE FIRST. Without this the overpayment check below is racy:
  -- two concurrent partial payments each pass independently and together
  -- overpay. This single line is the difference between a correct ledger and a
  -- ledger that is usually correct.
  select * into v_inv from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'invoice % not found', p_invoice_id using errcode = 'P0002';
  end if;
  if not (select public.can_access_customer(v_inv.customer_id)) then
    raise exception 'not authorised for this customer' using errcode = '42501';
  end if;
  if v_inv.lifecycle <> 'issued' then
    raise exception 'invoice % is void', v_inv.number using errcode = '23514';
  end if;
  if p_amount_paise <= 0 then
    raise exception 'payment amount must be positive' using errcode = '23514';
  end if;

  if p_idempotency_key is not null then
    select p.id into v_id from public.payments p
    where p.invoice_id = p_invoice_id and p.reference = p_idempotency_key;
    if found then
      select coalesce(sum(amount_paise), 0) into v_paid_paise from public.payments
      where invoice_id = p_invoice_id and voided_at is null;
      return query select v_id, v_paid_paise, v_inv.total_paise - v_paid_paise;
      return;
    end if;
  end if;

  select coalesce(sum(amount_paise), 0) into v_paid_paise
  from public.payments where invoice_id = p_invoice_id and voided_at is null;

  if v_paid_paise + p_amount_paise > v_inv.total_paise then
    raise exception
      'overpayment: invoice % totals % paise, % already paid, tried to add %',
      v_inv.number, v_inv.total_paise, v_paid_paise, p_amount_paise using errcode = '23514';
  end if;

  insert into public.payments (invoice_id, amount_paise, method, paid_on, reference, recorded_by)
  values (p_invoice_id, p_amount_paise, p_method,
          coalesce(p_paid_on, public.today_kolkata()), p_reference, v_uid)
  returning id into v_id;

  v_paid_paise := v_paid_paise + p_amount_paise;
  return query select v_id, v_paid_paise, v_inv.total_paise - v_paid_paise;
end $$;

revoke all on function public.record_payment(uuid, bigint, public.payment_method, date, text, text) from public, anon;

grant execute on function public.record_payment(uuid, bigint, public.payment_method, date, text, text) to authenticated;

-- ── void_payment (admin) ────────────────────────────────────────────────────
create or replace function public.void_payment(p_payment_id uuid, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not (select public.is_admin()) then
    raise exception 'voiding a payment is admin-only' using errcode = '42501';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 3 then
    raise exception 'a void reason is required' using errcode = '23514';
  end if;
  update public.payments
     set voided_at = now(), voided_by = auth.uid(), void_reason = p_reason
   where id = p_payment_id and voided_at is null;
  if not found then
    raise exception 'payment % not found or already void', p_payment_id using errcode = 'P0002';
  end if;
end $$;

revoke all on function public.void_payment(uuid, text) from public, anon;

grant execute on function public.void_payment(uuid, text) to authenticated;

-- ── void_invoice (admin) ────────────────────────────────────────────────────
-- PRD §4: Employees "cannot delete, cannot void invoices".
create or replace function public.void_invoice(p_invoice_id uuid, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_inv public.invoices%rowtype; v_paid_paise bigint;
begin
  if not (select public.is_admin()) then
    raise exception 'voiding an invoice is admin-only' using errcode = '42501';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 3 then
    raise exception 'a void reason is required' using errcode = '23514';
  end if;

  select * into v_inv from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'invoice % not found', p_invoice_id using errcode = 'P0002';
  end if;
  if v_inv.lifecycle <> 'issued' then
    raise exception 'invoice % is already void', v_inv.number using errcode = '23514';
  end if;

  -- An invoice with money against it must be corrected by CREDIT NOTE, not
  -- voided — otherwise the payment points at a document that no longer exists.
  select coalesce(sum(amount_paise), 0) into v_paid_paise
  from public.payments where invoice_id = p_invoice_id and voided_at is null;
  if v_paid_paise > 0 then
    raise exception
      'invoice % has % paise of payments against it; use a credit note, not a void',
      v_inv.number, v_paid_paise using errcode = '23514';
  end if;

  update public.invoices
     set lifecycle = 'void', voided_at = now(), voided_by = auth.uid(), void_reason = p_reason
   where id = p_invoice_id;
  -- The number stays consumed forever. Never reused (CLAUDE.md §4).
end $$;

revoke all on function public.void_invoice(uuid, text) from public, anon;

grant execute on function public.void_invoice(uuid, text) to authenticated;

-- ── admin_set_user ──────────────────────────────────────────────────────────
create or replace function public.admin_set_user(
  p_user_id uuid,
  p_role    public.user_role default null,
  p_active  boolean default null,
  p_in_pool boolean default null
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
  -- Locking the owner out of their own CRM is a plausible Tuesday. The constraint
  -- trigger on profiles catches the last-admin case at commit; this catches the
  -- more common self-inflicted one with a clearer message.
  if p_user_id = auth.uid() and (p_role = 'employee' or p_active is false) then
    raise exception 'you cannot demote or deactivate yourself' using errcode = '42501';
  end if;
  update public.profiles
     set role               = coalesce(p_role, role),
         active             = coalesce(p_active, active),
         in_assignment_pool = coalesce(p_in_pool, in_assignment_pool)
   where id = p_user_id;
  if not found then
    raise exception 'user % not found', p_user_id using errcode = 'P0002';
  end if;
end $$;

revoke all on function public.admin_set_user(uuid, public.user_role, boolean, boolean) from public, anon;

grant execute on function public.admin_set_user(uuid, public.user_role, boolean, boolean) to authenticated;

-- ── read_customer_passport ──────────────────────────────────────────────────
-- VOLATILE, because it WRITES the access log. Triggers do not fire on SELECT,
-- so a logged read must go through a function. This is what makes "access
-- logged" (CLAUDE.md §4) a database guarantee rather than a convention someone
-- remembers to follow: you cannot obtain the ciphertext without leaving a row
-- behind.
--
-- Returns CIPHERTEXT. Node decrypts with the key from Railway env. The key
-- never enters Postgres, so a leaked service_role key is not enough to read a
-- passport.
create or replace function public.read_customer_passport(
  p_customer_id uuid,
  p_purpose     text
)
returns table (ciphertext bytea, key_version smallint)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null or not (select public.is_active_user()) then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not (select public.can_access_customer(p_customer_id)) then
    raise exception 'not authorised for this customer' using errcode = '42501';
  end if;
  if p_purpose is null or length(btrim(p_purpose)) < 3 then
    raise exception 'a purpose is required to read PII' using errcode = '23514';
  end if;

  insert into private.pii_access_log (customer_id, user_id, actor_kind, purpose, request_id)
  values (p_customer_id, v_uid, 'user', p_purpose,
          nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-request-id');

  return query
    select p.passport_no_ciphertext, p.key_version
    from private.customer_pii p
    where p.customer_id = p_customer_id;
end $$;

revoke all on function public.read_customer_passport(uuid, text) from public, anon;

grant execute on function public.read_customer_passport(uuid, text) to authenticated;

-- ── upsert_customer_passport ────────────────────────────────────────────────
create or replace function public.upsert_customer_passport(
  p_customer_id uuid,
  p_ciphertext  bytea,
  p_hash        bytea,
  p_key_version smallint default 1
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null or not (select public.can_access_customer(p_customer_id)) then
    raise exception 'not authorised' using errcode = '42501';
  end if;
  insert into private.customer_pii
    (customer_id, passport_no_ciphertext, passport_no_hash, key_version, created_by)
  values (p_customer_id, p_ciphertext, p_hash, p_key_version, v_uid)
  on conflict (customer_id) do update
    set passport_no_ciphertext = excluded.passport_no_ciphertext,
        passport_no_hash       = excluded.passport_no_hash,
        key_version            = excluded.key_version;
end $$;

revoke all on function public.upsert_customer_passport(uuid, bytea, bytea, smallint) from public, anon;

grant execute on function public.upsert_customer_passport(uuid, bytea, bytea, smallint) to authenticated;
