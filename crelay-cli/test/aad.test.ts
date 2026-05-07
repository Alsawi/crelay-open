import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calculateAad } from "../src/aad.js";

describe("AAD calculation", () => {
  it("calculates request and response AAD using method, path, and tenant", () => {
    assert.deepStrictEqual(calculateAad("post", "health", "tenant_123"), {
      requestAad: "POST:/health:tenant_123",
      responseAad: "RESPONSE:/health:tenant_123",
    });
  });
});
