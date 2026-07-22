import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { encrypt, decrypt, byteaToBuffer, bufferToBytea, CURRENT_KEY_VERSION } from "@/lib/crypto";

/**
 * Portal token minting and retrieval.
 *
 * Three columns, three jobs:
 *   portal_token_hash       — SHA-256. The lookup index. portal_read() hashes the
 *                             incoming token and matches on this. One-way (§3.26).
 *   portal_token_ciphertext — AES-256-GCM of the raw token. Lets US rebuild the
 *                             link for an email without changing it. Same scheme
 *                             as passports: key in the env, never in Postgres.
 *   portal_token_key_version— which key encrypted it.
 *
 * Why not just store the raw token: a service_role leak would then hand over
 * every customer's portal link. Why not only the hash: then no automated email
 * could ever include the link, which is the entire point of the case-open
 * message.
 */

function siteUrl(): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL;
  if (!base) {
    // Silently emitting http://localhost links into a customer's inbox is worse
    // than not sending. Fail loudly at the seam.
    throw new Error(
      "NEXT_PUBLIC_SITE_URL is not set — portal links would point at nothing.",
    );
  }
  return base.replace(/\/$/, "");
}

export function portalUrlFor(token: string): string {
  return `${siteUrl()}/portal/${token}`;
}

function hashToken(token: string): Buffer {
  return createHash("sha256").update(token).digest();
}

/**
 * Mint a NEW token, replacing any existing one.
 *
 * This REVOKES the old link — any URL already in the customer's inbox stops
 * working. That is correct for a deliberate re-issue (the customer forwarded it
 * to someone, or you want it dead), and wrong as a side effect of sending an
 * email. Use getOrCreatePortalUrl() for the latter.
 */
export async function mintPortalToken(
  customerId: string,
): Promise<{ token: string; url: string }> {
  const token = randomBytes(32).toString("hex");
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("customers")
    .update({
      portal_token_hash: bufferToBytea(hashToken(token)),
      portal_token_ciphertext: bufferToBytea(encrypt(token)),
      portal_token_key_version: CURRENT_KEY_VERSION,
      portal_issued_at: new Date().toISOString(),
      portal_revoked_at: null,
    })
    .eq("id", customerId);

  if (error) throw new Error(`Could not issue a portal token: ${error.message}`);
  return { token, url: portalUrlFor(token) };
}

/**
 * The customer's portal URL — the SAME one every time.
 *
 * Decrypts the stored token if there is one, mints one if there isn't. This is
 * what every automated email calls, so it must be stable: a customer who gets
 * three emails over two months should find all three links still work.
 *
 * Returns null if the token was revoked — a revoked customer should not be
 * silently re-issued by an automated email.
 */
export async function getOrCreatePortalUrl(
  customerId: string,
): Promise<string | null> {
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("customers")
    .select("portal_token_ciphertext, portal_revoked_at, archived_at")
    .eq("id", customerId)
    .maybeSingle();

  if (!data || data.archived_at) return null;
  if (data.portal_revoked_at) return null;

  if (data.portal_token_ciphertext) {
    try {
      const token = decrypt(byteaToBuffer(data.portal_token_ciphertext as string));
      return portalUrlFor(token);
    } catch {
      // Undecryptable: either the key changed or this row predates the
      // ciphertext column (the seeded customers have a hash and nothing else).
      // Minting a fresh one is safe — nobody could have been using a link we
      // cannot reconstruct.
    }
  }

  const { url } = await mintPortalToken(customerId);
  return url;
}
