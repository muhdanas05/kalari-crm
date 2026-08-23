-- ============================================================================
-- queue_invoice_email() now returns the event id it created.
--
-- Without it the caller had no way to dispatch THAT event: dispatchEvents()
-- claims the oldest N unprocessed events, so with any backlog the freshly
-- queued resend sat behind other work and the button reported nothing while
-- flushing unrelated mail. The id lets the send path be targeted.
-- ============================================================================

drop function if exists public.queue_invoice_email(uuid);

create or replace function public.queue_invoice_email(p_invoice_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_inv public.invoices%rowtype;
  v_event_id uuid;
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

  insert into public.events (type, entity, entity_id, customer_id, case_id, payload, dedupe_key)
  values (
    'invoice.issued', 'invoice', v_inv.id, v_inv.customer_id, v_inv.case_id,
    jsonb_build_object('number', v_inv.number, 'resend', true),
    'invoice.issued:manual:' || v_inv.id::text || ':'
      || extract(epoch from clock_timestamp())::text
  )
  returning id into v_event_id;

  return v_event_id;
end $$;

revoke all on function public.queue_invoice_email(uuid) from public, anon;

grant execute on function public.queue_invoice_email(uuid) to authenticated;
