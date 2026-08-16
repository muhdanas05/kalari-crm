-- ============================================================================
-- UPI joins cash / transfer / cheque as a payment method.
--
-- It is how most people in Kerala actually pay, and it was being recorded as
-- "transfer", which makes the account book unable to answer "how much came in
-- by UPI".
--
-- `alter type ... add value` cannot run inside a transaction block in older
-- Postgres; on PG 12+ it can, EXCEPT that the new value cannot be used in the
-- same transaction that adds it. Nothing here uses it, so this is safe as a
-- single statement — and it is additive, so no existing row changes meaning.
-- ============================================================================

alter type public.payment_method add value if not exists 'upi';
