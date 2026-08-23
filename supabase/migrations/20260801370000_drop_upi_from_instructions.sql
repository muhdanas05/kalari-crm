-- ============================================================================
-- Drop the UPI mention from the payment-instructions email.
--
-- Owner's call. No UPI ID was ever supplied, and telling a customer "UPI
-- reaches this account" without giving them a VPA to send to is an
-- instruction they cannot act on. Bank transfer details only.
--
-- UPI remains a valid PAYMENT METHOD for recording money that has already
-- arrived (20260801330000) — that is a record of what happened, not an
-- instruction to the customer, and the two are unrelated.
-- ============================================================================

update public.automation_settings
   set config = jsonb_set(
     config,
     '{text}',
     -- ::text so to_jsonb() has a concrete type; a bare literal is `unknown`
     -- and to_jsonb is polymorphic, which errors with 42804.
     to_jsonb(
       (E'To pay, transfer to:\n\n'
       'Beneficiary: M/S KALARI TOURS AND TRAVELS\n'
       'Account number: 40651111000724\n'
       'IFSC: KLGB0040651\n'
       'Bank: Kerala Gramin Bank, Kottayam Malabar\n'
       'Reference: your invoice number\n\n'
       'Once you have paid, please send us a message on WhatsApp or call the '
       'office, so we can confirm it against your file straight away.')::text
     )
   )
 where key = 'email.payment_instructions';

do $$
begin
  if exists (
    select 1 from public.automation_settings
    where key = 'email.payment_instructions' and config ->> 'text' ilike '%UPI%'
  ) then
    raise exception 'UPI still present in the payment instructions';
  end if;
end $$;
