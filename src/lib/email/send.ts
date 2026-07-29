import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdapter } from "./adapter";

export type SendSummary = {
  claimed: number;
  sent: number;
  failed: number;
  suppressed: number;
  errors: string[];
};

/** Exponential backoff, capped. 1m, 4m, 16m, 64m, then give up at 5. */
const MAX_ATTEMPTS = 5;
function backoffMinutes(attempt: number): number {
  return Math.min(4 ** attempt, 64);
}

/**
 * The sender. Claims queued mail, hands it to the adapter, records what
 * happened.
 *
 * Separate from the dispatcher on purpose: the dispatcher decides WHAT to send
 * and can't fail on a provider outage; this can fail all it likes and the event
 * is already safely recorded. That split is why a Resend outage costs you a
 * retry rather than a lost notification.
 *
 * Batch-bounded because Railway/Netlify style function timeouts are real: a
 * timeout mid-batch is a no-op the next tick absorbs, since every row is claimed
 * before it is sent.
 */
export async function sendQueuedEmails(limit = 25): Promise<SendSummary> {
  const supabase = createAdminClient();
  const out: SendSummary = {
    claimed: 0,
    sent: 0,
    failed: 0,
    suppressed: 0,
    errors: [],
  };

  // Kill switch (§5.6). Checked here as well as in the dispatcher: this is the
  // last gate before something actually leaves the building.
  const { data: settings } = await supabase
    .from("automation_settings")
    .select("key, enabled")
    .in("key", ["email.enabled", "email.sandbox"]);
  const map = Object.fromEntries((settings ?? []).map((s) => [s.key, s.enabled]));
  if (!map["email.enabled"] || map["email.sandbox"]) {
    return out;
  }

  const { data: rows } = await supabase
    .from("email_queue")
    .select("*")
    .in("status", ["queued", "failed"])
    .lte("next_attempt_at", new Date().toISOString())
    .lt("attempts", MAX_ATTEMPTS)
    .order("next_attempt_at")
    .limit(limit);

  out.claimed = rows?.length ?? 0;
  if (!rows?.length) return out;

  const adapter = await getAdapter();

  for (const row of rows) {
    // Claim it first. If this process dies mid-send, the row is 'sending' and
    // will not be picked up again by the next tick — better a stuck row you can
    // see than the same email sent twice.
    await supabase
      .from("email_queue")
      .update({ status: "sending", attempts: row.attempts + 1 })
      .eq("id", row.id);

    // Re-check suppression at send time, not just at queue time: a bounce may
    // have landed in the minutes between.
    const { data: suppressed } = await supabase
      .from("suppressions")
      .select("email")
      .eq("email", row.to_email.toLowerCase())
      .maybeSingle();

    if (suppressed) {
      await supabase
        .from("email_queue")
        .update({ status: "suppressed", last_error: "address suppressed" })
        .eq("id", row.id);
      await logEmail(supabase, row, "suppressed", null, "address suppressed");
      out.suppressed++;
      continue;
    }

    const result = await adapter.send(
      row.to_email,
      row.subject,
      row.body,
      (row.attachments as unknown as { filename: string; content: string }[]) ?? [],
    );

    if (result.status === "sent") {
      await supabase
        .from("email_queue")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          provider_msg_id: result.msg_id,
          last_error: null,
        })
        .eq("id", row.id);
      await logEmail(supabase, row, "sent", result.msg_id, null);
      out.sent++;
      continue;
    }

    const attempts = row.attempts + 1;
    const giveUp = attempts >= MAX_ATTEMPTS;

    await supabase
      .from("email_queue")
      .update({
        status: "failed",
        last_error: result.error ?? "unknown error",
        next_attempt_at: new Date(
          Date.now() + backoffMinutes(attempts) * 60_000,
        ).toISOString(),
      })
      .eq("id", row.id);

    out.failed++;
    if (result.error) out.errors.push(`${row.to_email}: ${result.error}`);

    if (giveUp) {
      await logEmail(supabase, row, "failed", null, result.error ?? null);

      // §5.6: "Retry with backoff; terminal failure → CallTask." We have now
      // failed five times. This person is not reachable by email, so they become
      // a phone call rather than a silence.
      if (row.customer_id) {
        await supabase.from("events").insert({
          type: "email.failed",
          entity: "customer",
          entity_id: row.customer_id,
          customer_id: row.customer_id,
          case_id: row.case_id,
          payload: { template: row.template_key, error: result.error },
          dedupe_key: `email.failed:${row.id}`,
        });
      }
    }
  }

  return out;
}

async function logEmail(
  supabase: ReturnType<typeof createAdminClient>,
  row: {
    id: string;
    customer_id: string | null;
    supplier_id: string | null;
    case_id: string | null;
    template_key: string | null;
    to_email: string;
    subject: string;
    body: string;
  },
  status: "sent" | "failed" | "suppressed",
  msgId: string | null,
  error: string | null,
) {
  await supabase.from("email_log").insert({
    queue_id: row.id,
    customer_id: row.customer_id,
    supplier_id: row.supplier_id,
    case_id: row.case_id,
    template_key: row.template_key,
    to_email: row.to_email,
    subject: row.subject,
    body: row.body,
    status,
    provider_msg_id: msgId,
    error,
  });
}
