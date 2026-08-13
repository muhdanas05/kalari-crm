import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Shared-secret gate, same shape as /api/cron/run.
 *
 * This route runs as service_role and is excluded from the auth middleware, so
 * without this ANYONE could POST a forged `email.bounced` and permanently
 * suppress any address — killing email to a customer with no audit of who did
 * it. Verified: it was fully open.
 *
 * Accepts the secret in the Authorization header OR a `?key=` query param,
 * because most providers let you set the endpoint URL but not custom headers.
 *
 * FAILS CLOSED: no EMAIL_WEBHOOK_SECRET configured means the endpoint refuses
 * everything rather than falling back to anonymous writes.
 */
function authorised(request: NextRequest): boolean {
  const secret = process.env.EMAIL_WEBHOOK_SECRET;
  if (!secret) return false;

  const given =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    new URL(request.url).searchParams.get("key") ??
    "";

  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  // Length first: timingSafeEqual throws on a length mismatch.
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Provider webhook: bounces and complaints → the suppression list.
 *
 * §5.6: "Bounce/complaint webhooks → suppression list. Never send to a
 * suppressed address." And then the bridge: a person we cannot email becomes a
 * person we call, via an `email.failed` event.
 *
 * Shaped for Resend's payload. A different provider means a different parser
 * here and nothing else — the suppression list and the event are provider-blind.
 */
export async function POST(request: NextRequest) {
  if (!authorised(request)) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }

  const supabase = createAdminClient();

  let payload: { type?: string; data?: { to?: string[]; email?: string; bounce?: { type?: string } } };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const type = payload.type ?? "";
  const to = payload.data?.to?.[0] ?? payload.data?.email;
  if (!to) return NextResponse.json({ ok: true, ignored: "no address" });

  const email = to.toLowerCase();
  const now = new Date().toISOString();

  if (type === "email.bounced") {
    const hard = payload.data?.bounce?.type !== "Transient";

    // Only the MOST RECENT message to this address, not every one ever sent —
    // `.eq("to_email", …)` with no further filter stamped the entire history,
    // inflating the automation error count and misattributing the bounce.
    // ilike, because providers echo the address in arbitrary case.
    const { data: lastSent } = await supabase
      .from("email_log")
      .select("id")
      .ilike("to_email", email)
      .is("bounced_at", null)
      .order("occurred_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastSent) {
      await supabase
        .from("email_log")
        .update({ bounced_at: now, bounce_type: payload.data?.bounce?.type ?? "unknown" })
        .eq("id", lastSent.id);
    }

    // A transient bounce (mailbox full) is not a dead address — suppressing on
    // one would lose a customer permanently over a temporary problem.
    if (hard) {
      await supabase
        .from("suppressions")
        .upsert({ email, reason: "hard_bounce", detail: "provider webhook" });
      await flagAndCall(supabase, email, "hard bounce");
    }
  }

  if (type === "email.complained") {
    // Same narrowing as the bounce branch above.
    const { data: lastSent } = await supabase
      .from("email_log")
      .select("id")
      .ilike("to_email", email)
      .is("complained_at", null)
      .order("occurred_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastSent) {
      await supabase
        .from("email_log")
        .update({ complained_at: now })
        .eq("id", lastSent.id);
    }
    await supabase
      .from("suppressions")
      .upsert({ email, reason: "complaint", detail: "provider webhook" });
    // A complaint means stop emailing — it does NOT mean start phoning. That
    // would be reading "leave me alone" as "try another channel".
  }

  if (type === "email.opened") {
    // §5.6: open tracking, so Kalari can see whether email actually works for
    // his customers — which is the real answer to OQ10.
    const { data: row } = await supabase
      .from("email_log")
      .select("id, open_count")
      .ilike("to_email", email)
      .order("occurred_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (row) {
      await supabase
        .from("email_log")
        .update({ opened_at: now, open_count: (row.open_count ?? 0) + 1 })
        .eq("id", row.id);
    }
  }

  return NextResponse.json({ ok: true });
}

async function flagAndCall(
  supabase: ReturnType<typeof createAdminClient>,
  email: string,
  reason: string,
) {
  const { data: customers } = await supabase
    .from("customers")
    .select("id")
    .ilike("email", email)
    .is("archived_at", null);

  for (const c of customers ?? []) {
    await supabase
      .from("customers")
      .update({ email_flagged_at: new Date().toISOString() })
      .eq("id", c.id)
      .is("email_flagged_at", null);

    await supabase.from("events").insert({
      type: "email.failed",
      entity: "customer",
      entity_id: c.id,
      customer_id: c.id,
      payload: { reason },
      dedupe_key: `email.failed:bounce:${c.id}`,
    });
  }
}
