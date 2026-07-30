-- ============================================================================
-- 0027 · Two new service families.
--
-- `attestation` — Certificate & Document Attestation. On Kalari's own flyer
-- alongside the six families already modelled, but missed in the first
-- catalogue pass because it is absent from the website's service menu.
--
-- `other` — the escape hatch for a one-off service that does not belong to any
-- family. Reserved now rather than later: adding an enum value costs TWO
-- migrations (see the NOTE in 0001 — `ALTER TYPE … ADD VALUE` cannot be used
-- in the transaction that adds it, and Supabase runs one file per
-- transaction), so a value nobody can add on the day they need it is a value
-- that gets worked around with a wrong family instead.
--
-- THIS FILE ADDS THE VALUES AND NOTHING ELSE. Everything that USES them lives
-- in 0028. Do not merge the two.
-- ============================================================================

alter type public.service_family add value if not exists 'attestation';

alter type public.service_family add value if not exists 'other';
