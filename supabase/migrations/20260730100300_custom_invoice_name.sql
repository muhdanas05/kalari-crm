-- ============================================================================
-- 0030 · Custom invoices carry their own description.
--
-- issue_invoice already tolerated a null service_id — it wrote the literal
-- 'Custom' as the service name. That is fine for the ledger's integrity and
-- useless to the customer holding the paper: every one-off job produced an
-- invoice that said "Custom" and nothing else.
--
-- One new draft column, one extra term in one coalesce. The function is
-- reproduced verbatim from 0008 apart from that line — `create or replace`
-- cannot patch a single statement, so the whole body has to come along.
-- ============================================================================

alter table public.invoice_drafts
  add column if not exists custom_service_name text;

comment on column public.invoice_drafts.custom_service_name is
  'What a service-less invoice is FOR. Snapshotted onto invoices.service_name '
  'at issue, in place of the literal "Custom". Ignored when service_id is set — '
  'the catalogue name wins, so the two can never disagree on a document.';

grant insert (custom_service_name) on public.invoice_drafts to authenticated;

grant update (custom_service_name) on public.invoice_drafts to authenticated;

create or replace function public.issue_invoice(
  p_draft_id            uuid,
  p_expected_total_paise bigint,
  p_issue_date          date default null,
  p_idempotency_key     text default null
)
returns table (invoice_id uuid, number text, total_paise bigint)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_draft      public.invoice_drafts%rowtype;
  v_uid        uuid := auth.uid();
  v_series     text;
  v_seq        bigint;
  v_issue      date;
  v_due        date;
  v_overdue_n  integer;
  v_subtotal_paise   bigint := 0;
  v_gst_paise        bigint := 0;
  v_id         uuid;
  v_existing   public.invoices%rowtype;
  v_line       jsonb;
  v_no         integer := 0;
  v_svc_name   text;
begin
  -- 1. Authorization. DEFINER bypassed RLS, so this is not optional.
  if v_uid is null or not (select public.is_active_user()) then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_draft from public.invoice_drafts where id = p_draft_id;
  if not found then
    raise exception 'draft % not found', p_draft_id using errcode = 'P0002';
  end if;

  if not (select public.can_access_customer(v_draft.customer_id)) then
    raise exception 'not authorised for this customer' using errcode = '42501';
  end if;

  -- 2. Idempotency. Survives double-clicks and client retries: returns the
  --    invoice that already exists instead of issuing a second one.
  if p_idempotency_key is not null then
    select * into v_existing from public.invoices
    where customer_id = v_draft.customer_id and idempotency_key = p_idempotency_key;
    if found then
      return query select v_existing.id, v_existing.number, v_existing.total_paise;
      return;
    end if;
  end if;

  if v_draft.issued_invoice_id is not null then
    raise exception 'draft % is already issued as %', p_draft_id, v_draft.issued_invoice_id
      using errcode = '23505';
  end if;

  -- 3. Lines must exist and be arithmetically exact.
  if jsonb_typeof(v_draft.lines) <> 'array' or jsonb_array_length(v_draft.lines) = 0 then
    raise exception 'cannot issue an invoice with no lines' using errcode = '23514';
  end if;

  for v_line in select * from jsonb_array_elements(v_draft.lines) loop
    if (v_line ->> 'qty')::integer <= 0 then
      raise exception 'line "%": qty must be > 0', v_line ->> 'label' using errcode = '23514';
    end if;
    if (v_line ->> 'rate_paise')::bigint < 0 then
      raise exception 'line "%": rate cannot be negative', v_line ->> 'label' using errcode = '23514';
    end if;
    v_subtotal_paise := v_subtotal_paise + ((v_line ->> 'qty')::bigint * (v_line ->> 'rate_paise')::bigint);
    v_gst_paise := v_gst_paise + coalesce(round(
      (((v_line ->> 'qty')::bigint * (v_line ->> 'rate_paise')::bigint)::numeric
        * coalesce((v_line ->> 'gst_bp')::integer, 0)) / 10000), 0);
  end loop;

  -- 4. The drift tripwire.
  if (v_subtotal_paise + v_gst_paise) is distinct from p_expected_total_paise then
    raise exception
      'total mismatch: client says % paise, database computes % paise. Refusing to issue.',
      p_expected_total_paise, v_subtotal_paise + v_gst_paise using errcode = '23514';
  end if;

  -- 5. Dates. Asia/Kolkata, always (CLAUDE.md §4).
  v_issue := coalesce(p_issue_date, public.today_kolkata());
  if v_issue > public.today_kolkata() then
    raise exception 'cannot issue an invoice dated in the future' using errcode = '23514';
  end if;
  if v_issue < public.today_kolkata() and not (select public.is_admin()) then
    raise exception 'back-dating an invoice is admin-only' using errcode = '42501';
  end if;

  -- OQ8 [ASSUMPTION] — due_date snapshotted at issue, default 7 days.
  select coalesce(nullif(current_setting('app.invoice_overdue_days', true), ''), '7')::integer
    into v_overdue_n;
  v_due := v_issue + v_overdue_n;

  -- Indian financial-year series (April–March): July 2026 → 'INV-2026-27'.
  -- Derived from v_issue (not today) so a back-dated invoice lands in the FY it
  -- belongs to. Must mirror public.current_invoice_series().
  v_series := case
    when extract(month from v_issue) >= 4 then
      'INV-' || to_char(v_issue, 'YYYY') || '-' || to_char(v_issue + interval '1 year', 'YY')
    else
      'INV-' || to_char(v_issue - interval '1 year', 'YYYY') || '-' || to_char(v_issue, 'YY')
  end;

  -- Number order must not contradict date order within a series.
  if exists (select 1 from public.invoices
             where series = v_series and issue_date > v_issue and doc_type = 'invoice') then
    raise exception 'issue_date % precedes an existing invoice in series % — '
      'numbers would not follow dates', v_issue, v_series using errcode = '23514';
  end if;

  select s.name into v_svc_name from public.services s where s.id = v_draft.service_id;

  -- 6. Number allocated LAST, so the counter row is locked for the shortest
  --    possible time and a failure above never burns a number.
  v_seq := private.next_invoice_seq(v_series);

  insert into public.invoices (
    doc_type, customer_id, case_id, service_id, service_name,
    pax_adults, pax_children, series, seq, issue_date, due_date,
    subtotal_paise, gst_paise, total_paise, amount_note,
    issued_by, idempotency_key
  ) values (
    'invoice', v_draft.customer_id, v_draft.case_id, v_draft.service_id,
    -- THE ONE CHANGED LINE (0030): a custom invoice says what it is for.
    -- Catalogue name first so a service-backed invoice can never be relabelled
    -- by a stale draft field; 'Custom' remains the last resort.
    coalesce(v_svc_name, nullif(btrim(v_draft.custom_service_name), ''), 'Custom'),
    v_draft.pax_adults, v_draft.pax_children, v_series, v_seq, v_issue, v_due,
    v_subtotal_paise, v_gst_paise, v_subtotal_paise + v_gst_paise, v_draft.amount_note,
    v_uid, p_idempotency_key
  ) returning id into v_id;

  for v_line in select * from jsonb_array_elements(v_draft.lines) loop
    v_no := v_no + 1;
    insert into public.invoice_lines (
      invoice_id, line_no, label, qty, rate_paise, catalogue_rate_paise,
      amount_paise, gst_bp, gst_paise
    ) values (
      v_id, v_no, v_line ->> 'label',
      (v_line ->> 'qty')::integer,
      (v_line ->> 'rate_paise')::bigint,
      nullif(v_line ->> 'catalogue_rate_paise', '')::bigint,
      (v_line ->> 'qty')::bigint * (v_line ->> 'rate_paise')::bigint,
      coalesce((v_line ->> 'gst_bp')::integer, 0),
      coalesce(round((((v_line ->> 'qty')::bigint * (v_line ->> 'rate_paise')::bigint)::numeric
        * coalesce((v_line ->> 'gst_bp')::integer, 0)) / 10000), 0)
    );
  end loop;

  update public.invoice_drafts set issued_invoice_id = v_id where id = p_draft_id;

  return query select v_id, i.number, i.total_paise from public.invoices i where i.id = v_id;
end $$;

revoke all on function public.issue_invoice(uuid, bigint, date, text) from public, anon;

grant execute on function public.issue_invoice(uuid, bigint, date, text) to authenticated;
