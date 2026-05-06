/**
 * Node.js script example — CRelay SDK
 *
 * Run: npx tsx examples/node-script/index.ts
 *
 * A simple script demonstrating the SDK's basic usage.
 */

import { CRelayClient, CRelayError } from "@crelay/sdk";

async function main() {
  const client = new CRelayClient({
    apiKey: process.env.CR_API_KEY ?? "cr_test_…",
    baseUrl: process.env.CR_BASE_URL ?? "https://gateway.example.com",
    tenantId: process.env.CR_TENANT_ID ?? "tenant_42",
    kid: process.env.CR_KID ?? "key_v1",
    keyB64: process.env.CR_KEY_B64 ?? "dGVzdC1rZXktMzItYnl0ZXMtbG9uZy1rZXk=",
  });

  try {
    console.log("Sending secure request…");

    const result = await client.secureRequest({
      targetUrl: "https://api.internal.example.com/transfer",
      method: "POST",
      data: {
        amount: 1000,
        currency: "USD",
        destination: "acc_abc123",
      },
    });

    console.log("✅ Response:", result.data);
    console.log("   Metadata:", result._sg);
  } catch (err) {
    if (err instanceof CRelayError) {
      console.error(`❌ SDK error [${err.code}]: ${err.message}`);
      if (err.statusCode) {
        console.error(`   HTTP status: ${err.statusCode}`);
      }
    } else {
      console.error("❌ Unexpected error:", err);
    }
    process.exit(1);
  }
}

main();
