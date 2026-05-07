import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sanitizeSecrets } from "../src/safety.js";

describe("safe output", () => {
  it("does not include raw secrets after sanitization", () => {
    const apiKey = "sk_live_super_secret";
    const keyB64 = "qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqo=";
    const output = sanitizeSecrets(`failed with ${apiKey} and ${keyB64}`, [apiKey, keyB64]);

    assert.equal(output.includes(apiKey), false);
    assert.equal(output.includes(keyB64), false);
    assert.match(output, /\[masked\]/);
  });
});
