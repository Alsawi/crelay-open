declare module "@crelay/sdk" {
  export interface Envelope {
    v: 1;
    alg: "A256GCM";
    kid: string;
    nonce: string;
    ciphertext: string;
    aadContext: string;
    ts: number;
    meta?: Record<string, unknown>;
  }

  export interface CRelayClientOptions {
    apiKey: string;
    baseUrl: string;
    tenantId: string;
    kid: string;
    keyB64: string;
  }

  export interface SecureRequestInput {
    targetUrl: string;
    method: string;
    headers?: Record<string, string>;
    data: unknown;
    aadPath?: string;
    requestId?: string;
  }

  export interface CRelayResponse {
    data: unknown;
    _sg: {
      kid: string;
      ts: number;
      requestId: string;
    };
  }

  export class CRelayError extends Error {
    constructor(message: string, code: string, statusCode?: number);
    code: string;
    statusCode?: number;
  }

  export class CRelayClient {
    constructor(options: CRelayClientOptions);
    secureRequest(input: SecureRequestInput): Promise<CRelayResponse>;
  }

  export function buildRequestAad(method: string, path: string, tenantId: string): string;
  export function buildResponseAad(path: string, tenantId: string): string;
  export function encrypt(data: unknown, key: Buffer, kid: string, aadContext: string, requestId?: string): Envelope;
  export function decrypt(envelope: Envelope, key: Buffer, expectedAad: string): unknown;
  export function validateTimestamp(ts: number, maxStaleMs?: number): void;
  export function assertEnvelope(value: unknown): Envelope;
}
