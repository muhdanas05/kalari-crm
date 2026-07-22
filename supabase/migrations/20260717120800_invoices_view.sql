-- ============================================================================
-- 0009 · invoices_v — derived payment status.
--
-- REQ-PM2: "Invoice status derives from payments: Unpaid / Partially Paid /
-- Paid / Overdue. Never hand-set."
--
-- The way to guarantee "never hand-set" is not discipline — it is to have NO
-- SETTABLE COLUMN. There is no invoices.status anywhere in this schema. There
-- is nothing to hand-set.
--
-- The PRD's single `status` conflates two orthogonal facts:
--   lifecycle (issued|void) — a DECISION someone made          → stored
--   payment status + overdue — a FUNCTION of (total, Σpayments, today) → derived
--
-- Note a generated column could not express these anyway: it may only reference
-- its own row, and `paid` is an aggregate over payments. That is not a
-- workaround problem — it is the schema telling you the column was modelled
-- wrong.
--
-- Why a VIEW and not a trigger-maintained column: at this volume the lateral
-- sums are free, and there is ZERO drift risk. PRD success criterion #4 —
-- "Dashboard outstanding total always reconciles to invoices minus payments" —
-- becomes true BY DEFINITION rather than by a reconciliation job nobody runs.
-- If it ever hurts, materialise behind the same view name: forward-only, no
-- client change.
-- ============================================================================

create view public.invoices_v with (security_invoker = true) as
select
  i.*,
  p.paid_paise,
  cn.credited_paise,
  (i.total_paise - p.paid_paise - cn.credited_paise) as outstanding_paise,

  case
    when i.total_paise - p.paid_paise - cn.credited_paise <= 0 then 'paid'
    when p.paid_paise > 0                                    then 'partially_paid'
    else 'unpaid'
  end as payment_status,

  -- Overdue is a FLAG orthogonal to the three payment states, not a fourth
  -- value: a partially-paid invoice can also be overdue. The call queue needs
  -- "overdue AND partially paid"; the PDF badge needs one word. Both are
  -- available rather than collapsing the facts prematurely.
  (
    i.lifecycle = 'issued'
    and i.total_paise - p.paid_paise - cn.credited_paise > 0
    and public.today_kolkata() > i.due_date
  ) as is_overdue,

  -- Collapsed to the PRD's four values for direct UI binding.
  case
    when i.lifecycle = 'void' then 'void'
    when i.total_paise - p.paid_paise - cn.credited_paise <= 0 then 'paid'
    when public.today_kolkata() > i.due_date then 'overdue'
    when p.paid_paise > 0 then 'partially_paid'
    else 'unpaid'
  end as display_status,

  greatest(public.today_kolkata() - i.due_date, 0) as days_overdue

from public.invoices i
cross join lateral (
  select coalesce(sum(pm.amount_paise), 0)::bigint as paid_paise
  from public.payments pm
  where pm.invoice_id = i.id and pm.voided_at is null
) p
cross join lateral (
  select coalesce(sum(c.total_paise), 0)::bigint as credited_paise
  from public.invoices c
  where c.parent_invoice_id = i.id
    and c.doc_type = 'credit_note'
    and c.lifecycle = 'issued'
) cn;

-- security_invoker = true → RLS on the base tables applies PER CALLER, so this
-- view cannot become an RLS bypass.
--
-- ⚠️ Live bug class to watch: if a user could see an invoice but NOT all of its
-- payments, their paid_paise would silently differ from the admin's. Our
-- payments policy is derived from the invoices policy so they are aligned — but
-- a pgTAP test asserts an employee's paid_paise equals the admin's, because
-- "silently different money per viewer" is not a bug you want to find in
-- production.
grant select on public.invoices_v to authenticated;

revoke all on public.invoices_v from public, anon;

comment on view public.invoices_v is
  'Invoices with DERIVED payment status. There is no invoices.status column by '
  'design (REQ-PM2 "never hand-set"). outstanding_paise = total - payments - credits, '
  'computed live, so it always reconciles.';
