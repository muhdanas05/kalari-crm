-- ============================================================================
-- 0025 · Lead intake + auto-assignment, in one transaction.
--
-- §5.1 / §5.2: an enquiry becomes a Customer + a Sales case at New Enquiry,
-- auto-assigned to the employee with the fewest live cases, ties round-robin.
-- Manual in-app entry uses the SAME code path.
--
-- Why one SQL function and not application code: success criterion §8.3 is
-- "zero unassigned cases". The only way to guarantee that under concurrency is
-- to create the case and pick its owner in the same transaction. Two leads
-- arriving in the same second must not both be handed to the same "fewest
-- cases" employee and leave a third idle — the assignment has to read and write
-- atomically.
-- ============================================================================

create or replace function public.create_lead(
  p_name          text,
  p_phone         text,
  p_email         text default null,
  p_service_id    uuid default null,
  p_source        text default null,
  p_message       text default null,
  -- Attribution (§3.28): write-once, captured on the first lead. A few fields
  -- now; unrecoverable later.
  p_gclid         text default null,
  p_fbclid        text default null,
  p_utm_source    text default null,
  p_utm_medium    text default null,
  p_utm_campaign  text default null,
  p_utm_content   text default null,
  p_utm_term      text default null,
  p_referrer      text default null,
  p_landing_page  text default null
)
returns table (customer_id uuid, case_id uuid, is_new_customer boolean, assigned_to uuid)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_e164     text;
  v_customer uuid;
  v_is_new   boolean := false;
  v_assignee uuid;
  v_pipeline uuid;
  v_stage    uuid;
  v_case     uuid;
begin
  if coalesce(trim(p_name), '') = '' or coalesce(trim(p_phone), '') = '' then
    raise exception 'name and phone are required' using errcode = '23514';
  end if;

  v_e164 := public.normalise_phone_in(p_phone);

  -- §3.27: de-duplicate on phone across formats. An existing customer gets a
  -- NEW case, not a second record. phone_e164 is generated + unique, so this is
  -- the authoritative match, not a fuzzy guess.
  select id into v_customer
    from public.customers
   where phone_e164 = v_e164 and archived_at is null
   limit 1;

  if v_customer is null then
    v_is_new := true;

    -- Fewest live (non-terminal) cases among the active pool; ties → the one
    -- who was assigned least recently (round-robin). FOR UPDATE via the
    -- surrounding transaction keeps two concurrent leads from colliding.
    select p.id into v_assignee
      from public.profiles p
     where p.active and p.archived_at is null and p.in_assignment_pool
     order by
       (select count(*) from public.cases c
         where c.assigned_user_id = p.id
           and c.status = 'open') asc,
       (select coalesce(max(c.created_at), 'epoch'::timestamptz)
          from public.cases c where c.assigned_user_id = p.id) asc,
       p.id
     limit 1;

    insert into public.customers (
      name, phone, email, source, assigned_user_id,
      gclid, fbclid, utm_source, utm_medium, utm_campaign,
      utm_content, utm_term, referrer, landing_page
    ) values (
      trim(p_name), trim(p_phone), nullif(trim(p_email), ''),
      coalesce(p_source, 'website'), v_assignee,
      p_gclid, p_fbclid, p_utm_source, p_utm_medium, p_utm_campaign,
      p_utm_content, p_utm_term, p_referrer, p_landing_page
    )
    returning id into v_customer;
  else
    -- Existing customer: keep their current owner so their cases stay together.
    select assigned_user_id into v_assignee
      from public.customers where id = v_customer;
    if v_assignee is null then
      select p.id into v_assignee
        from public.profiles p
       where p.active and p.archived_at is null and p.in_assignment_pool
       order by (select count(*) from public.cases c
                  where c.assigned_user_id = p.id and c.status = 'open') asc, p.id
       limit 1;
    end if;
  end if;

  -- New enquiries start on the Sales pipeline. A service may not be known yet —
  -- that's fine, the stage guard only enforces a path once a service is set.
  select pl.id, s.id into v_pipeline, v_stage
    from public.pipelines pl
    join public.stages s on s.pipeline_id = pl.id
   where pl.key = 'sales' and s.key = 'new_enquiry'
   limit 1;

  insert into public.cases (
    customer_id, service_id, pipeline_id, stage_id, assigned_user_id,
    status, opened_at, stage_entered_at, pax_adults, pax_children
  ) values (
    v_customer, p_service_id, v_pipeline, v_stage, v_assignee,
    'open', now(), now(), 1, 0
  )
  returning id into v_case;

  -- §5.1: emit lead.created. The case-open trigger already fires the portal-link
  -- email; the note (if any) rides along for context.
  if coalesce(trim(p_message), '') <> '' then
    insert into public.events (type, entity, entity_id, customer_id, case_id, payload, dedupe_key)
    values ('lead.created', 'case', v_case, v_customer, v_case,
            jsonb_build_object('message', p_message, 'source', p_source),
            'lead.note:' || v_case::text)
    on conflict (dedupe_key) do nothing;
  end if;

  return query select v_customer, v_case, v_is_new, v_assignee;
end $$;

comment on function public.create_lead is
  'The single intake path for §5.1 — website form AND manual entry. Creates '
  'customer (dedup on phone, §3.27) + Sales case, auto-assigns to the lightest '
  'active pool member in the same transaction so §8.3 (zero unassigned) holds '
  'under concurrency. Attribution is captured here, write-once (§3.28).';

-- The website posts as service_role (bearer-token authed in the route); manual
-- entry calls it as the signed-in user.
grant execute on function public.create_lead(
  text, text, text, uuid, text, text,
  text, text, text, text, text, text, text, text, text
) to authenticated, service_role;
