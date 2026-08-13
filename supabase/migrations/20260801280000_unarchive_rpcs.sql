-- ============================================================================
-- Archive was a black hole. This is the way back.
--
-- 0029 added archive_customer / archive_case / archive_supplier, and the app
-- grew archive buttons for quotations, services, line-item rules and expenses
-- too. Nothing could ever be un-archived: a repo-wide search for "unarchive",
-- "restore", or any write of `archived_at = null` returned ZERO hits, and every
-- list filters `.is("archived_at", null)`, so an archived row simply ceased to
-- exist -- gone from lists, search, the call queue and every customer picker.
--
-- The catalogue's own Archive dialog already admitted the gap in its copy:
--   "Nothing is deleted, so this can be undone IN THE DATABASE if it was a
--    mistake."
-- Telling a travel agent in Kannur to open a SQL console is not an undo. That
-- sentence is the spec for this migration.
--
-- Soft-delete is still the rule -- nothing here hard-deletes. These only clear
-- archived_at/archived_by, which is precisely what makes soft-delete worth
-- having in the first place.
--
-- Same gate as the archive side (admin-only), same definer-not-grant shape,
-- for the same reason 0029 gives: `archived_at` stays out of every column
-- grant so the only doors are these, each with a specific lock.
-- ============================================================================

-- ── unarchive_customer ──────────────────────────────────────────────────────
create or replace function public.unarchive_customer(p_customer_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not (select public.is_admin()) then
    raise exception 'restoring a customer is admin-only' using errcode = '42501';
  end if;

  update public.customers
     set archived_at = null, archived_by = null
   where id = p_customer_id and archived_at is not null;

  if not found then
    raise exception 'customer % not found, or is not archived', p_customer_id
      using errcode = 'P0002';
  end if;
end $$;

revoke all on function public.unarchive_customer(uuid) from public, anon;

grant execute on function public.unarchive_customer(uuid) to authenticated;

-- ── unarchive_case ──────────────────────────────────────────────────────────
-- Mirrors archive_case's split gate: a case with no issued invoices can be
-- restored by its own assignee (it is usually the phantom left by a failed
-- issue), anything with money attached is admin-only.
create or replace function public.unarchive_case(p_case_id uuid)
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

  if v_invoices > 0 then
    if not (select public.is_admin()) then
      raise exception
        'this case has % issued invoice(s) -- restoring it is admin-only', v_invoices
        using errcode = '42501';
    end if;
  elsif not (
    (select public.is_admin())
    or (v_case.assigned_user_id = (select auth.uid())
        and (select public.is_active_user()))
  ) then
    raise exception 'not authorised to restore this case' using errcode = '42501';
  end if;

  -- Refuse if the customer is still archived: restoring a case whose customer
  -- is invisible produces a board row that leads nowhere.
  if exists (
    select 1 from public.customers c
    where c.id = v_case.customer_id and c.archived_at is not null
  ) then
    raise exception 'restore the customer first -- this case belongs to an archived one'
      using errcode = '23514';
  end if;

  update public.cases set archived_at = null where id = p_case_id;
end $$;

revoke all on function public.unarchive_case(uuid) from public, anon;

grant execute on function public.unarchive_case(uuid) to authenticated;

-- ── unarchive_supplier ──────────────────────────────────────────────────────
create or replace function public.unarchive_supplier(p_supplier_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not (select public.is_admin()) then
    raise exception 'restoring a supplier is admin-only' using errcode = '42501';
  end if;

  update public.suppliers
     set archived_at = null
   where id = p_supplier_id and archived_at is not null;

  if not found then
    raise exception 'supplier % not found, or is not archived', p_supplier_id
      using errcode = 'P0002';
  end if;
end $$;

revoke all on function public.unarchive_supplier(uuid) from public, anon;

grant execute on function public.unarchive_supplier(uuid) to authenticated;
