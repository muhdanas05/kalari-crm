-- ============================================================================
-- Issued invoices become editable.
--
-- Owner's explicit, repeated instruction: this is his own book and he wants to
-- correct a document in place instead of void-and-reissue for every typo.
--
-- What can now change on an issued invoice: pax counts, due date, the note,
-- and the LINES (label / qty / rate / GST), which recomputes subtotal, GST and
-- total using exactly the arithmetic issue_invoice() uses.
--
-- What still cannot: series, seq and number. Not out of caution — those three
-- feed the gap-free sequential numbering the invoice counter exists to
-- guarantee, and letting them move would let two documents claim the same
-- number. Everything a person would actually want to fix is now editable;
-- only the identity of the document is pinned.
--
-- pdf_path is cleared on every edit so a stale PDF rendered from the old lines
-- cannot be served afterwards; the route re-renders on next view.
-- ============================================================================

create or replace function private.tg_invoice_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mutable   text[] := array[
    'lifecycle','voided_at','voided_by','void_reason','pdf_path',
    'pax_adults','pax_children','due_date',
    'subtotal_paise','gst_paise','total_paise','amount_note'
  ];
  v_generated text[] := array['number'];
  v_ignore    text[] := v_mutable || v_generated;
  v_old jsonb;
  v_new jsonb;
begin
  if TG_OP = 'DELETE' then
    raise exception 'invoices are append-only; use void_invoice()'
      using errcode = '42501';
  end if;

  if NEW.series is distinct from OLD.series or NEW.seq is distinct from OLD.seq then
    raise exception 'invoice %: the invoice number is permanent and never reused',
      OLD.number using errcode = '23514';
  end if;

  -- pdf_path may now be cleared (an edit invalidates the rendered PDF) and set
  -- again by attach_invoice_pdf. It still may not jump straight from one path
  -- to a different one without passing through NULL.
  if OLD.pdf_path is not null
     and NEW.pdf_path is distinct from OLD.pdf_path
     and NEW.pdf_path is not null then
    raise exception 'invoice %: pdf_path must be cleared before re-attaching', OLD.number
      using errcode = '23514';
  end if;

  if NEW.lifecycle is distinct from OLD.lifecycle
     and not (OLD.lifecycle = 'issued' and NEW.lifecycle = 'void') then
    raise exception 'invoice %: illegal lifecycle transition % -> %',
      OLD.number, OLD.lifecycle, NEW.lifecycle using errcode = '23514';
  end if;

  v_old := to_jsonb(OLD) - v_ignore;
  v_new := to_jsonb(NEW) - v_ignore;
  if v_old is distinct from v_new then
    raise exception 'invoice %: % cannot be changed after issue',
      OLD.number,
      (select array_agg(e.key) from jsonb_each(v_new) e
        where v_old -> e.key is distinct from e.value)
      using errcode = '23514';
  end if;

  return NEW;
end $$;

-- ── edit_issued_invoice ─────────────────────────────────────────────────────
create or replace function public.edit_issued_invoice(
  p_invoice_id           uuid,
  p_pax_adults           integer,
  p_pax_children         integer,
  p_due_date             date,
  p_amount_note          text,
  p_lines                jsonb,
  p_expected_total_paise bigint,
  p_reason               text default null
)
returns table (invoice_id uuid, number text, total_paise bigint)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_inv            public.invoices%rowtype;
  v_subtotal_paise bigint := 0;
  v_gst_paise      bigint := 0;
  v_paid_paise     bigint;
  v_line           jsonb;
  v_no             integer := 0;
begin
  if not (select public.has_permission('invoices')) then
    raise exception 'not authorised' using errcode = '42501';
  end if;

  select * into v_inv from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'invoice % not found', p_invoice_id using errcode = 'P0002';
  end if;
  if v_inv.lifecycle <> 'issued' then
    raise exception 'invoice % is void — restore it before editing', v_inv.number
      using errcode = '23514';
  end if;
  if p_pax_adults + p_pax_children < 1 then
    raise exception 'at least one traveller is required' using errcode = '23514';
  end if;
  if p_due_date < v_inv.issue_date then
    raise exception 'due date cannot be before the issue date (%)', v_inv.issue_date
      using errcode = '23514';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'an invoice needs at least one line' using errcode = '23514';
  end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
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

  -- Same drift tripwire as issue_invoice: if the client's arithmetic and the
  -- database's disagree, refuse rather than write a number nobody computed.
  if (v_subtotal_paise + v_gst_paise) is distinct from p_expected_total_paise then
    raise exception
      'total mismatch: client says % paise, database computes % paise. Refusing to save.',
      p_expected_total_paise, v_subtotal_paise + v_gst_paise using errcode = '23514';
  end if;

  -- Cannot drop the total below money already collected — that would leave a
  -- negative outstanding and a payment with nothing to belong to.
  -- NB: every invoice_id below is table-qualified. This function's OUT
  -- parameters are (invoice_id, number, total_paise), so a bare `invoice_id`
  -- is ambiguous against the column and Postgres raises 42702 at runtime.
  select coalesce(sum(p.amount_paise), 0) into v_paid_paise
  from public.payments p where p.invoice_id = p_invoice_id and p.voided_at is null;
  if (v_subtotal_paise + v_gst_paise) < v_paid_paise then
    raise exception
      'invoice %: new total (% paise) is below the % paise already paid — void the payment first',
      v_inv.number, v_subtotal_paise + v_gst_paise, v_paid_paise using errcode = '23514';
  end if;

  delete from public.invoice_lines l where l.invoice_id = p_invoice_id;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_no := v_no + 1;
    insert into public.invoice_lines (
      invoice_id, line_no, label, qty, rate_paise, catalogue_rate_paise,
      amount_paise, gst_bp, gst_paise
    ) values (
      p_invoice_id, v_no, v_line ->> 'label',
      (v_line ->> 'qty')::integer,
      (v_line ->> 'rate_paise')::bigint,
      nullif(v_line ->> 'catalogue_rate_paise', '')::bigint,
      (v_line ->> 'qty')::bigint * (v_line ->> 'rate_paise')::bigint,
      coalesce((v_line ->> 'gst_bp')::integer, 0),
      coalesce(round((((v_line ->> 'qty')::bigint * (v_line ->> 'rate_paise')::bigint)::numeric
        * coalesce((v_line ->> 'gst_bp')::integer, 0)) / 10000), 0)
    );
  end loop;

  update public.invoices
     set pax_adults     = p_pax_adults,
         pax_children   = p_pax_children,
         due_date       = p_due_date,
         amount_note    = p_amount_note,
         subtotal_paise = v_subtotal_paise,
         gst_paise      = v_gst_paise,
         total_paise    = v_subtotal_paise + v_gst_paise,
         pdf_path       = null
   where id = p_invoice_id;

  -- The audit trigger already captures the before/after column diff; it has no
  -- column for a free-text note, so the optional reason gets its own row.
  if nullif(btrim(coalesce(p_reason, '')), '') is not null then
    insert into public.activity_log
      (actor_kind, user_id, entity, entity_id, action, after, changed_keys)
    values (
      'user', auth.uid(), 'invoices', p_invoice_id, 'update',
      jsonb_build_object('edit_reason', btrim(p_reason)), array['edit_reason']
    );
  end if;

  return query select v_inv.id, v_inv.number, (v_subtotal_paise + v_gst_paise);
end $$;

revoke all on function public.edit_issued_invoice(uuid, integer, integer, date, text, jsonb, bigint, text)
  from public, anon;

grant execute on function public.edit_issued_invoice(uuid, integer, integer, date, text, jsonb, bigint, text)
  to authenticated;
