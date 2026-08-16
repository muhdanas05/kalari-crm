import "server-only";
import { formatPaiseBare } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { paymentMethodLabel } from "@/lib/invoices/display";

/**
 * Payment receipt PDF — the CRM's replacement for the paper receipt book.
 * Same header/footer style as invoice.ts; see that file's note on why money
 * renders as "Rs." (core Helvetica has no ₹ glyph).
 */

export type ReceiptForPdf = {
  number: string;
  paidOn: string;
  amountPaise: number;
  method: string;
  reference: string | null;
  customerName: string;
  invoiceNumber: string;
  balanceAfterPaise: number;
};

const COMPANY = {
  name: "Kalari Tours and Travels",
  addressLines: [
    "Pookode, Nasim complex, Kuthuparamba Road",
    "Kannur - 670643, Kerala, India",
  ],
  contact: "+91 95673 24364  ·  0490 208 3303",
};

const NAVY = "#0f365d";
const GOLD = "#c7890a";
const INK = "#1a1a1a";
const MID = "#6b6b80";

export async function renderReceiptPdf(r: ReceiptForPdf): Promise<Buffer> {
  const { jsPDF } = await import("jspdf");

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const M = 48;

  // ── Header ────────────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold").setFontSize(18).setTextColor(NAVY);
  doc.text("KALARI TOURS AND TRAVELS", M, 60);
  doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(GOLD);
  doc.text("YOUR JOURNEY, HANDLED RIGHT", M, 73);

  doc.setFontSize(8).setTextColor(MID);
  COMPANY.addressLines.forEach((l, i) => doc.text(l, M, 90 + i * 11));
  doc.text(COMPANY.contact, M, 90 + COMPANY.addressLines.length * 11);

  doc.setFont("helvetica", "bold").setFontSize(22).setTextColor(INK);
  doc.text("RECEIPT", W - M, 60, { align: "right" });
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(MID);
  doc.text(`No.  ${r.number}`, W - M, 78, { align: "right" });
  doc.text(`Date  ${formatDate(r.paidOn)}`, W - M, 91, { align: "right" });

  // ── Received from ────────────────────────────────────────────────────────
  let y = 150;
  doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(GOLD);
  doc.text("RECEIVED FROM", M, y);
  y += 14;
  doc.setFont("helvetica", "bold").setFontSize(13).setTextColor(INK);
  doc.text(r.customerName, M, y);

  // ── Amount, prominent ────────────────────────────────────────────────────
  y += 50;
  doc.setFont("helvetica", "bold").setFontSize(28).setTextColor(NAVY);
  doc.text(`Rs. ${formatPaiseBare(r.amountPaise)}`, M, y);

  // ── Details table ────────────────────────────────────────────────────────
  y += 40;
  const row = (label: string, value: string) => {
    doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(MID);
    doc.text(label, M, y);
    doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(INK);
    doc.text(value, M + 140, y);
    y += 22;
  };
  doc.setDrawColor("#e5e3dc").setLineWidth(0.5);
  doc.line(M, y - 14, W - M, y - 14);
  y += 6;
  row("Against invoice", r.invoiceNumber);
  row("Payment method", paymentMethodLabel(r.method));
  if (r.reference) row("Reference", r.reference);
  row("Balance after this payment", `Rs. ${formatPaiseBare(r.balanceAfterPaise)}`);

  // ── Footer ───────────────────────────────────────────────────────────────
  const fy = doc.internal.pageSize.getHeight() - 40;
  doc.setDrawColor("#e5e3dc").setLineWidth(0.5);
  doc.line(M, fy - 12, W - M, fy - 12);
  doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(MID);
  doc.text(
    "This is a computer-generated receipt. Thank you for your business.",
    W / 2,
    fy,
    { align: "center" },
  );

  return Buffer.from(doc.output("arraybuffer"));
}
