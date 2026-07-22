import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";

/**
 * The default client: Server Components, Server Actions, Route Handlers.
 * Runs as the logged-in user, so RLS applies. This is what almost everything
 * should use — ARCHITECTURE.md §3.21 puts authorisation below the UI, and the
 * only way to honour that is to let the database do the scoping.
 */
export async function createClient() {
  // Next 15: cookies() is async.
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            toSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Components cannot set cookies. This is expected, not an
            // error: middleware.ts refreshes the session and writes the cookies.
            // Swallowing here is required — without it every RSC render throws.
          }
        },
      },
    },
  );
}
