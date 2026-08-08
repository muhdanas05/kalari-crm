import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { PageKey } from "@/lib/auth/pages";

export type UserRow = {
  id: string;
  name: string;
  email: string | null;
  role: "admin" | "employee";
  active: boolean;
  permissions: PageKey[];
};

/** Every login on this CRM. Admin-only — gated by the page, not by RLS alone. */
export async function listUsers(): Promise<UserRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, name, email, role, active, permissions")
    .is("archived_at", null)
    .order("role")
    .order("name");
  return (data ?? []) as UserRow[];
}
