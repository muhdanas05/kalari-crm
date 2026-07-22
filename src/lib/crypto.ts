import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

/**
 * AES-256-GCM, in Node, with the key from the environment.
 *
 * The schema specifies the format, so this implements it rather than inventing
 * one (private.customer_pii.passport_no_ciphertext):
 *
 *   "AES-256-GCM: iv || ciphertext || authTag. Encrypted in Node, never in PG."
 *
 * WHY NOT pgcrypto: verified on this project — pgsodium is not installed and its
 * Transparent Column Encryption is deprecated. More importantly, a key held in
 * the database (or in Vault) lives in the same backup as the ciphertext, so a
 * dump would contain both. Keeping the key in the environment is what makes
 * "a leaked service_role key is not sufficient to read a passport" true rather
 * than aspirational (ARCHITECTURE.md §4).
 *
 * ⚠️ KEY ESCROW IS MANDATORY. Lose PII_ENCRYPTION_KEY and every passport and
 * portal token is unrecoverable from every backup and every PITR restore,
 * permanently. Do not rotate it in place — that is what key_version is for.
 */

/** Bump when the key changes; stored alongside each ciphertext. */
export const CURRENT_KEY_VERSION = 1;

const IV_BYTES = 12; // GCM standard. 96 bits is the only size with a proof.
const TAG_BYTES = 16;

function key(): Buffer {
  const raw = process.env.PII_ENCRYPTION_KEY;
  if (!raw) throw new Error("PII_ENCRYPTION_KEY is not set");
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) {
    throw new Error(
      `PII_ENCRYPTION_KEY must be 32 bytes base64 (got ${buf.length}). ` +
        `A short key means AES-256 silently isn't AES-256.`,
    );
  }
  return buf;
}

function pepper(): Buffer {
  const raw = process.env.PII_HASH_PEPPER;
  if (!raw) throw new Error("PII_HASH_PEPPER is not set");
  return Buffer.from(raw, "base64");
}

/** Encrypt to the schema's format: iv || ciphertext || authTag. */
export function encrypt(plaintext: string): Buffer {
  // A fresh IV per encryption. Reusing one under GCM is catastrophic — it leaks
  // the plaintext XOR, not just "weakens" it.
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, ct, cipher.getAuthTag()]);
}

/**
 * Decrypt the schema's format. Throws if the ciphertext was tampered with —
 * GCM authenticates, so a modified blob fails rather than returning garbage.
 */
export function decrypt(blob: Buffer): string {
  if (blob.length < IV_BYTES + TAG_BYTES + 1) {
    throw new Error("ciphertext too short to be valid");
  }
  const iv = blob.subarray(0, IV_BYTES);
  const tag = blob.subarray(blob.length - TAG_BYTES);
  const ct = blob.subarray(IV_BYTES, blob.length - TAG_BYTES);

  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

/**
 * The blind index: keyed HMAC-SHA256 over the normalised value + a server-side
 * pepper. Lets us find a passport by exact match without decrypting anything.
 *
 * Peppered because a bare SHA of a passport number is trivially brute-forced —
 * the keyspace is tiny and structured (a few letters and 6-8 digits). An
 * attacker with the database but not the pepper cannot enumerate it.
 */
export function blindIndex(value: string): Buffer {
  return createHmac("sha256", pepper())
    .update(normalisePassport(value))
    .digest();
}

/** Upper-case, strip anything that isn't alphanumeric. "a-123 456" → "A123456". */
export function normalisePassport(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Constant-time compare, for anything secret. */
export function safeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Postgres bytea over PostgREST is `\xdeadbeef` hex. */
export function byteaToBuffer(hex: string): Buffer {
  return Buffer.from(hex.startsWith("\\x") ? hex.slice(2) : hex, "hex");
}

export function bufferToBytea(buf: Buffer): string {
  return "\\x" + buf.toString("hex");
}
