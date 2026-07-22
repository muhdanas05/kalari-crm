import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth/session";

/**
 * Root. Employees land on their call list, admins on the dashboard (§5.7 — the
 * call list is the employee's home screen, not a sub-page).
 */
export default async function RootPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  redirect(profile.role === "employee" ? "/calls" : "/dashboard");
}
