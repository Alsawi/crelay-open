/**
 * CRelay SDK — Main Client
 *
 * The {@link CRelayClient} is the primary entry point for the SDK.
 * It handles encryption, HTTP forwarding, and response decryption.
 */

import * as crypto from "node:crypto";
import { CRelayError } from "./errors.js";
import { buildRequestAad, buildResponseAad } from "./aad.js";
import { encrypt, decrypt, assertEnvelope, validateTimestamp } from "./crypto.js";
import type {
  Envelope,
  CRelayClientOptions,
  CRelayResponse,
  SecureRequestInput,
} from "./types.js";

/** AES-256 key length in bytes. */
const KEY_LEN = 32;

/**
 * Client for interacting with a CRelay gateway instance.
 *
 * Encrypts outgoing request payloads with AES-256-GCM and decrypts
 * response envelopes, enforcing AAD binding, freshness, and key validation.
 *
 * @example
 * ```ts
 * const client = new CRelayClient({
 *   apiKey: "sg_live_…",
 *   baseUrl: "https://gateway.example.com",
 *   tenantId: "tenant_42",
 *   kid: "key_v1",
 *   keyB64: "dGVzdC1rZXktMzItYnl0ZXMtbG9uZy1rZXk=",
 * });
 *
 * const result = await client.secureRequest({
 *   targetUrl: "https://api.example.com/internal/transfer",
 *   method: "POST",
 *   data: { amount: 1000 },
 * });
 * ```
 */
export class CRelayClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly tenantId: string;
  private readonly kid: string;
  private readonly key: Buffer;

  /**
   * Create a new CRelayClient.
   *
   * @param opts - Client configuration options.
   * @throws {CRelayError} If any required option is missing or the key is invalid.
   */
  constructor(opts: CRelayClientOptions) {
    if (!opts.apiKey) {
      throw new CRelayError("apiKey is required", "INVALID_CONFIGURATION");
    }
    if (!opts.baseUrl) {
      throw new CRelayError("baseUrl is required", "INVALID_CONFIGURATION");
    }
    if (!opts.tenantId) {
      throw new CRelayError("tenantId is required", "INVALID_CONFIGURATION");
    }
    if (!opts.kid) {
      throw new CRelayError("kid is required", "INVALID_CONFIGURATION");
    }
    if (!opts.keyB64) {
      throw new CRelayError("keyB64 is required", "INVALID_CONFIGURATION");
    }

    this.apiKey = opts.apiKey;
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.tenantId = opts.tenantId;
    this.kid = opts.kid;

    let keyBuf: Buffer;
    try {
      keyBuf = Buffer.from(opts.keyB64, "base64");
    } catch {
      throw new CRelayError("keyB64 is not valid Base64", "INVALID_CONFIGURATION");
    }

    if (keyBuf.length !== KEY_LEN) {
      throw new CRelayError(
        `AES key must decode to ${KEY_LEN} bytes, got ${keyBuf.length}`,
        "INVALID_KEY_LENGTH",
      );
    }

    this.key = keyBuf;
  }

  /**
   * Send a securely encrypted request through the CRelay gateway.
   *
   * The payload is encrypted client-side, forwarded to the gateway, and the
   * response envelope is decrypted and validated before returning.
   *
   * @param request - The request parameters.
   * @returns The decrypted response data.
   * @throws {CRelayError} On encryption, HTTP, or decryption errors.
   */
  async secureRequest(request: SecureRequestInput): Promise<CRelayResponse> {
    if (!request.targetUrl) {
      throw new CRelayError("targetUrl is required", "INVALID_REQUEST");
    }
    if (!request.method) {
      throw new CRelayError("method is required", "INVALID_REQUEST");
    }

    // Derive path from targetUrl for AAD binding
    let path: string;
    try {
      const url = new URL(request.targetUrl);
      path = url.pathname;
    } catch {
      throw new CRelayError(
        `Invalid targetUrl: ${request.targetUrl}`,
        "INVALID_REQUEST",
      );
    }

    // Allow caller to override the AAD path
    const aadPath = request.aadPath ?? path;
    const requestId = request.requestId ?? crypto.randomUUID();

    // Build request AAD and encrypt
    const requestAad = buildRequestAad(request.method, aadPath, this.tenantId);
    const envelope = this.encryptPayload(request.data, requestAad, requestId);

    // POST to the gateway
    const response = await this.forwardRequest({
      targetUrl: request.targetUrl,
      method: request.method,
      headers: request.headers,
      envelope,
      requestId,
    });

    // Validate and decrypt the response envelope
    const responseEnvelope = assertEnvelope(response);
    validateTimestamp(responseEnvelope.ts);

    if (responseEnvelope.kid !== this.kid) {
      throw new CRelayError(
        `Response kid mismatch: expected "${this.kid}", got "${responseEnvelope.kid}"`,
        "KID_MISMATCH",
      );
    }

    const responseAad = buildResponseAad(aadPath, this.tenantId);
    const data = this.decryptEnvelope(responseEnvelope, responseAad);

    return {
      data,
      _sg: {
        kid: responseEnvelope.kid,
        ts: responseEnvelope.ts,
        requestId,
      },
    };
  }

  // ── Private helpers ────────────────────────────────────────────────────

  /** Encrypt a payload using the client's key and kid. */
  private encryptPayload(data: unknown, aadContext: string, requestId: string): Envelope {
    return encrypt(data, this.key, this.kid, aadContext, requestId);
  }

  /** Decrypt an envelope using the client's key. */
  private decryptEnvelope(envelope: Envelope, expectedAad: string): unknown {
    return decrypt(envelope, this.key, expectedAad);
  }

  /** Send the encrypted request to the gateway. */
  private async forwardRequest(params: {
    targetUrl: string;
    method: string;
    headers?: Record<string, string>;
    envelope: Envelope;
    requestId: string;
  }): Promise<unknown> {
    const url = `${this.baseUrl}/secure/forward`;
    const body = {
      targetUrl: params.targetUrl,
      method: params.method,
      headers: params.headers,
      envelope: params.envelope,
    };

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.apiKey,
          "x-request-id": params.requestId,
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new CRelayError(
        `HTTP request failed: ${(err as Error).message}`,
        "HTTP_ERROR",
      );
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new CRelayError(
        `Gateway returned ${res.status}: ${text}`,
        "HTTP_ERROR",
        res.status,
      );
    }

    try {
      return await res.json();
    } catch {
      throw new CRelayError(
        "Gateway returned invalid JSON",
        "MALFORMED_ENVELOPE",
      );
    }
  }
}
