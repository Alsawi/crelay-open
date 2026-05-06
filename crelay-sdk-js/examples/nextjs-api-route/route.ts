/**
 * Next.js API route example — CRelay SDK
 *
 * Place this file at `app/api/secure-transfer/route.ts` in your Next.js app.
 * It demonstrates how to use CRelayClient inside a Next.js route handler.
 */

import { CRelayClient } from "@crelay/sdk";

// Initialise once at module scope (keys can come from env vars)
const client = new CRelayClient({
  apiKey: process.env.CR_API_KEY!,
  baseUrl: process.env.CR_BASE_URL!,
  tenantId: process.env.CR_TENANT_ID!,
  kid: process.env.CR_KID!,
  keyB64: process.env.CR_KEY_B64!,
});

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json();

    const result = await client.secureRequest({
      targetUrl: "https://api.internal.example.com/transfer",
      method: "POST",
      data: body,
    });

    return Response.json({ success: true, data: result.data });
  } catch (err: any) {
    console.error("CRelay error:", err.message);
    return Response.json(
      { error: "CRelay request failed" },
      { status: 502 },
    );
  }
}
