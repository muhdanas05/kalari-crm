-- ============================================================================
-- 0020 · The email layer: templates, queue, log, suppressions, consent.
--
-- ARCHITECTURE.md §4: automations NEVER send. They write an Event; a dispatcher
-- resolves recipient + template, renders, queues, and hands to an adapter.
-- This migration is the queue and the log — the dispatcher and the adapter live
-- in TypeScript, where they can be read and tested.
--
-- NO SMS, NO WHATSAPP. The channel could change later without touching
-- business logic (that is the entire point of the seam), but the blocker there
-- is regulatory — India's TRAI DLT sender-ID registration for SMS, and the
-- WhatsApp Business API approval process — not technical.
-- ============================================================================

create type public.email_status as enum (
  'queued', 'sending', 'sent', 'failed', 'suppressed', 'sandboxed'
);

create type public.suppression_reason as enum (
  'hard_bounce', 'complaint', 'manual', 'unsubscribe'
);

-- ── Templates ───────────────────────────────────────────────────────────────
--
-- Admin-editable (§5.6). Body is rendered with {{token}} substitution — a full
-- template language is a footgun in a box someone edits at 11pm.
create table public.email_templates (
  key           text primary key,
  name          text not null,
  subject       text not null,
  body          text not null,
  -- §5.6: "Transactional mail is exempt from consent. Promotional mail is not."
  -- This flag is what the dispatcher checks before it will send without a
  -- logged consent record. Getting it wrong is a legal problem, not a UX one.
  is_promotional boolean not null default false,
  enabled       boolean not null default true,
  updated_at    timestamptz not null default now(),
  updated_by    uuid references public.profiles(id) on delete set null
);

-- ── Queue ───────────────────────────────────────────────────────────────────
create table public.email_queue (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid references public.events(id) on delete set null,
  customer_id   uuid references public.customers(id) on delete cascade,
  case_id       uuid references public.cases(id) on delete set null,
  invoice_id    uuid references public.invoices(id) on delete set null,

  template_key  text references public.email_templates(key) on delete set null,
  to_email      text not null,
  subject       text not null,
  body          text not null,
  attachments   jsonb not null default '[]'::jsonb,

  status        public.email_status not null default 'queued',
  attempts      integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error    text,

  provider_msg_id text,
  dedupe_key    text unique,

  created_at    timestamptz not null default now(),
  sent_at       timestamptz
);

create index email_queue_pending_idx
  on public.email_queue (next_attempt_at)
  where status in ('queued', 'failed');

-- ── Log ─────────────────────────────────────────────────────────────────────
--
-- The permanent record + the sandbox sink + open/bounce tracking. Every email
-- logged against the customer (§5.6 / SOW §02.G).
create table public.email_log (
  id            uuid primary key default gen_random_uuid(),
  queue_id      uuid references public.email_queue(id) on delete set null,
  customer_id   uuid references public.customers(id) on delete cascade,
  case_id       uuid references public.cases(id) on delete set null,

  template_key  text,
  to_email      text not null,
  subject       text not null,
  body          text,

  status        public.email_status not null,
  provider_msg_id text,
  error         text,

  -- Nothing is ever silently dropped: an email that could not send because the
  -- adapter is off is logged as 'sandboxed', not forgotten.
  sandboxed     boolean not null default false,

  opened_at     timestamptz,
  open_count    integer not null default 0,
  bounced_at    timestamptz,
  bounce_type   text,
  complained_at timestamptz,

  occurred_at   timestamptz not null default now()
);

create index email_log_customer_idx on public.email_log (customer_id, occurred_at desc);
create index email_log_errors_idx on public.email_log (occurred_at desc)
  where status = 'failed' or bounced_at is not null;

-- ── Suppressions ────────────────────────────────────────────────────────────
--
-- §5.6: "Never send to a suppressed address." Keyed by address, not customer:
-- a bounced address stays bounced even if it reappears on a new record.
create table public.suppressions (
  email       text primary key,
  reason      public.suppression_reason not null,
  detail      text,
  created_at  timestamptz not null default now()
);

-- ── Consent ─────────────────────────────────────────────────────────────────
--
-- §5.6: consent CANNOT be inferred from an existing customer relationship, and
-- proof must be retained. Append-only — a withdrawal is a new row, so the
-- history of what was agreed and when survives.
create table public.email_consent (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  email       text not null,
  granted     boolean not null,
  source      text not null,
  evidence    jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index email_consent_customer_idx
  on public.email_consent (customer_id, occurred_at desc);

/** True only if the LATEST consent row for this customer grants it. */
create or replace function public.has_email_consent(p_customer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select c.granted
       from public.email_consent c
      where c.customer_id = p_customer_id
      order by c.occurred_at desc
      limit 1),
    false
  );
$$;

-- ── Per-stage email configuration ───────────────────────────────────────────
--
-- The brief: "on some selected stages i want to send them emails also as
-- reminders". So WHICH stages email is DATA, not code — an admin can change it
-- without a deploy, and the answer is visible rather than buried in a switch.
--
-- Default OFF for every stage except the ones seeded below. The old design
-- emailed on every stage change: 9 emails per case, which is how a business
-- teaches its customers to ignore its email.
create table public.stage_email_config (
  stage_id     uuid primary key references public.stages(id) on delete cascade,
  enabled      boolean not null default false,
  template_key text references public.email_templates(key) on delete set null,
  updated_at   timestamptz not null default now(),
  updated_by   uuid references public.profiles(id) on delete set null
);

-- ── Templates seed ──────────────────────────────────────────────────────────
insert into public.email_templates (key, name, subject, body, is_promotional) values
(
  'case.opened',
  'Case opened — track your booking',
  'Your booking is underway — track it here',
  E'Dear {{customer_name}},\n\n'
  'We have started work on your {{service_name}}.\n\n'
  'You can see exactly where your application is at any time, here:\n'
  '{{portal_url}}\n\n'
  'That page shows your current stage, what happens next, any documents we still '
  'need, and your balance. It updates itself — there is no need to call and ask.\n\n'
  'Kalari Tours and Travels — Your Journey, Handled Right',
  false
),
(
  'stage.changed',
  'Stage update',
  'Update on your application: {{stage_name}}',
  E'Dear {{customer_name}},\n\n'
  'Your application has reached: {{stage_name}}.\n\n'
  '{{next_step}}\n\n'
  'Full details, documents outstanding and your balance:\n{{portal_url}}\n\n'
  'Kalari Tours and Travels — Your Journey, Handled Right',
  false
),
(
  'docs.missing',
  'Documents outstanding',
  'We need a few documents to continue',
  E'Dear {{customer_name}},\n\n'
  'To move your application forward we still need:\n\n{{documents}}\n\n'
  'You can send them by replying to this email.\n\n'
  'Your application status: {{portal_url}}\n\n'
  'Kalari Tours and Travels — Your Journey, Handled Right',
  false
),
(
  'invoice.issued',
  'Invoice issued',
  'Invoice {{invoice_number}} — ₹{{invoice_total}}',
  E'Dear {{customer_name}},\n\n'
  'Please find invoice {{invoice_number}} attached, for {{service_name}}.\n\n'
  'Total: ₹{{invoice_total}}\nDue: {{due_date}}\n\n'
  '{{payment_instructions}}\n\n'
  'Your application status: {{portal_url}}\n\n'
  'Kalari Tours and Travels — Your Journey, Handled Right',
  false
),
(
  'invoice.unpaid',
  'Payment reminder',
  'Reminder: invoice {{invoice_number}} — ₹{{invoice_outstanding}} outstanding',
  E'Dear {{customer_name}},\n\n'
  'Invoice {{invoice_number}} has ₹{{invoice_outstanding}} outstanding, due {{due_date}}.\n\n'
  '{{payment_instructions}}\n\n'
  'If you have already paid, please ignore this message.\n\n'
  'Kalari Tours and Travels — Your Journey, Handled Right',
  false
),
(
  'invoice.overdue',
  'Overdue payment',
  'Overdue: invoice {{invoice_number}} — ₹{{invoice_outstanding}}',
  E'Dear {{customer_name}},\n\n'
  'Invoice {{invoice_number}} is now {{days_overdue}} days overdue, with ₹'
  '{{invoice_outstanding}} outstanding.\n\n{{payment_instructions}}\n\n'
  'If there is a problem, please call our office so we can help.\n\n'
  'Kalari Tours and Travels — Your Journey, Handled Right',
  false
),
(
  'renewal.due',
  'Visa renewal due',
  'Your visa is due for renewal',
  E'Dear {{customer_name}},\n\n'
  'Your visa was issued in {{visa_issue_month}} and is approaching renewal.\n\n'
  'We can start the renewal now so there is no gap. Reply to this email or call '
  'our office and we will take care of it.\n\n'
  'Kalari Tours and Travels — Your Journey, Handled Right',
  false
),
(
  'case.complete',
  'Application complete',
  'Your application is complete',
  E'Dear {{customer_name}},\n\n'
  'Your {{service_name}} is complete. It has been a pleasure to act for you.\n\n'
  'We will be in touch before your visa is due for renewal, so you do not have '
  'to remember.\n\n'
  'Kalari Tours and Travels — Your Journey, Handled Right',
  false
)
on conflict (key) do nothing;

-- Which stages email, by default.
--
-- Deliberately NOT all of them. One message at case open pointing at the
-- portal, then email only on the stages that actually mean something to a
-- customer. PSK Appointment is one they must attend; Ticket Issued, Travel
-- Docs Shared, Group Allocated, Visa Received, Passport Dispatched and Voucher
-- Sent are the milestones they are waiting for; Complete is the end. The rest
-- they can see on the portal whenever they like.
insert into public.stage_email_config (stage_id, enabled, template_key)
select s.id,
       s.key in ('appointment', 'ticket_issued', 'docs_shared', 'group_allocated', 'visa_received', 'dispatched', 'voucher_sent', 'complete'),
       case when s.key in ('appointment', 'ticket_issued', 'docs_shared', 'group_allocated', 'visa_received', 'dispatched', 'voucher_sent', 'complete')
            then 'stage.changed' end
from public.stages s
on conflict (stage_id) do nothing;

-- Payment instructions live in settings so the office can change bank details
-- without a deploy.
--
-- SOW §03: no online checkout. This is bank details and nothing else.
--
-- The "tell us once you've paid" line is doing real work, not being polite: a
-- bank transfer arrives with no callback. Nobody in the office knows the money
-- landed until someone checks the statement, so the reminder sequence keeps
-- chasing a customer who has already paid — which is exactly how a system
-- teaches people to ignore it. Asking them to send a message closes that loop
-- with a human, no gateway and no webhook.
insert into public.automation_settings (key, enabled, config) values
(
  'email.payment_instructions',
  true,
  jsonb_build_object(
    'text',
    E'To pay, transfer to:\n\n'
    'Bank: <PENDING — BANK NAME>\n'
    'Account name: <PENDING — ACCOUNT NAME>\n'
    'Account number: <PENDING — ACCOUNT NUMBER>\n'
    'IFSC: <PENDING — IFSC CODE>\n'
    'UPI: <PENDING — UPI ID>\n'
    'Reference: your invoice number\n\n'
    'Once you have paid, please send us a message on WhatsApp at +91 95673 24364 '
    'or call the office, so we can confirm it against your file straight away.',
    'note',
    'BLOCKED: real bank account + IFSC + UPI ID needed from Kalari. No online '
    'payment gateway — this is instructions only. The WhatsApp number is a '
    'plain tel/wa.me link in copy, NOT an integration.'
  )
),
('rule.case_opened', true, '{"note":"One email at case open with the portal link — replaces per-stage spam."}'),
('rule.invoice_issued', true, '{}'),
('rule.case_complete', true, '{}')
on conflict (key) do nothing;

-- ── RLS ─────────────────────────────────────────────────────────────────────

alter table public.email_templates     enable row level security;
alter table public.email_queue         enable row level security;
alter table public.email_log           enable row level security;
alter table public.suppressions        enable row level security;
alter table public.email_consent       enable row level security;
alter table public.stage_email_config  enable row level security;

revoke all on public.email_templates    from public, anon, authenticated;
revoke all on public.email_queue        from public, anon, authenticated;
revoke all on public.email_log          from public, anon, authenticated;
revoke all on public.suppressions       from public, anon, authenticated;
revoke all on public.email_consent      from public, anon, authenticated;
revoke all on public.stage_email_config from public, anon, authenticated;

-- The queue is machinery: only the dispatcher (service_role) writes it. Humans
-- read the log.
create policy email_queue_select on public.email_queue for select to authenticated
  using ((select public.is_admin()) or (select public.can_access_customer(customer_id)));

create policy email_log_select on public.email_log for select to authenticated
  using ((select public.is_admin()) or (select public.can_access_customer(customer_id)));

create policy email_templates_select on public.email_templates for select to authenticated
  using ((select public.is_active_user()));
create policy email_templates_admin on public.email_templates for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy suppressions_admin on public.suppressions for select to authenticated
  using ((select public.is_admin()));

create policy email_consent_select on public.email_consent for select to authenticated
  using ((select public.is_admin()) or (select public.can_access_customer(customer_id)));
create policy email_consent_insert on public.email_consent for insert to authenticated
  with check ((select public.can_access_customer(customer_id)));

create policy stage_email_config_select on public.stage_email_config for select to authenticated
  using ((select public.is_active_user()));
create policy stage_email_config_admin on public.stage_email_config for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

grant select on public.email_queue        to authenticated;
grant select on public.email_log          to authenticated;
grant select on public.email_templates    to authenticated;
grant select on public.suppressions       to authenticated;
grant select, insert on public.email_consent to authenticated;
grant select on public.stage_email_config to authenticated;
grant update (subject, body, enabled, updated_by, updated_at) on public.email_templates to authenticated;
grant update (enabled, template_key, updated_by, updated_at) on public.stage_email_config to authenticated;

grant execute on function public.has_email_consent(uuid) to authenticated;
