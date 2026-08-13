-- ============================================================================
-- record_payment()'s idempotency has never worked.
--
-- The guard reads:
--     where p.invoice_id = p_invoice_id and p.reference = p_idempotency_key
-- but the insert stores the USER-TYPED reference in that column:
--     ... p_paid_on, p_reference, v_uid ...
-- p_idempotency_key is never persisted anywhere -- payments has no column for
-- it. So the lookup can only ever match if the operator happened to type the
-- key into the "Cheque no / transfer ref" box.
--
-- Consequence: a lost response on a flaky connection, then a resubmit, books
-- the money TWICE. The overpayment guard does not catch it while the double is
-- still <= the invoice total -- it only caps the damage. RecordPaymentButton's
-- comment claims double-submit protection that does not exist.
--
-- Fix: a real column plus a partial unique index, so idempotency is enforced
-- by the DATABASE and not merely looked for. The index is the guarantee; the
-- early-return below is just the friendly path.
-- ============================================================================

alter table public.payments
  add column if not exists idempotency_key text;

comment on column public.payments.idempotency_key is
  'Client-supplied, one per payment ATTEMPT. Deduplicates a retry after a lost '
  'response. Distinct from `reference`, which is the human cheque/transfer no.';

-- Partial, so the many pre-existing NULL rows do not collide with each other.
create unique index if not exists payments_idempotency_uk
  on public.payments (invoice_id, idempotency_key)
  where idempotency_key is not null;

-- The payments guard freezes every column not in its mutable list, and it
-- compares whole rows, so this new column is frozen automatically -- no change
-- needed there (that default-deny-on-new-columns property is why it was
-- written as a whole-row diff).

create or replace function public.record_payment(
  p_invoice_id      uuid,
  p_amount_paise    bigint,
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
  v_inv        public.invoices%rowtype;
  v_uid        uuid := auth.uid();
  v_paid_paise bigint;
  v_id         uuid;
  v_paid_on    date;
  v_series     text;
  v_seq        bigint;
begin
  if v_uid is null or not (select public.is_active_user()) then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

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

  -- Now reads the column it actually writes.
  if p_idempotency_key is not null then
    select p.id into v_id from public.payments p
    where p.invoice_id = p_invoice_id and p.idempotency_key = p_idempotency_key;
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

  v_series := case
    when extract(month from v_paid_on) >= 4 then
      'RCT-' || to_char(v_paid_on, 'YYYY') || '-' || to_char(v_paid_on + interval '1 year', 'YY')
    else
      'RCT-' || to_char(v_paid_on - interval '1 year', 'YYYY') || '-' || to_char(v_paid_on, 'YY')
  end;
  v_seq := private.next_invoice_seq(v_series);

  insert into public.payments
    (invoice_id, amount_paise, method, paid_on, reference, recorded_by, series, seq,
     idempotency_key)
  values (p_invoice_id, p_amount_paise, p_method, v_paid_on, p_reference, v_uid,
          v_series, v_seq, p_idempotency_key)
  returning id into v_id;

  v_paid_paise := v_paid_paise + p_amount_paise;
  return query select v_id, v_paid_paise, v_inv.total_paise - v_paid_paise;
end $$;

revoke all on function public.record_payment(uuid, bigint, public.payment_method, date, text, text) from public, anon;

grant execute on function public.record_payment(uuid, bigint, public.payment_method, date, text, text) to authenticated;
