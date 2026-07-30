-- Bug fix: PDF download/attach was 500ing for every invoice in production.
-- Two independent causes, both live-reproduced against this project:
--
-- 1. The `invoices` Storage bucket was never created. src/lib/pdf/store.ts
--    has always assumed it exists ("the invoices bucket is private with no
--    RLS policies") — nothing in supabase/migrations/ ever created it, on
--    any project this template has been cloned to. Every upload failed with
--    "Bucket not found".
--
-- 2. attach_invoice_pdf() gated on can_access_customer(), which resolves
--    through auth.uid() — but its only caller (generateAndAttachInvoicePdf)
--    has always used the admin (service_role) client, because the bucket
--    write needs service_role. A service_role JWT carries no `sub`, so
--    auth.uid() is null there and the check failed every time with
--    "not authorised" — this was never reachable from any other caller.
--    Same shape as dispatch_call_task (0022): a function whose only caller
--    is trusted service-side code doesn't re-derive authorization from a
--    user session that doesn't exist in that context. Re-granted to
--    service_role only, matching that precedent.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('invoices', 'invoices', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

create or replace function public.attach_invoice_pdf(p_invoice_id uuid, p_path text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.invoices set pdf_path = p_path where id = p_invoice_id;
  if not found then
    raise exception 'invoice % not found', p_invoice_id using errcode = 'P0002';
  end if;
end $$;

revoke all on function public.attach_invoice_pdf(uuid, text) from public, anon, authenticated;
grant execute on function public.attach_invoice_pdf(uuid, text) to service_role;

comment on function public.attach_invoice_pdf is
  'Records the stored PDF path on an issued invoice. service_role-only: its '
  'sole caller (generateAndAttachInvoicePdf) already runs behind '
  'requireProfile()/requireAdmin() at the Next.js layer and needs the admin '
  'client for the Storage write, so there is no user session here to '
  'authorise against — trusting the caller matches dispatch_call_task (0022).';
