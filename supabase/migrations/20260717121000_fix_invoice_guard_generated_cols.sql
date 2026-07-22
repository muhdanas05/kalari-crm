-- ============================================================================
-- 0011 · Fix: the invoice guard rejected its own LEGAL operations.
--
-- Bug (found by driving the trigger against the live DB, not by reading it):
-- `invoices.number` is a GENERATED column (series || '-' || lpad(seq,5)).
-- Generated columns are NOT populated in NEW during a BEFORE trigger — NEW.number
-- is NULL while OLD.number holds the value. The whole-row comparison therefore
-- saw `number` change on EVERY update and raised, blocking the two operations
-- that are supposed to be allowed:
--     • attach_invoice_pdf()  → invoices could never get a PDF
--     • issued → void         → invoices could never be voided
--
-- Symptom was masked because both look like correct immutability enforcement.
-- The failure mode of a too-strict guard is indistinguishable from a working one
-- until you test the ALLOWED path. That is why the negative test matters as much
-- as the positive one.
--
-- Fix: exclude generated columns from the comparison. This is SAFE, not a
-- weakening: `number` is derived purely from `series` and `seq`, and both remain
-- frozen by this very trigger. Freezing the inputs freezes the output
-- transitively — there is no way to change `number` without changing `series` or
-- `seq`, which still raises.
--
-- Forward-only: a new migration, never an edit to an applied one (CLAUDE.md §9).
-- ============================================================================

create or replace function private.tg_invoice_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Legitimately mutable post-issue.
  v_mutable   text[] := array['lifecycle','voided_at','voided_by','void_reason','pdf_path'];
  -- NOT mutable — merely not comparable in a BEFORE trigger, because Postgres
  -- has not computed them into NEW yet. Frozen transitively via series + seq.
  v_generated text[] := array['number'];
  v_ignore    text[] := v_mutable || v_generated;
  v_old jsonb;
  v_new jsonb;
begin
  if TG_OP = 'DELETE' then
    raise exception 'invoices are append-only; use void_invoice()'
      using errcode = '42501';
  end if;

  -- series/seq stay frozen by the whole-row comparison below, which is what
  -- keeps `number` frozen despite being excluded from it. Belt and braces:
  if NEW.series is distinct from OLD.series or NEW.seq is distinct from OLD.seq then
    raise exception 'invoice %: the invoice number is permanent and never reused',
      OLD.number using errcode = '23514';
  end if;

  if OLD.pdf_path is not null and NEW.pdf_path is distinct from OLD.pdf_path then
    raise exception 'invoice %: pdf_path is write-once', OLD.number
      using errcode = '23514';
  end if;

  if NEW.lifecycle is distinct from OLD.lifecycle
     and not (OLD.lifecycle = 'issued' and NEW.lifecycle = 'void') then
    raise exception 'invoice %: illegal lifecycle transition % -> %',
      OLD.number, OLD.lifecycle, NEW.lifecycle using errcode = '23514';
  end if;

  -- Everything else frozen. Subtracting the ignore list from BOTH sides means a
  -- column added by a future migration is frozen automatically by default —
  -- the property that makes this beat enumerating 25 column comparisons.
  v_old := to_jsonb(OLD) - v_ignore;
  v_new := to_jsonb(NEW) - v_ignore;
  if v_old is distinct from v_new then
    raise exception 'invoice % is immutable; attempted change to: %',
      OLD.number,
      (select array_agg(e.key) from jsonb_each(v_new) e
        where v_old -> e.key is distinct from e.value)
      using errcode = '23514';
  end if;

  return NEW;
end $$;

-- The payment guard has no generated columns, so it is unaffected. Verified by
-- inspection: payments has no `generated always as` column.;
