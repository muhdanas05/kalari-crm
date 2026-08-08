-- Widen the RLS policies behind each permission-gated page to match —
-- granting the checkbox in Settings must actually work, not just unlock a
-- page shell that then shows no data (exactly the class of bug the Accounts
-- page hit before has_permission() existed). profiles itself is the one
-- deliberate exception: user management stays is_admin()-only regardless —
-- granting a manager the ability to edit permissions would let them grant
-- themselves more.

-- ── Accounts (expenses) ──────────────────────────────────────────────────
drop policy if exists expenses_admin_read on public.expenses;
create policy expenses_admin_read on public.expenses
  for select to authenticated using ( (select public.has_permission('accounts')) );

drop policy if exists expenses_admin_write on public.expenses;
create policy expenses_admin_write on public.expenses
  for all to authenticated
  using ( (select public.has_permission('accounts')) )
  with check ( (select public.has_permission('accounts')) );

-- ── Service Catalogue ────────────────────────────────────────────────────
drop policy if exists services_admin_write on public.services;
create policy services_admin_write on public.services
  for all to authenticated
  using ( (select public.has_permission('admin_catalogue')) )
  with check ( (select public.has_permission('admin_catalogue')) );

drop policy if exists line_item_rules_admin_write on public.line_item_rules;
create policy line_item_rules_admin_write on public.line_item_rules
  for all to authenticated
  using ( (select public.has_permission('admin_catalogue')) )
  with check ( (select public.has_permission('admin_catalogue')) );

-- ── Pipeline Stages ──────────────────────────────────────────────────────
drop policy if exists stages_admin_write on public.stages;
create policy stages_admin_write on public.stages
  for all to authenticated
  using ( (select public.has_permission('admin_stages')) )
  with check ( (select public.has_permission('admin_stages')) );

drop policy if exists stage_applicability_admin_write on public.stage_applicability;
create policy stage_applicability_admin_write on public.stage_applicability
  for all to authenticated
  using ( (select public.has_permission('admin_stages')) )
  with check ( (select public.has_permission('admin_stages')) );

drop policy if exists stage_email_config_admin on public.stage_email_config;
create policy stage_email_config_admin on public.stage_email_config
  for all to authenticated
  using ( (select public.has_permission('admin_stages')) )
  with check ( (select public.has_permission('admin_stages')) );

-- ── Suppliers — write was admin-only even though the tab itself never was ──
drop policy if exists suppliers_admin_write on public.suppliers;
create policy suppliers_admin_write on public.suppliers
  for all to authenticated
  using ( (select public.has_permission('suppliers')) )
  with check ( (select public.has_permission('suppliers')) );

-- ── Integrations ─────────────────────────────────────────────────────────
drop policy if exists integration_requests_admin on public.integration_requests;
create policy integration_requests_admin on public.integration_requests
  for all to authenticated
  using ( (select public.has_permission('admin_integrations')) )
  with check ( (select public.has_permission('admin_integrations')) );

-- ── Automations ──────────────────────────────────────────────────────────
drop policy if exists automation_settings_admin on public.automation_settings;
create policy automation_settings_admin on public.automation_settings
  for update to authenticated
  using ( (select public.has_permission('automations')) )
  with check ( (select public.has_permission('automations')) );

-- ── Logs (audit trail tab) ───────────────────────────────────────────────
drop policy if exists activity_log_admin_select on public.activity_log;
create policy activity_log_admin_select on public.activity_log
  for select to authenticated using ( (select public.has_permission('admin_logs')) );
