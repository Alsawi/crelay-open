# CRelay Open Roadmap

CRelay Open is in beta. This roadmap describes the public SDK, CLI, protocol, and quickstart work planned for the open-source repository.

## Current focus: beta hardening

- Improve SDK test coverage for envelope validation, replay metadata, and decrypt failure cases.
- Improve CLI setup validation and actionable error messages.
- Expand quickstart examples for common API relay flows.
- Clarify protocol documentation and threat model assumptions.
- Add safe diagnostics examples that demonstrate redaction-first logging.

## Near-term milestones

### 0.4.x beta

- Stabilize quickstart developer experience.
- Add more SDK usage examples.
- Add protocol examples for valid and invalid envelopes.
- Improve CI and release hygiene.
- Add issue templates and security reporting flow.

### 0.5.x beta

- Add browser-safe documentation where applicable.
- Add more CLI validation commands.
- Add integration examples for common backend frameworks.
- Improve replay protection documentation.
- Add redaction test fixtures.

### 1.0 candidate

- Freeze public envelope format.
- Publish stable SDK and CLI documentation.
- Define compatibility policy.
- Provide migration notes for beta users.
- Document production integration guidance and clear non-goals.

## Future ideas

These are intentionally not committed for a specific release yet:

- Additional language SDKs.
- HAR-like redacted diagnostic export for local development.
- More formal protocol test vectors.
- Example reverse proxy integrations.
- Optional local gateway reference implementation for development only.

## Out of scope for this repository

- Hosted CRelay gateway source code.
- Managed production relay infrastructure.
- Production console source code.
- Customer-specific deployments.
- Secrets, credentials, private operational configuration, or production keys.
