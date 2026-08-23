"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/auth/session";
import { dispatchEventById } from "@/lib/dispatch";
import { sendQueuedEmails } from "@/lib/email/send";

export type EmailResult =
  | { ok: true; sandboxed: boolean; to: string }
  | { ok: false; error: string };

/**
 * Deliberately conservative. This is not RFC 5322 — it is "would a provider
 * plausibly accept this", which is the question that matters before we hand
 * the address to Gmail and get a bounce hours later.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@,]+\.[a-z]{2,}$/i;

/**
 * Email the invoice from the invoice screen (§5.4 — "one click").
 *
 * Still goes through the event seam — it emits `invoice.issued` and the same
 * dispatcher + sender handle it as every other email, so suppression, the
 * sandbox flag and the log all apply exactly once. What changed: instead of
 * queueing and leaving the customer to wait up to 15 minutes for the next cron
 * tick, this then RUNS that dispatcher and sender inline and reports what
 * actually happened. A button labelled "Email" should either send or say why
 * it couldn't.
 *
 * The event insert goes through queue_invoice_email(), a definer RPC: the
 * `authenticated` role holds no INSERT on public.events (it is the automation
 * seam, and a browser that can write to it is a browser that can email anyone),
 * so the old direct insert failed every single time with
 * "permission denied for table events".
 */
export async function emailInvoice(invoiceId: string): Promise<EmailResult> {
  await requirePermission("invoices");
  const supabase = await createClient();

  // RLS-scoped: if the caller can't see this invoice, they get nothing to email.
  const { data: inv } = await supabase
    .from("invoices_v")
    .select("id, customer_id, number")
    .eq("id", invoiceId)
    .maybeSingle();

  if (!inv?.id || !inv.customer_id) {
    return { ok: false, error: "Invoice not found." };
  }

  const { data: customer } = await supabase
    .from("customers")
    .select("name, email")
    .eq("id", inv.customer_id)
    .maybeSingle();

  // ── Say why, before anything is queued ──────────────────────────────────
  const to = (customer?.email ?? "").trim();
  const who = customer?.name ?? "This customer";

  if (!to) {
    return {
      ok: false,
      error: `${who} has no email address on file, so there is nowhere to send this. Add one on their profile, or call them instead.`,
    };
  }
  if (!EMAIL_RE.test(to)) {
    return {
      ok: false,
      error: `"${to}" doesn't look like a valid email address, so this wasn't sent. Correct it on ${who}'s profile and try again.`,
    };
  }

  // Suppressed addresses are a hard stop — a previous hard bounce or a spam
  // complaint. Sending anyway is how a domain's reputation dies.
  const admin = createAdminClient();
  const { data: suppressed } = await admin
    .from("suppressions")
    .select("reason")
    .eq("email", to.toLowerCase())
    .maybeSingle();

  if (suppressed) {
    const why =
      suppressed.reason === "complaint"
        ? "they marked a previous email as spam"
        : "a previous email hard-bounced";
    return {
      ok: false,
      error: `${to} is on the suppression list because ${why}. Nothing was sent — phone them instead.`,
    };
  }

  const { data: eventId, error: queueError } = await supabase.rpc("queue_invoice_email", {
    p_invoice_id: invoiceId,
  });
  if (queueError) return { ok: false, error: queueError.message };
  if (!eventId) return { ok: false, error: "Could not queue the email." };

  // ── Send it now, rather than at the next cron tick ───────────────────────
  const { data: settings } = await supabase
    .from("automation_settings")
    .select("key, enabled")
    .in("key", ["email.enabled", "email.sandbox"]);
  const map = Object.fromEntries((settings ?? []).map((s) => [s.key, s.enabled]));
  const sandboxed = !map["email.enabled"] || map["email.sandbox"];

  try {
    // Targeted, not the whole backlog: dispatchEvents()/sendQueuedEmails()
    // claim oldest-first, so with a queue behind it this event would not be
    // reached and unrelated mail would go out instead.
    await dispatchEventById(eventId);
    if (!sandboxed) await sendQueuedEmails(1, eventId);
  } catch (e) {
    // The event is already recorded, so the cron will still pick this up —
    // don't claim success, but don't pretend it's lost either.
    const message = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      error: `Queued, but sending failed: ${message}. It will be retried automatically.`,
    };
  }

  revalidatePath(`/invoices/${invoiceId}`);

  if (sandboxed) return { ok: true, sandboxed: true, to };

  // Report what the sender actually recorded for this invoice, not what we
  // hoped. The queue row is the source of truth.
  const { data: queued } = await admin
    .from("email_queue")
    .select("status, last_error")
    .eq("event_id", eventId)
    .maybeSingle();

  if (queued?.status === "failed") {
    return {
      ok: false,
      error: `Sending to ${to} failed: ${queued.last_error ?? "the provider rejected it"}. It will be retried automatically.`,
    };
  }
  if (queued?.status === "suppressed") {
    return { ok: false, error: `${to} is suppressed — nothing was sent.` };
  }

  return { ok: true, sandboxed: false, to };
}
