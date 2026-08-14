"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/session";
import type { DraftLineInput } from "../../new/actions";

export type EditResult =
  | { ok: true; number: string; totalPaise: number }
  | { ok: false; error: string };

/**
 * Edit an already-issued invoice in place.
 *
 * The RPC recomputes the totals from the lines and refuses on any mismatch
 * with what the client computed — same drift tripwire as issuing. The invoice
 * number never moves; everything else here is fair game.
 */
export async function editIssuedInvoice(
  invoiceId: string,
  input: {
    paxAdults: number;
    paxChildren: number;
    dueDate: string;
    amountNote: string | null;
    lines: DraftLineInput[];
    expectedTotalPaise: number;
    reason?: string | null;
  },
): Promise<EditResult> {
  await requirePermission("invoices");
  const supabase = await createClient();

  const { data, error } = await supabase
    .rpc("edit_issued_invoice", {
      p_invoice_id: invoiceId,
      p_pax_adults: input.paxAdults,
      p_pax_children: input.paxChildren,
      p_due_date: input.dueDate,
      // The generated types don't mark these nullable. An empty note reads the
      // same as none at every render site, so "" is the honest coercion here.
      p_amount_note: input.amountNote ?? "",
      p_lines: input.lines,
      p_expected_total_paise: input.expectedTotalPaise,
      p_reason: input.reason ?? undefined,
    })
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "The invoice could not be updated." };

  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  revalidatePath("/payments");
  revalidatePath("/accounts");
  revalidatePath("/dashboard");

  return { ok: true, number: data.number, totalPaise: data.total_paise };
}
