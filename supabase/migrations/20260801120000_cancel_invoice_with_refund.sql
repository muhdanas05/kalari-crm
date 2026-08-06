-- "Cancel invoice after it's issued — if we cancel we have to return money
-- too, so reflect the dashboard correctly."
--
-- void_invoice() already refuses an invoice with live payments against it
-- ("use a credit note, not a void") — correct, since a payment must never
-- point at a document that no longer stands. What was missing is the other
-- side: an actual way to cancel one WITH its money returned, not just a
-- refusal. This is that path — void every live payment (the refund: money
-- that was "collected" no longer is, everywhere that's read from — dashboard,
-- Accounts, invoices_v.outstanding_paise, all derive from
-- payments.voided_at is null) and the invoice, in one transaction, so there's
-- no window where payments are gone but the invoice still reads 'issued'.
--
-- Same guarantees as void_invoice(): admin-only, reason required, number
-- stays consumed forever, nothing is deleted — only reachable when this
-- exact case applies, so void_invoice() itself is untouched.
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
  if not (select public.is_admin()) then
    raise exception 'cancelling an invoice is admin-only' using errcode = '42501';
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

revoke all on function public.cancel_invoice_with_refund(uuid, text) from public, anon;
grant execute on function public.cancel_invoice_with_refund(uuid, text) to authenticated;
