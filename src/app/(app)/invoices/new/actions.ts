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
  /** Null for a custom invoice — free-form lines, no catalogue service. */
  serviceId: string | null;
  /** Custom invoices carry their own description in place of a service name. */
  customServiceName?: string | null;
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

  // Open the case BEFORE issuing, because an issued invoice is immutable — its
  // case_id cannot be filled in afterwards. Only for services the admin has
  // marked as pipeline-tracked: a ticket is sold and done, a visa runs for
  // weeks. If the issue then fails, the case is archived below rather than
  // left as a phantom on the board.
  let caseId = input.caseId;
  let openedCaseId: string | null = null;

  if (!caseId && input.serviceId) {
    const opened = await openCaseForService(
      supabase,
      input.serviceId,
      input.customerId,
      profile.id,
      input.paxAdults,
      input.paxChildren,
    );
    if (opened) {
      caseId = opened;
      openedCaseId = opened;
    }
  }

  const { data: draft, error: draftError } = await supabase
    .from("invoice_drafts")
    .insert({
      customer_id: input.customerId,
      case_id: caseId,
      service_id: input.serviceId,
      custom_service_name: input.serviceId ? null : (input.customServiceName ?? null),
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
    await rollbackOpenedCase(supabase, openedCaseId);
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
    await rollbackOpenedCase(supabase, openedCaseId);
    return { ok: false, error: error.message };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.invoice_id) {
    await rollbackOpenedCase(supabase, openedCaseId);
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
  if (openedCaseId) revalidatePath("/pipeline");

  return { ok: true, invoiceId: row.invoice_id, number: row.number };
}

/**
 * Open a Processing case for a pipeline-tracked service, at the first stage of
 * that service's own declared path (§3.14 — stages are per-service, not one
 * linear pipeline).
 *
 * Returns null when the service is point-of-sale (`tracks_pipeline = false`),
 * or when anything about the lookup is off. Null is not an error here: no case
 * is the correct outcome for a ticket sale, and a missing stage path must not
 * block someone from taking money.
 */
async function openCaseForService(
  supabase: Awaited<ReturnType<typeof createClient>>,
  serviceId: string,
  customerId: string,
  profileId: string,
  paxAdults: number,
  paxChildren: number,
): Promise<string | null> {
  const { data: service } = await supabase
    .from("services")
    .select("tracks_pipeline")
    .eq("id", serviceId)
    .single();

  if (!service?.tracks_pipeline) return null;

  // The first stage of THIS service's path. stage_applicability carries the
  // per-service ordering, so this is the same list the case will be moved
  // along — never a global "stage 1" that the service does not use.
  const { data: firstStage } = await supabase
    .from("stage_applicability")
    .select("stage_id, sort_order, stages!inner(pipeline_id, pipelines!inner(key))")
    .eq("service_id", serviceId)
    .eq("stages.pipelines.key", "processing")
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!firstStage?.stage_id) return null;

  const pipelineId = (
    firstStage as unknown as { stages: { pipeline_id: string } }
  ).stages?.pipeline_id;
  if (!pipelineId) return null;

  const { data: opened, error } = await supabase
    .from("cases")
    .insert({
      customer_id: customerId,
      service_id: serviceId,
      pipeline_id: pipelineId,
      stage_id: firstStage.stage_id,
      pax_adults: paxAdults,
      pax_children: paxChildren,
      created_by: profileId,
    })
    .select("id")
    .single();

  if (error || !opened) {
    console.error("[invoice] could not open case:", error?.message);
    return null;
  }
  return opened.id;
}

/**
 * Archive a case opened moments ago for an invoice that then failed to issue.
 * Soft-delete, never a hard one — the audit trail already has the insert, and
 * a deleted row makes that entry unexplainable.
 */
async function rollbackOpenedCase(
  supabase: Awaited<ReturnType<typeof createClient>>,
  caseId: string | null,
) {
  if (!caseId) return;
  // archive_case, not a direct update: `archived_at` is absent from every
  // column grant on purpose. The RPC lets the case's own assignee clear a case
  // with no issued invoices, which is exactly this one.
  const { error } = await supabase.rpc("archive_case", { p_case_id: caseId });
  if (error) {
    console.error(`[invoice] orphan case ${caseId} left open:`, error.message);
  }
}
