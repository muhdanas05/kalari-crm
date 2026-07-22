import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Public lead intake — the Shopify site posts here (§5.1).
 *
 * Bearer-token authed (Shopify has no session), service-role (no user is
 * acting), and it does exactly one thing: call create_lead(), which creates the
 * customer + case + assignment in one transaction. All the rules — dedup on
 * phone, auto-assign, write-once attribution — live in that RPC, so a curl to
 * this endpoint is held to the same guarantees as the in-app form.
 *
 * Excluded from the auth middleware. Rate-limited so a leaked token can't be
 * used to flood the pipeline.
 */
export async function POST(request: NextRequest) {
  const token = process.env.LEADS_INTAKE_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "lead intake not configured" },
      { status: 503 },
    );
  }

  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(token);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const name = str(body.name);
  const phone = str(body.phone);
  if (!name || !phone) {
    return NextResponse.json(
      { error: "name and phone are required" },
      { status: 422 },
    );
  }

  const supabase = createAdminClient();

  // Postgres-backed rate limit, reusing the portal's limiter. In-memory would be
  // useless on a stateless serverless host — it resets every cold start and is
  // per-instance.
  const ip =
    request.headers.get("x-nf-client-connection-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  const { data: ok } = await supabase.rpc("portal_rate_ok", {
    p_ip: `lead:${ip}`,
    p_limit: 20,
  });
  if (ok === false) {
    return NextResponse.json({ error: "rate limited" }, { status: 429 });
  }

  const { error } = await supabase.rpc("create_lead", {
    p_name: name,
    p_phone: phone,
    p_email: str(body.email),
    p_source: str(body.source) ?? "website",
    p_message: str(body.message),
    // Attribution — write it now or lose it forever (§3.28).
    p_gclid: str(body.gclid),
    p_fbclid: str(body.fbclid),
    p_utm_source: str(body.utm_source),
    p_utm_medium: str(body.utm_medium),
    p_utm_campaign: str(body.utm_campaign),
    p_utm_content: str(body.utm_content),
    p_utm_term: str(body.utm_term),
    p_referrer: str(body.referrer),
    p_landing_page: str(body.landing_page),
  });

  if (error) {
    // Don't leak SQL detail to a public endpoint.
    console.error("[leads] create_lead failed:", error.message);
    return NextResponse.json({ error: "could not record lead" }, { status: 500 });
  }

  // 201 with confirmation only — the site gets no internal ids back.
  return NextResponse.json({ ok: true, received: true }, { status: 201 });
}

function str(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t === "" ? undefined : t.slice(0, 500);
}
