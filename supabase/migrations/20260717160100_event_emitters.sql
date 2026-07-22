-- ============================================================================
-- 0021 · Event emitters — the triggers that write Events when things happen.
--
-- Until now `events` was only written by the scheduled rule engine (things that
-- become true over time: overdue, stuck, renewal-due). This adds the events that
-- fire the moment something HAPPENS: a case opens, a stage moves, an invoice is
-- issued, a case completes.
--
-- Still no sending. These write to `events` and nothing else — the dispatcher
-- decides what an event means (§4).
-- ============================================================================

-- ── Case opened → ONE email with the portal link ────────────────────────────
--
-- The brief, and it is the right call: "Instead of 9 stage-update messages per
-- case, send one message at case open: Track your visa here: [link]."
--
-- Nine emails per case is how a business trains its customers to filter it. One
-- email that points at a page which is always current is better for them AND
-- kills the "where is my visa" phone call, which is the actual daily cost.
create or replace function private.tg_case_opened_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.events (type, entity, entity_id, customer_id, case_id, payload, dedupe_key)
  values (
    'lead.created', 'case', NEW.id, NEW.customer_id, NEW.id,
    jsonb_build_object('service_id', NEW.service_id),
    -- Once per case, ever.
    'case.opened:' || NEW.id::text
  )
  on conflict (dedupe_key) do nothing;
  return NEW;
end $$;

create trigger cases_opened_event
  after insert on public.cases
  for each row execute function private.tg_case_opened_event();

-- ── Stage changed → maybe an email, exactly once per stage ──────────────────
--
-- THE DEDUPE RULE, stated in the brief:
--
--   "if i moved to n+1 stage and then again n stage and then again n+1 stage
--    so it shouldnt send twice"
--
-- The dedupe_key is (case, stage) — NOT (case, stage, timestamp) and not a
-- counter. So the FIRST time a case reaches Medical it emits; every subsequent
-- arrival at Medical hits the unique index and does nothing, forever. Walking
-- backwards to correct a mistake and forwards again is silent, which is what
-- you want: the customer already got that message.
--
-- This is enforced by a UNIQUE INDEX, not by application logic. Two admins
-- dragging the same card at the same moment cannot both win.
create or replace function private.tg_case_stage_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enabled  boolean;
  v_template text;
  v_stage    text;
  v_terminal boolean;
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

  -- Which stages email is DATA (stage_email_config), so the office can change
  -- it without a deploy.
  select c.enabled, c.template_key into v_enabled, v_template
    from public.stage_email_config c where c.stage_id = NEW.stage_id;

  if not coalesce(v_enabled, false) then
    return NEW;
  end if;

  insert into public.events (type, entity, entity_id, customer_id, case_id, payload, dedupe_key)
  values (
    'case.stage_changed', 'case', NEW.id, NEW.customer_id, NEW.id,
    jsonb_build_object('stage', v_stage, 'template', coalesce(v_template, 'stage.changed')),
    -- (case, stage) — the whole dedupe rule, in one string.
    'case.stage_changed:' || NEW.id::text || ':' || NEW.stage_id::text
  )
  on conflict (dedupe_key) do nothing;

  return NEW;
end $$;

create trigger cases_stage_event
  after update on public.cases
  for each row execute function private.tg_case_stage_event();

-- ── Invoice issued → email it ───────────────────────────────────────────────
create or replace function private.tg_invoice_issued_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if NEW.doc_type <> 'invoice' or NEW.lifecycle <> 'issued' then
    return NEW;
  end if;

  insert into public.events (type, entity, entity_id, customer_id, case_id, payload, dedupe_key)
  values (
    'invoice.issued', 'invoice', NEW.id, NEW.customer_id, NEW.case_id,
    jsonb_build_object('number', NEW.number, 'total_paise', NEW.total_paise),
    'invoice.issued:' || NEW.id::text
  )
  on conflict (dedupe_key) do nothing;
  return NEW;
end $$;

create trigger invoices_issued_event
  after insert on public.invoices
  for each row execute function private.tg_invoice_issued_event();

-- ── Payment received → close the chase ──────────────────────────────────────
--
-- §5.10: "Reminders suppress mid-sequence once paid." A customer who has paid
-- and still gets a reminder learns the system is wrong about them.
create or replace function private.tg_payment_received_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer uuid;
  v_out      bigint;
begin
  select i.customer_id into v_customer from public.invoices i where i.id = NEW.invoice_id;

  insert into public.events (type, entity, entity_id, customer_id, payload, dedupe_key)
  values ('payment.received', 'payment', NEW.id, v_customer,
          jsonb_build_object('amount_paise', NEW.amount_paise),
          'payment.received:' || NEW.id::text)
  on conflict (dedupe_key) do nothing;

  -- Settled? Stop chasing — close the open payment tasks for this invoice.
  select v.outstanding_paise into v_out
    from public.invoices_v v where v.id = NEW.invoice_id;

  if coalesce(v_out, 0) <= 0 then
    update public.call_tasks t
       set status = 'auto_closed', closed_at = now(), updated_at = now()
     where t.invoice_id = NEW.invoice_id
       and t.status = 'open'
       and t.reason in ('payment_chase', 'promise_due');

    -- And drop any reminder still sitting in the queue unsent.
    update public.email_queue q
       set status = 'suppressed', last_error = 'invoice settled before send'
     where q.invoice_id = NEW.invoice_id
       and q.status in ('queued', 'failed')
       and q.template_key in ('invoice.unpaid', 'invoice.overdue');
  end if;

  return NEW;
end $$;

create trigger payments_received_event
  after insert on public.payments
  for each row execute function private.tg_payment_received_event();

-- ── Portal tokens the dispatcher can actually use ───────────────────────────
--
-- PROBLEM: every automated email carries {{portal_url}}, which needs the RAW
-- token. `portal_token_hash` is one-way by design (§3.26) — so the dispatcher
-- cannot rebuild a link for a customer who already has a token. Re-issuing on
-- every send would silently kill the link already sitting in their inbox, which
-- is worse than not sending at all.
--
-- The hash still can't be reversed, and it shouldn't be. So store the token the
-- way this codebase already stores its other unreadable secret: encrypted in
-- Node, ciphertext only in Postgres, key in the environment.
--
--   private.customer_pii.passport_no_ciphertext bytea
--   -- "AES-256-GCM: iv || ciphertext || authTag. Encrypted in Node, never in PG."
--
-- Identical scheme, identical reasoning: a leaked service_role key gets you a
-- column of ciphertext and nothing else. The hash stays as the lookup index —
-- portal_read() still finds the customer by hashing the incoming token, and
-- never touches this column.
--
-- "Shown once" (§3.26) still holds where it matters: the UI shows a token once
-- and cannot re-display it. The customer's own emailed link is not a
-- "shown-once" secret — it is a long-lived per-customer URL they are meant to
-- keep, which is exactly what §5.8 describes.
alter table public.customers
  add column if not exists portal_token_ciphertext bytea,
  add column if not exists portal_token_key_version smallint;

comment on column public.customers.portal_token_ciphertext is
  'AES-256-GCM (iv || ciphertext || authTag) of the raw portal token. Encrypted '
  'in Node with PII_ENCRYPTION_KEY, never in Postgres — so a leaked '
  'service_role key does not yield working portal links. Exists because every '
  'automated email needs the raw token and portal_token_hash is one-way. '
  'Covered by the same key escrow requirement as passports.';

-- No backfill here. A token minted in SQL could not be encrypted (the key is
-- deliberately not reachable from Postgres), so it would be a valid credential
-- nobody could ever use — exactly the bug this column exists to avoid. Existing
-- customers get one lazily, in Node, the first time the dispatcher or the UI
-- needs their link. See src/lib/portal/token.ts.
