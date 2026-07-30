import type { Database } from "@/lib/supabase/database.types";

type EventType = Database["public"]["Enums"]["event_type"];
type CallReason = Database["public"]["Enums"]["call_reason"];
type CallPriority = Database["public"]["Enums"]["call_priority"];

/**
 * What each event MEANS. The whole dispatch policy, in one table you can read.
 *
 * This is the file ARCHITECTURE.md §4's design test lives in:
 *
 *   "The CRM must be fully usable with email switched off entirely. Everything
 *    degrades to the call queue."
 *
 * Every row that has an `email` also has a `call` fallback, or is deliberately
 * marked as one that doesn't need a human. When email is off, the dispatcher
 * walks this same table and takes the `call` branch — same code path, one flag.
 * Nothing is ever silently dropped: an event with no email and no call still
 * gets a `sandboxed` row in email_log saying so.
 */
export type DispatchRule = {
  /** Template key, or null when this event never emails. */
  email: string | null;
  /** Raise a call task — always, or only when the email couldn't go. */
  call?: {
    reason: CallReason;
    priority: CallPriority;
    /**
     * "fallback" — only when email couldn't be sent (no address, suppressed,
     *              adapter off). The §5.6 bridge: email failure becomes a call,
     *              not a silent drop.
     * "always"   — money and deadlines. An unopened email is not a conversation;
     *              §5.7 says these need a voice regardless.
     */
     when: "fallback" | "always";
  };
  /** Human label for the Automations tab. */
  label: string;
};

export const DISPATCH_RULES: Record<EventType, DispatchRule> = {
  // ONE message at case open with the portal link. Replaces per-stage email
  // spam — the customer gets a page that is always current instead of nine
  // notifications they learn to filter.
  "lead.created": {
    email: "case.opened",
    call: { reason: "unreachable", priority: "medium", when: "fallback" },
    label: "Case opened — send portal link",
  },

  // Only fires for stages an admin has switched on (stage_email_config), and
  // only ONCE per stage per case, forever — enforced by the events.dedupe_key
  // unique index, so n → n+1 → n → n+1 sends exactly one email.
  "case.stage_changed": {
    email: "stage.changed",
    label: "Stage update",
  },

  "case.completed": {
    email: "case.complete",
    label: "Application complete",
  },

  // Stuck is an internal problem, not a customer one. Never email the customer
  // to say we haven't done anything — call them.
  "case.stuck": {
    email: null,
    call: { reason: "case_unblock", priority: "medium", when: "always" },
    label: "Case stuck — chase internally",
  },

  "docs.missing": {
    email: "docs.missing",
    call: { reason: "doc_collection", priority: "high", when: "always" },
    label: "Documents outstanding",
  },

  "quote.unanswered": {
    email: null,
    call: { reason: "quote_followup", priority: "medium", when: "always" },
    label: "Quote unanswered — follow up",
  },

  "invoice.issued": {
    email: "invoice.issued",
    call: { reason: "unreachable", priority: "medium", when: "fallback" },
    label: "Invoice issued",
  },

  "invoice.unpaid": {
    email: "invoice.unpaid",
    call: { reason: "payment_chase", priority: "medium", when: "fallback" },
    label: "Payment reminder",
  },

  // Money that is late always gets a human. §5.7 rates this High.
  "invoice.overdue": {
    email: "invoice.overdue",
    call: { reason: "payment_chase", priority: "high", when: "always" },
    label: "Overdue — email and call",
  },

  // The receipt IS the point for a remote payer: a bank transfer leaves them
  // with no proof of payment until someone sends one. The trigger already
  // closes the chase tasks and suppresses the reminders; this is the
  // acknowledgement, with the receipt PDF attached. No call fallback — nobody
  // needs a phone call to be told their own payment arrived.
  "payment.received": {
    email: "payment.received",
    label: "Payment received — receipt emailed",
  },

  // The highest-value rule in the product: every past customer becomes repeat
  // business without anyone remembering to chase them.
  "renewal.due": {
    email: "renewal.due",
    call: { reason: "renewal", priority: "medium", when: "always" },
    label: "Renewal due",
  },

  // Promotional — needs logged consent. The dispatcher refuses without it.
  "reengagement.due": {
    email: null,
    call: { reason: "reengagement", priority: "low", when: "always" },
    label: "Re-engagement",
  },

  // The bridge itself: a bounce means this person is not reachable by email, so
  // they become a phone call rather than a silence.
  "email.failed": {
    email: null,
    call: { reason: "unreachable", priority: "high", when: "always" },
    label: "Email failed — call instead",
  },
};
