-- ============================================================================
-- 0029 · Archive RPCs for customers, cases, suppliers and expenses.
--
-- Soft-delete is the only delete in this system (a hard delete erases the row
-- the audit trail describes), but until now NOTHING could be archived from the
-- app: `archived_at` is deliberately absent from every column-level UPDATE
-- grant, so the UI had no legal way to set it.
--
-- Definer RPCs, not new grants. Two reasons:
--   1. "Employees cannot delete" is a locked decision. Archiving IS deleting
--      as far as the user is concerned, so it takes the same admin gate as
--      void_invoice / void_payment, and the gate lives in one place.
--   2. A column grant is permanent and blunt: granting `archived_at` would let
--      any employee archive anything their RLS policy already lets them
--      update. A definer function is a door with a specific lock.
--
-- The exception is archive_case: an invoice that fails to issue must be able
-- to clean up the case it opened a moment earlier, and the person issuing an
-- invoice is usually NOT an admin. So archive_case admits the case's own
-- assignee too — for a case with no invoices, which is exactly the phantom
-- left by a failed issue. Anything with money attached stays admin-only.
-- ============================================================================

-- ── archive_customer ────────────────────────────────────────────────────────
create or replace function public.archive_customer(p_customer_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_open_cases integer; v_outstanding_paise bigint;
begin
  if not (select public.is_admin()) then
    raise exception 'archiving a customer is admin-only' using errcode = '42501';
  end if;

  if not exists (select 1 from public.customers where id = p_customer_id) then
    raise exception 'customer % not found', p_customer_id using errcode = 'P0002';
  end if;

  -- Refuse while money is outstanding. Archiving hides the customer from every
  -- list, including the chase lists — so archiving a debtor is how a debt gets
  -- quietly forgotten. Make it impossible rather than merely inadvisable.
  select coalesce(sum(iv.outstanding_paise), 0) into v_outstanding_paise
  from public.invoices_v iv
  where iv.customer_id = p_customer_id and iv.lifecycle = 'issued';

  if v_outstanding_paise > 0 then
    raise exception
      'customer has % paise outstanding — settle or void the invoices first',
      v_outstanding_paise using errcode = '23514';
  end if;

  select count(*) into v_open_cases
  from public.cases
  where customer_id = p_customer_id and archived_at is null and status = 'open';

  if v_open_cases > 0 then
    raise exception 'customer has % open case(s) — close or archive them first',
      v_open_cases using errcode = '23514';
  end if;

  update public.customers
     set archived_at = now(), archived_by = (select auth.uid())
   where id = p_customer_id and archived_at is null;
end $$;

revoke all on function public.archive_customer(uuid) from public, anon;

grant execute on function public.archive_customer(uuid) to authenticated;

-- ── archive_case ────────────────────────────────────────────────────────────
create or replace function public.archive_case(p_case_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_case public.cases%rowtype; v_invoices integer;
begin
  select * into v_case from public.cases where id = p_case_id;
  if not found then
    raise exception 'case % not found', p_case_id using errcode = 'P0002';
  end if;

  select count(*) into v_invoices
  from public.invoices where case_id = p_case_id and lifecycle = 'issued';

  -- A case with issued invoices against it is part of the money trail: admin
  -- only. A case with none is either a mistake or the phantom left by an
  -- invoice that failed to issue, so its own assignee can clear it up.
  if v_invoices > 0 then
    if not (select public.is_admin()) then
      raise exception
        'this case has % issued invoice(s) — archiving it is admin-only', v_invoices
        using errcode = '42501';
    end if;
  elsif not (
    (select public.is_admin())
    or (v_case.assigned_user_id = (select auth.uid())
        and (select public.is_active_user()))
  ) then
    raise exception 'not authorised to archive this case' using errcode = '42501';
  end if;

  update public.cases
     set archived_at = now()
   where id = p_case_id and archived_at is null;
end $$;

revoke all on function public.archive_case(uuid) from public, anon;

grant execute on function public.archive_case(uuid) to authenticated;

-- ── archive_supplier ────────────────────────────────────────────────────────
-- suppliers.archived_at IS writable by admins through the existing
-- suppliers_admin_write policy, so this exists only to refuse the unsafe case:
-- archiving a supplier that live cases still point at.
create or replace function public.archive_supplier(p_supplier_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_cases integer;
begin
  if not (select public.is_admin()) then
    raise exception 'archiving a supplier is admin-only' using errcode = '42501';
  end if;

  select count(*) into v_cases
  from public.cases
  where supplier_id = p_supplier_id and archived_at is null and status = 'open';

  if v_cases > 0 then
    raise exception 'supplier is on % open case(s) — reassign them first', v_cases
      using errcode = '23514';
  end if;

  update public.suppliers
     set archived_at = now()
   where id = p_supplier_id and archived_at is null;
end $$;

revoke all on function public.archive_supplier(uuid) from public, anon;

grant execute on function public.archive_supplier(uuid) to authenticated;
