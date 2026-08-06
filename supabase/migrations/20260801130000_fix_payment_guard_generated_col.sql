-- Bug: void_payment() has never worked, for any payment, ever.
--
-- Same bug as 0011 (tg_invoice_guard), and that migration even said so at the
-- time — "payments has no generated always as column, unaffected" — which
-- was true on 2026-07-17 and stopped being true on 2026-07-29
-- (20260729100100_payment_receipts.sql added payments.number as a GENERATED
-- ALWAYS AS (series || '-' || lpad(seq,5)) STORED column) with nobody
-- circling back to re-apply the same fix. Generated columns are not
-- populated into NEW inside a BEFORE trigger — NEW.number reads NULL while
-- OLD.number holds the real value — so tg_payment_guard's whole-row
-- comparison saw `number` "change" on every single update and refused it,
-- including its own intended job: setting voided_at/voided_by/void_reason.
--
-- Found by driving void_payment() against a live row, not by reading the
-- trigger — the same lesson 0011 already drew: a too-strict guard and a
-- correctly-working one look identical until the allowed path is tested.
--
-- Fix: identical shape to 0011 — exclude `number` from the comparison.
-- Still safe, not a weakening: number is derived only from series + seq, and
-- both stay frozen by the same comparison (they're not in v_mutable), so
-- number is frozen transitively.
create or replace function private.tg_payment_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mutable   text[] := array['voided_at','voided_by','void_reason'];
  v_generated text[] := array['number'];
  v_ignore    text[] := v_mutable || v_generated;
begin
  if TG_OP = 'DELETE' then
    raise exception 'payments are append-only; use void_payment()'
      using errcode = '42501';
  end if;
  if OLD.voided_at is not null then
    raise exception 'payment % is already void', OLD.id using errcode = '23514';
  end if;
  if (to_jsonb(OLD) - v_ignore) is distinct from (to_jsonb(NEW) - v_ignore) then
    raise exception 'payment % is immutable; void it and record a new one', OLD.id
      using errcode = '23514';
  end if;
  return NEW;
end $$;
