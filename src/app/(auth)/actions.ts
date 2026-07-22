"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error: string | null };

/**
 * Sign in. ARCHITECTURE.md §3.20: no self-signup — the admin creates users, so
 * there is deliberately no sign-up action in this file.
 */
export async function signIn(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/dashboard");

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Deliberately vague: never reveal whether the address exists.
    return { error: "Those details don't match an account." };
  }

  // An auth user with no profile row, or a deactivated one, is not a user of
  // this system (§3.22 — the revocation switch must actually revoke).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("active, archived_at, role")
    .eq("id", user!.id)
    .single();

  if (!profile || !profile.active || profile.archived_at) {
    await supabase.auth.signOut();
    return { error: "This account is not active. Contact your administrator." };
  }

  revalidatePath("/", "layout");
  // Employees live on the call list; admins on the dashboard (§5.7).
  const home =
    next !== "/dashboard"
      ? next
      : profile.role === "employee"
        ? "/calls"
        : "/dashboard";
  redirect(home);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
