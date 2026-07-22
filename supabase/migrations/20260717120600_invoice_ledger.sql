-- ============================================================================
-- 0007 · The invoice ledger.
--
-- CLAUDE.md §4:
--   "Invoice numbers are sequential and never reused. Issued invoices are
--    immutable — correct by void-and-reissue or credit note, both logged.
--    Rate changes never mutate already-issued invoices."
--
-- Structure:
--   invoice_drafts  — scratch. freely mutable. no number. jsonb lines.
--   invoices        — ISSUED DOCUMENTS ONLY. every row immutable from birth.
--   invoice_lines   — immutable by construction (see the deferred trigger).
--   payments        — immutable; a mistake is voided, never edited.
--
-- Drafts are a separate TABLE rather than a status='draft' column because:
--   1. The immutability trigger becomes unconditional. `if OLD.status <>
--      'draft'` is exactly where the bug would live in eighteen months.
--   2. number/series/seq are NOT NULL — no partial unique index, no nullable
--      number edge cases.
--   3. The financial CHECKs apply to every row with NO exception. A half-edited
--      draft would violate `subtotal = Σ(lines)` constantly, forcing every
--      constraint to be conditional — i.e. enforcing nothing.
--
-- ⚠️ No `cases` table in Phase 1. PRD §9 puts pipelines in Phase 2, and the
-- invoice generator mock (04:44) shows a CUSTOMER + service selector with no
-- case. case_id is a nullable column now; its FK arrives with Phase 2. Phase 1
-- invoices genuinely have no case, so NULL is the truthful value, not a gap.
-- ============================================================================

-- ── Invoice numbering ───────────────────────────────────────────────────────
-- A COUNTER ROW, not a sequence. nextval() is deliberately non-transactional —
-- that is the entire point of a sequence and it is exactly the property we
-- cannot have: a rolled-back issue would burn a number forever, leaving a gap.
-- The counter's increment is inside the transaction, so rolling back the
-- invoice rolls back the number too.
--
-- Not advisory locks either: those only serialise transactions that CHOOSE to
-- take them, so one code path that forgets silently defeats it. You physically
-- cannot obtain a number here without touching (and locking) the row.
create table private.invoice_counters (
  series   text primary key,
  last_seq bigint not null default 0 check (last_seq >= 0)
);

revoke all on private.invoice_counters from public, anon, authenticated;

create or replace function private.next_invoice_seq(p_series text)
returns bigint
language sql
volatile
set search_path = ''
as $$
  insert into private.invoice_counters as c (series, last_seq)
  values (p_series, 1)
  on conflict (series) do update set last_seq = c.last_seq + 1
  returning c.last_seq;
$$;

-- The default series follows the Indian financial year (April–March), because
-- GST invoices need a consecutive series per FY: July 2026 → 'INV-2026-27'.
-- ⚠ FLAG FOR KALARI'S ACCOUNTANT: series convention (per-FY? per-branch?) needs
-- written confirmation before the first real invoice.
create or replace function public.current_invoice_series()
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when extract(month from public.today_kolkata()) >= 4 then
      'INV-' || to_char(public.today_kolkata(), 'YYYY') || '-'
             || to_char(public.today_kolkata() + interval '1 year', 'YY')
    else
      'INV-' || to_char(public.today_kolkata() - interval '1 year', 'YYYY') || '-'
             || to_char(public.today_kolkata(), 'YY')
  end
$$;

revoke all on function public.current_invoice_series() from public, anon;

grant execute on function public.current_invoice_series() to authenticated;

-- Display-only. Reads the counter WITHOUT incrementing, so two open drafts can
-- both show "will issue as INV-2026-27-00042 (provisional)" honestly. The real
-- number is allocated LAST, inside issue_invoice.
create or replace function public.peek_next_invoice_number(p_series text default null)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(s.series, public.current_invoice_series())
         || '-' || lpad((coalesce(c.last_seq, 0) + 1)::text, 5, '0')
  from (select coalesce(p_series, public.current_invoice_series()) as series) s
  left join private.invoice_counters c on c.series = s.series
$$;

revoke all on function public.peek_next_invoice_number(text) from public, anon;

grant execute on function public.peek_next_invoice_number(text) to authenticated;

-- ── invoice_drafts ──────────────────────────────────────────────────────────
create table public.invoice_drafts (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references public.customers(id) on delete restrict,
  case_id      uuid,  -- Phase 2; FK added with the pipelines migration.

  -- The four pricing dimensions, resolved by lib/pricing/engine.ts.
  service_id   uuid references public.services(id) on delete restrict,
  pax_adults   integer not null default 1 check (pax_adults >= 0),
  pax_children integer not null default 0 check (pax_children >= 0),

  -- UI scratch. Edited as a whole, never queried by line, never aggregated —
  -- so one jsonb column in one row, not a child table with its own RLS.
  -- Validated hard at issue; nothing here is trusted.
  lines        jsonb not null default '[]'::jsonb,

  -- REQ-I4 replacement. Inherited default (pending Kalari's preference): no amount-in-words
  -- generation. A free-text note, defaulting to the formatted total. This
  -- overrides CLAUDE.md §4's amount-in-words rule and PRD REQ-I4 — recorded in
  -- the migration so the deviation is discoverable, not folklore.
  -- Bonus: it dissolves the unanswerable "is .12 'one two' or 'twelve'?"
  -- question rather than guessing it.
  amount_note  text,

  created_by   uuid not null references public.profiles(id) on delete restrict,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  issued_invoice_id uuid,   -- set on issue; the draft then becomes read-only

  constraint drafts_pax_ck check (pax_adults + pax_children >= 1)
);

create index invoice_drafts_customer_idx on public.invoice_drafts (customer_id);

create index invoice_drafts_open_idx
  on public.invoice_drafts (created_by, updated_at desc) where issued_invoice_id is null;

create trigger invoice_drafts_touch
  before update on public.invoice_drafts
  for each row execute function private.tg_touch_updated_at();

-- ── invoices — issued documents only ────────────────────────────────────────
create table public.invoices (
  id           uuid primary key default gen_random_uuid(),

  -- doc_type + parent_invoice_id land NOW even though credit notes ship later.
  -- Retrofitting a discriminator onto a populated IMMUTABLE ledger under
  -- forward-only migrations is genuinely unpleasant; the column is free today.
  doc_type          public.doc_type not null default 'invoice',
  parent_invoice_id uuid references public.invoices(id) on delete restrict,
  supersedes_invoice_id uuid references public.invoices(id) on delete restrict,

  customer_id  uuid not null references public.customers(id) on delete restrict,
  case_id      uuid,
  service_id   uuid references public.services(id) on delete restrict,

  -- Snapshot of the dimensions at issue, so the document explains itself even
  -- if the catalogue is later edited.
  service_name text not null,
  pax_adults   integer not null default 1,
  pax_children integer not null default 0,

  series       text   not null,
  seq          bigint not null check (seq > 0),
  -- Verified live on PG 17.6 that lpad/|| are accepted as IMMUTABLE here.
  number       text generated always as (series || '-' || lpad(seq::text, 5, '0')) stored,

  issue_date   date not null,
  -- OQ8 [ASSUMPTION] — REQ-PM4: overdue = N days from issue, N configurable,
  -- default 7. SNAPSHOTTED at issue rather than derived live, consistent with
  -- the immutability philosophy: changing N later must not silently re-age
  -- every historical invoice. "Configurable" literally implies live derivation;
  -- this is a real question for Kalari, not a coin-flip.
  due_date     date not null,

  currency     text not null default 'INR' check (currency = 'INR'),

  -- Money: integer paise. NEVER numeric/float (CLAUDE.md §4).
  subtotal_paise bigint not null check (subtotal_paise >= 0),
  gst_paise      bigint not null default 0 check (gst_paise >= 0),
  total_paise    bigint not null check (total_paise >= 0),

  amount_note  text,

  lifecycle    public.invoice_lifecycle not null default 'issued',
  voided_at    timestamptz,
  voided_by    uuid references public.profiles(id) on delete restrict,
  void_reason  text,

  -- The ONLY permitted post-issue write. PDF rendering must NOT happen inside
  -- the issuing transaction: it would hold the counter row lock across an
  -- external call. Issue commits → a route renders + uploads → attach_invoice_pdf().
  -- NULL means "PDF pending" in the UI.
  pdf_path     text,

  issued_by    uuid not null references public.profiles(id) on delete restrict,
  issued_at    timestamptz not null default now(),
  idempotency_key text,

  -- Backstop: if next_invoice_seq() is ever wrong, this fails hard rather than
  -- producing two invoices numbered INV-2026-00042.
  constraint invoices_number_uk unique (series, seq),

  -- REQ-I3: GST is a per-line, default-ZERO field — there is no GST engine.
  -- All seven canonical totals in PRD §6.5 are exactly Σ(lines) + 0.
  constraint invoices_total_ck check (total_paise = subtotal_paise + gst_paise),
  constraint invoices_void_ck check (
    (lifecycle = 'void') = (voided_at is not null)
    and (lifecycle = 'void') = (void_reason is not null)
  ),
  constraint invoices_credit_note_ck check (
    (doc_type = 'credit_note') = (parent_invoice_id is not null)
  ),
  constraint invoices_due_ck check (due_date >= issue_date)
);

create index invoices_customer_idx on public.invoices (customer_id, issue_date desc);

create index invoices_lifecycle_idx on public.invoices (lifecycle, due_date);

create unique index invoices_idempotency_uk
  on public.invoices (customer_id, idempotency_key) where idempotency_key is not null;

comment on column public.invoices.pdf_path is
  'Write-once, post-issue. PDF generation is deliberately OUTSIDE the issuing '
  'transaction so it cannot hold the invoice-counter lock across an external call.';

comment on table public.invoices is
  'ISSUED documents only. Every row immutable from birth — drafts live in '
  'public.invoice_drafts. Corrections are void-and-reissue or credit note.';

-- ── invoice_lines ───────────────────────────────────────────────────────────
create table public.invoice_lines (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references public.invoices(id) on delete restrict,

  line_no     integer not null check (line_no > 0),
  label       text not null check (length(btrim(label)) > 0),

  -- qty is an INTEGER, which is what keeps `amount = qty * rate` exactly
  -- checkable below. Per-person and once-per-file are both whole counts.
  qty         integer not null check (qty > 0),

  -- What was actually charged.
  rate_paise   bigint not null check (rate_paise >= 0),
  -- What the catalogue said AT ISSUE. REQ-I2 makes editing a rate LEGAL —
  -- government fees move — so we do not force rate to match the catalogue. We
  -- snapshot both instead, which is what renders the design's "EDITED · was X"
  -- chip on an issued invoice and gives the admin a queryable "invoices with
  -- overridden rates". There is no tampering threat model here: rate editing is
  -- a feature, so these checks are anti-BUG, not anti-attacker.
  catalogue_rate_paise bigint check (catalogue_rate_paise >= 0),

  amount_paise bigint not null check (amount_paise >= 0),
  gst_bp      integer not null default 0 check (gst_bp >= 0 and gst_bp <= 10000),
  gst_paise    bigint not null default 0 check (gst_paise >= 0),

  constraint invoice_lines_no_uk unique (invoice_id, line_no),
  -- Exact integer arithmetic, enforced by the DATABASE regardless of which
  -- language produced the numbers. This is only expressible because qty is an
  -- integer and money is integer paise; with numeric it could fail on a
  -- fractional cent and would have to be dropped.
  constraint invoice_lines_amount_ck check (amount_paise = qty::bigint * rate_paise),
  constraint invoice_lines_vat_ck
    check (gst_paise = round((amount_paise::numeric * gst_bp) / 10000))
);

create index invoice_lines_invoice_idx on public.invoice_lines (invoice_id, line_no);

-- ── payments ────────────────────────────────────────────────────────────────
create table public.payments (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references public.invoices(id) on delete restrict,

  amount_paise bigint not null check (amount_paise > 0),
  method      public.payment_method not null,   -- cash | transfer | cheque (REQ-PM1)
  paid_on     date not null,
  reference   text,

  recorded_by uuid not null references public.profiles(id) on delete restrict,
  created_at  timestamptz not null default now(),

  -- Payments are immutable like invoices: a mis-keyed payment is VOIDED, never
  -- edited, so the trail survives and `amount_paise > 0` always holds.
  voided_at   timestamptz,
  voided_by   uuid references public.profiles(id) on delete restrict,
  void_reason text,

  constraint payments_void_ck check (
    (voided_at is not null) = (void_reason is not null)
  )
);

create index payments_invoice_idx on public.payments (invoice_id) where voided_at is null;

-- ── Immutability: the trigger is the ACTUAL guarantee ───────────────────────
-- Grants stop the browser. RLS stops the browser. Neither stops service_role
-- (which bypasses RLS entirely), a security-definer RPC (which bypasses RLS AND
-- grants), a leaked service key, or someone in the SQL editor. A trigger stops
-- all of them.
create or replace function private.tg_invoice_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mutable text[] := array['lifecycle','voided_at','voided_by','void_reason','pdf_path'];
  v_old jsonb;
  v_new jsonb;
begin
  if TG_OP = 'DELETE' then
    raise exception 'invoices are append-only; use void_invoice()'
      using errcode = '42501';
  end if;

  -- pdf_path is write-once.
  if OLD.pdf_path is not null and NEW.pdf_path is distinct from OLD.pdf_path then
    raise exception 'invoice %: pdf_path is write-once', OLD.number
      using errcode = '23514';
  end if;

  -- The only legal lifecycle move is issued → void.
  if NEW.lifecycle is distinct from OLD.lifecycle
     and not (OLD.lifecycle = 'issued' and NEW.lifecycle = 'void') then
    raise exception 'invoice %: illegal lifecycle transition % -> %',
      OLD.number, OLD.lifecycle, NEW.lifecycle using errcode = '23514';
  end if;

  -- Everything else is frozen. Comparing whole rows minus the mutable keys
  -- means a column added by a FUTURE migration is frozen automatically, by
  -- default. That default-deny-on-new-columns property is why this beats
  -- enumerating 25 column comparisons.
  v_old := to_jsonb(OLD) - v_mutable;
  v_new := to_jsonb(NEW) - v_mutable;
  if v_old is distinct from v_new then
    raise exception 'invoice % is immutable; attempted change to: %',
      OLD.number,
      (select array_agg(e.key) from jsonb_each(v_new) e
        where v_old -> e.key is distinct from e.value)
      using errcode = '23514';
  end if;

  return NEW;
end $$;

create trigger invoices_guard
  before update or delete on public.invoices
  for each row execute function private.tg_invoice_guard();

-- invoice_lines become immutable FOR FREE: invoices.subtotal_paise is frozen by
-- the trigger above, and this DEFERRED constraint trigger asserts
-- subtotal = Σ(lines) at COMMIT. You therefore cannot insert, edit or delete a
-- line without breaking an invariant on a row you are not allowed to touch.
-- Deferred so issue_invoice can insert the invoice and its lines in any order.
create or replace function private.tg_check_invoice_totals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice_id uuid := coalesce(NEW.invoice_id, OLD.invoice_id);
  v_sum bigint;
  v_sub bigint;
  v_gst bigint;
  v_gst_sum bigint;
  v_number text;
begin
  select i.subtotal_paise, i.gst_paise, i.number into v_sub, v_gst, v_number
  from public.invoices i where i.id = v_invoice_id;

  if not found then return null; end if;  -- invoice deleted in same txn

  select coalesce(sum(l.amount_paise), 0), coalesce(sum(l.gst_paise), 0)
    into v_sum, v_gst_sum
  from public.invoice_lines l where l.invoice_id = v_invoice_id;

  if v_sum is distinct from v_sub then
    raise exception 'invoice %: subtotal_paise=% but lines sum to %',
      v_number, v_sub, v_sum using errcode = '23514';
  end if;
  if v_gst_sum is distinct from v_gst then
    raise exception 'invoice %: gst_paise=% but line GST sums to %',
      v_number, v_gst, v_gst_sum using errcode = '23514';
  end if;
  return null;
end $$;

create constraint trigger invoice_totals_match
  after insert or update or delete on public.invoice_lines
  deferrable initially deferred
  for each row execute function private.tg_check_invoice_totals();

-- Payments: only the void columns may ever change.
create or replace function private.tg_payment_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mutable text[] := array['voided_at','voided_by','void_reason'];
begin
  if TG_OP = 'DELETE' then
    raise exception 'payments are append-only; use void_payment()'
      using errcode = '42501';
  end if;
  if OLD.voided_at is not null then
    raise exception 'payment % is already void', OLD.id using errcode = '23514';
  end if;
  if (to_jsonb(OLD) - v_mutable) is distinct from (to_jsonb(NEW) - v_mutable) then
    raise exception 'payment % is immutable; void it and record a new one', OLD.id
      using errcode = '23514';
  end if;
  return NEW;
end $$;

create trigger payments_guard
  before update or delete on public.payments
  for each row execute function private.tg_payment_guard();

-- ── Audit ───────────────────────────────────────────────────────────────────
create trigger audit after insert or update or delete on public.invoices
  for each row execute function private.tg_activity_log();

create trigger audit after insert or update or delete on public.invoice_lines
  for each row execute function private.tg_activity_log();

create trigger audit after insert or update or delete on public.payments
  for each row execute function private.tg_activity_log();

create trigger audit after insert or update or delete on public.invoice_drafts
  for each row execute function private.tg_activity_log();

-- ── RLS + grants ────────────────────────────────────────────────────────────
alter table public.invoices       enable row level security;

alter table public.invoice_lines  enable row level security;

alter table public.payments       enable row level security;

alter table public.invoice_drafts enable row level security;

revoke all on public.invoices       from public, anon, authenticated;

revoke all on public.invoice_lines  from public, anon, authenticated;

revoke all on public.payments       from public, anon, authenticated;

revoke all on public.invoice_drafts from public, anon, authenticated;

-- Scope: admin sees all; employee sees only their assigned customers'.
create policy invoices_select on public.invoices
  for select to authenticated
  using (
    (select public.is_admin())
    or exists (
      select 1 from public.customers c
      where c.id = invoices.customer_id
        and c.assigned_user_id = (select auth.uid())
    )
  );

create policy invoice_lines_select on public.invoice_lines
  for select to authenticated
  using (
    exists (select 1 from public.invoices i where i.id = invoice_lines.invoice_id)
  );

create policy payments_select on public.payments
  for select to authenticated
  using (
    exists (select 1 from public.invoices i where i.id = payments.invoice_id)
  );

create policy invoice_drafts_all on public.invoice_drafts
  for all to authenticated
  using (
    (select public.is_admin())
    or exists (
      select 1 from public.customers c
      where c.id = invoice_drafts.customer_id
        and c.assigned_user_id = (select auth.uid())
    )
  )
  with check (
    (select public.is_admin())
    or exists (
      select 1 from public.customers c
      where c.id = invoice_drafts.customer_id
        and c.assigned_user_id = (select auth.uid())
    )
  );

-- SELECT only on the ledger. NO insert/update/delete grant to authenticated:
-- every mutation goes through a security-definer RPC.
--
-- Why revoked privileges rather than restrictive RLS policies as the primary
-- gate: an RLS USING clause that matches no rows returns 0 ROWS AND HTTP 204 —
-- the client believes the write succeeded. A missing privilege raises 42501.
-- On a money table, failing LOUD beats failing quiet.
grant select on public.invoices      to authenticated;

grant select on public.invoice_lines to authenticated;

grant select on public.payments      to authenticated;

-- Drafts are scratch and ARE directly writable — nothing is guaranteed about
-- them, and they carry no money semantics until issue_invoice validates them.
grant select, insert, update, delete on public.invoice_drafts to authenticated;
