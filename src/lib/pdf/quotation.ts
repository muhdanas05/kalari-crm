import "server-only";
import { formatPaiseBare } from "@/lib/money";
import { formatDate } from "@/lib/dates";

/**
 * Quotation PDF — same house style as invoice.ts (header/footer/table), but
 * generated on demand rather than stored: a quotation is not an append-only
 * financial document, so there's no "the number was already reported, don't
 * touch the artifact" reason to persist one. Re-render every request; it's
 * always in sync with whatever the quotation currently says.
 */

export type QuotationLineForPdf = {
  label: string;
  qty: number;
  rate_paise: number;
};

export type QuotationForPdf = {
  number: string;
  createdOn: string;
  validUntil: string | null;
  serviceName: string;
  subtotalPaise: number;
  gstPaise: number;
  totalPaise: number;
  amountNote: string | null;
  customer: { name: string; phone: string; email: string | null };
  lines: QuotationLineForPdf[];
};

const COMPANY = {
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

export async function renderQuotationPdf(q: QuotationForPdf): Promise<Buffer> {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const M = 48;

  doc.setFont("helvetica", "bold").setFontSize(18).setTextColor(NAVY);
  doc.text("KALARI TOURS AND TRAVELS", M, 60);
  doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(GOLD);
  doc.text("YOUR JOURNEY, HANDLED RIGHT", M, 73);

  doc.setFontSize(8).setTextColor(MID);
  COMPANY.addressLines.forEach((l, i) => doc.text(l, M, 90 + i * 11));
  doc.text(COMPANY.contact, M, 90 + COMPANY.addressLines.length * 11);

  doc.setFont("helvetica", "bold").setFontSize(22).setTextColor(INK);
  doc.text("QUOTATION", W - M, 60, { align: "right" });
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(MID);
  doc.text(`No.  ${q.number}`, W - M, 78, { align: "right" });
  doc.text(`Date  ${formatDate(q.createdOn)}`, W - M, 91, { align: "right" });
  if (q.validUntil) {
    doc.text(`Valid until  ${formatDate(q.validUntil)}`, W - M, 104, { align: "right" });
  }

  let y = 150;
  doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(GOLD);
  doc.text("QUOTED TO", M, y);
  y += 14;
  doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(INK);
  doc.text(q.customer.name, M, y);
  y += 13;
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(MID);
  doc.text(q.customer.phone, M, y);
  if (q.customer.email) {
    y += 12;
    doc.text(q.customer.email, M, y);
  }
  doc.text(q.serviceName, W - M, 150, { align: "right" });

  autoTable(doc, {
    startY: y + 24,
    head: [["No", "Description", "Qty", "Rate", "Amount"]],
    body: q.lines.map((l, i) => [
      String(i + 1),
      l.label,
      String(l.qty),
      formatPaiseBare(l.rate_paise),
      formatPaiseBare(l.qty * l.rate_paise),
    ]),
    theme: "plain",
    headStyles: { fillColor: NAVY, textColor: "#ffffff", fontStyle: "bold", fontSize: 8, halign: "left" },
    bodyStyles: { fontSize: 9, textColor: INK, cellPadding: 6 },
    alternateRowStyles: { fillColor: "#f7f6f2" },
    columnStyles: {
      0: { cellWidth: 30, halign: "right" },
      1: { cellWidth: "auto" },
      2: { cellWidth: 50, halign: "right" },
      3: { cellWidth: 80, halign: "right" },
      4: { cellWidth: 90, halign: "right", fontStyle: "bold" },
    },
    margin: { left: M, right: M },
  });

  // @ts-expect-error — autotable augments doc at runtime with lastAutoTable
  let ty = (doc.lastAutoTable?.finalY ?? y + 200) + 18;
  const labelX = W - M - 150;
  const valueX = W - M;

  const totalRow = (label: string, value: string, bold = false, big = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(big ? 12 : 9);
    doc.setTextColor(bold ? INK : MID);
    doc.text(label, labelX, ty);
    doc.setTextColor(INK);
    doc.text(`Rs. ${value}`, valueX, ty, { align: "right" });
    ty += big ? 22 : 16;
  };

  totalRow("Subtotal", formatPaiseBare(q.subtotalPaise));
  if (q.gstPaise > 0) totalRow("GST", formatPaiseBare(q.gstPaise));

  doc.setDrawColor(GOLD).setLineWidth(1);
  doc.line(labelX, ty - 4, valueX, ty - 4);
  ty += 14;
  totalRow("Total", formatPaiseBare(q.totalPaise), true, true);

  if (q.amountNote) {
    doc.setFont("helvetica", "italic").setFontSize(8.5).setTextColor(MID);
    doc.text(q.amountNote.replace(/₹/g, "Rs. "), M, ty + 10, { maxWidth: W - 2 * M });
  }

  const fy = doc.internal.pageSize.getHeight() - 40;
  doc.setDrawColor("#e5e3dc").setLineWidth(0.5);
  doc.line(M, fy - 12, W - M, fy - 12);
  doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(MID);
  doc.text(
    "This is a quotation, not a tax invoice. Prices may change if not accepted before the valid-until date.",
    W / 2,
    fy,
    { align: "center" },
  );

  return Buffer.from(doc.output("arraybuffer"));
}
