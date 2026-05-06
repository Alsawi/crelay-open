# @crelay/sdk

[![npm version](https://img.shields.io/npm/v/@crelay/sdk.svg)](https://www.npmjs.com/package/@crelay/sdk)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178c6.svg)](https://www.typescriptlang.org/)

Encrypted API relay with replay protection — AES-256-GCM payload encryption for APIs, with route-bound AAD and freshness validation.

---

> **CRelay is not a replacement for HTTPS.**
> It adds an application-level security layer for sensitive API calls by encrypting request and response payloads with AES-256-GCM and enforcing replay protection, timestamp freshness, and route-bound AAD.
> Use it when you need payload security beyond transport encryption.

---

## Quick Start

```ts
import { CRelayClient } from "@crelay/sdk";

const client = new CRelayClient({
  apiKey: process.env.CR_API_KEY!,
  baseUrl: process.env.CR_BASE_URL!,
  tenantId: "tenant_42",
  kid: "key_v1",
  keyB64: process.env.CR_KEY_B64!,
});

const result = await client.secureRequest({
  targetUrl: "https://api.example.com/internal/transfer",
  method: "POST",
  data: { amount: 1000 },
});

console.log(result.data);   // decrypted response payload
console.log(result._sg);    // { kid, ts, requestId }
```

## Install

```bash
npm install @crelay/sdk
```

Requires **Node.js ≥ 20** (uses built-in `crypto` and `fetch`).

## Features

| Feature | Description |
|---------|-------------|
| **AES-256-GCM Encryption** | Every request and response payload is sealed with an authenticated-encryption cipher. Tampering is cryptographically detected. |
| **Replay Protection** | Each envelope carries a unique `requestId`. The gateway rejects duplicate IDs within the staleness window. |
| **Route-bound AAD** | Additional Authenticated Data binds every envelope to a specific HTTP method + path + tenant. An encrypted payload for `/transfer` cannot be replayed on `/refund`. |
| **Freshness Validation** | Timestamps are checked on both client and server. Envelopes older than 5 minutes (configurable) or more than 1 second in the future are rejected. |
| **Key Rotation** | The `kid` field in every envelope identifies which key was used. Rotate keys by publishing a new `kid` — old envelopes remain verifiable until the key is decommissioned. |
| **Encrypted Responses** | The gateway encrypts the upstream API response with response AAD before returning it to the client. Both directions are protected. |

## How It Works

```
┌────────┐          ┌──────────┐          ┌─────────┐
│ Client │          │ Gateway  │          │  API    │
└───┬────┘          └────┬─────┘          └────┬────┘
    │                    │                     │
    │ 1. Encrypt data    │                     │
    │    with AES-GCM    │                     │
    │    + request AAD   │                     │
    │                    │                     │
    │ 2. POST /secure/forward                 │
    │    { envelope }    │                     │
    │───────────────────>│                     │
    │                    │ 3. Validate AAD     │
    │                    │    + freshness      │
    │                    │                     │
    │                    │ 4. Decrypt + forward│
    │                    │────────────────────>│
    │                    │                     │
    │                    │ 5. API response     │
    │                    │<────────────────────│
    │                    │                     │
    │                    │ 6. Encrypt response │
    │                    │    + response AAD   │
    │                    │                     │
    │ 7. Response envelope                     │
    │<───────────────────│                     │
    │                    │                     │
    │ 8. Decrypt + validate AAD                │
    │    + check freshness                     │
    │                    │                     │
```

**Step-by-step:**

1. Your code calls `client.secureRequest()` with a target URL, method, and data.
2. The SDK encrypts the payload using your AES-256 key, binding the AAD to `METHOD:path:tenantId`.
3. The encrypted envelope is POSTed to the CRelay gateway's `/secure/forward` endpoint.
4. The gateway validates the envelope's AAD and timestamp freshness, then decrypts the payload.
5. The gateway forwards the plaintext request to your upstream API.
6. The API responds normally.
7. The gateway encrypts the response with `RESPONSE:path:tenantId` AAD and returns it.
8. The SDK decrypts the response envelope, validates AAD + freshness, and returns the data to your code.

> **Note on gateway trust:** CRelay decrypts payloads inside the trusted gateway boundary, enforces replay protection, timestamp freshness, route-bound AAD, and target allowlists, forwards to the upstream API, then encrypts the response back to the client. The gateway must be operated within a trusted boundary. If the gateway is compromised, plaintext payloads are exposed at that layer. CRelay protects payloads beyond HTTPS and prevents cross-route replay, stale replay, and tampering — but it is not a zero-knowledge system.

## Client API

### `new CRelayClient(options)`

Creates a new client instance.

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `apiKey` | `string` | ✅ | API key for gateway authentication |
| `baseUrl` | `string` | ✅ | Gateway base URL (e.g. `https://gateway.example.com`) |
| `tenantId` | `string` | ✅ | Your tenant identifier |
| `kid` | `string` | ✅ | Key identifier for the AES key |
| `keyB64` | `string` | ✅ | Base64-encoded 256-bit AES key |

```ts
const client = new CRelayClient({
  apiKey: "cr_live_abc123",
  baseUrl: "https://gateway.example.com",
  tenantId: "tenant_42",
  kid: "key_v1",
  keyB64: "YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXoxMjM0NTY=", // 32 bytes, Base64
});
```

### `client.secureRequest(input)`

Sends an encrypted request through the gateway and returns the decrypted response.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `targetUrl` | `string` | ✅ | The URL to forward the request to |
| `method` | `string` | ✅ | HTTP method (`"GET"`, `"POST"`, etc.) |
| `data` | `unknown` | ✅ | Payload to encrypt and send |
| `headers` | `Record<string, string>` | | Optional headers to forward |
| `aadPath` | `string` | | Override the AAD path (defaults to URL pathname) |
| `requestId` | `string` | | Custom request ID (auto-generated if omitted) |

Returns a `CRelayResponse`:

```ts
interface CRelayResponse {
  data: unknown;         // Decrypted response payload
  _sg: {
    kid: string;         // Key identifier from the response envelope
    ts: number;          // Timestamp from the response envelope
    requestId: string;   // Request ID echoed back
  };
}
```

## AAD Conventions

AAD (Additional Authenticated Data) binds each encrypted envelope to a specific context, preventing cross-route replay attacks.

**Request AAD format:**

```
METHOD:path:tenantId
```

Example: `POST:/internal/transfer:tenant_42`

**Response AAD format:**

```
RESPONSE:path:tenantId
```

Example: `RESPONSE:/internal/transfer:tenant_42`

The path is extracted from the `targetUrl` by default. You can override it with the `aadPath` parameter if your URL structure doesn't match the route you want to bind to.

```ts
// Custom AAD path
await client.secureRequest({
  targetUrl: "https://api.example.com/v2/transfer?id=123",
  method: "POST",
  data: { amount: 1000 },
  aadPath: "/v2/transfer", // binds to /v2/transfer, not /v2/transfer?id=123
});
```

## Crypto Compatibility

This SDK uses **Node.js `crypto`** (not Web Crypto) for all cryptographic operations. This is a deliberate choice for a server-side SDK — it gives us:

- **Synchronous key validation** at client construction time
- **Proven AES-256-GCM implementation** backed by OpenSSL
- **No polyfill overhead** on Node.js ≥ 20

### Key Requirements

- **Algorithm:** AES-256-GCM
- **Key length:** 32 bytes (256 bits), provided as Base64
- **Nonce:** 12 bytes, randomly generated per envelope (`crypto.randomBytes`)
- **Auth tag:** 16 bytes, appended to ciphertext

### Envelope Format

```json
{
  "v": 1,
  "alg": "A256GCM",
  "kid": "key_v1",
  "nonce": "Base64-encoded 12-byte nonce",
  "ciphertext": "Base64-encoded ciphertext + auth tag",
  "aadContext": "POST:/internal/transfer:tenant_42",
  "ts": 1717987200000
}
```

## Error Handling

All errors thrown by the SDK are instances of `CRelayError`:

```ts
import { CRelayError } from "@crelay/sdk";

try {
  await client.secureRequest({ ... });
} catch (err) {
  if (err instanceof CRelayError) {
    console.error(err.code);       // e.g. "AAD_MISMATCH"
    console.error(err.message);    // human-readable description
    console.error(err.statusCode); // HTTP status (if from gateway)
  }
}
```

### Error Codes

| Code | Description |
|------|-------------|
| `SDK_ERROR` | Generic SDK error |
| `INVALID_CONFIGURATION` | Missing or invalid client options |
| `INVALID_KEY_LENGTH` | Key is not 32 bytes |
| `INVALID_REQUEST` | Missing required request fields |
| `MALFORMED_ENVELOPE` | Envelope failed validation |
| `KID_MISMATCH` | Response kid doesn't match client kid |
| `AAD_MISMATCH` | AAD context doesn't match expected value |
| `DECRYPT_FAILED` | Decryption failed (wrong key, tampered data) |
| `HTTP_ERROR` | Gateway returned a non-2xx response |
| `REPLAY_DETECTED` | Duplicate requestId detected |
| `FRESHNESS_FAILED` | Timestamp too old or in the future |

## Examples

### Express Server

```ts
import express from "express";
import { CRelayClient } from "@crelay/sdk";

const app = express();
const client = new CRelayClient({ /* ... */ });

app.post("/api/transfer", async (req, res) => {
  const result = await client.secureRequest({
    targetUrl: "https://api.internal.example.com/transfer",
    method: "POST",
    data: req.body,
  });
  res.json({ data: result.data });
});
```

See [`examples/express/server.ts`](examples/express/server.ts) for the full example.

### Next.js API Route

```ts
import { CRelayClient } from "@crelay/sdk";

const client = new CRelayClient({ /* ... */ });

export async function POST(request: Request) {
  const body = await request.json();
  const result = await client.secureRequest({
    targetUrl: "https://api.internal.example.com/transfer",
    method: "POST",
    data: body,
  });
  return Response.json({ data: result.data });
}
```

See [`examples/nextjs-api-route/route.ts`](examples/nextjs-api-route/route.ts) for the full example.

### Node.js Script

```ts
import { CRelayClient, CRelayError } from "@crelay/sdk";

const client = new CRelayClient({ /* ... */ });

try {
  const result = await client.secureRequest({
    targetUrl: "https://api.internal.example.com/transfer",
    method: "POST",
    data: { amount: 1000 },
  });
  console.log(result.data);
} catch (err) {
  if (err instanceof CRelayError) {
    console.error(`[${err.code}] ${err.message}`);
  }
}
```

See [`examples/node-script/index.ts`](examples/node-script/index.ts) for the full example.

## Why Not Just HTTPS?

HTTPS provides transport-layer encryption — it protects data *in flight* between two endpoints. But transport encryption has well-known limitations:

| Threat | HTTPS | CRelay |
|--------|-------|--------|
| **MITM or compromised TLS path** | Protects transport, but payload is exposed after TLS termination | Application payload remains encrypted until the trusted CRelay gateway boundary |
| **Replay attacks** | No application-level replay protection | `requestId` + freshness check |
| **Cross-route replay** | No route-bound payload context | AAD bound to method + path |
| **Stolen payloads after TLS termination** | No application-level freshness enforcement | Stale envelopes rejected |
| **Payload tampering outside TLS boundary** | Not protected after TLS termination | AES-GCM auth tag verification |

> **CRelay protects sensitive API payloads beyond HTTPS with AES-256-GCM encryption, replay protection, timestamp freshness, and route-bound AAD.**

Think of it this way: HTTPS protects the *wire*. CRelay protects the *payload*. They're complementary, not competing. You should always use HTTPS — and add CRelay when the data warrants defense in depth.

Common use cases:

- **Financial transactions** — encrypt transfer details so intercepted traffic cannot be read or replayed
- **Healthcare APIs** — protect PHI (Protected Health Information) beyond HIPAA-mandated TLS
- **Internal service meshes** — prevent lateral movement from compromising one service to reading all inter-service traffic
- **Multi-tenant platforms** — ensure tenant isolation at the application layer with AAD binding

## Related Repositories

| Repository | Description |
|------------|-------------|
| [`crelay-protocol`](https://github.com/Alsawi/crelay-open) | Formal specification for the envelope format, AAD conventions, and replay protection |
| [`crelay-quickstart`](https://github.com/Alsawi/crelay-open) | End-to-end quickstart with a local gateway and sample keys |

## License

[MIT](LICENSE) — Copyright 2025 CRelay
