import "server-only";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

export type PortalData = {
  customer: { name: string };
  case: {
    stage: string;
    service: string | null;
    pipeline: string;
    stage_path: { name: string }[];
    complete: boolean;
  } | null;
  documents_outstanding: { label: string }[];
  money: { total_paise: number; paid_paise: number; outstanding_paise: number };
  invoice_number: string | null;
  payment_instructions: string | null;
};

/**
 * Read a customer's portal by raw token.
 *
 * This is the ONE legitimate service-role read path with no user session: the
 * customer has no account and never will (§5.8 — "No login, works on any
 * phone"). anon is granted nothing, so the privilege lives here, behind a route
 * we own, where we keep the rate limit and the 404 semantics.
 *
 * Returns null for missing, revoked, expired AND rate-limited alike. The caller
 * renders 404 for all of them — never 401/403, which would confirm that a token
 * exists.
 */
export async function readPortal(token: string): Promise<PortalData | null> {
  // A token that isn't 64 hex chars cannot match anything. Reject before
  // touching the database.
  if (!/^[0-9a-f]{64}$/.test(token)) return null;

  const supabase = createAdminClient();

  const h = await headers();
  const ip =
    h.get("x-nf-client-connection-ip") ??
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";

  const { data: allowed } = await supabase.rpc("portal_rate_ok", {
    p_ip: ip,
    p_limit: 30,
  });
  if (allowed === false) return null;

  const { data, error } = await supabase.rpc("portal_read", { p_token: token });
  if (error || !data) return null;

  return data as unknown as PortalData;
}
