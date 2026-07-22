-- ============================================================================
-- 0024 · Portal: add "pay here" (bank details) + the unpaid invoice number.
--
-- The brief: the portal should show "pay-here info", and — clarified — that is
-- BANK DETAILS ONLY plus a line telling the customer to message us once they've
-- paid. No gateway (SOW §03).
--
-- portal_read() is SECURITY DEFINER and returns a deliberately narrow payload.
-- This widens it by exactly two safe fields: the payment instructions (already
-- public-facing copy, stored in automation_settings) and the number of the
-- oldest unpaid invoice, so the customer knows which reference to quote.
-- Still no passport, no phone, no internal notes.
-- ============================================================================

create or replace function public.portal_read(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_customer public.customers%rowtype;
  v_case     record;
  v_docs     jsonb;
  v_money    jsonb;
  v_pay      text;
  v_inv_no   text;
begin
  select * into v_customer
    from public.customers c
   where c.portal_token_hash = extensions.digest(p_token, 'sha256')
     and c.portal_revoked_at is null
     and c.archived_at is null;

  if not found then
    perform pg_sleep(0.15);
    return null;
  end if;

  select c.id, c.visa_issue_date, s.name as stage_name, s.sort_order as stage_sort,
         sv.name as service_name, p.name as pipeline_name, c.status,
         c.stage_entered_at
    into v_case
    from public.cases c
    join public.stages s     on s.id = c.stage_id
    join public.pipelines p  on p.id = c.pipeline_id
    left join public.services sv on sv.id = c.service_id
   where c.customer_id = v_customer.id and c.archived_at is null
   order by c.opened_at desc
   limit 1;

  if v_case.status = 'closed'
     and v_case.stage_entered_at < now() - interval '90 days' then
    return null;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('label', cd.label) order by cd.label), '[]'::jsonb)
    into v_docs
    from public.case_documents cd
   where cd.case_id = v_case.id and cd.state = 'outstanding';

  select jsonb_build_object(
           'total_paise',       coalesce(sum(i.total_paise), 0),
           'paid_paise',        coalesce(sum(i.paid_paise), 0),
           'outstanding_paise', coalesce(sum(i.outstanding_paise), 0)
         )
    into v_money
    from public.invoices_v i
   where i.customer_id = v_customer.id and i.lifecycle = 'issued';

  -- The invoice they should quote as their reference: oldest still owing.
  select i.number into v_inv_no
    from public.invoices_v i
   where i.customer_id = v_customer.id
     and i.lifecycle = 'issued'
     and i.outstanding_paise > 0
   order by i.issue_date
   limit 1;

  -- Bank details, only when there is actually something to pay — no reason to
  -- show payment instructions to a customer who owes nothing.
  if coalesce((v_money->>'outstanding_paise')::bigint, 0) > 0 then
    select (config->>'text') into v_pay
      from public.automation_settings
     where key = 'email.payment_instructions' and enabled;
  end if;

  return jsonb_build_object(
    'customer', jsonb_build_object('name', v_customer.name),
    'case', case when v_case.id is null then null else jsonb_build_object(
      'stage',        v_case.stage_name,
      'service',      v_case.service_name,
      'pipeline',     v_case.pipeline_name,
      'stage_path',   (
        select coalesce(jsonb_agg(jsonb_build_object('name', st.name) order by sa.sort_order), '[]'::jsonb)
          from public.stage_applicability sa
          join public.stages st on st.id = sa.stage_id
         where sa.service_id = (select service_id from public.cases where id = v_case.id)
      ),
      'complete',     (v_case.status = 'closed')
    ) end,
    'documents_outstanding', v_docs,
    'money', v_money,
    'invoice_number', v_inv_no,
    'payment_instructions', v_pay
  );
end $$;
