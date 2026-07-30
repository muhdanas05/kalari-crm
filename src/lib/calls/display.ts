import type { Database } from "@/lib/supabase/database.types";

/**
 * Client-safe display helpers for the call queue.
 *
 * These live apart from lib/db/calls.ts on purpose: that module imports the
 * server Supabase client, which imports next/headers, which cannot be pulled
 * into a Client Component. A label map is not worth dragging the server runtime
 * across the boundary — so the pure values live here and both sides import them.
 */

export type CallTask = Database["public"]["Views"]["call_list_v"]["Row"];
export type CallOutcome = Database["public"]["Enums"]["call_outcome"];
export type CallReason = Database["public"]["Enums"]["call_reason"];

export const REASON_LABEL: Record<CallReason, string> = {
  payment_chase: "Payment chase",
  doc_collection: "Documents",
  unreachable: "Unreachable",
  quote_followup: "Quote follow-up",
  case_unblock: "Case unblock",
  renewal: "Renewal",
  reengagement: "Re-engagement",
  promise_due: "Promised payment",
  wrong_number_admin: "Wrong number",
  input_needed: "Needs input",
};

export const OUTCOME_LABEL: Record<CallOutcome, string> = {
  reached_resolved: "Reached — resolved",
  promised_payment: "Promised payment",
  needs_callback: "Needs callback",
  no_answer: "No answer",
  busy: "Busy",
  switched_off: "Switched off",
  wrong_number: "Wrong number",
  refused: "Refused",
};

export function priorityTone(p: string | null): "alert" | "warn" | "neutral" {
  return p === "high" ? "alert" : p === "medium" ? "warn" : "neutral";
}
