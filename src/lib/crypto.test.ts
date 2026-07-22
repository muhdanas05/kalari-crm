import { describe, it, expect, beforeAll } from "vitest";
import { randomBytes } from "node:crypto";

/**
 * Crypto is the code you must never trust by reading. Every one of these
 * assertions is a property the rest of the system quietly relies on.
 */

let mod: typeof import("./crypto");

beforeAll(async () => {
  // Test keys, not the real ones — the real PII_ENCRYPTION_KEY must never be
  // needed to run the suite (and must never end up in CI).
  process.env.PII_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  process.env.PII_HASH_PEPPER = randomBytes(32).toString("base64");
  mod = await import("./crypto");
});

describe("AES-256-GCM — the schema's format", () => {
  it("round-trips", () => {
    expect(mod.decrypt(mod.encrypt("A1234567"))).toBe("A1234567");
  });

  it("handles unicode and long values", () => {
    const v = "Ahmed Al Balushi · جواز · " + "x".repeat(500);
    expect(mod.decrypt(mod.encrypt(v))).toBe(v);
  });

  it("lays out iv || ciphertext || authTag, as the column comment promises", () => {
    const blob = mod.encrypt("A1234567");
    // 12-byte IV + 16-byte tag + at least 1 byte of ciphertext
    expect(blob.length).toBe(12 + "A1234567".length + 16);
  });

  it("NEVER reuses an IV — reuse under GCM leaks the plaintext XOR", () => {
    const ivs = new Set(
      Array.from({ length: 200 }, () =>
        mod.encrypt("same input every time").subarray(0, 12).toString("hex"),
      ),
    );
    expect(ivs.size).toBe(200);
  });

  it("produces different ciphertext for identical plaintext", () => {
    expect(mod.encrypt("A1234567").toString("hex")).not.toBe(
      mod.encrypt("A1234567").toString("hex"),
    );
  });

  it("REFUSES tampered ciphertext rather than returning garbage", () => {
    const blob = mod.encrypt("A1234567");
    blob[20] ^= 0xff; // flip a bit in the ciphertext body
    expect(() => mod.decrypt(blob)).toThrow();
  });

  it("refuses a tampered auth tag", () => {
    const blob = mod.encrypt("A1234567");
    blob[blob.length - 1] ^= 0xff;
    expect(() => mod.decrypt(blob)).toThrow();
  });

  it("refuses a truncated blob", () => {
    expect(() => mod.decrypt(Buffer.alloc(8))).toThrow(/too short/);
  });

  it("cannot decrypt with a different key", async () => {
    const blob = mod.encrypt("A1234567");
    const original = process.env.PII_ENCRYPTION_KEY;
    process.env.PII_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    expect(() => mod.decrypt(blob)).toThrow();
    process.env.PII_ENCRYPTION_KEY = original;
  });
});

describe("key validation", () => {
  it("refuses a short key — AES-256 that isn't AES-256 must not be silent", () => {
    const original = process.env.PII_ENCRYPTION_KEY;
    process.env.PII_ENCRYPTION_KEY = Buffer.alloc(16).toString("base64");
    expect(() => mod.encrypt("x")).toThrow(/32 bytes/);
    process.env.PII_ENCRYPTION_KEY = original;
  });

  it("refuses a missing key", () => {
    const original = process.env.PII_ENCRYPTION_KEY;
    delete process.env.PII_ENCRYPTION_KEY;
    expect(() => mod.encrypt("x")).toThrow(/not set/);
    process.env.PII_ENCRYPTION_KEY = original;
  });
});

describe("blind index (§: exact-match lookup without decrypting)", () => {
  it("is stable for the same input", () => {
    expect(mod.blindIndex("A1234567").toString("hex")).toBe(
      mod.blindIndex("A1234567").toString("hex"),
    );
  });

  it("normalises before hashing, so formatting doesn't fork the index", () => {
    const canonical = mod.blindIndex("A1234567").toString("hex");
    for (const variant of ["a1234567", "A-123 4567", " a123-4567 "]) {
      expect(mod.blindIndex(variant).toString("hex")).toBe(canonical);
    }
  });

  it("differs for different passports", () => {
    expect(mod.blindIndex("A1234567").toString("hex")).not.toBe(
      mod.blindIndex("A1234568").toString("hex"),
    );
  });

  it("depends on the pepper — the DB alone must not be brute-forceable", () => {
    const before = mod.blindIndex("A1234567").toString("hex");
    const original = process.env.PII_HASH_PEPPER;
    process.env.PII_HASH_PEPPER = randomBytes(32).toString("base64");
    expect(mod.blindIndex("A1234567").toString("hex")).not.toBe(before);
    process.env.PII_HASH_PEPPER = original;
  });
});

describe("normalisePassport", () => {
  it.each([
    ["a-123 456", "A123456"],
    ["  A1234567  ", "A1234567"],
    ["p.1234.567", "P1234567"],
  ])("%s → %s", (input, expected) => {
    expect(mod.normalisePassport(input)).toBe(expected);
  });
});

describe("bytea round-trip (how PostgREST hands us bytes)", () => {
  it("survives \\x hex both ways", () => {
    const blob = mod.encrypt("A1234567");
    expect(mod.byteaToBuffer(mod.bufferToBytea(blob)).equals(blob)).toBe(true);
  });

  it("tolerates hex with no \\x prefix", () => {
    expect(mod.byteaToBuffer("deadbeef").toString("hex")).toBe("deadbeef");
  });

  it("decrypts a blob that has been through bytea", () => {
    const blob = mod.encrypt("A1234567");
    expect(mod.decrypt(mod.byteaToBuffer(mod.bufferToBytea(blob)))).toBe("A1234567");
  });
});

describe("safeEqual", () => {
  it("true for equal", () => {
    expect(mod.safeEqual(Buffer.from("abc"), Buffer.from("abc"))).toBe(true);
  });
  it("false for different", () => {
    expect(mod.safeEqual(Buffer.from("abc"), Buffer.from("abd"))).toBe(false);
  });
  it("false for different lengths, without throwing", () => {
    expect(mod.safeEqual(Buffer.from("ab"), Buffer.from("abc"))).toBe(false);
  });
});
