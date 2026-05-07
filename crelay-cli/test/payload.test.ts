import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadPayload } from "../src/payload.js";

describe("payload JSON loading", () => {
  it("loads inline JSON", async () => {
    const payload = await loadPayload('{"ok":true}', process.cwd(), "POST");
    assert.deepStrictEqual(payload.value, { ok: true });
    assert.strictEqual(payload.source, "inline");
    assert.strictEqual(payload.jsonValid, true);
  });

  it("loads JSON from a file", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "crelay-cli-payload-"));
    await writeFile(path.join(cwd, "payload.json"), '{"amount":42}', "utf8");

    const payload = await loadPayload("./payload.json", cwd, "POST");
    assert.deepStrictEqual(payload.value, { amount: 42 });
    assert.strictEqual(payload.source, "file");
  });

  it("rejects invalid JSON", async () => {
    await assert.rejects(
      () => loadPayload("{bad", process.cwd(), "POST"),
      /Body must be valid JSON/,
    );
  });
});
