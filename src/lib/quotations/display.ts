/**
 * Client-safe display helpers for quotations. Same split as
 * lib/invoices/display.ts — a label map must not drag next/headers across
 * the client boundary via lib/db/quotations.ts.
 */

export const QUOTATION_STATUSES = [
  "draft",
  "sent",
  "accepted",
  "declined",
  "expired",
  "converted",
] as const;
export type QuotationStatus = (typeof QUOTATION_STATUSES)[number];

export function statusTone(status: string | null): "ok" | "warn" | "alert" | "neutral" | "accent" {
  switch (status) {
    case "accepted":
    case "converted":
      return "ok";
    case "sent":
      return "accent";
    case "draft":
      return "neutral";
    case "declined":
    case "expired":
      return "alert";
    default:
      return "neutral";
  }
}

export function statusLabel(status: string | null): string {
  switch (status) {
    case "draft":
      return "Draft";
    case "sent":
      return "Sent";
    case "accepted":
      return "Accepted";
    case "declined":
      return "Declined";
    case "expired":
      return "Expired";
    case "converted":
      return "Converted";
    default:
      return status ?? "—";
  }
}
