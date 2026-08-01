-- "2 emails will be sent — one from us normally status update and one for
-- collecting docs — because follow ups will be triggered on input stages
-- only." tg_case_stage_event() currently RETURNs right after inserting
-- case.input_needed, which means a checkpoint stage skips the regular
-- stage_changed update entirely — the customer gets only the custom
-- "we need X" email, never the plain "you're now at Y" one, even when the
-- stage has both switched on. Those are two different messages with two
-- different jobs; a checkpoint stage should send the update AND the
-- request, not one instead of the other. Removed the early return so both
-- checks run independently.
create or replace function private.tg_case_stage_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enabled        boolean;
  v_template       text;
  v_requires_input boolean;
  v_custom_subject text;
  v_stage          text;
  v_terminal       boolean;
begin
  if NEW.stage_id is not distinct from OLD.stage_id then
    return NEW;
  end if;

  select s.name, s.is_terminal into v_stage, v_terminal
    from public.stages s where s.id = NEW.stage_id;

  -- Completion is its own event, not a stage update.
  if v_terminal and v_stage = 'Complete' then
    insert into public.events (type, entity, entity_id, customer_id, case_id, payload, dedupe_key)
    values ('case.completed', 'case', NEW.id, NEW.customer_id, NEW.id, '{}'::jsonb,
            'case.completed:' || NEW.id::text)
    on conflict (dedupe_key) do nothing;
    return NEW;
  end if;

  select c.enabled, c.template_key, c.requires_input, c.custom_subject
    into v_enabled, v_template, v_requires_input, v_custom_subject
    from public.stage_email_config c where c.stage_id = NEW.stage_id;

  -- A checkpoint stage: custom email + call task. requires_input is its own
  -- switch, independent of `enabled` — a stage can be a checkpoint with no
  -- regular update, a regular update with no checkpoint, or both, in which
  -- case the customer gets two separate emails: this one, and the plain
  -- status update below. Needs an actual subject written, or there is
  -- nothing to send.
  if coalesce(v_requires_input, false) and coalesce(trim(v_custom_subject), '') <> '' then
    insert into public.events (type, entity, entity_id, customer_id, case_id, payload, dedupe_key)
    values (
      'case.input_needed', 'case', NEW.id, NEW.customer_id, NEW.id,
      jsonb_build_object('stage', v_stage),
      'case.input_needed:' || NEW.id::text || ':' || NEW.stage_id::text
    )
    on conflict (dedupe_key) do nothing;
  end if;

  if coalesce(v_enabled, false) then
    insert into public.events (type, entity, entity_id, customer_id, case_id, payload, dedupe_key)
    values (
      'case.stage_changed', 'case', NEW.id, NEW.customer_id, NEW.id,
      jsonb_build_object('stage', v_stage, 'template', coalesce(v_template, 'stage.changed')),
      'case.stage_changed:' || NEW.id::text || ':' || NEW.stage_id::text
    )
    on conflict (dedupe_key) do nothing;
  end if;

  return NEW;
end $$;
