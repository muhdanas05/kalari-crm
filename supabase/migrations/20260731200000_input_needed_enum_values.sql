-- ============================================================================
-- 0033 · Two new enum values for the "needs input from the customer" stage
--        feature. Own migration — ADD VALUE cannot be used in the same
--        transaction that then uses the value (0001's standing note).
--
-- THIS FILE ADDS THE VALUES AND NOTHING ELSE. Everything that USES them lives
-- in 0034. Do not merge the two.
-- ============================================================================

alter type public.event_type add value if not exists 'case.input_needed';

alter type public.call_reason add value if not exists 'input_needed';
