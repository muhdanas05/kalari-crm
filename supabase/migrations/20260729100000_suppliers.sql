-- ============================================================================
-- Suppliers — vendors Kalari books through (consolidators, DMCs, visa/Haj
-- agents, hotels). A case can reference the supplier fulfilling it, and staff
-- can email that supplier through the same queue/log customer email uses.
--
-- Forward-only: the schema is live (project uedhlrkmpediekclodkb). Never edit
-- an applied migration.
-- ============================================================================

create table public.suppliers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) > 0),
  -- Free text, not an enum: vendor types don't map 1:1 to service_family and
  -- grow ad hoc (a hotel DMC, a ticket consolidator, a Haj operator...).
  supplies    text,

  contact_person text,
  email       text,
  phone       text,
  whatsapp    text,
  city        text,
  address     text,
  notes       text,

  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger suppliers_touch
  before update on public.suppliers
  for each row execute function private.tg_touch_updated_at();

create trigger audit
  after insert or update or delete on public.suppliers
  for each row execute function private.tg_activity_log();

-- ── RLS + grants ────────────────────────────────────────────────────────────
alter table public.suppliers enable row level security;

revoke all on public.suppliers from public, anon, authenticated;

-- Everyone active reads it: employees need it to see/set a case's supplier.
create policy suppliers_select on public.suppliers
  for select to authenticated
  using ( (select public.is_active_user()) );

-- Admin-only write, same as the service catalogue.
create policy suppliers_admin_write on public.suppliers
  for all to authenticated
  using      ( (select public.is_admin()) )
  with check ( (select public.is_admin()) );

grant select on public.suppliers to authenticated;
grant insert, update on public.suppliers to authenticated;
-- No delete: soft-delete only, via archived_at.

-- ── cases.supplier_id ────────────────────────────────────────────────────────
alter table public.cases
  add column supplier_id uuid references public.suppliers(id) on delete restrict;

create index cases_supplier_idx on public.cases (supplier_id) where archived_at is null;

grant update (supplier_id) on public.cases to authenticated;

-- ── email_queue / email_log get a supplier_id ────────────────────────────────
-- Nullable, same shape as customer_id — an email row now points at EITHER a
-- customer OR a supplier (never both; enforced in the app, not the DB, same
-- as the rest of this seam).
alter table public.email_queue
  add column supplier_id uuid references public.suppliers(id) on delete set null;

alter table public.email_log
  add column supplier_id uuid references public.suppliers(id) on delete set null;

create index email_log_supplier_idx
  on public.email_log (supplier_id, occurred_at desc) where supplier_id is not null;

-- The existing select policies only grant visibility via can_access_customer,
-- so a supplier email (customer_id null) would be invisible to employees.
-- Forward-only: drop and recreate with the supplier clause added.
drop policy email_queue_select on public.email_queue;
create policy email_queue_select on public.email_queue for select to authenticated
  using (
    (select public.is_admin())
    or (select public.can_access_customer(customer_id))
    or (supplier_id is not null and (select public.is_active_user()))
  );

drop policy email_log_select on public.email_log;
create policy email_log_select on public.email_log for select to authenticated
  using (
    (select public.is_admin())
    or (select public.can_access_customer(customer_id))
    or (supplier_id is not null and (select public.is_active_user()))
  );
