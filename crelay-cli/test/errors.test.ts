import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CRelayError } from "@crelay/sdk";
import { detectFailureCode, explainFailure, GATEWAY_ERROR_EXPLANATIONS } from "../src/errors.js";

describe("gateway error explanation", () => {
  it("detects explicit gateway codes in HTTP error bodies", () => {
    const err = new CRelayError(
      'Gateway returned 403: {"error":{"code":"TARGET_NOT_ALLOWED"}}',
      "HTTP_ERROR",
      403,
    );

    assert.strictEqual(detectFailureCode(err), "TARGET_NOT_ALLOWED");
    assert.match(explainFailure(err).message, /target URL is not allowed/i);
  });

  it("maps SDK freshness failures to REQUEST_STALE", () => {
    const err = new CRelayError("Envelope timestamp is stale", "FRESHNESS_FAILED");
    assert.strictEqual(detectFailureCode(err), "REQUEST_STALE");
  });

  it("uses HTTP 401 as AUTH_INVALID_API_KEY when no code is present", () => {
    const err = new CRelayError("Gateway returned 401: Authentication failed.", "HTTP_ERROR", 401);
    assert.strictEqual(detectFailureCode(err), "AUTH_INVALID_API_KEY");
  });

  it("maps all known gateway errors to human-readable fixes", () => {
    for (const code of Object.keys(GATEWAY_ERROR_EXPLANATIONS)) {
      const explanation = explainFailure(new Error(`Gateway returned error ${code}`));
      assert.strictEqual(explanation.code, code);
      assert.notStrictEqual(explanation.message, "");
    }
  });
});
