// `server-only` makes importing this from a Client Component a BUILD error rather
// than a runtime leak. This module holds a key that bypasses RLS entirely, so the
// import boundary is the safeguard — do not remove this line.
import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/**
 * Service-role client. Bypasses RLS completely.
 *
 * Legitimate uses — all of them are paths where NO user session exists:
 *   • the customer status portal (anon holds zero grants; ARCHITECTURE.md §5.8)
 *   • /api/leads          — Shopify posts with no session
 *   • /api/cron/*         — scheduled workers, actor_kind='system'
 *   • creating auth users — requires the admin API
 *
 * NEVER use it to "make a query work". If a read fails under RLS, the fix is the
 * policy, not this client.
 *
 * NEVER use it for read_customer_passport(): that RPC writes the access-log row
 * from auth.uid(), so calling it as service-role records a blank/■ actor and
 * breaks §3.24–25. Use the user-scoped client from ./server.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");

  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    key,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
