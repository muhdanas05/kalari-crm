-- ============================================================================
-- Payment receipts — replaces the paper receipt book. Every recorded payment
-- gets a gap-free, per-financial-year receipt number, exactly like invoices
-- (private.next_invoice_seq is generic over the series string, so 'RCT-...'
-- costs nothing new).
--
-- Forward-only: the schema is live. Never edit an applied migration.
-- ============================================================================

alter table public.payments
  add column series text,
  add column seq    bigint check (seq > 0),
  add column number text generated always as
    (case when series is not null and seq is not null
          then series || '-' || lpad(seq::text, 5, '0') end) stored;

-- Nullable: the table is empty on this project today, but nullable keeps the
-- migration safe in general — an old payment with no receipt number is a
-- truthful state, not a broken one.
alter table public.payments
  add constraint payments_number_uk unique (series, seq);

-- ── record_payment: assign the receipt number at insert ─────────────────────
-- Same signature and return shape as before (CLAUDE.md: forward-only, and
-- changing a function's OUT columns would require a drop). The immutability
-- guard (private.tg_payment_guard) only fires on UPDATE/DELETE, so setting
-- series/seq here, at INSERT, is untouched by it — and once set, frozen by it.
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
  v_paid_on date;
  v_series  text;
  v_seq     bigint;
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

  v_paid_on := coalesce(p_paid_on, public.today_kolkata());

  -- Indian financial-year receipt series (April–March), same shape as
  -- current_invoice_series() with an 'RCT-' prefix. Number allocated LAST
  -- (right before the insert), so a failure above never burns one.
  v_series := case
    when extract(month from v_paid_on) >= 4 then
      'RCT-' || to_char(v_paid_on, 'YYYY') || '-' || to_char(v_paid_on + interval '1 year', 'YY')
    else
      'RCT-' || to_char(v_paid_on - interval '1 year', 'YYYY') || '-' || to_char(v_paid_on, 'YY')
  end;
  v_seq := private.next_invoice_seq(v_series);

  insert into public.payments
    (invoice_id, amount_paise, method, paid_on, reference, recorded_by, series, seq)
  values (p_invoice_id, p_amount_paise, p_method, v_paid_on, p_reference, v_uid, v_series, v_seq)
  returning id into v_id;

  v_paid_paise := v_paid_paise + p_amount_paise;
  return query select v_id, v_paid_paise, v_inv.total_paise - v_paid_paise;
end $$;

revoke all on function public.record_payment(uuid, bigint, public.payment_method, date, text, text) from public, anon;

grant execute on function public.record_payment(uuid, bigint, public.payment_method, date, text, text) to authenticated;
