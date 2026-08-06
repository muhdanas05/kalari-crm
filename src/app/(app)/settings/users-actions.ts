"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/session";
import type { Database } from "@/lib/supabase/database.types";

type Role = Database["public"]["Enums"]["user_role"];

export type Result = { ok: true } | { ok: false; error: string };

/**
 * Create a login. Uses the admin API — there's no session to attribute this
 * to (the new user hasn't logged in yet) — the one case lib/supabase/admin.ts
 * documents as legitimate. requireAdmin() is the real gate; the client can't
 * reach this action at all unless the signed-in user already is one.
 */
export async function createUser(input: {
  email: string;
  password: string;
  name: string;
  role: Role;
}): Promise<Result> {
  await requireAdmin();

  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  if (!email || !name) return { ok: false, error: "Name and email are required." };
  if (input.password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
  });
  if (error) return { ok: false, error: error.message };

  const { error: profileError } = await admin
    .from("profiles")
    .upsert(
      { id: data.user.id, name, email, role: input.role, active: true },
      { onConflict: "id" },
    );
  if (profileError) {
    // Don't leave a login with no profile — RLS resolves to "nobody" for it,
    // which reads as a confusing silent failure rather than an error.
    await admin.auth.admin.deleteUser(data.user.id);
    return { ok: false, error: profileError.message };
  }

  revalidatePath("/settings");
  return { ok: true };
}

/** Role and/or active, in one call — admin_set_user() is the real gate too. */
export async function setUserRoleActive(
  userId: string,
  input: { role?: Role; active?: boolean },
): Promise<Result> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_user", {
    p_user_id: userId,
    p_active: input.active ?? undefined,
    p_role: input.role ?? undefined,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/settings");
  return { ok: true };
}
