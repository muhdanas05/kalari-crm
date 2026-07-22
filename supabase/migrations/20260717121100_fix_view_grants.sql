-- ============================================================================
-- 0012 · Fix: invoices_v carried Supabase's default DELETE/TRUNCATE grant.
--
-- Found by the pgTAP assertion "authenticated can never DELETE or TRUNCATE",
-- not by reading the migration.
--
-- Cause: 0009 said
--     grant select on public.invoices_v to authenticated;
--     revoke all on public.invoices_v from public, anon;
-- The revoke named `public, anon` but NOT `authenticated`, so Supabase's
-- default ACL (arwdDxtm on every new object in `public` — verified on this
-- project) survived untouched on the view. The `grant select` then looked like
-- it was defining the privilege set when it was only adding to it.
--
-- Impact today: low. invoices_v has lateral joins, so it is not auto-updatable
-- and a DELETE against it errors. The invoice guard trigger would also refuse.
-- But it contradicts the stated rule ("no role holds DELETE"), and if the view
-- were ever simplified into an auto-updatable one, the grant would silently
-- become live. A privilege that only fails by accident is not a control.
--
-- Lesson recorded: REVOKE must always name `authenticated` explicitly, on
-- VIEWS as well as tables. Easy to miss on views because they feel read-only.
-- ============================================================================

revoke all on public.invoices_v from public, anon, authenticated;

grant select on public.invoices_v to authenticated;

-- invoice_drafts keeps DELETE deliberately: a draft is scratch state with no
-- number, no invariants and no money semantics until issue_invoice validates
-- it. Throwing one away is a normal, correct action — unlike an invoice, which
-- is append-only forever.;
