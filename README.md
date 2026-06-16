# CRelay Open

[![Open Source](https://img.shields.io/badge/open%20source-CRelay-black)](https://github.com/Alsawi/crelay-open)
[![Security](https://img.shields.io/badge/security-redaction%20first-blue)](./SECURITY.md)

CRelay Open is the open-source developer toolkit for CRelay: a secure API relay and encrypted payload workflow for teams that need safer API integrations, replay protection, and inspectable request flows without exposing raw secrets.

This repository contains the public SDK, CLI, protocol specification, and quickstart examples. The hosted CRelay gateway and production control plane are not included here.

## Why CRelay exists

Modern applications call many internal and third-party APIs. Those calls often carry credentials, customer identifiers, tokens, and business-sensitive payloads. CRelay focuses on making API relay workflows safer by providing:

- Client-side encrypted payload envelopes.
- AES-256-GCM based message protection.
- Replay protection primitives.
- A documented protocol and threat model.
- A CLI for setup validation and secure test requests.
- A quickstart mock gateway for local experimentation.
- Redaction-first design for logs, debugging, and future traffic inspection workflows.

## Repository packages

| Package | Purpose |
| --- | --- |
| `crelay-sdk-js` | Node.js SDK for encrypting and decrypting CRelay payload envelopes. Published as `@crelay/sdk`. |
| `crelay-cli` | Developer CLI for initializing config, validating setup, and sending secure test requests. Published as `@crelay/cli`. |
| `crelay-protocol` | Protocol specification, envelope format, and threat model. |
| `crelay-quickstart` | Local demo with client, mock gateway, and upstream API. |

## What is not included

The hosted CRelay gateway, managed relay infrastructure, production console, and production control plane are private services and are not part of this repository. The quickstart mock gateway is for development and demonstration only. Do not use it as a production security boundary.

## Quick start

Requirements:

- Node.js 20 or newer
- npm 10 or newer

Install, build, and test:

```bash
npm install
npm run build
npm run test
```

Run the quickstart demo in three terminals:

```bash
# Terminal 1: start upstream API
npm run quickstart:upstream

# Terminal 2: start mock gateway
npm run quickstart:gateway

# Terminal 3: run client demo
npm run quickstart:client
```

Optional health check:

```bash
npm run quickstart:check
```

## Basic workflow

1. Use the SDK or CLI to create an encrypted CRelay envelope.
2. Send the envelope to a gateway or mock gateway.
3. The gateway validates envelope metadata and forwards only safe, expected data.
4. Replay protection and envelope validation help reduce accidental or malicious request reuse.

See `crelay-protocol` for the wire format and security assumptions.

## Security model

CRelay Open follows these principles:

- Never log raw authorization headers, cookies, API keys, tokens, private keys, or full sensitive payloads.
- Prefer explicit envelope validation over implicit trust.
- Treat local quickstart components as demos, not production hardening.
- Keep redaction enabled for developer-facing diagnostics.
- Document security assumptions and known limitations.

For vulnerability reporting, read [SECURITY.md](./SECURITY.md).

## Project status

CRelay Open is in beta. The SDK, CLI, protocol docs, and quickstart are intended for early developers and reviewers. APIs may change before a stable 1.0 release.

See [ROADMAP.md](./ROADMAP.md) for planned work.

## Contributing

Contributions are welcome. Good first contributions include documentation improvements, quickstart fixes, SDK tests, CLI usability improvements, and protocol review feedback.

Before opening a pull request, read [CONTRIBUTING.md](./CONTRIBUTING.md) and [SECURITY.md](./SECURITY.md).

## Useful links

- Website: https://crelay.dev
- Repository: https://github.com/Alsawi/crelay-open
- npm package: https://www.npmjs.com/package/@crelay/sdk

## License

This project is licensed under the Apache License 2.0. See [LICENSE](./LICENSE).
