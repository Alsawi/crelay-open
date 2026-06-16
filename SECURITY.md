# Security Policy

CRelay handles security-sensitive API workflows. Please treat any suspected vulnerability seriously and avoid public disclosure until it is reviewed.

## Supported scope

Security reports are welcome for:

- `crelay-sdk-js`
- `crelay-cli`
- `crelay-protocol`
- `crelay-quickstart`
- Documentation that may cause unsafe implementation choices

The quickstart mock gateway is intentionally a demo component and is not a production security boundary. Reports about the mock gateway are still useful when they reveal unsafe examples or misleading documentation.

## Reporting a vulnerability

Please do not open a public GitHub issue for security vulnerabilities.

Send a private report to the repository maintainer through GitHub Security Advisories when available, or contact the maintainer using the contact information on the CRelay website.

Include as much as possible:

- Affected package or file path.
- Impact and exploitability.
- Minimal reproduction steps.
- Whether secrets, tokens, cookies, private keys, or customer data could be exposed.
- Suggested fix if known.

## Security principles

CRelay Open follows these rules:

- Do not log raw `Authorization`, `Cookie`, `Set-Cookie`, API keys, agent tokens, private keys, JWTs, or provider secrets.
- Do not store full request or response bodies in diagnostics.
- Redact before displaying diagnostic or traffic metadata.
- Treat URL query strings as sensitive because they may contain tokens.
- Use authenticated encryption for payload envelopes.
- Prefer deny-by-default behavior for ambiguous protocol states.
- Fail safely when replay protection or validation state is unavailable.

## Dependency security

When changing dependencies:

- Prefer maintained packages with clear licenses.
- Avoid adding dependencies for small utility functions.
- Run tests before opening a pull request.
- Document security-sensitive dependency changes in the pull request.

## Responsible disclosure

We aim to acknowledge reports quickly and provide a remediation plan after triage. Public disclosure should wait until a fix or mitigation is available unless active exploitation requires urgent coordinated disclosure.
