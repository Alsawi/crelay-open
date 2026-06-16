# CRelay Open Architecture

CRelay Open contains the public developer-facing parts of the CRelay ecosystem.

## Components

```text
client application
   |
   | creates encrypted CRelay envelope
   v
@crelay/sdk or @crelay/cli
   |
   | sends envelope
   v
mock gateway in quickstart
   |
   | forwards demo request
   v
upstream demo API
```

## Packages

### `crelay-sdk-js`

The JavaScript SDK creates and reads encrypted CRelay payload envelopes. It is intended for backend applications and developer tools that need a safe, documented way to package sensitive API payloads.

Responsibilities:

- Envelope creation.
- Envelope parsing.
- AES-256-GCM encryption/decryption primitives.
- Validation helpers.
- Test coverage for success and failure paths.

### `crelay-cli`

The CLI helps developers initialize configuration, validate local setup, and send secure test requests.

Responsibilities:

- Developer onboarding.
- Local validation commands.
- Safe test request generation.
- Clear, actionable errors.

### `crelay-protocol`

The protocol package documents the envelope format, metadata, replay protection assumptions, and threat model.

Responsibilities:

- Wire format documentation.
- Security assumptions.
- Compatibility notes.
- Test-vector style examples where possible.

### `crelay-quickstart`

The quickstart demonstrates the end-to-end flow using a client demo, mock gateway, and upstream API.

Responsibilities:

- Local demo only.
- Developer education.
- Safe examples.
- No production security guarantees.

## Security boundaries

The quickstart mock gateway is not a production gateway. It exists so developers can understand the flow locally.

Production CRelay services are outside this repository and include managed infrastructure such as the hosted gateway, relay services, production console, and control plane.

## Data handling principles

CRelay Open examples should follow these rules:

- Redact secrets before logging.
- Do not log full sensitive payloads.
- Treat headers and query strings as sensitive.
- Avoid storing raw credentials or private keys.
- Keep quickstart configuration local and disposable.

## Maintainer workflow

Recommended validation before release:

```bash
npm install
npm run build
npm run test
npm run quickstart:check
```

Release notes should document protocol, SDK, or CLI behavior changes clearly because downstream users may depend on envelope compatibility.
