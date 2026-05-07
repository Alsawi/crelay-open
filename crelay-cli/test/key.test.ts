import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateKeyB64 } from "../src/key.js";

describe("validateKeyB64", () => {
  it("accepts base64 that decodes to 32 bytes", () => {
    const result = validateKeyB64(Buffer.alloc(32, 0xab).toString("base64"));
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.byteLength, 32);
  });

  it("rejects invalid base64", () => {
    const result = validateKeyB64("not valid base64!");
    assert.strictEqual(result.ok, false);
    assert.match(result.message, /not valid Base64/);
  });

  it("rejects keys that do not decode to 32 bytes", () => {
    const result = validateKeyB64(Buffer.alloc(16, 0xab).toString("base64"));
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.byteLength, 16);
    assert.match(result.message, /32 bytes/);
  });
});
