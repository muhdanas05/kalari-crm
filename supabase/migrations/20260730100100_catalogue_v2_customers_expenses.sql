-- ============================================================================
-- 0028 · Invoice-first flow, an editable catalogue, customer categories,
--        and the expense side of the account book.
--
-- Uses the enum values added in 0027. Forward-only: this database is live.
--
-- The shape change that matters is `services.tracks_pipeline`. Until now every
-- case came from lead intake, and the invoice builder never passed a case id —
-- so an invoice and its case were never linked in practice. The real business
-- flow is the other way round: a customer walks in, an invoice is raised, and
-- only SOME services (the multi-step ones) deserve a tracked case. A ticket is
-- sold and done; a visa runs for weeks.
--
-- Which services those are is DATA, not code — the admin flips a switch in the
-- catalogue editor. Hardcoding the family list would mean a deploy every time
-- the office changes its mind about whether hotel bookings need chasing.
-- ============================================================================

-- ── services.tracks_pipeline ────────────────────────────────────────────────
alter table public.services
  add column if not exists tracks_pipeline boolean not null default false;

comment on column public.services.tracks_pipeline is
  'When true, issuing an invoice for this service opens a Processing case at '
  'the first stage of its declared path. When false the sale is complete at '
  'payment and no case is created. Admin-editable — see /admin/catalogue.';

-- The multi-step services, as confirmed with Kalari. Ticketing, hotel and
-- attestation are point-of-sale: invoice, take payment, done.
update public.services
   set tracks_pipeline = true
 where family in ('visa', 'passport', 'haj_umrah', 'holiday');

-- ── Dimension applicability: two new families ───────────────────────────────
-- Both are flat-rate with no dimensions, like hotel. Recreated wholesale
-- because a CHECK constraint cannot be altered in place.
alter table public.services drop constraint if exists services_dims_ck;

alter table public.services add constraint services_dims_ck check (
  case family
    when 'ticketing' then
      category is null and type is null and location is not null
    when 'holiday' then
      category is null and type is null and location is not null
    when 'haj_umrah' then
      category in ('haj', 'umrah') and type is null and location is null
    when 'visa' then
      category is null and type is not null and location is null
    when 'passport' then
      category is null and type is not null and location is null
    when 'hotel' then
      category is null and type is null and location is null
    -- Certificate & document attestation: flat fee, no dimensions.
    when 'attestation' then
      category is null and type is null and location is null
    -- The escape hatch. A one-off service with no family of its own; the name
    -- carries the meaning. No dimensions, so the 4-tuple stays unique against
    -- exactly one 'other' row — which is the point: `other` is not a bucket to
    -- fill, it is a single "everything else" line for ad-hoc work.
    when 'other' then
      category is null and type is null and location is null
  end
);

comment on constraint services_dims_ck on public.services is
  'Dimension applicability, mirroring lib/pricing/engine.ts applicableDimensions(). '
  'attestation/other are flat-rate: all four dimensions null.';

-- ── Seed: attestation ───────────────────────────────────────────────────────
-- ⚠️ PLACEHOLDER RATE, like every other rate in this catalogue. Unconfirmed.
insert into public.services (name, family, category, location, type, tracks_pipeline)
values ('Certificate & Document Attestation', 'attestation', null, null, null, false)
on conflict (family, category, location, type) do update set name = excluded.name;

insert into public.line_item_rules (service_id, label, rate_paise, qty_rule, sort_order)
select s.id, 'Attestation Fee (per document)', 100000, 'per_person'::public.qty_rule, 1
from public.services s
where s.family = 'attestation'
  and s.category is not distinct from null
  and s.location is not distinct from null
  and s.type     is not distinct from null
on conflict (service_id, sort_order) do update
  set label = excluded.label, rate_paise = excluded.rate_paise, qty_rule = excluded.qty_rule;

-- ── customers.category ──────────────────────────────────────────────────────
-- Free text, not an enum: the office invents segments faster than migrations
-- ship, and a wrong enum value is unremovable. The UI suggests the common ones
-- via a datalist and stays out of the way otherwise.
alter table public.customers add column if not exists category text;

comment on column public.customers.category is
  'Free-text segment (Regular / Corporate / Agent / Haj Group / …). Deliberately '
  'not an enum — the office coins new segments without a deploy.';

create index if not exists customers_category_idx
  on public.customers (category) where archived_at is null and category is not null;

-- Additive: existing grants stay, this adds the one column.
grant insert (category) on public.customers to authenticated;

grant update (category) on public.customers to authenticated;

-- ── expenses — the money-out side of the account book ───────────────────────
-- Payments are money in and already carry receipt numbers. This is the other
-- column of the day-book: what the office actually paid out.
--
-- ADMIN ONLY, in policy as well as in UI. The locked decision is that
-- employees never see company money; an expense ledger is company money.
create table if not exists public.expenses (
  id           uuid primary key default gen_random_uuid(),

  spent_on     date not null default public.today_kolkata(),
  category     text not null check (length(btrim(category)) > 0),
  description  text,

  -- Integer paise, like every other money column (scripts/guard-money-columns).
  amount_paise bigint not null check (amount_paise > 0),

  method       public.payment_method not null,

  -- Optional: which supplier this went to. `restrict` so archiving a supplier
  -- can never orphan the books.
  supplier_id  uuid references public.suppliers(id) on delete restrict,

  notes        text,

  created_by   uuid references public.profiles(id) on delete restrict,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  archived_at  timestamptz
);

create index if not exists expenses_spent_on_idx
  on public.expenses (spent_on desc) where archived_at is null;

create index if not exists expenses_supplier_idx
  on public.expenses (supplier_id) where archived_at is null;

comment on table public.expenses is
  'Money out. The counterpart to payments (money in) in the account book. '
  'Admin-only by RLS: employees never see company money.';

drop trigger if exists expenses_touch on public.expenses;

create trigger expenses_touch
  before update on public.expenses
  for each row execute function private.tg_touch_updated_at();

drop trigger if exists audit on public.expenses;

create trigger audit
  after insert or update or delete on public.expenses
  for each row execute function private.tg_activity_log();

alter table public.expenses enable row level security;

revoke all on public.expenses from public, anon, authenticated;

drop policy if exists expenses_admin_read on public.expenses;

create policy expenses_admin_read on public.expenses
  for select to authenticated
  using ( (select public.is_admin()) );

drop policy if exists expenses_admin_write on public.expenses;

create policy expenses_admin_write on public.expenses
  for all to authenticated
  using      ( (select public.is_admin()) )
  with check ( (select public.is_admin()) );

grant select on public.expenses to authenticated;

-- No DELETE: soft-delete via archived_at, like everything else.
grant insert (spent_on, category, description, amount_paise, method,
              supplier_id, notes, created_by) on public.expenses to authenticated;

grant update (spent_on, category, description, amount_paise, method,
              supplier_id, notes, archived_at) on public.expenses to authenticated;

-- ── payment.received email ──────────────────────────────────────────────────
-- The gap this closes: a customer paid and the system said nothing. The
-- trigger already closes the chase tasks and suppresses the reminder emails;
-- it just never thanked anyone. The receipt PDF rides along as an attachment,
-- which is what actually replaces the paper receipt book for a remote payer.
insert into public.email_templates (key, name, subject, body, is_promotional) values
(
  'payment.received',
  'Payment received — receipt attached',
  'Receipt {{receipt_number}} — payment received, thank you',
  E'Dear {{customer_name}},\n\n'
  'We have received your payment of ₹{{payment_amount}} against invoice '
  '{{invoice_number}}.\n\n'
  'Your receipt {{receipt_number}} is attached to this email.\n\n'
  'Outstanding balance: ₹{{invoice_outstanding}}\n\n'
  'You can see your full status any time here:\n{{portal_url}}\n\n'
  'Thank you.\n\n'
  'Kalari Tours and Travels — Your Journey, Handled Right',
  false
)
on conflict (key) do nothing;

insert into public.automation_settings (key, enabled, config) values
  ('rule.payment_received', true,
   '{"note":"Emails a receipt (PDF attached) when a payment is recorded. The trigger already closes chase tasks; this is the acknowledgement."}')
on conflict (key) do nothing;

-- ── Assertions ──────────────────────────────────────────────────────────────
do $$
declare v_tracked integer; v_untracked integer; v_attest integer;
begin
  select count(*) into v_tracked   from public.services where tracks_pipeline;
  select count(*) into v_untracked from public.services where not tracks_pipeline;
  select count(*) into v_attest    from public.services where family = 'attestation';

  -- 2 visa + 2 passport + 2 haj_umrah + 2 holiday = 8
  if v_tracked <> 8 then
    raise exception 'expected 8 pipeline-tracked services, found %', v_tracked;
  end if;
  -- 2 ticketing + 1 hotel + 1 attestation = 4
  if v_untracked <> 4 then
    raise exception 'expected 4 point-of-sale services, found %', v_untracked;
  end if;
  if v_attest <> 1 then
    raise exception 'expected 1 attestation service, found %', v_attest;
  end if;

  raise notice 'catalogue v2 ok: % tracked, % point-of-sale', v_tracked, v_untracked;
end $$;
