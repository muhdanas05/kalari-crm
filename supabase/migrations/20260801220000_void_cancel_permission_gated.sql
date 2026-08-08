-- void_invoice/void_payment/cancel_invoice_with_refund were admin-only.
-- Gate on the 'invoices' permission instead — same as everything else in
-- this pass, access is per-page, not per-role. A manager granted the
-- Invoices tab can now do the whole invoice lifecycle on it, not just view.
create or replace function public.void_invoice(p_invoice_id uuid, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_inv public.invoices%rowtype; v_paid_paise bigint;
begin
  if not (select public.has_permission('invoices')) then
    raise exception 'not authorised' using errcode = '42501';
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
end $$;

create or replace function public.void_payment(p_payment_id uuid, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not (select public.has_permission('invoices')) then
    raise exception 'not authorised' using errcode = '42501';
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

create or replace function public.cancel_invoice_with_refund(
  p_invoice_id uuid,
  p_reason     text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_inv public.invoices%rowtype;
begin
  if not (select public.has_permission('invoices')) then
    raise exception 'not authorised' using errcode = '42501';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 3 then
    raise exception 'a reason is required' using errcode = '23514';
  end if;

  select * into v_inv from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'invoice % not found', p_invoice_id using errcode = 'P0002';
  end if;
  if v_inv.lifecycle <> 'issued' then
    raise exception 'invoice % is already void', v_inv.number using errcode = '23514';
  end if;

  update public.payments
     set voided_at = now(), voided_by = auth.uid(),
         void_reason = 'refunded — invoice cancelled: ' || p_reason
   where invoice_id = p_invoice_id and voided_at is null;

  update public.invoices
     set lifecycle = 'void', voided_at = now(), voided_by = auth.uid(), void_reason = p_reason
   where id = p_invoice_id;
end $$;
