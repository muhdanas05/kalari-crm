import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchEvents } from "@/lib/dispatch";
import { sendQueuedEmails } from "@/lib/email/send";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The whole scheduled worker, in one endpoint.
 *
 *   rules → events → dispatch → queue → send
 *
 * One endpoint rather than three because each step is idempotent and bounded,
 * so running them in sequence on one tick is simpler than coordinating three
 * schedules — and if the tick times out, the next one picks up exactly where
 * this stopped. Nothing here is "resumed"; it is all re-derived.
 *
 * Excluded from the auth middleware (it has no session) and guarded by a shared
 * secret instead.
 *
 * Trigger it however you like:
 *   • Railway cron  →  curl -H "Authorization: Bearer $CRON_SECRET" .../api/cron/run
 *   • pg_cron + pg_net from Supabase
 *   • cron-job.org, if you want it visible without a platform
 */
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 500 });
  }

  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  // Length check first: timingSafeEqual throws on a mismatch rather than
  // returning false.
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }

  const started = Date.now();

  try {
    // 1. Rules → Events, in SQL. These physically cannot send — they can only
    //    write events. That is §4's seam, enforced by where the code lives.
    const supabase = createAdminClient();
    const { data: rules, error: rulesError } = await supabase.rpc(
      "run_automation_rules",
    );
    if (rulesError) throw new Error(`rules: ${rulesError.message}`);

    // 2. Events → email queue and/or call tasks.
    const dispatch = await dispatchEvents(50);

    // 3. Queue → adapter. No-ops entirely when email is off, which is the
    //    default and is not a broken state.
    const send = await sendQueuedEmails(25);

    return NextResponse.json({
      ok: true,
      ms: Date.now() - started,
      rules,
      dispatch,
      send,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // 500 so the caller's own logs show a failure. A cron that always returns
    // 200 is a cron nobody notices has died.
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/** GET for a quick manual poke; same auth. */
export async function GET(request: NextRequest) {
  return POST(request);
}
