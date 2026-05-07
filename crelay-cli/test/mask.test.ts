import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { maskSecret } from "../src/mask.js";

describe("maskSecret", () => {
  it("does not reveal short secrets", () => {
    assert.strictEqual(maskSecret("abc123"), "******");
  });

  it("keeps only prefix and suffix for longer secrets", () => {
    assert.strictEqual(
      maskSecret("crelay_test_secret_abcdefghijklmnopqrstuvwxyz"),
      "cre...wxyz"
    );
  });

  it("reports missing values without exposing anything", () => {
    assert.strictEqual(maskSecret(undefined), "<missing>");
  });
});