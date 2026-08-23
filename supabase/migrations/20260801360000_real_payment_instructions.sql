-- ============================================================================
-- Real bank details in the payment-instructions email.
--
-- 20260717160000 seeded this setting with <PENDING — ...> placeholders, and it
-- is a DATA row, not code — so adding the account to lib/pdf/bank.ts (which
-- fixed the invoice PDF) left every emailed invoice still telling the customer
-- "Account number: <PENDING — ACCOUNT NUMBER>".
--
-- From the passbook. The UPI line is DROPPED rather than left as a placeholder:
-- no UPI ID has been provided, and a line reading "<PENDING>" on a payment
-- instruction is worse than no line at all.
--
-- MICR, account type and the registered mobile are deliberately omitted too —
-- MICR is only used for physical cheque clearing, and the rest is internal.
-- Nothing there helps a customer pay.
-- ============================================================================

update public.automation_settings
   set config = jsonb_build_object(
     'text',
     E'To pay, transfer to:\n\n'
     'Beneficiary: M/S KALARI TOURS AND TRAVELS\n'
     'Account number: 40651111000724\n'
     'IFSC: KLGB0040651\n'
     'Bank: Kerala Gramin Bank, Kottayam Malabar\n'
     'Reference: your invoice number\n\n'
     'NEFT, RTGS, IMPS and UPI all reach this account.\n\n'
     'Once you have paid, please send us a message on WhatsApp at +91 95673 24364 '
     'or call the office, so we can confirm it against your file straight away.',
     'note',
     'Real account, from the passbook (2026-08-23). Must stay in step with '
     'src/lib/pdf/bank.ts, which prints the same details on the invoice PDF — '
     'two documents disagreeing about an account number is how money reaches '
     'the wrong place. No UPI ID supplied yet; add a "UPI: <id>" line here and '
     'in bank.ts when there is one.'
   )
 where key = 'email.payment_instructions';

-- Fail loudly if the row was renamed or removed, rather than silently doing
-- nothing and leaving customers with the placeholder.
do $$
begin
  if not exists (
    select 1 from public.automation_settings
    where key = 'email.payment_instructions'
      and config ->> 'text' like '%40651111000724%'
  ) then
    raise exception 'payment instructions were not updated — check the setting key';
  end if;
end $$;
