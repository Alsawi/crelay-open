/**
 * CRelay SDK — Cryptographic Primitives
 *
 * All operations use Node.js `crypto` with AES-256-GCM.
 * The key must be exactly 32 bytes (256 bits).
 */

import * as crypto from "node:crypto";
import { CRelayError } from "./errors.js";
import type { Envelope, ProtectedPayload } from "./types.js";

/** AES-256-GCM key length in bytes. */
const KEY_LEN = 32;
/** GCM nonce length in bytes. */
const NONCE_LEN = 12;
/** GCM authentication tag length in bytes. */
const TAG_LEN = 16;
/** Default maximum staleness for timestamp validation (5 minutes). */
const DEFAULT_MAX_STALE_MS = 5 * 60 * 1000;
/** Maximum allowed clock skew into the future (1 second). */
const MAX_FUTURE_MS = 1000;

/**
 * Encrypt a payload into an AES-256-GCM envelope.
 *
 * @param data       - Arbitrary JSON-serialisable data.
 * @param key        - 32-byte AES key.
 * @param kid        - Key identifier to embed in the envelope.
 * @param aadContext - AAD string (method:path:tenant or RESPONSE:path:tenant).
 * @param requestId  - Optional request identifier; auto-generated if omitted.
 * @returns A sealed {@link Envelope}.
 */
export function encrypt(
  data: unknown,
  key: Buffer,
  kid: string,
  aadContext: string,
  requestId?: string,
): Envelope {
  if (key.length !== KEY_LEN) {
    throw new CRelayError(
      `AES key must be ${KEY_LEN} bytes, got ${key.length}`,
      "INVALID_KEY_LENGTH",
    );
  }

  const nonce = crypto.randomBytes(NONCE_LEN);
  const payload: ProtectedPayload = {
    data,
    timestamp: Date.now(),
    requestId: requestId ?? crypto.randomUUID(),
  };

  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const aadBuf = Buffer.from(aadContext, "utf8");

  const cipher = crypto.createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(aadBuf);

  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  const ciphertext = Buffer.concat([encrypted, tag]);

  return {
    v: 1,
    alg: "A256GCM",
    kid,
    nonce: nonce.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    aadContext,
    ts: payload.timestamp,
  };
}

/**
 * Decrypt an AES-256-GCM envelope.
 *
 * @param envelope    - The sealed envelope.
 * @param key         - 32-byte AES key.
 * @param expectedAad - AAD string that must match `envelope.aadContext`.
 * @returns The decrypted payload data.
 */
export function decrypt(envelope: Envelope, key: Buffer, expectedAad: string): unknown {
  if (key.length !== KEY_LEN) {
    throw new CRelayError(
      `AES key must be ${KEY_LEN} bytes, got ${key.length}`,
      "INVALID_KEY_LENGTH",
    );
  }

  if (envelope.aadContext !== expectedAad) {
    throw new CRelayError(
      `AAD mismatch: expected "${expectedAad}", got "${envelope.aadContext}"`,
      "AAD_MISMATCH",
    );
  }

  const ciphertextBuf = Buffer.from(envelope.ciphertext, "base64");
  if (ciphertextBuf.length <= TAG_LEN) {
    throw new CRelayError("Ciphertext too short", "MALFORMED_ENVELOPE");
  }

  const body = ciphertextBuf.subarray(0, ciphertextBuf.length - TAG_LEN);
  const tag = ciphertextBuf.subarray(ciphertextBuf.length - TAG_LEN);

  const nonce = Buffer.from(envelope.nonce, "base64");
  const aadBuf = Buffer.from(envelope.aadContext, "utf8");

  let payload: ProtectedPayload;
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, nonce);
    decipher.setAAD(aadBuf);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([decipher.update(body), decipher.final()]);
    payload = JSON.parse(decrypted.toString("utf8")) as ProtectedPayload;
  } catch (err) {
    throw new CRelayError(
      `Decryption failed: ${(err as Error).message}`,
      "DECRYPT_FAILED",
    );
  }

  return payload.data;
}

/**
 * Validate a timestamp for freshness.
 *
 * Rejects timestamps older than `maxStaleMs` (default 5 min) or more than
 * 1 second in the future.
 *
 * @param ts         - Unix timestamp in milliseconds.
 * @param maxStaleMs - Maximum age in milliseconds (default 300 000).
 */
export function validateTimestamp(ts: number, maxStaleMs: number = DEFAULT_MAX_STALE_MS): void {
  const now = Date.now();

  if (ts > now + MAX_FUTURE_MS) {
    throw new CRelayError(
      `Timestamp is in the future: ${ts} > ${now + MAX_FUTURE_MS}`,
      "FRESHNESS_FAILED",
    );
  }

  if (now - ts > maxStaleMs) {
    throw new CRelayError(
      `Timestamp too old: ${now - ts}ms staleness exceeds ${maxStaleMs}ms limit`,
      "FRESHNESS_FAILED",
    );
  }
}

/**
 * Runtime type guard that asserts `input` is a valid {@link Envelope}.
 *
 * @param input - Value to validate.
 * @returns The validated Envelope.
 * @throws {CRelayError} with code `MALFORMED_ENVELOPE` on failure.
 */
export function assertEnvelope(input: unknown): Envelope {
  if (typeof input !== "object" || input === null) {
    throw new CRelayError("Envelope must be an object", "MALFORMED_ENVELOPE");
  }

  const obj = input as Record<string, unknown>;

  if (obj.v !== 1) {
    throw new CRelayError(`Envelope version must be 1, got ${obj.v}`, "MALFORMED_ENVELOPE");
  }

  if (obj.alg !== "A256GCM") {
    throw new CRelayError(
      `Envelope algorithm must be "A256GCM", got "${obj.alg}"`,
      "MALFORMED_ENVELOPE",
    );
  }

  if (typeof obj.kid !== "string" || !obj.kid) {
    throw new CRelayError('Envelope must have a non-empty "kid" string', "MALFORMED_ENVELOPE");
  }

  if (typeof obj.nonce !== "string" || !obj.nonce) {
    throw new CRelayError('Envelope must have a non-empty "nonce" string', "MALFORMED_ENVELOPE");
  }

  if (typeof obj.ciphertext !== "string" || !obj.ciphertext) {
    throw new CRelayError('Envelope must have a non-empty "ciphertext" string', "MALFORMED_ENVELOPE");
  }

  if (typeof obj.aadContext !== "string" || !obj.aadContext) {
    throw new CRelayError('Envelope must have a non-empty "aadContext" string', "MALFORMED_ENVELOPE");
  }

  if (typeof obj.ts !== "number") {
    throw new CRelayError('Envelope must have a numeric "ts" field', "MALFORMED_ENVELOPE");
  }

  return input as Envelope;
}
