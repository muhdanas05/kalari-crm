"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/session";
import type { Database } from "@/lib/supabase/database.types";

type PaymentMethod = Database["public"]["Enums"]["payment_method"];

export type PaymentResult =
  | { ok: true; outstandingFils: number }
  | { ok: false; error: string };

/**
 * Record a payment against an invoice.
 *
 * All the hard parts live in record_payment(): it re-checks authorisation
 * (SECURITY DEFINER bypassed RLS, so the RPC cannot skip it), refuses an
 * overpayment under concurrency (§3.12 — two simultaneous partial payments must
 * not both pass), and takes an idempotency key so a double-click or a retry on a
 * flaky phone connection doesn't book the money twice.
 *
 * We pass the key; we do not invent our own guard.
 */
export async function recordPayment(
  invoiceId: string,
  input: {
    amountFils: number;
    method: PaymentMethod;
    paidOn?: string;
    reference?: string;
    idempotencyKey: string;
  },
): Promise<PaymentResult> {
  await requireProfile();

  if (!Number.isSafeInteger(input.amountFils) || input.amountFils <= 0) {
    return { ok: false, error: "Enter an amount greater than zero." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_payment", {
    p_invoice_id: invoiceId,
    p_amount_paise: input.amountFils,
    p_method: input.method,
    p_paid_on: input.paidOn ?? undefined,
    p_reference: input.reference || undefined,
    p_idempotency_key: input.idempotencyKey,
  });

  if (error) {
    // The RPC raises with a readable message (overpayment, voided invoice,
    // not authorised). Surface it rather than inventing our own wording — it
    // knows exactly which rule was broken.
    return { ok: false, error: error.message };
  }

  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  revalidatePath("/payments");
  revalidatePath("/dashboard");

  const row = Array.isArray(data) ? data[0] : data;
  return { ok: true, outstandingFils: row?.outstanding_paise ?? 0 };
}
