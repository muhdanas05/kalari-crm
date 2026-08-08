"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/session";
import type { PaymentMethod } from "@/lib/db/accounts";

export type ExpenseInput = {
  id?: string;
  spentOn: string;
  category: string;
  amountPaise: number;
  method: PaymentMethod;
  supplierId?: string;
  description?: string;
  notes?: string;
};

export type SaveExpenseResult = { ok: true; id: string } | { ok: false; error: string };

/**
 * Gated on the 'accounts' permission in the UI and in RLS
 * (expenses_admin_write) — this is defence in depth, the database refuses
 * regardless.
 */
export async function saveExpense(input: ExpenseInput): Promise<SaveExpenseResult> {
  const profile = await requirePermission("accounts");

  if (!input.category.trim()) return { ok: false, error: "Category is required." };
  if (!Number.isSafeInteger(input.amountPaise) || input.amountPaise <= 0) {
    return { ok: false, error: "Amount must be more than zero." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.spentOn)) {
    return { ok: false, error: "A valid date is required." };
  }

  const supabase = await createClient();
  const row = {
    spent_on: input.spentOn,
    category: input.category.trim(),
    description: input.description?.trim() || null,
    amount_paise: input.amountPaise,
    method: input.method,
    supplier_id: input.supplierId || null,
    notes: input.notes?.trim() || null,
  };

  const { data, error } = input.id
    ? await supabase.from("expenses").update(row).eq("id", input.id).select("id").single()
    : await supabase
        .from("expenses")
        .insert({ ...row, created_by: profile.id })
        .select("id")
        .single();

  if (error) return { ok: false, error: error.message };

  revalidatePath("/accounts");
  return { ok: true, id: data.id };
}

/** Soft-delete. `archived_at` is in the column-level UPDATE grant for expenses. */
export async function archiveExpense(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requirePermission("accounts");
  const supabase = await createClient();
  const { error } = await supabase
    .from("expenses")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/accounts");
  return { ok: true };
}
