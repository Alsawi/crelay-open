/**
 * CRelay SDK — Crypto Test Suite
 *
 * 18 tests covering encrypt/decrypt, AAD binding, envelope validation,
 * timestamp freshness, and error code correctness.
 *
 * Uses node:test and node:assert/strict — no external test framework.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  encrypt,
  decrypt,
  assertEnvelope,
  validateTimestamp,
} from "../src/crypto.js";
import { buildRequestAad, buildResponseAad } from "../src/aad.js";
import { CRelayError } from "../src/errors.js";
import type { Envelope } from "../src/types.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Generate a valid 32-byte AES key. */
function makeKey(): Buffer {
  return Buffer.alloc(32, 0xab); // deterministic for tests
}

const KID = "test-key-001";
const TENANT = "tenant_test";

// ── 1. Encrypt/decrypt round trip ────────────────────────────────────────────

describe("encrypt + decrypt", () => {
  it("encrypt/decrypt round trip", () => {
    const key = makeKey();
    const aad = buildRequestAad("POST", "/transfer", TENANT);
    const envelope = encrypt({ amount: 1000 }, key, KID, aad);
    const result = decrypt(envelope, key, aad);
    assert.deepStrictEqual(result, { amount: 1000 });
  });

  it("wrong AAD fails decrypt", () => {
    const key = makeKey();
    const aad = buildRequestAad("POST", "/transfer", TENANT);
    const envelope = encrypt({ amount: 1000 }, key, KID, aad);
    assert.throws(
      () => decrypt(envelope, key, "POST:/other:tenant_test"),
      (err: unknown) => err instanceof CRelayError && err.code === "AAD_MISMATCH",
    );
  });

  it("ciphertext tampering fails decrypt", () => {
    const key = makeKey();
    const aad = buildRequestAad("POST", "/transfer", TENANT);
    const envelope = encrypt({ amount: 1000 }, key, KID, aad);

    // Tamper with the ciphertext
    const tampered: Envelope = { ...envelope, ciphertext: envelope.ciphertext.slice(0, -4) + "AAAA" };
    assert.throws(
      () => decrypt(tampered, key, aad),
      (err: unknown) => err instanceof CRelayError && err.code === "DECRYPT_FAILED",
    );
  });

  it("response AAD decrypt works", () => {
    const key = makeKey();
    const aad = buildResponseAad("/transfer", TENANT);
    const envelope = encrypt({ status: "ok" }, key, KID, aad);
    const result = decrypt(envelope, key, aad);
    assert.deepStrictEqual(result, { status: "ok" });
  });

  it("encrypt rejects wrong key length", () => {
    const badKey = Buffer.alloc(16); // too short
    const aad = buildRequestAad("POST", "/transfer", TENANT);
    assert.throws(
      () => encrypt({ data: 1 }, badKey, KID, aad),
      (err: unknown) => err instanceof CRelayError && err.code === "INVALID_KEY_LENGTH",
    );
  });

  it("decrypt rejects wrong key length", () => {
    const key = makeKey();
    const aad = buildRequestAad("POST", "/transfer", TENANT);
    const envelope = encrypt({ data: 1 }, key, KID, aad);
    const badKey = Buffer.alloc(16);
    assert.throws(
      () => decrypt(envelope, badKey, aad),
      (err: unknown) => err instanceof CRelayError && err.code === "INVALID_KEY_LENGTH",
    );
  });
});

// ── 2. assertEnvelope validation ─────────────────────────────────────────────

describe("assertEnvelope", () => {
  const validEnvelope: Envelope = {
    v: 1,
    alg: "A256GCM",
    kid: "key-1",
    nonce: "dGVzdC1ub25jZQ==",
    ciphertext: "dGVzdC1jaXBoZXJ0ZXh0",
    aadContext: "POST:/path:tenant1",
    ts: Date.now(),
  };

  it("assertEnvelope rejects null", () => {
    assert.throws(
      () => assertEnvelope(null),
      (err: unknown) => err instanceof CRelayError && err.code === "MALFORMED_ENVELOPE",
    );
  });

  it("assertEnvelope rejects non-object", () => {
    assert.throws(
      () => assertEnvelope("not an object"),
      (err: unknown) => err instanceof CRelayError && err.code === "MALFORMED_ENVELOPE",
    );
  });

  it("assertEnvelope rejects unsupported version", () => {
    const bad: Envelope = { ...validEnvelope, v: 2 as 1 };
    assert.throws(
      () => assertEnvelope(bad),
      (err: unknown) => err instanceof CRelayError && err.code === "MALFORMED_ENVELOPE",
    );
  });

  it("assertEnvelope rejects unsupported alg", () => {
    const bad = { ...validEnvelope, alg: "RSA-OAEP" };
    assert.throws(
      () => assertEnvelope(bad),
      (err: unknown) => err instanceof CRelayError && err.code === "MALFORMED_ENVELOPE",
    );
  });

  it("assertEnvelope rejects missing kid", () => {
    const bad = { ...validEnvelope, kid: "" };
    assert.throws(
      () => assertEnvelope(bad),
      (err: unknown) => err instanceof CRelayError && err.code === "MALFORMED_ENVELOPE",
    );
  });

  it("assertEnvelope accepts valid envelope", () => {
    const result = assertEnvelope(validEnvelope);
    assert.deepStrictEqual(result, validEnvelope);
  });
});

// ── 3. validateTimestamp ─────────────────────────────────────────────────────

describe("validateTimestamp", () => {
  it("validateTimestamp accepts current timestamp", () => {
    // Should not throw
    validateTimestamp(Date.now());
  });

  it("validateTimestamp rejects stale timestamp", () => {
    const stale = Date.now() - 6 * 60 * 1000; // 6 minutes old (exceeds 5 min default)
    assert.throws(
      () => validateTimestamp(stale),
      (err: unknown) => err instanceof CRelayError && err.code === "FRESHNESS_FAILED",
    );
  });

  it("validateTimestamp rejects future timestamp", () => {
    const future = Date.now() + 10_000; // 10 seconds in the future
    assert.throws(
      () => validateTimestamp(future),
      (err: unknown) => err instanceof CRelayError && err.code === "FRESHNESS_FAILED",
    );
  });
});

// ── 4. AAD builders ─────────────────────────────────────────────────────────

describe("AAD builders", () => {
  it("buildRequestAad returns METHOD:/path:tenantId", () => {
    const aad = buildRequestAad("POST", "/transfer", "tenant_42");
    assert.strictEqual(aad, "POST:/transfer:tenant_42");
  });

  it("buildRequestAad uppercases method", () => {
    const aad = buildRequestAad("post", "/transfer", "tenant_42");
    assert.strictEqual(aad, "POST:/transfer:tenant_42");
  });

  it("buildResponseAad returns RESPONSE:/path:tenantId", () => {
    const aad = buildResponseAad("/transfer", "tenant_42");
    assert.strictEqual(aad, "RESPONSE:/transfer:tenant_42");
  });
});
