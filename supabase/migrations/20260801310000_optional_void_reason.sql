-- ============================================================================
-- The void/cancel reason is now OPTIONAL.
--
-- All three RPCs enforced `length(btrim(p_reason)) < 3 -> raise`, and the UI
-- enforced the same minimum. The practical effect was a Cancel & refund button
-- that appeared to be broken: you clicked it, nothing happened, and a small red
-- line asked for a longer reason. Owner's call — this is his own book, and a
-- free-text field should never be the thing standing between him and voiding
-- an invoice.
--
-- invoices_void_ck still requires void_reason to be NOT NULL when lifecycle is
-- 'void', so a blank reason gets a default instead of a null. The audit trail
-- keeps a row either way; it just no longer insists the human narrate it.
-- ============================================================================

create or replace function public.void_invoice(p_invoice_id uuid, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_inv public.invoices%rowtype; v_paid_paise bigint; v_reason text;
begin
  if not (select public.has_permission('invoices')) then
    raise exception 'not authorised' using errcode = '42501';
  end if;
  v_reason := coalesce(nullif(btrim(p_reason), ''), 'Voided (no reason given)');

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
      'invoice % has % paise of payments against it; use cancel_invoice_with_refund()',
      v_inv.number, v_paid_paise using errcode = '23514';
  end if;

  update public.invoices
     set lifecycle = 'void', voided_at = now(), voided_by = auth.uid(), void_reason = v_reason
   where id = p_invoice_id;
end $$;

create or replace function public.void_payment(p_payment_id uuid, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_reason text;
begin
  if not (select public.has_permission('invoices')) then
    raise exception 'not authorised' using errcode = '42501';
  end if;
  v_reason := coalesce(nullif(btrim(p_reason), ''), 'Voided (no reason given)');

  update public.payments
     set voided_at = now(), voided_by = auth.uid(), void_reason = v_reason
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
  v_reason text;
begin
  if not (select public.has_permission('invoices')) then
    raise exception 'not authorised' using errcode = '42501';
  end if;
  v_reason := coalesce(nullif(btrim(p_reason), ''), 'Cancelled and refunded (no reason given)');

  select * into v_inv from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'invoice % not found', p_invoice_id using errcode = 'P0002';
  end if;
  if v_inv.lifecycle <> 'issued' then
    raise exception 'invoice % is already void', v_inv.number using errcode = '23514';
  end if;

  update public.payments
     set voided_at = now(), voided_by = auth.uid(),
         void_reason = 'refunded — invoice cancelled: ' || v_reason
   where invoice_id = p_invoice_id and voided_at is null;

  update public.invoices
     set lifecycle = 'void', voided_at = now(), voided_by = auth.uid(), void_reason = v_reason
   where id = p_invoice_id;
end $$;
