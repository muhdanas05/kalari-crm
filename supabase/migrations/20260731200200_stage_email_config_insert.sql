-- ============================================================================
-- 0035 · stage_email_config needed an INSERT path.
--
-- Every existing stage got a config row from the 0020 seed. A stage created
-- through the new admin stage editor (0034) has none — and the admin-write
-- policy from 0020 was UPDATE-only, so the client had no legal way to create
-- one. Widened to `for all`, which also covers the insert the editor does the
-- moment a new stage is created (a default, everything-off row, so the
-- trigger has something to read rather than nothing).
-- ============================================================================

drop policy if exists stage_email_config_admin on public.stage_email_config;

create policy stage_email_config_admin on public.stage_email_config
  for all to authenticated
  using      ( (select public.is_admin()) )
  with check ( (select public.is_admin()) );

grant insert (stage_id, enabled, template_key, requires_input, custom_subject,
              custom_body, updated_by, updated_at)
  on public.stage_email_config to authenticated;
