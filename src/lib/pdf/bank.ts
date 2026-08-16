/**
 * Kalari's bank account, as it appears on the passbook.
 *
 * One place, because it goes on both the invoice and the receipt and a
 * mismatch between two documents is exactly how money reaches the wrong
 * account. If the account ever changes, change it here.
 *
 * Kept as plain data (no ₹, no non-ASCII) because jsPDF's core Helvetica has
 * no glyph for anything outside Latin-1 — see the "Rs." handling in
 * invoice.ts.
 */
export const BANK = {
  beneficiary: "M/S KALARI TOURS AND TRAVELS",
  accountNo: "40651111000724",
  bank: "Kerala Gramin Bank",
  branch: "Kottayam Malabar (40651), Kannur - 670691",
  ifsc: "KLGB0040651",
  micr: "670480114",
  accountType: "Current Account",
} as const;

/** The block as it renders on a document, one label/value pair per line. */
export const BANK_LINES: [string, string][] = [
  ["Beneficiary", BANK.beneficiary],
  ["Account No", BANK.accountNo],
  ["IFSC", BANK.ifsc],
  ["Bank", `${BANK.bank}, ${BANK.branch}`],
];
