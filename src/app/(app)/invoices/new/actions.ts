"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/session";
import { formatPaise } from "@/lib/money";

export type DraftLineInput = {
  label: string;
  qty: number;
  rate_paise: number;
  catalogue_rate_paise: number | null;
  gst_bp: number;
};

export type IssueResult =
  | { ok: true; invoiceId: string; number: string }
  | { ok: false; error: string };

/**
 * Create a draft, then issue it.
 *
 * The two-step exists because the ledger is split: `invoice_drafts` is mutable
 * scratch with no invariants; `invoices` is immutable from birth (§3.8). Issuing
 * is the moment scratch becomes a document.
 *
 * `expectedTotalFils` is computed by the client from the same engine the tests
 * pin. issue_invoice recomputes from the draft's lines and REFUSES on any
 * mismatch (§3.6) — so a client bug surfaces as a loud error here, not as a
 * wrong number on a PDF the customer already has.
 */
export async function createAndIssueInvoice(input: {
  customerId: string;
  caseId: string | null;
  serviceId: string;
  paxAdults: number;
  paxChildren: number;
  lines: DraftLineInput[];
  amountNote: string | null;
  expectedTotalFils: number;
  idempotencyKey: string;
}): Promise<IssueResult> {
  const profile = await requireProfile();
  const supabase = await createClient();

  if (input.lines.length === 0) {
    return { ok: false, error: "An invoice needs at least one line." };
  }

  const { data: draft, error: draftError } = await supabase
    .from("invoice_drafts")
    .insert({
      customer_id: input.customerId,
      case_id: input.caseId,
      service_id: input.serviceId,
      pax_adults: input.paxAdults,
      pax_children: input.paxChildren,
      lines: input.lines,
      // The migration records the inherited default (pending Kalari): no amount-in-words
      // generation — a free-text note DEFAULTING TO THE FORMATTED TOTAL. That
      // decision overrides the PRD's amount-in-words requirement, and it also
      // dissolves the unanswerable "is .12 'one two' or 'twelve'?" question.
      amount_note: input.amountNote ?? formatPaise(input.expectedTotalFils),
      // created_by has no default: the actor is a fact to record, not to infer
      // (§3.24). requireProfile() already proved who this is.
      created_by: profile.id,
    })
    .select("id")
    .single();

  if (draftError || !draft) {
    return { ok: false, error: draftError?.message ?? "Could not create the draft." };
  }

  const { data, error } = await supabase.rpc("issue_invoice", {
    p_draft_id: draft.id,
    p_expected_total_paise: input.expectedTotalFils,
    p_idempotency_key: input.idempotencyKey,
  });

  if (error) {
    // The RPC's messages are specific — a total mismatch names both figures, a
    // future issue_date says so. Pass them through; they're better than ours.
    return { ok: false, error: error.message };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.invoice_id) {
    return { ok: false, error: "The invoice was not issued." };
  }

  // Render + store the PDF now that the immutable row exists. Non-fatal: the
  // invoice is issued and correct regardless, and the PDF is regenerable from
  // the row — a Storage hiccup must never undo an issue or burn a number.
  const { generateAndAttachInvoicePdf } = await import("@/lib/pdf/store");
  const pdf = await generateAndAttachInvoicePdf(row.invoice_id);
  if (!pdf.ok) {
    console.error(`[invoice ${row.number}] PDF generation failed:`, pdf.error);
  }

  revalidatePath("/invoices");
  revalidatePath("/dashboard");
  revalidatePath(`/customers/${input.customerId}`);

  return { ok: true, invoiceId: row.invoice_id, number: row.number };
}
