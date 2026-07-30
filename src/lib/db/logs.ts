import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * The raw logs behind /history.
 *
 * /history is the readable feed — one union, newest first, errors flagged. This
 * module is the other half: the unaggregated tables, for when "an email failed"
 * is not enough and you need the provider message id and the error text.
 *
 * Everything here reads as the signed-in user, so RLS still applies. The page
 * on top of it is admin-only anyway.
 */

// email_log is already served by getEmailLog() in lib/db/automations.ts — reuse
// it rather than writing a second query against the same table.
export { getEmailLog as listEmailLog } from "@/lib/db/automations";

/**
 * The send queue. Queued and failed first — a drained queue is not interesting,
 * a stuck one is the whole reason to open this page.
 */
export async function listEmailQueue(limit = 150) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("email_queue")
    .select(
      "id, to_email, subject, status, attempts, last_error, next_attempt_at, created_at, sent_at, template_key, provider_msg_id",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  const rows = data ?? [];
  const rank = (s: string) => (s === "failed" ? 0 : s === "queued" ? 1 : 2);
  return rows.sort((a, b) => rank(a.status) - rank(b.status));
}

/** The event seam (ARCHITECTURE §4) — what the dispatcher saw and what it did. */
export async function listEvents(limit = 150) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("events")
    .select("id, type, entity, entity_id, attempts, occurred_at, processed_at, processed_result, customer_id, case_id")
    .order("occurred_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

/** The audit trail. Written by database triggers; nothing in the app can edit it. */
export async function listAuditLog(limit = 150) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("activity_log")
    .select("id, action, actor_kind, entity, entity_id, before, after, changed_keys, occurred_at, user_id")
    .order("occurred_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}
