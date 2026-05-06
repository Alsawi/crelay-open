# CRelay Quickstart

**Try CRelay end-to-end in 5 minutes.**

```
Client (SDK) ──encrypt──▶ CRelay Gateway ──decrypt──▶ Demo API
                                                      │
Client (SDK) ◀─decrypt── CRelay Gateway ◀─encrypt─────┘
```

## Prerequisites

- **Node.js 20+** and **npm**
- (Optional) **Docker** and **Docker Compose** for containerized setup

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/Alsawi/crelay-open.git
cd crelay-open/crelay-quickstart

# Install all dependencies
npm run install:all
```

### 2. Set up your encryption key

```bash
cp .env.example .env

# Generate a 32-byte base64 key and add it to .env
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
# Paste the output as CRELAY_KEY_B64 in .env
```

### 3. Run

**Option A: Docker Compose (recommended)**

```bash
docker compose --env-file .env up --build
```

**Option B: npm scripts (manual)**

Start services in this order — each service must be ready before the next one starts:

```bash
# Terminal 1 — Start the upstream API FIRST
npm run upstream
# Wait until you see: [upstream-api] Demo API running on http://localhost:4010

# Terminal 2 — Start the mock gateway SECOND
CRELAY_KEY_B64=<your-key> npm run gateway
# Wait until you see: [mock-gateway] DEMO MOCK GATEWAY running on http://localhost:3000

# Terminal 3 — Run the client demo THIRD (after both services are ready)
CRELAY_KEY_B64=<your-key> npm run client
```

**Confirm both services are healthy before running the client:**

```bash
curl http://localhost:4010/health   # Should return {"status":"ok",...}
curl http://localhost:3000/health   # Should return {"status":"ok",...}
```

Or use the health check script from the workspace root:

```bash
npm run quickstart:check
```

## Expected Output

When the client runs successfully, you will see output like:

```
🔐  CRelay — Client Demo
    Mode: gateway
    Gateway: http://localhost:3000
    Upstream: http://localhost:4010

──────────────────────────────────────────────────────────
  Step 1: Create a user (POST /users)
──────────────────────────────────────────────────────────
  ✅ User created:
     {
       "id": "a1b2c3d4-...",
       "email": "alice@example.com",
       "name": "Alice Johnson",
       "created_at": "2025-01-15T10:30:00.000Z"
     }

──────────────────────────────────────────────────────────
  Step 2: Make a transfer (POST /transfer)
──────────────────────────────────────────────────────────
  ✅ Transfer completed:
     {
       "transferId": "e5f6g7h8-...",
       "from": "acc-001",
       "to": "acc-002",
       "amount": 42.5,
       "status": "completed"
     }

──────────────────────────────────────────────────────────
  Step 3: Check balance (GET /balance/acc-001)
──────────────────────────────────────────────────────────
  ✅ Balance retrieved:
     {
       "accountId": "acc-001",
       "balance": 1234.56,
       "currency": "USD",
       "asOf": "2025-01-15T10:30:00.000Z"
     }
```

## Two Modes

### Hosted Gateway Sandbox

Use the real CRelay hosted service. Your requests are encrypted and routed through the production infrastructure with full replay protection, rate limiting, and audit logging. To use this mode, sign up for an API key at the CRelay dashboard and set:

```bash
CRELAY_BASE_URL=https://api.crelay.dev
CRELAY_API_KEY=cr_live_your_real_key
CRELAY_MODE=gateway
```

When using the hosted sandbox, the mock gateway is not needed — only the upstream API and client.

### Local Mock Gateway

For offline development and quick evaluation, the included mock gateway simulates the encryption and forwarding behavior. This lets you try the full flow without signing up for anything. The mock gateway decrypts your request envelope, forwards it to the upstream API, encrypts the response, and returns it — just like the real gateway, but without production-grade security features.

To run in local mode:

```bash
CRELAY_MODE=gateway npm run client
```

Or bypass the gateway entirely for basic testing:

```bash
CRELAY_MODE=local npm run client
```

## What This Quickstart Demonstrates

### Request Encryption with AES-256-GCM

Every request payload is encrypted using AES-256-GCM before leaving the client. The gateway decrypts it, forwards it to your upstream API, then encrypts the response. This means your sensitive data is never transmitted in plaintext over the network. Even if an attacker intercepts the traffic, they cannot read or modify the payload without the encryption key.

### Route-Bound AAD Binding

The Additional Authenticated Data (AAD) field in the AES-256-GCM encryption is bound to the HTTP method and path of the request. This prevents a class of attacks where an encrypted payload for one endpoint is replayed against a different endpoint. If someone tries to take an encrypted transfer request and submit it to the user creation endpoint, the AAD verification will fail and the decryption will reject the ciphertext.

### Replay Protection (requestId)

Each encrypted envelope includes a unique `requestId` (a UUID v4). The real CRelay gateway maintains a replay cache and rejects any request with a previously seen `requestId`. This prevents an attacker from capturing and resubmitting a valid encrypted request. The mock gateway logs the `requestId` but does not enforce this check — it relies on the hosted gateway for production replay protection.

### Response Decryption

The response from the upstream API is encrypted by the gateway using the same AES-256-GCM scheme before being returned to the client. The client SDK (or the built-in decryption logic in this demo) decrypts the response envelope to recover the plaintext data. This ensures that the response is also protected in transit.

## Architecture

```
┌──────────────┐     encrypted      ┌──────────────────┐    plaintext     ┌──────────────┐
│              │     envelope       │                  │    request       │              │
│  Client SDK  │ ───────────────── │  CRelay Gateway  │ ─────────────── │  Upstream API │
│              │                    │                  │                  │              │
│  (encrypts   │ ◀───────────────── │  (decrypts &     │ ◀─────────────── │  (your API)  │
│   & decrypts)│     encrypted      │   encrypts)      │    plaintext     │              │
│              │     response       │                  │    response      │              │
└──────────────┘                    └──────────────────┘                  └──────────────┘
```

The client SDK encrypts the request payload and wraps it in a protocol envelope that includes the version (`v`), algorithm (`alg`), key ID (`kid`), nonce, ciphertext (with appended auth tag), AAD context, and timestamp. The gateway validates the envelope, decrypts the payload, and forwards the plaintext request to your upstream API. When the upstream API responds, the gateway encrypts the response using response AAD and returns the protocol envelope. The client SDK then decrypts the response and returns the plaintext data to your application code.

This architecture means your application code only ever sees plaintext data — the encryption and decryption happen transparently within the SDK and gateway. There is no need to change your API handlers or response formats.

## Next Steps

1. **Get a production API key** — Sign up at the CRelay dashboard to receive your API key and tenant credentials.
2. **Read the protocol spec** — Understand the envelope format, key rotation, and advanced features in the CRelay documentation.
3. **Integrate the SDK** — Add `@crelay/sdk` to your application and configure it with your production credentials.
4. **Deploy your upstream API** — Register your upstream endpoints with the gateway so it knows where to forward decrypted requests.

## ⚠️ Important Disclaimer

The mock gateway included in this repository is **intentionally simplified** for demonstration purposes only. It includes basic in-memory replay protection for demo purposes, but does **not** implement the full security features of the real CRelay gateway, including but not limited to:

- Replay attack protection (request ID deduplication)
- Rate limiting and throttling
- Key rotation and key management service integration
- Audit trail logging and compliance reporting
- TLS termination and certificate management
- HSM-backed key storage
- Tenant isolation and multi-tenancy enforcement
- Request signing and integrity verification beyond AAD

**Do NOT deploy the mock gateway in any production or staging environment.** It exists solely to let you evaluate the encryption flow locally without signing up for the hosted service. For production use, always connect to the real CRelay gateway.

## Troubleshooting

### "fetch failed" or connection refused

If the client demo shows `fetch failed` or `ECONNREFUSED`, the gateway or upstream service is not ready yet. Start the upstream API first (port 4010), then the mock gateway (port 3000), and wait for both to report they are listening before running the client. You can verify both are healthy:

```bash
curl http://localhost:4010/health
curl http://localhost:3000/health
```

### Decryption failed — check key

If the mock gateway logs `Decryption failed`, the `CRELAY_KEY_B64` environment variable differs between the gateway and the client. Both must use the **exact same** 32-byte base64 key. Verify by printing the key from both terminals:

```bash
echo $CRELAY_KEY_B64
```

### Port already in use

If port 3000 or 4010 is already in use, stop the existing process or set a different port:

```bash
PORT=4011 npm run upstream        # custom upstream port
GATEWAY_PORT=3001 npm run gateway  # custom gateway port
```

Remember to also update `UPSTREAM_URL` and `CRELAY_BASE_URL` in the client environment if you change ports.

## License

MIT
