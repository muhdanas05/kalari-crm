"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/session";

export type TokenResult = { ok: true; url: string } | { ok: false; error: string };

/**
 * Issue (or re-issue) a customer's portal link.
 *
 * §3.26: portal tokens are credentials — store a hash, show the token once.
 * The raw token is generated inside the database and returned exactly once, in
 * this response. It is never stored anywhere we can read it back: the column
 * holds a SHA-256. If the customer loses the link, you re-issue, which revokes
 * and replaces the old one.
 */
export async function issuePortalLink(customerId: string): Promise<TokenResult> {
  await requireProfile();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("issue_portal_token", {
    p_customer_id: customerId,
  });

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Could not issue a link." };
  }

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  revalidatePath(`/customers/${customerId}`);
  return { ok: true, url: `${base}/portal/${data}` };
}

export async function revokePortalLink(
  customerId: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireProfile();
  const supabase = await createClient();

  const { error } = await supabase.rpc("revoke_portal_token", {
    p_customer_id: customerId,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath(`/customers/${customerId}`);
  return { ok: true };
}
