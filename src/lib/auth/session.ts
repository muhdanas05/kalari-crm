import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { hasPermission, type PageKey } from "@/lib/auth/pages";

export { hasPermission };

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Role = Database["public"]["Enums"]["user_role"];

/**
 * The profile row, cached across requests for 60s.
 *
 * PERFORMANCE: the shell needs the user's name and role on every page. Left
 * uncached that is a Singapore round trip (~600ms) on the front of every
 * navigation, for a row that changes maybe twice a year.
 *
 * IS THIS SAFE? Yes, and specifically because of how this system is built:
 * the profile is used to decide WHAT RENDERS — which nav items, which tiles.
 * It is never the access boundary. RLS and is_active_user() read `profiles`
 * LIVE inside the database, so a user deactivated 5 seconds ago gets an empty
 * result set from every query and every RPC refuses them, no matter what this
 * cache still says. The worst case is a stale nav item that leads to a page
 * with no data — not a leak (ARCHITECTURE.md §3.18, §3.21).
 *
 * That 60s bound is the deliberate part: "role gates the UI, RLS gates access"
 * is exactly what makes caching it defensible. If that ever stops being true,
 * this cache stops being safe.
 *
 * Uses the admin client because unstable_cache runs outside the request scope
 * and cannot read cookies — the user id is passed in, having already been proven
 * by the caller.
 */
const getProfileCached = unstable_cache(
  async (userId: string): Promise<Profile | null> => {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();
    return data ?? null;
  },
  ["profile"],
  { revalidate: 60, tags: ["profiles"] },
);

/**
 * The signed-in user's profile, or null.
 *
 * React cache() dedupes within a request, so a layout, a page and three
 * components each asking costs one lookup. unstable_cache then dedupes ACROSS
 * requests for 60s.
 *
 * The JWT is verified locally (getClaims — no network); only the profile row
 * touches the database, and only on a cache miss.
 */
export const getProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();

  // Local signature verification. See the note in middleware.ts.
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return null;

  const profile = await getProfileCached(userId);

  // An auth user with no profile row, or a deactivated one, is not a user of
  // this system. Fail closed.
  if (!profile || !profile.active || profile.archived_at) return null;

  return profile;
});

/** Use in any authenticated page/action. Redirects out if there's no session. */
export async function requireProfile(): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  return profile;
}

/**
 * Use in admin-only pages and actions. Defence in depth, not the boundary — the
 * database refuses admin-only work regardless (§3.21).
 */
export async function requireAdmin(): Promise<Profile> {
  const profile = await requireProfile();
  if (profile.role !== "admin") redirect("/dashboard");
  return profile;
}

export function isAdmin(profile: Profile | null): boolean {
  return profile?.role === "admin";
}

/**
 * Use in a page/action gated by a specific permission rather than a flat
 * admin/not-admin split. Defence in depth, same as requireAdmin() — RLS and
 * has_permission() in Postgres are the real boundary for anything that
 * touches data; this just keeps the UI honest about what it's for.
 */
export async function requirePermission(page: PageKey): Promise<Profile> {
  const profile = await requireProfile();
  if (!hasPermission(profile, page)) redirect("/dashboard");
  return profile;
}
