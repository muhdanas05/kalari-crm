import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/session";
import { generateAndAttachInvoicePdf, signedInvoicePdfUrl } from "@/lib/pdf/store";

export const dynamic = "force-dynamic";

/**
 * Download an issued invoice's PDF.
 *
 * Authorisation runs as the signed-in user: the RLS SELECT on invoices_v decides
 * whether they may see this invoice at all. Only then do we reach for the stored
 * file (admin client, because the bucket is private) — so an employee cannot pull
 * a PDF for a customer who isn't theirs by guessing the id.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireProfile();
  const { id } = await params;

  const supabase = await createClient();
  // RLS-scoped read: if they can't see the row, they get nothing.
  const { data: inv } = await supabase
    .from("invoices_v")
    .select("id, pdf_path")
    .eq("id", id)
    .maybeSingle();

  if (!inv) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Regenerate on demand if it was never stored (e.g. issued before PDFs, or a
  // Storage hiccup at issue time). The row is the source of truth; the file is
  // derived, so making it lazily is safe.
  let path = inv.pdf_path;
  if (!path) {
    const gen = await generateAndAttachInvoicePdf(id);
    if (!gen.ok) {
      console.error(`[invoice pdf] ${id}: ${gen.error}`);
      return NextResponse.json({ error: "could not generate PDF" }, { status: 500 });
    }
    path = gen.path;
  }

  const url = await signedInvoicePdfUrl(path, 120);
  if (!url) {
    return NextResponse.json({ error: "could not sign URL" }, { status: 500 });
  }

  // Redirect to a short-lived signed URL rather than proxying the bytes — lets
  // Storage serve the file and keeps this function fast.
  return NextResponse.redirect(url);
}
