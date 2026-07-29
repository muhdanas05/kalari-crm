import { NextResponse, type NextRequest } from "next/server";
import { requireProfile } from "@/lib/auth/session";
import { getPaymentForReceipt } from "@/lib/db/invoices";
import { renderReceiptPdf } from "@/lib/pdf/receipt";

export const dynamic = "force-dynamic";

/**
 * A payment's receipt PDF, rendered on demand. Unlike the invoice PDF, this
 * isn't stored in Storage — a receipt is a printout handed over a counter or
 * WhatsApp'd once, and the payments row (with its gap-free receipt number) is
 * the permanent record, not the file.
 *
 * Authorisation runs as the signed-in user: RLS on `payments` decides whether
 * they may see this row at all (getPaymentForReceipt is a plain server-scoped
 * query, so an inaccessible payment simply returns nothing here).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireProfile();
  const { id } = await params;

  const detail = await getPaymentForReceipt(id);
  if (!detail) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const { payment, invoice, customerName, balanceAfter } = detail;

  // A voided payment never happened, as far as the customer's paper trail is
  // concerned — issuing a receipt for it would hand out proof of a payment
  // that's been reversed.
  if (payment.voided_at || !payment.number) {
    return NextResponse.json({ error: "no receipt for this payment" }, { status: 404 });
  }

  const buffer = await renderReceiptPdf({
    number: payment.number,
    paidOn: payment.paid_on,
    amountPaise: payment.amount_paise,
    method: payment.method,
    reference: payment.reference,
    customerName,
    invoiceNumber: invoice.number ?? "—",
    balanceAfterPaise: balanceAfter,
  });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${payment.number}.pdf"`,
    },
  });
}
