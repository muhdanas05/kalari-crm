"use server";

import { revalidatePath } from "next/cache";
import { revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/session";

export type ArchiveKind = "customer" | "case" | "supplier";
export type ArchiveResult = { ok: true } | { ok: false; error: string };

/**
 * Soft-delete for the three entities a user can retire from the UI.
 *
 * All three go through definer RPCs (0029) rather than a direct update:
 * `archived_at` is deliberately absent from every column-level grant, so this
 * is the only legal path. The RPCs carry the real rules — admin-only for
 * customers and suppliers, plus refusals for a customer who still owes money,
 * a supplier on open cases, and a case with issued invoices archived by
 * someone who is not an admin.
 *
 * requireProfile, not requireAdmin: archive_case admits a case's own assignee
 * when there is no money attached, and the RPC is the one enforcing that.
 */
export async function archiveEntity(
  kind: ArchiveKind,
  id: string,
): Promise<ArchiveResult> {
  await requireProfile();
  const supabase = await createClient();

  const { error } =
    kind === "customer"
      ? await supabase.rpc("archive_customer", { p_customer_id: id })
      : kind === "case"
        ? await supabase.rpc("archive_case", { p_case_id: id })
        : await supabase.rpc("archive_supplier", { p_supplier_id: id });

  if (error) return { ok: false, error: error.message };

  if (kind === "customer") {
    revalidatePath("/customers");
    revalidatePath("/calls");
  } else if (kind === "case") {
    revalidatePath("/pipeline");
    revalidatePath("/dashboard");
  } else {
    revalidateTag("suppliers");
    revalidatePath("/suppliers");
  }

  return { ok: true };
}
