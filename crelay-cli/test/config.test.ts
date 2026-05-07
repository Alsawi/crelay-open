import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getDefaultTargetOrigin, joinTargetUrl, loadRuntimeConfig, normalizePath } from "../src/config.js";

describe("config parsing", () => {
  it("loads crelay.config.json with .env, .env.local, .env.crelay, and process env precedence", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "crelay-cli-config-"));
    await writeFile(
      path.join(cwd, "crelay.config.json"),
      JSON.stringify({
        gatewayUrl: "https://gateway.crelay.dev",
        tenantId: "tenant_from_config",
        kid: "kid_from_config",
        target: {
          origin: "https://api.example.com/base",
          testPath: "ready",
        },
      }),
      "utf8",
    );
    await writeFile(
      path.join(cwd, ".env"),
      [
        "CRELAY_API_KEY=sk_from_env_file",
        "CRELAY_TENANT_ID=tenant_from_dotenv",
        "CRELAY_KID=kid_from_dotenv",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      path.join(cwd, ".env.local"),
      [
        "CRELAY_API_KEY=sk_from_env_local",
        "CRELAY_KID=kid_from_env_local",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      path.join(cwd, ".env.crelay"),
      [
        "CRELAY_API_KEY=sk_from_crelay",
        "CRELAY_KEY_B64=qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqo=",
        "CRELAY_TENANT_ID=tenant_from_env",
      ].join("\n"),
      "utf8",
    );

    const config = await loadRuntimeConfig(cwd, {
      CRELAY_API_KEY: "sk_from_process",
    });

    assert.strictEqual(config.baseUrl, "https://gateway.crelay.dev");
    assert.strictEqual(config.apiKey, "sk_from_process");
    assert.strictEqual(config.tenantId, "tenant_from_env");
    assert.strictEqual(config.kid, "kid_from_env_local");
    assert.strictEqual(config.targetOrigin, "https://api.example.com");
    assert.strictEqual(config.testPath, "/ready");
    assert.deepStrictEqual(config.envFiles, [".env", ".env.local", ".env.crelay"]);
  });

  it("normalizes paths and joins target URLs", () => {
    assert.strictEqual(normalizePath("health"), "/health");
    assert.strictEqual(joinTargetUrl("https://api.example.com/", "health"), "https://api.example.com/health");
  });
});

describe("getDefaultTargetOrigin", () => {
  it("finds targetOrigin field", () => {
    assert.strictEqual(
      getDefaultTargetOrigin({ targetOrigin: "https://api.example.com" }),
      "https://api.example.com",
    );
  });

  it("finds target as string", () => {
    assert.strictEqual(
      getDefaultTargetOrigin({ target: "https://api.example.com" }),
      "https://api.example.com",
    );
  });

  it("finds target.origin object form", () => {
    assert.strictEqual(
      getDefaultTargetOrigin({ target: { origin: "https://api.example.com" } }),
      "https://api.example.com",
    );
  });

  it("finds targets[0].origin", () => {
    assert.strictEqual(
      getDefaultTargetOrigin({ targets: [{ name: "primary", origin: "https://api.example.com" }] }),
      "https://api.example.com",
    );
  });

  it("returns undefined when no target is configured", () => {
    assert.strictEqual(getDefaultTargetOrigin({}), undefined);
  });
});
