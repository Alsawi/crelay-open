# @crelay/cli

Developer integration and debug CLI for CRelay. It helps you initialize local configuration, validate environment setup, send a secure test request, and inspect payload/AAD/envelope details safely.

Requires Node.js 20 or newer.

## Install

```bash
npm install --save-dev @crelay/cli
```

## `crelay init`

Interactive setup:

```bash
npx crelay init
```

Flag-based setup:

```bash
npx crelay init \
  --gateway-url https://gateway.crelay.dev \
  --tenant-id tenant_123 \
  --kid key_v1 \
  --target https://api.example.com \
  --path /health
```

Creates:

- `crelay.config.json`
- `.env.crelay.example`
- `examples/crelay-test.mjs`

`init` never asks for or stores real `CRELAY_API_KEY` or `CRELAY_KEY_B64`. The env example uses placeholders.

## `crelay doctor`

```bash
npx crelay doctor
```

Reads `.env`, `.env.local`, `.env.crelay`, and `crelay.config.json`.

Checks:

- Gateway URL exists and is valid
- `CRELAY_API_KEY` exists
- `CRELAY_TENANT_ID` exists
- `CRELAY_KID` exists
- `CRELAY_KEY_B64` exists and decodes to exactly 32 bytes
- Target origin exists
- Gateway `/health` is reachable

Secrets are always masked.

## `crelay test`

Sends one encrypted request through the gateway using `@crelay/sdk`.

```bash
npx crelay test
npx crelay test --target https://api.example.com --path /health
npx crelay test --method POST --path /internal/action --body ./payload.json --show-response
npx crelay test --method POST --body '{"hello":"world"}'
```

Flags:

- `--target https://api.example.com`
- `--path /health`
- `--method GET|POST`
- `--body ./payload.json` or inline JSON
- `--show-response`

By default, `test` uses `GET` and the path from config or `/health`.

## `crelay debug`

Payload-level diagnostic tool.

```bash
npx crelay debug --target https://api.example.com/internal/action --method POST --body ./payload.json
npx crelay debug --target https://api.example.com/health --verbose
npx crelay debug --target https://api.example.com/internal/action --method POST --body '{"ok":true}' --show-payload
```

Reports:

- Config: gateway URL, tenantId, kid, masked API key, key validity and decoded length
- Target: origin, path, method, query string presence, and the v0.1 AAD query-string note
- AAD: request `METHOD:/path:tenantId` and response `RESPONSE:/path:tenantId`
- Payload: JSON validity, byte size, large-payload warning
- Envelope: version, algorithm, kid, nonce length, ciphertext byte size, timestamp age, requestId
- Gateway: `/health` status, secure request status, gateway error code, upstream status, response decrypt result

## Telemetry

CRelay CLI includes optional anonymous usage telemetry. Telemetry is **disabled by default**.

### What is collected

- Command name (`doctor`, `test`, `debug`)
- Success/failure status
- Duration in milliseconds
- CLI version, Node.js major version, OS platform
- Gateway host (not full URL)
- Whether a target override was used
- HTTP method used
- Known gateway error codes (e.g., `AUTH_INVALID_API_KEY`)

### What is never collected

- API keys, keyB64 values, payloads, headers, or target URLs
- Response bodies or decrypted content
- Personal information or project names

### Managing telemetry

```bash
crelay telemetry status    # Show current state
crelay telemetry enable    # Enable anonymous diagnostics
crelay telemetry disable   # Disable telemetry
```

You will be prompted once on first use of `crelay init` or `crelay doctor`. Configuration is stored at `~/.crelay/config.json`.

## Safe Debug Policy

- Raw API keys are never printed.
- Raw `CRELAY_KEY_B64` values are never printed.
- Plaintext payloads are hidden unless `--show-payload` is passed.
- `--show-payload` prints an explicit warning.
- Full ciphertext is hidden by default.
- `--verbose` prints only truncated ciphertext.
- Error output is scrubbed for known secret values.

## Error Explanations

The CLI maps known CRelay gateway errors to human-readable fixes:

- `AUTH_MISSING_API_KEY`
- `AUTH_INVALID_API_KEY`
- `TARGET_NOT_ALLOWED`
- `ENVELOPE_INVALID`
- `KEY_UNKNOWN`
- `DECRYPT_FAILED`
- `AAD_MISMATCH`
- `REPLAY_DETECTED`
- `REQUEST_STALE`
- `REQUEST_FROM_FUTURE`
- `PAYLOAD_TOO_LARGE`
- `UPSTREAM_TIMEOUT`
- `UPSTREAM_ERROR`
- `RESPONSE_ENCRYPT_FAILED`
- `RATE_LIMITED`

For upstream failures, the CLI separates gateway success from upstream behavior. For example, an upstream `404` is reported as:

```text
CRelay worked, but your upstream returned 404. Check method/path or test the upstream directly with curl.
```
