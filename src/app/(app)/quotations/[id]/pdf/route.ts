import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/session";
import { renderQuotationPdf } from "@/lib/pdf/quotation";
import type { DraftLine } from "@/lib/pricing/engine";

export const dynamic = "force-dynamic";

/** Rendered fresh every request — see lib/pdf/quotation.ts for why. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await requirePermission("quotations");
  const { id } = await params;

  const supabase = await createClient();
  const { data: quotation } = await supabase
    .from("quotations")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!quotation) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const [{ data: customer }, { data: service }] = await Promise.all([
    quotation.customer_id
      ? supabase.from("customers").select("name, phone, email").eq("id", quotation.customer_id).maybeSingle()
      : Promise.resolve({ data: null }),
    quotation.service_id
      ? supabase.from("services").select("name").eq("id", quotation.service_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const lines = (quotation.lines as unknown as DraftLine[]) ?? [];

  const pdf = await renderQuotationPdf({
    number: quotation.number ?? "—",
    createdOn: quotation.created_at,
    validUntil: quotation.valid_until,
    serviceName: service?.name ?? quotation.custom_service_name ?? "",
    subtotalPaise: quotation.subtotal_paise,
    gstPaise: quotation.gst_paise,
    totalPaise: quotation.total_paise,
    amountNote: quotation.amount_note,
    customer: {
      name: customer?.name ?? "—",
      phone: customer?.phone ?? "",
      email: customer?.email ?? null,
    },
    lines: lines.map((l) => ({ label: l.label, qty: l.qty, rate_paise: l.rate_paise })),
  });

  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${quotation.number ?? "quotation"}.pdf"`,
    },
  });
}
