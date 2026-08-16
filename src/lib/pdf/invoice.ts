import "server-only";
import { formatPaiseBare } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { BANK_LINES } from "./bank";

/**
 * Invoice PDF — generated in Node, at issue time.
 *
 * ARCHITECTURE.md §5.4: header, then No / Description / Qty / Rate / GST /
 * Net Amount, Total, Grand Total.
 *
 * NOTE: money renders as "Rs." — jsPDF's built-in Helvetica is WinAnsi-encoded
 * and has no ₹ (U+20B9) glyph. Embedding a Unicode font as base64 VFS is the
 * only way to get the real symbol; not worth it until Kalari asks.
 *
 * Server-side, not browser-side, because invoices.pdf_path + attach_invoice_pdf
 * exist precisely so the PDF is stored once at issue and the email worker can
 * attach it with no browser present.
 *
 * jsPDF's core fonts (Helvetica) are built in and need no embedding, so this
 * runs in a Railway container with no system fonts. Only reach for a custom face
 * if Kalari's letterhead demands one — then it must be embedded as a base64
 * VFS entry, or it silently falls back to Helvetica in production.
 */

export type InvoiceLineForPdf = {
  line_no: number;
  label: string;
  qty: number;
  rate_paise: number;
  gst_paise: number;
  amount_paise: number;
};

export type InvoiceForPdf = {
  number: string;
  issue_date: string;
  due_date: string;
  service_name: string;
  subtotal_paise: number;
  gst_paise: number;
  total_paise: number;
  amount_note: string | null;
  customer: { name: string; phone: string; email: string | null; sponsor_company: string | null };
  lines: InvoiceLineForPdf[];
};

// Address and phones from kalaritravels.in.
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

export async function renderInvoicePdf(inv: InvoiceForPdf): Promise<Buffer> {
  // Dynamic import: keeps jsPDF out of any bundle that doesn't render a PDF.
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

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

  // INVOICE block, right-aligned.
  doc.setFont("helvetica", "bold").setFontSize(22).setTextColor(INK);
  doc.text("INVOICE", W - M, 60, { align: "right" });
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(MID);
  doc.text(`No.  ${inv.number}`, W - M, 78, { align: "right" });
  doc.text(`Issued  ${formatDate(inv.issue_date)}`, W - M, 91, { align: "right" });
  doc.text(`Due  ${formatDate(inv.due_date)}`, W - M, 104, { align: "right" });

  // ── Bill to ─────────────────────────────────────────────────────────────
  let y = 150;
  doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(GOLD);
  doc.text("BILL TO", M, y);
  y += 14;
  doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(INK);
  doc.text(inv.customer.name, M, y);
  y += 13;
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(MID);
  if (inv.customer.sponsor_company) {
    doc.text(inv.customer.sponsor_company, M, y);
    y += 12;
  }
  doc.text(inv.customer.phone, M, y);
  if (inv.customer.email) {
    y += 12;
    doc.text(inv.customer.email, M, y);
  }
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(MID);
  doc.text(inv.service_name, W - M, 150, { align: "right" });

  // ── Lines ──────────────────────────────────────────────────────────────────
  autoTable(doc, {
    startY: y + 24,
    head: [["No", "Description", "Qty", "Rate", "GST", "Net Amount"]],
    body: inv.lines.map((l) => [
      String(l.line_no),
      l.label,
      String(l.qty),
      formatPaiseBare(l.rate_paise),
      l.gst_paise ? formatPaiseBare(l.gst_paise) : "—",
      formatPaiseBare(l.amount_paise),
    ]),
    theme: "plain",
    headStyles: {
      fillColor: NAVY,
      textColor: "#ffffff",
      fontStyle: "bold",
      fontSize: 8,
      halign: "left",
    },
    bodyStyles: { fontSize: 9, textColor: INK, cellPadding: 6 },
    alternateRowStyles: { fillColor: "#f7f6f2" },
    columnStyles: {
      0: { cellWidth: 30, halign: "right" },
      1: { cellWidth: "auto" },
      2: { cellWidth: 40, halign: "right" },
      3: { cellWidth: 70, halign: "right" },
      4: { cellWidth: 60, halign: "right" },
      5: { cellWidth: 80, halign: "right", fontStyle: "bold" },
    },
    margin: { left: M, right: M },
  });

  // ── Totals ─────────────────────────────────────────────────────────────────
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
    // "Rs." not "₹" — core Helvetica has no rupee glyph (see header note).
    doc.text(`Rs. ${value}`, valueX, ty, { align: "right" });
    ty += big ? 22 : 16;
  };

  totalRow("Subtotal", formatPaiseBare(inv.subtotal_paise));
  if (inv.gst_paise > 0) totalRow("GST", formatPaiseBare(inv.gst_paise));

  doc.setDrawColor(GOLD).setLineWidth(1);
  doc.line(labelX, ty - 4, valueX, ty - 4);
  // Grand Total renders at 12pt bold — enough clearance below the rule that
  // its ascent doesn't run back into the line (it did at the old 6pt gap).
  ty += 14;
  totalRow("Grand Total", formatPaiseBare(inv.total_paise), true, true);

  if (inv.amount_note) {
    doc.setFont("helvetica", "italic").setFontSize(8.5).setTextColor(MID);
    // Free text (defaults to the formatted total, e.g. "₹500.00") — core
    // Helvetica has no ₹ glyph, same reason totalRow() uses "Rs." above.
    doc.text(inv.amount_note.replace(/₹/g, "Rs. "), M, ty + 10, { maxWidth: W - 2 * M });
    ty += 12;
  }

  // ── Bank details ─────────────────────────────────────────────────────────
  // Where to actually pay. Without this the customer has an amount and no
  // way to settle it without ringing the office.
  const BANK_BLOCK_H = 15 + BANK_LINES.length * 12;
  const pageH = doc.internal.pageSize.getHeight();
  let by = ty + 26;

  // A long invoice can push the totals far enough down that this block would
  // run into the footer rule. Start a fresh page rather than overprint it.
  if (by + BANK_BLOCK_H > pageH - 64) {
    doc.addPage();
    by = 60;
  }

  doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(NAVY);
  doc.text("BANK DETAILS  ·  NEFT / RTGS / IMPS / UPI", M, by);
  doc.setDrawColor(GOLD).setLineWidth(0.75);
  doc.line(M, by + 3, M + 200, by + 3);

  by += 15;
  for (const [label, value] of BANK_LINES) {
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(MID);
    doc.text(`${label}`, M, by);
    doc.setFont("helvetica", "bold").setTextColor(INK);
    doc.text(value, M + 62, by, { maxWidth: W - 2 * M - 62 });
    by += 12;
  }

  // ── Footer ───────────────────────────────────────────────────────────────
  const fy = pageH - 40;
  doc.setDrawColor("#e5e3dc").setLineWidth(0.5);
  doc.line(M, fy - 12, W - M, fy - 12);
  doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(MID);
  doc.text(
    "This is a computer-generated invoice. Thank you for your business.",
    W / 2,
    fy,
    { align: "center" },
  );

  return Buffer.from(doc.output("arraybuffer"));
}
