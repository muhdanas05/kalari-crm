-- Bug fix: create_lead() always opened the case on the Sales pipeline's
-- new_enquiry stage, but also wrote the caller's p_service_id straight onto
-- cases.service_id. tg_case_stage_guard (0017) refuses that combination —
-- stage_applicability only ever has rows for the Processing pipeline's
-- stages, never Sales's, so ANY lead created with a service pre-selected
-- (the "Service interest" field on the New Lead form) raised 23514. The
-- guard's own comment already says the intended shape: "No service means no
-- declared path (e.g. a Sales enquiry before the service is known)." A
-- pipeline case only gets its real service_id later, when an invoice opens
-- one (openCaseForService, 0032-era). The Sales-stage lead never should have
-- carried it.
--
-- Fix: stop writing p_service_id onto the case. The customer's interest is
-- not thrown away — it rides along on the same lead.created event the
-- optional message already used, so it's still on record, just not enforced
-- as a stage path the case isn't on yet.
create or replace function public.create_lead(
  p_name         text,
  p_phone        text,
  p_email        text default null,
  p_service_id   uuid default null,
  p_source       text default null,
  p_message      text default null,
  p_gclid        text default null,
  p_fbclid       text default null,
  p_utm_source   text default null,
  p_utm_medium   text default null,
  p_utm_campaign text default null,
  p_utm_content  text default null,
  p_utm_term     text default null,
  p_referrer     text default null,
  p_landing_page text default null
)
returns table (customer_id uuid, case_id uuid, is_new_customer boolean)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_customer     uuid;
  v_case         uuid;
  v_is_new       boolean := false;
  v_e164         text;
  v_pipeline     uuid;
  v_stage        uuid;
  v_service_name text;
begin
  if coalesce(trim(p_name), '') = '' or coalesce(trim(p_phone), '') = '' then
    raise exception 'name and phone are required' using errcode = '23514';
  end if;

  v_e164 := public.normalise_phone_in(p_phone);

  select id into v_customer
    from public.customers
   where phone_e164 = v_e164 and archived_at is null
   limit 1;

  if v_customer is null then
    v_is_new := true;

    insert into public.customers (
      name, phone, email, source,
      gclid, fbclid, utm_source, utm_medium, utm_campaign,
      utm_content, utm_term, referrer, landing_page
    ) values (
      trim(p_name), trim(p_phone), nullif(trim(p_email), ''),
      coalesce(p_source, 'website'),
      p_gclid, p_fbclid, p_utm_source, p_utm_medium, p_utm_campaign,
      p_utm_content, p_utm_term, p_referrer, p_landing_page
    )
    returning id into v_customer;
  end if;

  select pl.id, s.id into v_pipeline, v_stage
    from public.pipelines pl
    join public.stages s on s.pipeline_id = pl.id
   where pl.key = 'sales' and s.key = 'new_enquiry'
   limit 1;

  -- service_id intentionally omitted: a Sales-stage case has no declared
  -- stage path yet (tg_case_stage_guard), so it stays null here regardless
  -- of what the caller expressed interest in.
  insert into public.cases (
    customer_id, pipeline_id, stage_id,
    status, opened_at, stage_entered_at, pax_adults, pax_children
  ) values (
    v_customer, v_pipeline, v_stage,
    'open', now(), now(), 1, 0
  )
  returning id into v_case;

  if p_service_id is not null then
    select name into v_service_name from public.services where id = p_service_id;
  end if;

  if coalesce(trim(p_message), '') <> '' or p_service_id is not null then
    insert into public.events (type, entity, entity_id, customer_id, case_id, payload, dedupe_key)
    values ('lead.created', 'case', v_case, v_customer, v_case,
            jsonb_strip_nulls(jsonb_build_object(
              'message', nullif(trim(p_message), ''),
              'source', p_source,
              'interested_service_id', p_service_id,
              'interested_service_name', v_service_name
            )),
            'lead.note:' || v_case::text)
    on conflict (dedupe_key) do nothing;
  end if;

  return query select v_customer, v_case, v_is_new;
end $$;

comment on function public.create_lead is
  'The single intake path — website form AND manual entry. Creates customer '
  '(dedup on phone) + Sales case at new_enquiry, no service_id (REQ-P2: a '
  'Sales case has no declared stage path). A service interest expressed at '
  'intake rides along on the lead.created event only; the real service_id is '
  'set later when an invoice opens a Processing-pipeline case for it.';
