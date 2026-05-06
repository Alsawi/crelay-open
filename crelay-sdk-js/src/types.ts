/**
 * CRelay SDK — Type Definitions
 */

/** AES-256-GCM envelope wrapping an encrypted payload. */
export interface Envelope {
  /** Envelope version. Always `1`. */
  v: 1;
  /** Algorithm identifier. Always `"A256GCM"`. */
  alg: "A256GCM";
  /** Key identifier used for encryption. */
  kid: string;
  /** Base64-encoded 12-byte nonce. */
  nonce: string;
  /** Base64-encoded ciphertext (auth tag appended). */
  ciphertext: string;
  /** AAD context string bound to this envelope. */
  aadContext: string;
  /** Unix timestamp (milliseconds) when the envelope was created. */
  ts: number;
  /** Optional metadata attached by the caller. */
  meta?: Record<string, unknown>;
}

/** Options for constructing a {@link CRelayClient}. */
export interface CRelayClientOptions {
  /** API key for authenticating with the CRelay gateway. */
  apiKey: string;
  /** Base URL of the CRelay gateway instance (e.g. `https://gateway.example.com`). */
  baseUrl: string;
  /** Your tenant identifier. */
  tenantId: string;
  /** Key identifier matching the encryption key. */
  kid: string;
  /** Base64-encoded 256-bit AES key. */
  keyB64: string;
}

/** Input to {@link CRelayClient.secureRequest}. */
export interface SecureRequestInput {
  /** The target URL to forward the request to. */
  targetUrl: string;
  /** HTTP method (`"GET"`, `"POST"`, etc.). */
  method: string;
  /** Optional headers to forward with the request. */
  headers?: Record<string, string>;
  /** Payload to encrypt and send. */
  data: unknown;
  /** Optional AAD path override. Defaults to the path extracted from `targetUrl`. */
  aadPath?: string;
  /** Optional request identifier. Auto-generated if omitted. */
  requestId?: string;
}

/** Plaintext structure inside the encrypted envelope. */
export interface ProtectedPayload {
  /** The actual payload data. */
  data: unknown;
  /** Unix timestamp (milliseconds) when the payload was sealed. */
  timestamp: number;
  /** Unique request identifier for replay protection. */
  requestId: string;
}

/** Full response from CRelay, including the decrypted envelope. */
export interface CRelayResponse {
  /** The decrypted response data. */
  data: unknown;
  /** CRelay metadata. */
  _sg: {
    /** Key identifier used for the response envelope. */
    kid: string;
    /** Timestamp from the response envelope. */
    ts: number;
    /** Request ID echoed back. */
    requestId: string;
  };
}
