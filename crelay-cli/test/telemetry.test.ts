import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  readConfig,
  writeConfig,
  isTelemetryEnabled,
  setTelemetryEnabled,
  generateAnonymousId,
  sanitizeProperties,
  sendEvent,
} from "../src/telemetry.js";

describe("telemetry config", () => {
  let tmpDir: string;

  afterEach(async () => {
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("telemetry is disabled by default (no config file)", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "crelay-tel-"));
    const configDir = path.join(tmpDir, ".crelay");

    const enabled = await isTelemetryEnabled(configDir);
    assert.strictEqual(enabled, false);
  });

  it("enable writes config with enabled=true and generates anonymousId", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "crelay-tel-"));
    const configDir = path.join(tmpDir, ".crelay");

    await setTelemetryEnabled(true, configDir);

    const raw = await readFile(path.join(configDir, "config.json"), "utf8");
    const config = JSON.parse(raw);
    assert.strictEqual(config.enabled, true);
    assert.match(config.anonymousId, /^anon_/);
  });

  it("disable writes config with enabled=false", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "crelay-tel-"));
    const configDir = path.join(tmpDir, ".crelay");

    await setTelemetryEnabled(true, configDir);
    await setTelemetryEnabled(false, configDir);

    const raw = await readFile(path.join(configDir, "config.json"), "utf8");
    const config = JSON.parse(raw);
    assert.strictEqual(config.enabled, false);
    assert.match(config.anonymousId, /^anon_/);
  });

  it("preserves anonymousId across enable/disable", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "crelay-tel-"));
    const configDir = path.join(tmpDir, ".crelay");

    await setTelemetryEnabled(true, configDir);
    const firstRaw = await readFile(path.join(configDir, "config.json"), "utf8");
    const firstId = JSON.parse(firstRaw).anonymousId;

    await setTelemetryEnabled(false, configDir);
    const secondRaw = await readFile(path.join(configDir, "config.json"), "utf8");
    const secondId = JSON.parse(secondRaw).anonymousId;

    assert.strictEqual(firstId, secondId);
  });

  it("readConfig returns null for missing file", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "crelay-tel-"));
    const configDir = path.join(tmpDir, ".crelay");

    const config = await readConfig(configDir);
    assert.strictEqual(config, null);
  });

  it("readConfig returns written config", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "crelay-tel-"));
    const configDir = path.join(tmpDir, ".crelay");

    const written = { enabled: true, anonymousId: "anon_test_123" };
    await writeConfig(written, configDir);

    const config = await readConfig(configDir);
    assert.deepStrictEqual(config, written);
  });
});

describe("generateAnonymousId", () => {
  it("starts with anon_ prefix", () => {
    const id = generateAnonymousId();
    assert.match(id, /^anon_/);
  });

  it("generates unique IDs", () => {
    const id1 = generateAnonymousId();
    const id2 = generateAnonymousId();
    assert.notStrictEqual(id1, id2);
  });
});

describe("event sanitizer", () => {
  it("strips apiKey from properties", () => {
    const result = sanitizeProperties({ apiKey: "sk_live_xxx", success: true });
    assert.strictEqual(result.apiKey, undefined);
    assert.strictEqual(result.success, true);
  });

  it("strips keyB64 from properties", () => {
    const result = sanitizeProperties({ keyB64: "aaaa=", command: "test" });
    assert.strictEqual(result.keyB64, undefined);
    assert.strictEqual(result.command, "test");
  });

  it("strips payload, headers, targetUrl", () => {
    const result = sanitizeProperties({
      payload: "secret",
      headers: { auth: "bearer xxx" },
      targetUrl: "https://api.example.com",
      method: "GET",
    });
    assert.strictEqual(result.payload, undefined);
    assert.strictEqual(result.headers, undefined);
    assert.strictEqual(result.targetUrl, undefined);
    assert.strictEqual(result.method, "GET");
  });

  it("preserves all safe properties", () => {
    const safe = {
      success: true,
      durationMs: 150,
      cliVersion: "0.1.0",
      sdkVersion: "0.1.0",
      nodeVersionMajor: 20,
      platform: "darwin",
      gatewayHost: "gateway.crelay.dev",
      hasTarget: true,
      method: "GET",
      errorCategory: "UNKNOWN",
      knownGatewayError: "AUTH_INVALID_API_KEY",
      upstreamStatus: 200,
      command: "test",
    };
    const result = sanitizeProperties(safe);
    assert.deepStrictEqual(result, safe);
  });
});

describe("sendEvent", () => {
  let tmpDir: string;

  afterEach(async () => {
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("does not throw when fetch rejects", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "crelay-tel-"));
    const configDir = path.join(tmpDir, ".crelay");
    await setTelemetryEnabled(true, configDir);

    const failingFetch: typeof fetch = async () => {
      throw new Error("network down");
    };

    await assert.doesNotReject(() =>
      sendEvent("test", { command: "test", success: true }, failingFetch, configDir)
    );
  });

  it("does not throw when server returns 500", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "crelay-tel-"));
    const configDir = path.join(tmpDir, ".crelay");
    await setTelemetryEnabled(true, configDir);

    const errorFetch: typeof fetch = async () => new Response("error", { status: 500 });

    await assert.doesNotReject(() =>
      sendEvent("test", { command: "test", success: true }, errorFetch, configDir)
    );
  });

  it("includes command and success in payload", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "crelay-tel-"));
    const configDir = path.join(tmpDir, ".crelay");
    await setTelemetryEnabled(true, configDir);

    let capturedBody: string | undefined;
    const spyFetch: typeof fetch = async (_input, init) => {
      capturedBody = init?.body as string;
      return new Response("ok", { status: 200 });
    };

    await sendEvent("test", { command: "doctor", success: true }, spyFetch, configDir);

    assert.ok(capturedBody);
    const parsed = JSON.parse(capturedBody);
    assert.strictEqual(parsed.source, "cli");
    assert.strictEqual(parsed.event, "test");
    assert.strictEqual(parsed.properties.command, "doctor");
    assert.strictEqual(parsed.properties.success, true);
    assert.match(parsed.anonymousId, /^anon_/);
  });

  it("does not send when telemetry is disabled", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "crelay-tel-"));
    const configDir = path.join(tmpDir, ".crelay");
    await setTelemetryEnabled(false, configDir);

    let fetchCalled = false;
    const spyFetch: typeof fetch = async () => {
      fetchCalled = true;
      return new Response("ok", { status: 200 });
    };

    await sendEvent("test", { command: "doctor", success: true }, spyFetch, configDir);

    assert.strictEqual(fetchCalled, false);
  });

  it("does not send when no config exists", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "crelay-tel-"));
    const configDir = path.join(tmpDir, ".crelay");

    let fetchCalled = false;
    const spyFetch: typeof fetch = async () => {
      fetchCalled = true;
      return new Response("ok", { status: 200 });
    };

    await sendEvent("test", { command: "doctor", success: true }, spyFetch, configDir);

    assert.strictEqual(fetchCalled, false);
  });

  it("sanitizes properties before sending", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "crelay-tel-"));
    const configDir = path.join(tmpDir, ".crelay");
    await setTelemetryEnabled(true, configDir);

    let capturedBody: string | undefined;
    const spyFetch: typeof fetch = async (_input, init) => {
      capturedBody = init?.body as string;
      return new Response("ok", { status: 200 });
    };

    await sendEvent(
      "test",
      { command: "test", success: true, apiKey: "sk_live_secret", keyB64: "secret=" },
      spyFetch,
      configDir
    );

    assert.ok(capturedBody);
    const parsed = JSON.parse(capturedBody);
    assert.strictEqual(parsed.properties.apiKey, undefined);
    assert.strictEqual(parsed.properties.keyB64, undefined);
    assert.strictEqual(parsed.properties.command, "test");
    assert.strictEqual(parsed.properties.success, true);
  });
});
