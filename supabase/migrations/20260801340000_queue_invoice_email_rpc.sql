-- ============================================================================
-- Fix: the "Email" button on an invoice has never worked.
--
-- emailInvoice() inserts straight into public.events as the signed-in user,
-- but `authenticated` holds SELECT and nothing else on that table
-- (20260717140000: `revoke all ... ; grant select on public.events`). Every
-- click therefore came back with:
--     permission denied for table events
--
-- That revoke is correct and stays: events is the automation seam, and letting
-- a browser insert arbitrary rows into it means letting a browser trigger
-- arbitrary emails to arbitrary customers. The fix is a door with a lock, not
-- a wider grant -- the same shape as public.dispatch_call_task().
--
-- Authorisation inside the definer: the 'invoices' permission AND the caller's
-- normal access to that customer. security definer bypasses RLS, so this check
-- is not optional.
-- ============================================================================

create or replace function public.queue_invoice_email(p_invoice_id uuid)
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

  select * into v_inv from public.invoices where id = p_invoice_id;
  if not found then
    raise exception 'invoice % not found', p_invoice_id using errcode = 'P0002';
  end if;

  if not (select public.can_access_customer(v_inv.customer_id)) then
    raise exception 'not authorised for this customer' using errcode = '42501';
  end if;

  -- A resend is a deliberate human act -- the customer rang and asked for the
  -- invoice again -- so the key is made unique per click rather than reusing
  -- the one the automatic send at issue already burned. clock_timestamp() (not
  -- now()) so two clicks inside one transaction still differ.
  insert into public.events (type, entity, entity_id, customer_id, case_id, payload, dedupe_key)
  values (
    'invoice.issued', 'invoice', v_inv.id, v_inv.customer_id, v_inv.case_id,
    jsonb_build_object('number', v_inv.number, 'resend', true),
    'invoice.issued:manual:' || v_inv.id::text || ':'
      || extract(epoch from clock_timestamp())::text
  );
end $$;

revoke all on function public.queue_invoice_email(uuid) from public, anon;

grant execute on function public.queue_invoice_email(uuid) to authenticated;
