"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error: string | null };

/**
 * `next` arrives from a query param, so it is attacker-controlled. Without this
 * check, /login?next=https://evil.example renders the genuine login page and
 * then hands the freshly-signed-in user to another origin — a credential-
 * phishing lever aimed at exactly the handful of staff accounts that exist.
 *
 * Only a site-relative single-slash path is allowed. `//evil.example` is a
 * protocol-relative URL, which is why the second character is checked too.
 */
function safeNext(raw: string): string {
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/dashboard";
  return raw;
}

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
  const next = safeNext(String(formData.get("next") ?? "/dashboard"));

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
  redirect(next);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
