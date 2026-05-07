import { CRelayError } from "@crelay/sdk";

export const GATEWAY_ERROR_EXPLANATIONS = {
  AUTH_MISSING_API_KEY:
    "CRELAY_API_KEY was not sent. Set CRELAY_API_KEY in .env.crelay or your shell environment.",
  AUTH_INVALID_API_KEY:
    "The gateway rejected CRELAY_API_KEY. Check that the key is active for this tenant and environment.",
  TARGET_NOT_ALLOWED:
    "The target URL is not allowed for this tenant. Check the configured target origin and gateway allowlist.",
  ENVELOPE_INVALID:
    "The secure payload envelope is malformed. Confirm the CLI and gateway are using compatible CRelay protocol versions.",
  KEY_UNKNOWN:
    "The gateway does not know this kid. Check CRELAY_KID and the tenant key configuration.",
  DECRYPT_FAILED:
    "The gateway or SDK could not decrypt the envelope. Check CRELAY_KEY_B64, CRELAY_KID, and payload integrity.",
  AAD_MISMATCH:
    "The encrypted payload context did not match the target method/path/tenant. Check --method, --path, target URL, and tenantId.",
  REPLAY_DETECTED:
    "The gateway detected a duplicate request. Retry with a fresh request instead of replaying the same envelope.",
  REQUEST_STALE:
    "The request timestamp is outside the freshness window. Check local clock skew and retry.",
  REQUEST_FROM_FUTURE:
    "The request timestamp is ahead of the gateway clock. Check local clock skew and retry.",
  PAYLOAD_TOO_LARGE:
    "The encrypted payload exceeds the gateway size limit. Reduce the body size or use a smaller test payload.",
  UPSTREAM_TIMEOUT:
    "The gateway reached the target but the upstream timed out. Check upstream latency and availability.",
  UPSTREAM_ERROR:
    "The gateway could not complete the upstream request. Test the target directly and check upstream logs.",
  RESPONSE_ENCRYPT_FAILED:
    "The gateway failed while encrypting the upstream response. Check gateway logs and key configuration.",
  RATE_LIMITED:
    "The gateway rate-limited this request. Wait and retry, or lower request volume.",
} as const;

export type GatewayFailureCode = keyof typeof GATEWAY_ERROR_EXPLANATIONS;

const KNOWN_CODES = Object.keys(GATEWAY_ERROR_EXPLANATIONS) as GatewayFailureCode[];

export interface FailureExplanation {
  code: GatewayFailureCode | "UNKNOWN";
  message: string;
}

export function explainFailure(err: unknown): FailureExplanation {
  const code = detectFailureCode(err);
  if (code) {
    return {
      code,
      message: GATEWAY_ERROR_EXPLANATIONS[code],
    };
  }

  return {
    code: "UNKNOWN",
    message:
      "The secure request failed. Check the gateway response, network reachability, tenantId, kid, target URL, and key material.",
  };
}

export function detectFailureCode(err: unknown): GatewayFailureCode | undefined {
  if (err instanceof CRelayError) {
    if (err.code === "AAD_MISMATCH" || err.code === "DECRYPT_FAILED" || err.code === "REPLAY_DETECTED") {
      return err.code;
    }
    if (err.code === "FRESHNESS_FAILED") {
      return "REQUEST_STALE";
    }
    if (err.statusCode === 401) {
      return "AUTH_INVALID_API_KEY";
    }
    if (err.statusCode === 403) {
      return "TARGET_NOT_ALLOWED";
    }
    if (err.statusCode === 409) {
      return "REPLAY_DETECTED";
    }
  }

  const text = err instanceof Error ? err.message : String(err);
  for (const code of KNOWN_CODES) {
    if (text.includes(code)) {
      return code;
    }
  }

  if (text.includes("REQUEST_FROM_FUTURE")) {
    return "REQUEST_FROM_FUTURE";
  }

  if (text.includes("FRESHNESS_FAILED")) {
    return "REQUEST_STALE";
  }

  return undefined;
}
