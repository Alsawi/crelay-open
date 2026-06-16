# Changelog

## v0.4.1-beta

Initial public beta readiness release for CRelay Open.

### Added

- Public OSS README with project positioning, package overview, quickstart, security model, contribution guidance, and beta status.
- Apache 2.0 root repository license.
- Security policy for vulnerability reporting and redaction-sensitive contribution guidance.
- Contribution guide with development setup and PR checklist.
- Public roadmap for beta hardening, 0.5.x beta, and 1.0 candidate work.
- Code of conduct.
- Architecture overview for SDK, CLI, protocol, and quickstart components.
- GitHub issue templates for bugs and feature requests.
- Pull request template with security checklist.
- GitHub Actions CI for SDK build and test on Node 24.
- Open roadmap issues for protocol examples, SDK coverage, CLI validation, and framework examples.

### Security

- Documented redaction-first principles for headers, cookies, API keys, tokens, private keys, and sensitive payloads.
- Added SECURITY.md guidance for responsible disclosure and security-sensitive changes.
- Added PR checklist items to prevent accidental secret logging or unsafe diagnostics.

### Notes

- This is a beta release marker for the public OSS repository.
- The hosted CRelay gateway, production console, managed relay infrastructure, and production control plane are not included in this repository.
- The quickstart mock gateway remains development/demo-only and is not a production security boundary.
