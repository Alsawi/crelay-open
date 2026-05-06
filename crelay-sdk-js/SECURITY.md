# Security Policy

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a vulnerability in
the **CRelay SDK for JavaScript/TypeScript** (`@crelay/sdk`),
please report it responsibly.

### How to Report

**Preferred method — encrypted email:**

Send a PGP-encrypted email to **security@crelay.dev** using the public key
below.

**Alternative method — GitHub:**

Open a private vulnerability report at
[github.com/Alsawi/crelay-open/security/advisories](https://github.com/Alsawi/crelay-open/security/advisories).

### PGP Public Key

```
-----BEGIN PGP PUBLIC KEY BLOCK-----
xjMEZ4bWFhYJKwYBBAHaRw8BAQdAXS5vY5x2e5h3b2NvbnRhY3RAc2Vj
dXJlZ2F0ZS5kZXbCjwQTAAoAQQQUFBAAAAAABQUAAAAAAAABAAAAAAAA
AAAAAAAYgqV6qS7bY5x2e5h3b2NvbnRhY3RAc2VjdXJlZ2F0ZS5kZXYg
PHNlY3VyaXR5QHNlY3VyZWdhdGUuZGV2PsKUBBMWCgA8FiEEZ4bWFiEE
Z4bWFiEEZ4bWFiEEZ4bWABQJZ4bWFhsAgcSgAA==
-----END PGP PUBLIC KEY BLOCK-----
```

> **Note:** Replace this placeholder with your actual PGP key before
> open-sourcing. Generate one with `gpg --full-generate-key` and export with
> `gpg --armor --export security@crelay.dev`.

### Response Timeline

| Milestone                     | Target         |
|-------------------------------|----------------|
| Acknowledgment of report      | 48 hours       |
| Initial triage and assessment | 5 business days|
| Patch or mitigation released  | 30 days        |
| Coordinated public disclosure | 90 days        |

We will keep you informed at each milestone. If a patch requires more than
30 days, we will communicate an updated timeline and provide interim
mitigations where possible.

## Bug Bounty Program

We run a bug bounty program for critical vulnerabilities discovered in this SDK.
Eligible findings include:

- Cryptographic implementation flaws (key handling, nonce reuse, AAD bypass)
- Authentication or authorisation bypass
- Data leakage or injection vectors

Visit [crelay.dev/security](https://crelay.dev/security) for program
details, reward tiers, and scope.

## Scope

**In scope:**

- Source code in this repository (`@crelay/sdk`)
- Cryptographic primitives (`src/crypto.ts`)
- AAD construction and validation (`src/aad.ts`)
- Client request/response handling (`src/client.ts`)
- Envelope format and validation

**Out of scope:**

- The hosted CRelay gateway service (report to the gateway security team)
- Third-party dependencies (report upstream; we will track and patch)
- Denial-of-service attacks
- Social engineering

## Supported Versions

| Version | Supported          |
|---------|--------------------|
| 0.1.x   | ✅ Active development|
| < 0.1   | ❌ Pre-release      |

## Disclosure Policy

We follow **coordinated disclosure**. We ask that reporters:

1. Do not publicly disclose the vulnerability before a patch is available.
2. Allow us 90 days from acknowledgment before public disclosure.
3. Credit will be given in the advisory unless the reporter prefers to remain
   anonymous.

## Contact

- **Security email:** security@crelay.dev
- **General inquiries:** support@crelay.dev
- **GitHub Security Advisories:** [open a report](https://github.com/Alsawi/crelay-open/security/advisories)
