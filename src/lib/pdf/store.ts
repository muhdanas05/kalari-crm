import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderInvoicePdf, type InvoiceForPdf } from "./invoice";

/**
 * Render an issued invoice to PDF, store it, and record the path.
 *
 * Runs AFTER issue_invoice() has committed the immutable row. If PDF generation
 * fails, the invoice still exists and is correct — the PDF is regenerable from
 * the row, so a Storage hiccup must never roll back an issue or burn a number.
 * The caller treats a failure here as non-fatal.
 *
 * Uses the admin client for Storage: there is a signed-in user issuing the
 * invoice, but the `invoices` bucket is private with no RLS policies, so writes
 * go through service-role. The file path is namespaced by invoice id.
 */
export async function generateAndAttachInvoicePdf(
  invoiceId: string,
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const supabase = createAdminClient();

  const { data: inv } = await supabase
    .from("invoices_v")
    .select("*")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!inv) return { ok: false, error: "invoice not found" };

  const [{ data: lines }, { data: customer }] = await Promise.all([
    supabase
      .from("invoice_lines")
      .select("line_no, label, qty, rate_paise, gst_paise, amount_paise")
      .eq("invoice_id", invoiceId)
      .order("line_no"),
    inv.customer_id
      ? supabase
          .from("customers")
          .select("name, phone, email, sponsor_company")
          .eq("id", inv.customer_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const payload: InvoiceForPdf = {
    number: inv.number ?? "—",
    issue_date: inv.issue_date ?? "",
    due_date: inv.due_date ?? "",
    service_name: inv.service_name ?? "",
    subtotal_paise: inv.subtotal_paise ?? 0,
    gst_paise: inv.gst_paise ?? 0,
    total_paise: inv.total_paise ?? 0,
    amount_note: inv.amount_note,
    customer: {
      name: customer?.name ?? "—",
      phone: customer?.phone ?? "",
      email: customer?.email ?? null,
      sponsor_company: customer?.sponsor_company ?? null,
    },
    lines: lines ?? [],
  };

  let pdf: Buffer;
  try {
    pdf = await renderInvoicePdf(payload);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "render failed" };
  }

  // Path carries the number, so a downloaded file is self-describing.
  const path = `${invoiceId}/${inv.number}.pdf`;

  const { error: upErr } = await supabase.storage
    .from("invoices")
    .upload(path, pdf, { contentType: "application/pdf", upsert: true });
  if (upErr) return { ok: false, error: `upload: ${upErr.message}` };

  // Record it on the immutable row via the RPC that exists for exactly this.
  const { error: attErr } = await supabase.rpc("attach_invoice_pdf", {
    p_invoice_id: invoiceId,
    p_path: path,
  });
  if (attErr) return { ok: false, error: `attach: ${attErr.message}` };

  return { ok: true, path };
}

/** A short-lived signed URL to download the stored PDF. */
export async function signedInvoicePdfUrl(
  path: string,
  seconds = 300,
): Promise<string | null> {
  const supabase = createAdminClient();
  const { data } = await supabase.storage
    .from("invoices")
    .createSignedUrl(path, seconds);
  return data?.signedUrl ?? null;
}
