"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/session";

export type VoidResult = { ok: true } | { ok: false; error: string };

/**
 * Void an invoice. The RPC does the real gatekeeping — admin-only, reason
 * required, and it REFUSES an invoice with payments against it (that path is a
 * credit note, because a payment must never point at a document that no longer
 * stands). requireAdmin here is the UI-side echo of the same rule, so an
 * employee gets a clean message instead of a 42501.
 *
 * Nothing is deleted: `lifecycle` flips to 'void' and the number is kept
 * forever, because a gap in the sequence is indistinguishable from a missing
 * invoice when the accountant looks.
 */
export async function voidInvoice(
  invoiceId: string,
  reason: string,
): Promise<VoidResult> {
  await requireAdmin();

  if (reason.trim().length < 3) {
    return { ok: false, error: "Say why this invoice is being voided." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("void_invoice", {
    p_invoice_id: invoiceId,
    p_reason: reason.trim(),
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  revalidatePath("/dashboard");
  revalidatePath("/accounts");
  return { ok: true };
}

/**
 * Void a payment — the money did not arrive, or arrived against the wrong
 * invoice. Also admin-only by RPC.
 *
 * The receipt route already refuses to render for a voided payment, so the
 * paper trail stops the moment this succeeds.
 */
export async function voidPayment(
  paymentId: string,
  invoiceId: string,
  reason: string,
): Promise<VoidResult> {
  await requireAdmin();

  if (reason.trim().length < 3) {
    return { ok: false, error: "Say why this payment is being voided." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("void_payment", {
    p_payment_id: paymentId,
    p_reason: reason.trim(),
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/payments");
  revalidatePath("/dashboard");
  revalidatePath("/accounts");
  return { ok: true };
}
