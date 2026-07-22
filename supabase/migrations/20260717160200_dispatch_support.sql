-- ============================================================================
-- 0022 · Support functions for the TypeScript dispatcher.
--
-- The dispatcher runs as service_role and needs to raise call tasks. It cannot
-- call private.ensure_call_task() — `private` is hidden from every client role
-- on purpose, and granting USAGE on the schema to reach one function would undo
-- that. So: a thin public wrapper, granted to service_role only.
-- ============================================================================

create or replace function public.dispatch_call_task(
  p_customer_id uuid,
  p_reason      public.call_reason,
  p_priority    public.call_priority,
  p_context     text,
  p_dedupe_key  text,
  p_case_id     uuid default null,
  p_invoice_id  uuid default null
)
returns boolean            -- true when a task was actually raised
language sql
volatile
security definer
set search_path = ''
as $$
  select private.ensure_call_task(
    p_customer_id, p_reason, p_priority, p_context, p_dedupe_key,
    p_case_id, p_invoice_id, null
  );
$$;

comment on function public.dispatch_call_task is
  'Wrapper so the TypeScript dispatcher (service_role) can raise a call task '
  'without granting anything USAGE on the private schema. Idempotent via '
  'dedupe_key, like everything else in the automation layer.';

revoke all on function public.dispatch_call_task(uuid, public.call_reason, public.call_priority, text, text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.dispatch_call_task(uuid, public.call_reason, public.call_priority, text, text, uuid, uuid)
  to service_role;

-- ── Settings the dispatcher looks up ────────────────────────────────────────
--
-- Every rule individually toggleable (§5.10). These were referenced by the
-- dispatcher's rule table but never seeded — a missing key reads as "enabled",
-- which is the safe default but leaves the Automations tab with holes in it.
insert into public.automation_settings (key, enabled, config) values
  ('rule.stage_changed', true,
   '{"note":"Only fires for stages switched on in stage_email_config, and once per stage per case — ever."}'),
  ('rule.invoice_unpaid', true, '{"every_days":3,"max":5}')
on conflict (key) do nothing;

-- ── The unsent-queue view, for the Automations tab ──────────────────────────
create view public.automation_log_v with (security_invoker = true) as
select
  e.id,
  e.type::text            as event_type,
  e.entity,
  e.entity_id,
  e.customer_id,
  e.case_id,
  e.occurred_at,
  e.processed_at,
  e.processed_result,
  e.attempts,
  e.dedupe_key,
  c.name                  as customer_name,
  -- An event that has been sitting unprocessed through several attempts is a
  -- broken automation, and the brief asks for exactly this to be visible with a
  -- red icon rather than discovered a month later.
  (e.processed_at is null and e.attempts > 0)                  as is_failing,
  (e.processed_result ? 'error')                               as has_error,
  (e.processed_result ->> 'error')                             as error_text
from public.events e
left join public.customers c on c.id = e.customer_id;

comment on view public.automation_log_v is
  'What the automation layer actually did, per event. Powers the Automations '
  'tab — including the failures, which are the reason the tab exists.';

grant select on public.automation_log_v to authenticated;
