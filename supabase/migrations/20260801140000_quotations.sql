-- Quotations — a document a customer can be shown BEFORE money changes
-- hands. Deliberately NOT built like invoices: there's no tax/compliance
-- reason a quote can't be edited after the fact, so it stays a plain
-- mutable row right up until it's converted — no immutability trigger, no
-- append-only guard, none of the machinery invoices need. Numbered anyway
-- (reusing next_invoice_seq, generic over the series string) because a real
-- reference number is worth having on a document you hand to a customer,
-- even one that can still change.
create table public.quotations (
  id             uuid primary key default gen_random_uuid(),

  series         text not null,
  seq            bigint not null check (seq > 0),
  number         text generated always as
                   (series || '-' || lpad(seq::text, 5, '0')) stored,

  customer_id    uuid not null references public.customers(id) on delete restrict,
  service_id     uuid references public.services(id) on delete restrict,
  custom_service_name text,

  pax_adults     integer not null default 1 check (pax_adults >= 1),
  pax_children   integer not null default 0 check (pax_children >= 0),

  -- Same shape as invoice_drafts.lines — {label, qty, rate_paise,
  -- catalogue_rate_paise, gst_bp}[] — so building one reuses the exact same
  -- pricing engine and line-item UI as an invoice.
  lines          jsonb not null default '[]'::jsonb,
  subtotal_paise bigint not null default 0,
  gst_paise      bigint not null default 0,
  total_paise    bigint not null default 0,

  amount_note    text,
  valid_until    date,

  status         text not null default 'draft'
                   check (status in ('draft','sent','accepted','declined','expired','converted')),
  converted_invoice_id uuid references public.invoices(id) on delete set null,

  created_by     uuid references public.profiles(id) on delete restrict,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  archived_at    timestamptz,

  constraint quotations_number_uk unique (series, seq)
);

create index quotations_customer_idx on public.quotations (customer_id) where archived_at is null;
create index quotations_status_idx   on public.quotations (status) where archived_at is null;

comment on table public.quotations is
  'Pre-invoice quotes. Mutable by design — no tax document exists until '
  'convert_quotation_to_invoice() turns one into a real, immutable invoice.';

create trigger quotations_touch
  before update on public.quotations
  for each row execute function private.tg_touch_updated_at();

create trigger audit
  after insert or update or delete on public.quotations
  for each row execute function private.tg_activity_log();

alter table public.quotations enable row level security;

revoke all on public.quotations from public, anon, authenticated;

-- Same access shape as invoices/invoice_drafts post-0036: any active user
-- (admin or manager), nothing money-specific to hide on a document that
-- hasn't been paid against yet.
create policy quotations_all on public.quotations
  for all to authenticated
  using ( (select public.is_active_user()) )
  with check ( (select public.is_active_user()) );

grant select on public.quotations to authenticated;

grant insert (customer_id, service_id, custom_service_name, pax_adults,
              pax_children, lines, subtotal_paise, gst_paise, total_paise,
              amount_note, valid_until, series, seq, created_by)
  on public.quotations to authenticated;

grant update (service_id, custom_service_name, pax_adults, pax_children,
              lines, subtotal_paise, gst_paise, total_paise, amount_note,
              valid_until, status, converted_invoice_id, archived_at)
  on public.quotations to authenticated;

-- ── convert_quotation_to_invoice() ──────────────────────────────────────────
-- The one moment a quotation touches the real, immutable ledger. Mirrors
-- createAndIssueInvoice()'s TypeScript flow (open a case for a pipeline
-- service, draft, issue) but as one atomic RPC so there's no window where a
-- case or draft exists with no quotation pointing at it, or vice versa.
create or replace function public.convert_quotation_to_invoice(
  p_quotation_id     uuid,
  p_expected_total_paise bigint,
  p_idempotency_key  text
)
returns table (invoice_id uuid, number text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_q          public.quotations%rowtype;
  v_case_id    uuid;
  v_draft_id   uuid;
  v_pipeline_id uuid;
  v_stage_id   uuid;
  v_result     record;
begin
  if not (select public.is_active_user()) then
    raise exception 'not authorised' using errcode = '42501';
  end if;

  select * into v_q from public.quotations where id = p_quotation_id for update;
  if not found then
    raise exception 'quotation % not found', p_quotation_id using errcode = 'P0002';
  end if;
  if v_q.status = 'converted' then
    raise exception 'quotation % was already converted', v_q.number using errcode = '23514';
  end if;

  -- Open a case for a pipeline-tracked service, at its first declared stage —
  -- identical rule to openCaseForService() in invoices/new/actions.ts.
  if v_q.service_id is not null then
    select sa.stage_id, s.pipeline_id
      into v_stage_id, v_pipeline_id
      from public.stage_applicability sa
      join public.stages s on s.id = sa.stage_id
      join public.pipelines p on p.id = s.pipeline_id
     where sa.service_id = v_q.service_id and p.key = 'processing'
     order by sa.sort_order
     limit 1;

    if v_stage_id is not null then
      insert into public.cases (
        customer_id, service_id, pipeline_id, stage_id,
        pax_adults, pax_children, created_by
      ) values (
        v_q.customer_id, v_q.service_id, v_pipeline_id, v_stage_id,
        v_q.pax_adults, v_q.pax_children, v_q.created_by
      )
      returning id into v_case_id;
    end if;
  end if;

  insert into public.invoice_drafts (
    customer_id, case_id, service_id, custom_service_name,
    pax_adults, pax_children, lines, amount_note, created_by
  ) values (
    v_q.customer_id, v_case_id, v_q.service_id, v_q.custom_service_name,
    v_q.pax_adults, v_q.pax_children, v_q.lines, v_q.amount_note, v_q.created_by
  )
  returning id into v_draft_id;

  select * into v_result from public.issue_invoice(
    p_draft_id := v_draft_id,
    p_expected_total_paise := p_expected_total_paise,
    p_idempotency_key := p_idempotency_key
  );

  update public.quotations
     set status = 'converted', converted_invoice_id = v_result.invoice_id
   where id = p_quotation_id;

  return query select v_result.invoice_id, v_result.number;
end $$;

revoke all on function public.convert_quotation_to_invoice(uuid, bigint, text) from public, anon;
grant execute on function public.convert_quotation_to_invoice(uuid, bigint, text) to authenticated;
