# CRelay Open

Open-source SDK, protocol spec, and quickstart examples for CRelay.

Encrypted API relay with replay protection.

## Packages

- **crelay-sdk-js** — Node.js SDK for encrypting/decrypting API payloads with AES-256-GCM (published as `@crelay/sdk`)
- **crelay-cli** — Developer integration CLI for initializing config, validating setup, and sending secure test requests (published as `@crelay/cli`)
- **crelay-protocol** — Protocol specification, envelope format, and threat model
- **crelay-quickstart** — End-to-end demo with mock gateway, upstream API, and client

## Hosted Gateway

The hosted CRelay gateway infrastructure is private and not included in this repository. The mock gateway in quickstart is for demo purposes only and is not production-grade.

## Quick Start

```bash
npm install
npm run build
npm run test
```

To run the quickstart demo:

```bash
# Terminal 1: Start upstream API
npm run quickstart:upstream

# Terminal 2: Start mock gateway
npm run quickstart:gateway

# Terminal 3: Run client demo
npm run quickstart:client
```

## Links

- **Website:** [crelay.dev](https://crelay.dev)
- **Repository:** [github.com/Alsawi/crelay-open](https://github.com/Alsawi/crelay-open)
- **NPM package:** [@crelay/sdk](https://www.npmjs.com/package/@crelay/sdk)
