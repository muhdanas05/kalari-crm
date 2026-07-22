import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the auth session and redirects signed-out users to /login.
 * Server Components cannot write cookies, so this is the only place a refreshed
 * token gets persisted.
 *
 * PERFORMANCE — why getClaims() and not getUser():
 *
 * getUser() makes a NETWORK CALL to the Supabase auth server on every request to
 * revalidate the JWT. This project is in ap-southeast-1 and the round trip
 * measures ~600ms, so getUser() in middleware put ~600ms on the front of every
 * single navigation before a byte of the page was computed.
 *
 * getClaims() verifies the JWT signature LOCALLY against the project's public
 * JWKS (this project signs with ES256 and publishes a JWKS; verified). The JWKS
 * is fetched once and cached, so steady-state verification is pure CPU — no
 * round trip, and the same cryptographic guarantee.
 *
 * This is NOT the getSession() footgun. getSession() reads the cookie and trusts
 * it without checking the signature at all. getClaims() verifies the signature
 * against a key only the auth server holds — a forged or tampered token fails.
 * The one thing it cannot see is a token revoked mid-life, which is why
 * authorisation still lives in the database: RLS and is_active_user() read
 * `profiles` LIVE, so a deactivated user's queries return nothing regardless of
 * what their JWT still claims (ARCHITECTURE.md §3.18, §3.21-22).
 *
 * If the project is ever switched back to legacy HS256 (no published JWKS),
 * getClaims() falls back to a network call on its own — correct, just slower.
 */
export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          toSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Verifies locally; refreshes the session if the access token has expired.
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) {
    // An API caller wants a status code, not a login page. Redirecting a fetch()
    // to HTML makes it succeed with unparseable junk, which is worse than a
    // clean refusal.
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "unauthorised" }, { status: 401 });
    }

    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // Preserve intent so a deep link survives the round trip through login.
    if (request.nextUrl.pathname !== "/") {
      url.searchParams.set("next", request.nextUrl.pathname);
    }
    const redirect = NextResponse.redirect(url);
    supabaseResponse.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Everything except:
     *   login          — signed-out users must be able to reach it
     *   portal/*       — customers open it with no session (ARCHITECTURE.md §5.8)
     *   api/leads      — Shopify posts with a bearer token, not a cookie
     *   api/cron/*     — workers authenticate with a shared secret
     *   api/email/*    — provider webhooks
     *   _next, static assets
     */
    "/((?!login|portal|api/leads|api/cron|api/email|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
