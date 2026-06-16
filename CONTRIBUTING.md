# Contributing to CRelay Open

Thank you for helping improve CRelay Open. This repository is focused on the public SDK, CLI, protocol specification, and quickstart examples.

## Good first contributions

Good areas to start:

- Fix quickstart documentation.
- Add SDK tests.
- Improve CLI error messages.
- Review protocol wording and threat model clarity.
- Add examples for common Node.js API clients.
- Improve redaction and safe diagnostics tests.

## Development setup

```bash
npm install
npm run build
npm run test
```

Run the quickstart demo:

```bash
npm run quickstart:upstream
npm run quickstart:gateway
npm run quickstart:client
```

Use separate terminals for each process.

## Pull request checklist

Before opening a PR:

- Keep the change focused.
- Add or update tests when behavior changes.
- Update documentation for user-visible changes.
- Do not commit secrets, `.env` files, credentials, tokens, or private keys.
- Do not log raw `Authorization`, `Cookie`, `Set-Cookie`, API keys, JWTs, or private keys.
- Confirm `npm run build` passes.
- Confirm `npm run test` passes.

## Commit style

Use short conventional-style messages when possible:

- `fix: handle empty envelope metadata`
- `feat: add CLI validation command`
- `docs: clarify replay protection`
- `test: add SDK decrypt failure coverage`

## Security-sensitive changes

For security-sensitive changes, explain:

- What threat or misuse case is being addressed.
- What data may be sensitive.
- How redaction is applied.
- What tests cover the behavior.

Read [SECURITY.md](./SECURITY.md) before changing protocol, encryption, key handling, logging, or diagnostic behavior.

## Scope boundaries

This repository does not contain the hosted CRelay gateway, managed relay infrastructure, production console, or production control plane. Contributions should stay within the public SDK, CLI, protocol, quickstart, and documentation unless a maintainer explicitly opens that scope.
