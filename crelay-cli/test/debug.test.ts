import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { encrypt, buildResponseAad } from "@crelay/sdk";
import { runDebug } from "../src/debug.js";
import { loadPayload } from "../src/payload.js";

describe("debug command", () => {
  it("masks raw secrets in gateway failure output", async () => {
    const cwd = await writeProject();
    const logs: string[] = [];
    const errors: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      if (String(input).includes("/health")) {
        return new Response("ok", { status: 200 });
      }
      return new Response(`AUTH_INVALID_API_KEY sk_live_secret ${KEY_B64}`, { status: 401 });
    };

    const code = await runDebug(
      { log: (line) => logs.push(line), error: (line) => errors.push(line) },
      { cwd, env: {}, fetchImpl, target: "https://api.example.com/health" },
    );

    const output = [...logs, ...errors].join("\n");
    assert.strictEqual(code, 1);
    assert.equal(output.includes("sk_live_secret"), false);
    assert.equal(output.includes(KEY_B64), false);
    assert.match(output, /AUTH_INVALID_API_KEY/);
  });

  it("explains upstream 404 separately from gateway failure", async () => {
    const cwd = await writeProject();
    const logs: string[] = [];
    const errors: string[] = [];
    const key = Buffer.from(KEY_B64, "base64");
    const responseEnvelope = encrypt(
      { status: 404, ok: false, body: { message: "not found" } },
      key,
      "kid_test",
      buildResponseAad("/missing", "tenant_test"),
      "response-id",
    );
    const fetchImpl: typeof fetch = async (input) => {
      if (String(input).includes("/health")) {
        return new Response("ok", { status: 200 });
      }
      return Response.json(responseEnvelope, { status: 200 });
    };

    const code = await runDebug(
      { log: (line) => logs.push(line), error: (line) => errors.push(line) },
      { cwd, env: {}, fetchImpl, target: "https://api.example.com/missing" },
    );

    const output = [...logs, ...errors].join("\n");
    assert.strictEqual(code, 1);
    assert.match(output, /secure request status: 200/);
    assert.match(output, /upstream status: 404/);
    assert.match(output, /CRelay worked, but your upstream returned 404/);
    assert.doesNotMatch(output, /gateway failure/);
  });

  it("accepts --json inline body", async () => {
    const cwd = await writeProject();
    const logs: string[] = [];
    const errors: string[] = [];
    const key = Buffer.from(KEY_B64, "base64");
    const fetchImpl: typeof fetch = async (input, init) => {
      if (String(input).includes("/health")) {
        return new Response("ok", { status: 200 });
      }
      const body = JSON.parse(init?.body as string);
      const responseEnvelope = encrypt(
        { status: 200, ok: true, body: { received: body.envelope ? true : false } },
        key,
        "kid_test",
        buildResponseAad("/users", "tenant_test"),
        "response-id",
      );
      return Response.json(responseEnvelope, { status: 200 });
    };

    const code = await runDebug(
      { log: (line) => logs.push(line), error: (line) => errors.push(line) },
      { cwd, env: {}, fetchImpl, target: "https://api.example.com/users", method: "POST", body: '{"name":"CLI Test"}' },
    );

    const output = [...logs, ...errors].join("\n");
    assert.strictEqual(code, 0);
    assert.match(output, /payload size: \d+ bytes/);
    assert.match(output, /JSON validity: valid/);
  });

  it("accepts --body with a JSON file", async () => {
    const cwd = await writeProject();
    await writeFile(path.join(cwd, "payload.json"), '{"amount":42}', "utf8");
    const logs: string[] = [];
    const errors: string[] = [];
    const key = Buffer.from(KEY_B64, "base64");
    const fetchImpl: typeof fetch = async (input) => {
      if (String(input).includes("/health")) {
        return new Response("ok", { status: 200 });
      }
      const responseEnvelope = encrypt(
        { status: 200, ok: true, body: { ok: true } },
        key,
        "kid_test",
        buildResponseAad("/users", "tenant_test"),
        "response-id",
      );
      return Response.json(responseEnvelope, { status: 200 });
    };

    const code = await runDebug(
      { log: (line) => logs.push(line), error: (line) => errors.push(line) },
      { cwd, env: {}, fetchImpl, target: "https://api.example.com/users", method: "POST", body: "./payload.json" },
    );

    const output = [...logs, ...errors].join("\n");
    assert.strictEqual(code, 0);
    assert.match(output, /JSON validity: valid/);
  });
});

describe("debug payload validation", () => {
  it("rejects invalid inline JSON with clear error", async () => {
    await assert.rejects(
      () => loadPayload("{bad json", process.cwd(), "POST"),
      /Body must be valid JSON/,
    );
  });
});

const KEY_B64 = Buffer.alloc(32, 0xab).toString("base64");

async function writeProject(): Promise<string> {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "crelay-cli-debug-"));
  await writeFile(
    path.join(cwd, "crelay.config.json"),
    JSON.stringify({
      gatewayUrl: "https://gateway.crelay.dev",
      tenantId: "tenant_test",
      kid: "kid_test",
      target: {
        origin: "https://api.example.com",
        testPath: "/health",
      },
    }),
    "utf8",
  );
  await writeFile(
    path.join(cwd, ".env.crelay"),
    [
      "CRELAY_API_KEY=sk_live_secret",
      `CRELAY_KEY_B64=${KEY_B64}`,
    ].join("\n"),
    "utf8",
  );
  return cwd;
}
