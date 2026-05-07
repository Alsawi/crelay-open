import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { encrypt, buildResponseAad } from "@crelay/sdk";
import { runDebug } from "../src/debug.js";

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
