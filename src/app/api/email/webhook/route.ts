import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

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

    await supabase
      .from("email_log")
      .update({ bounced_at: now, bounce_type: payload.data?.bounce?.type ?? "unknown" })
      .eq("to_email", to)
      .is("bounced_at", null);

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
    await supabase
      .from("email_log")
      .update({ complained_at: now })
      .eq("to_email", to)
      .is("complained_at", null);
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
      .eq("to_email", to)
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
