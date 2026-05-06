/**
 * CRelay SDK — Public API
 *
 * This barrel file re-exports the SDK public surface.
 */

export { CRelayClient } from "./client.js";
export { CRelayError } from "./errors.js";
export type { ErrorCode } from "./errors.js";
export { buildRequestAad, buildResponseAad } from "./aad.js";
export { encrypt, decrypt, validateTimestamp, assertEnvelope } from "./crypto.js";
export type {
  Envelope,
  CRelayClientOptions,
  SecureRequestInput,
  ProtectedPayload,
  CRelayResponse,
} from "./types.js";
