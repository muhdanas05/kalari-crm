"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";

/**
 * Browser client. Use for auth calls (signInWithPassword, signOut) and realtime
 * only — NOT for data fetching. Reads go through Server Components so the query
 * runs once, on the server, with the session already resolved.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
