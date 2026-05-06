/**
 * Express server example — CRelay SDK
 *
 * Run: npx tsx examples/express/server.ts
 *
 * This shows a minimal Express app that uses CRelayClient
 * to make a secure, encrypted API call through the gateway.
 */

import express from "express";
import { CRelayClient } from "@crelay/sdk";

const app = express();
app.use(express.json());

// ── Initialise the client ──────────────────────────────────────────────
const client = new CRelayClient({
  apiKey: process.env.CR_API_KEY ?? "cr_test_…",
  baseUrl: process.env.CR_BASE_URL ?? "https://gateway.example.com",
  tenantId: process.env.CR_TENANT_ID ?? "tenant_42",
  kid: process.env.CR_KID ?? "key_v1",
  keyB64: process.env.CR_KEY_B64 ?? "dGVzdC1rZXktMzItYnl0ZXMtbG9uZy1rZXk=",
});

// ── Secure proxy endpoint ──────────────────────────────────────────────
app.post("/api/transfer", async (req, res) => {
  try {
    const result = await client.secureRequest({
      targetUrl: "https://api.internal.example.com/transfer",
      method: "POST",
      data: req.body,
    });

    res.json({ success: true, data: result.data });
  } catch (err: any) {
    console.error("Secure request failed:", err.message);
    res.status(502).json({ error: "CRelay request failed" });
  }
});

// ── Health check ───────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

const PORT = Number(process.env.PORT ?? 3000);
app.listen(PORT, () => {
  console.log(`🚀 Express server listening on http://localhost:${PORT}`);
});
