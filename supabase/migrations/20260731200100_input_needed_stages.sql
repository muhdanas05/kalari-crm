-- ============================================================================
-- 0034 · "Needs input from the customer" — fully custom per-stage emails, an
--        automatic call task, and an in-app stage editor.
--
-- Extends stage_email_config (already existed — "which stages email is DATA,
-- not code") with the piece it was missing: when a stage genuinely needs
-- something FROM the customer (a document, a payment, an answer), the office
-- wants to write that email themselves, for that exact stage, whatever it's
-- named — not pick from the shared template list.
--
-- Also opens up stage CRUD: today only a migration could add a stage or wire
-- it into a service's path. `stages` and `stage_applicability` had SELECT
-- policies and nothing else — admin write was simply never granted.
-- ============================================================================

-- ── stage_email_config: the custom content + the flag ───────────────────────
alter table public.stage_email_config
  add column if not exists requires_input  boolean not null default false,
  add column if not exists custom_subject  text,
  add column if not exists custom_body     text;

comment on column public.stage_email_config.requires_input is
  'This stage is a checkpoint: entering it emails the customer with '
  'custom_subject/custom_body (NOT the shared email_templates table) and raises '
  'a call task, so it happens whether or not the email lands. Independent of '
  '`enabled` — the two mechanisms never fire for the same stage (see '
  'tg_case_stage_event) so a customer is never emailed twice for one arrival.';

comment on column public.stage_email_config.custom_body is
  'Same {{token}} substitution as email_templates.body (customer_name, '
  'portal_url, service_name, stage_name, next_step, …) — rendered by the same '
  'function, just sourced from here instead of a shared template row.';

grant update (requires_input, custom_subject, custom_body, updated_by, updated_at)
  on public.stage_email_config to authenticated;

-- ── stages / stage_applicability: admin can now write, not just read ───────
-- `stages` has no archived_at — a stage nobody's service path uses is simply
-- absent from stage_applicability, which is the soft "unused" state. No new
-- column for something the schema already expresses.
create policy stages_admin_write on public.stages
  for all to authenticated
  using      ( (select public.is_admin()) )
  with check ( (select public.is_admin()) );

grant insert, update on public.stages to authenticated;

create policy stage_applicability_admin_write on public.stage_applicability
  for all to authenticated
  using      ( (select public.is_admin()) )
  with check ( (select public.is_admin()) );

grant insert, update, delete on public.stage_applicability to authenticated;

-- ── The trigger: branch on requires_input, never double-email a stage ──────
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

  -- A checkpoint stage: custom email + call task, regardless of `enabled` —
  -- requires_input is its own switch, deliberately not gated behind the
  -- generic one. Needs an actual subject written, or there is nothing to send.
  if coalesce(v_requires_input, false) and coalesce(trim(v_custom_subject), '') <> '' then
    insert into public.events (type, entity, entity_id, customer_id, case_id, payload, dedupe_key)
    values (
      'case.input_needed', 'case', NEW.id, NEW.customer_id, NEW.id,
      jsonb_build_object('stage', v_stage),
      -- Same (case, stage) dedupe rule as case.stage_changed: walking
      -- backwards and forwards through a checkpoint sends it once, not again.
      'case.input_needed:' || NEW.id::text || ':' || NEW.stage_id::text
    )
    on conflict (dedupe_key) do nothing;
    return NEW;
  end if;

  if not coalesce(v_enabled, false) then
    return NEW;
  end if;

  insert into public.events (type, entity, entity_id, customer_id, case_id, payload, dedupe_key)
  values (
    'case.stage_changed', 'case', NEW.id, NEW.customer_id, NEW.id,
    jsonb_build_object('stage', v_stage, 'template', coalesce(v_template, 'stage.changed')),
    'case.stage_changed:' || NEW.id::text || ':' || NEW.stage_id::text
  )
  on conflict (dedupe_key) do nothing;

  return NEW;
end $$;

-- ── Seed: the rule toggle, matching every other rule.* setting ─────────────
insert into public.automation_settings (key, enabled, config) values
  ('rule.input_needed', true,
   '{"note":"Emails the checkpoint stage''s custom message and raises a call task the moment a case enters it."}')
on conflict (key) do nothing;

-- ── Assertions ────────────────────────────────────────────────────────────
do $$
declare v_cols integer;
begin
  select count(*) into v_cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'stage_email_config'
    and column_name in ('requires_input', 'custom_subject', 'custom_body');
  if v_cols <> 3 then
    raise exception 'expected 3 new stage_email_config columns, found %', v_cols;
  end if;
  raise notice 'input-needed stages ok: % new columns on stage_email_config', v_cols;
end $$;
