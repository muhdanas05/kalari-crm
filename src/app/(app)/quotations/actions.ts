"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/session";
import { formatPaise } from "@/lib/money";
import type { DraftLineInput } from "@/app/(app)/invoices/new/actions";

export type Result = { ok: true } | { ok: false; error: string };
export type CreateResult =
  | { ok: true; quotationId: string; number: string }
  | { ok: false; error: string };
export type ConvertResult =
  | { ok: true; invoiceId: string; number: string }
  | { ok: false; error: string };

export async function createQuotation(input: {
  customerId: string;
  serviceId: string | null;
  customServiceName?: string | null;
  paxAdults: number;
  paxChildren: number;
  lines: DraftLineInput[];
  amountNote: string | null;
  validUntil: string | null;
  subtotalPaise: number;
  gstPaise: number;
  totalPaise: number;
}): Promise<CreateResult> {
  await requireProfile();

  if (input.lines.length === 0) {
    return { ok: false, error: "A quotation needs at least one line." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_quotation", {
    p_customer_id: input.customerId,
    p_service_id: input.serviceId ?? undefined,
    p_custom_service_name: (input.serviceId ? null : input.customServiceName) ?? undefined,
    p_pax_adults: input.paxAdults,
    p_pax_children: input.paxChildren,
    p_lines: input.lines,
    p_subtotal_paise: input.subtotalPaise,
    p_gst_paise: input.gstPaise,
    p_total_paise: input.totalPaise,
    p_amount_note: input.amountNote ?? formatPaise(input.totalPaise),
    p_valid_until: input.validUntil ?? undefined,
  });

  if (error) return { ok: false, error: error.message };
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.quotation_id) return { ok: false, error: "The quotation was not created." };

  revalidatePath("/quotations");
  return { ok: true, quotationId: row.quotation_id, number: row.number };
}

/** Draft/sent only — status transitions guard the rest client-side + via RLS. */
export async function updateQuotation(
  id: string,
  input: {
    serviceId: string | null;
    customServiceName?: string | null;
    paxAdults: number;
    paxChildren: number;
    lines: DraftLineInput[];
    amountNote: string | null;
    validUntil: string | null;
    subtotalPaise: number;
    gstPaise: number;
    totalPaise: number;
  },
): Promise<Result> {
  await requireProfile();
  const supabase = await createClient();

  const { error } = await supabase
    .from("quotations")
    .update({
      service_id: input.serviceId,
      custom_service_name: input.serviceId ? null : (input.customServiceName ?? null),
      pax_adults: input.paxAdults,
      pax_children: input.paxChildren,
      lines: input.lines,
      amount_note: input.amountNote,
      valid_until: input.validUntil,
      subtotal_paise: input.subtotalPaise,
      gst_paise: input.gstPaise,
      total_paise: input.totalPaise,
    })
    .eq("id", id)
    .in("status", ["draft", "sent"]);

  if (error) return { ok: false, error: error.message };
  revalidatePath(`/quotations/${id}`);
  revalidatePath("/quotations");
  return { ok: true };
}

const NEXT_STATUS: Record<string, string[]> = {
  draft: ["sent", "declined"],
  sent: ["accepted", "declined", "expired"],
  accepted: [],
  declined: [],
  expired: [],
  converted: [],
};

export async function setQuotationStatus(
  id: string,
  from: string,
  to: "sent" | "accepted" | "declined" | "expired",
): Promise<Result> {
  await requireProfile();
  if (!NEXT_STATUS[from]?.includes(to)) {
    return { ok: false, error: `Can't move a ${from} quotation to ${to}.` };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("quotations")
    .update({ status: to })
    .eq("id", id)
    .eq("status", from);

  if (error) return { ok: false, error: error.message };
  revalidatePath(`/quotations/${id}`);
  revalidatePath("/quotations");
  return { ok: true };
}

export async function archiveQuotation(id: string): Promise<Result> {
  await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase
    .from("quotations")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/quotations");
  return { ok: true };
}

/**
 * Turn an accepted quotation into a real, immutable invoice — the one
 * moment this feature touches the actual ledger. expectedTotalFils is
 * recomputed client-side from the SAME lines issue_invoice() will see, same
 * defence-in-depth as createAndIssueInvoice().
 */
export async function convertQuotation(
  quotationId: string,
  expectedTotalFils: number,
): Promise<ConvertResult> {
  await requireProfile();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("convert_quotation_to_invoice", {
    p_quotation_id: quotationId,
    p_expected_total_paise: expectedTotalFils,
    p_idempotency_key: `quotation:${quotationId}`,
  });

  if (error) return { ok: false, error: error.message };
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.invoice_id) return { ok: false, error: "The invoice was not created." };

  // Render + store the PDF, same as a normal issue — non-fatal if it fails.
  const { generateAndAttachInvoicePdf } = await import("@/lib/pdf/store");
  const pdf = await generateAndAttachInvoicePdf(row.invoice_id);
  if (!pdf.ok) {
    console.error(`[quotation ${quotationId}] PDF generation failed:`, pdf.error);
  }

  revalidatePath(`/quotations/${quotationId}`);
  revalidatePath("/quotations");
  revalidatePath("/invoices");
  revalidatePath("/pipeline");
  revalidatePath("/dashboard");
  return { ok: true, invoiceId: row.invoice_id, number: row.number };
}
