/**
 * CRelay SDK — Error Types
 */

/** Error codes used across the SDK. */
export type ErrorCode =
  | "SDK_ERROR"
  | "INVALID_CONFIGURATION"
  | "INVALID_KEY_LENGTH"
  | "INVALID_REQUEST"
  | "MALFORMED_ENVELOPE"
  | "KID_MISMATCH"
  | "AAD_MISMATCH"
  | "DECRYPT_FAILED"
  | "HTTP_ERROR"
  | "REPLAY_DETECTED"
  | "FRESHNESS_FAILED";

/**
 * Error thrown by the CRelay SDK.
 *
 * Carries a machine-readable `code` and an optional HTTP `statusCode`
 * when the error originated from a gateway HTTP response.
 */
export class CRelayError extends Error {
  /** Machine-readable error code. */
  public readonly code: ErrorCode;
  /** HTTP status code, if the error came from an HTTP response. */
  public readonly statusCode?: number;

  constructor(message: string, code: ErrorCode = "SDK_ERROR", statusCode?: number) {
    super(message);
    this.name = "CRelayError";
    this.code = code;
    if (statusCode !== undefined) {
      this.statusCode = statusCode;
    }
  }
}
