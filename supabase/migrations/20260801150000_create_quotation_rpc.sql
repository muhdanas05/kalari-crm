-- create_quotation(): the only way a quotation gets its number.
-- private.next_invoice_seq() has no grant to `authenticated` — the private
-- schema is hidden from every client role on purpose (0022's reasoning,
-- reused here) — so this is a thin security-definer wrapper, same shape as
-- dispatch_call_task(). Same financial-year series format as invoices
-- (INV-) and receipts (RCT-), prefixed QUO-.
create or replace function public.create_quotation(
  p_customer_id     uuid,
  p_service_id      uuid,
  p_custom_service_name text,
  p_pax_adults      integer,
  p_pax_children    integer,
  p_lines           jsonb,
  p_subtotal_paise  bigint,
  p_gst_paise       bigint,
  p_total_paise     bigint,
  p_amount_note     text,
  p_valid_until     date
)
returns table (quotation_id uuid, number text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_today  date := public.today_kolkata();
  v_series text;
  v_seq    bigint;
  v_id     uuid;
begin
  if not (select public.is_active_user()) then
    raise exception 'not authorised' using errcode = '42501';
  end if;
  if p_pax_adults is null or p_pax_adults < 1 then
    raise exception 'at least one adult is required' using errcode = '23514';
  end if;
  if jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 then
    raise exception 'a quotation needs at least one line' using errcode = '23514';
  end if;

  v_series := case
    when extract(month from v_today) >= 4 then
      'QUO-' || to_char(v_today, 'YYYY') || '-' || to_char(v_today + interval '1 year', 'YY')
    else
      'QUO-' || to_char(v_today - interval '1 year', 'YYYY') || '-' || to_char(v_today, 'YY')
  end;
  v_seq := private.next_invoice_seq(v_series);

  insert into public.quotations (
    series, seq, customer_id, service_id, custom_service_name,
    pax_adults, pax_children, lines, subtotal_paise, gst_paise, total_paise,
    amount_note, valid_until, created_by
  ) values (
    v_series, v_seq, p_customer_id, p_service_id, p_custom_service_name,
    p_pax_adults, p_pax_children, p_lines, p_subtotal_paise, p_gst_paise, p_total_paise,
    p_amount_note, p_valid_until, auth.uid()
  )
  returning id into v_id;

  return query select v_id, (select q.number from public.quotations q where q.id = v_id);
end $$;

revoke all on function public.create_quotation(
  uuid, uuid, text, integer, integer, jsonb, bigint, bigint, bigint, text, date
) from public, anon;
grant execute on function public.create_quotation(
  uuid, uuid, text, integer, integer, jsonb, bigint, bigint, bigint, text, date
) to authenticated;
