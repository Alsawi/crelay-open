# CRelay Protocol Specification

**Open protocol specification for encrypted API relay with replay protection.**

---

## The Key Message

> **HTTPS protects the pipe. CRelay protects the payload.**

TLS encrypts data in transit, but once it reaches an intermediary or a compromised endpoint, the payload is exposed. The CRelay Protocol ensures that API payloads remain encrypted, authenticated, and tamper-proof — even after TLS terminates — and adds replay protection, freshness validation, and route-bound AAD that TLS cannot provide.

---

## Our Advantage

Our advantage is not AES-GCM. AES-GCM is standard. Our advantage is **route-bound AAD**, **replay protection as a product**, and **drop-in SDK + gateway flow**.

Most encryption libraries stop at providing a `encrypt(key, plaintext)` function. They leave the hard problems — how to bind encryption to a specific API route, how to reject replayed requests at scale, how to ensure freshness — entirely to the developer. The CRelay Protocol solves these problems at the specification level, so every implementation gets them for free.

---

## Specification Documents

| Document | Description |
|----------|-------------|
| [spec.md](./spec.md) | Main specification — overview, algorithm, envelope structure, request flow, and security properties |
| [aad-binding.md](./aad-binding.md) | Route-bound Additional Authenticated Data (AAD) — prevents cross-route replay attacks |
| [replay-protection.md](./replay-protection.md) | Request deduplication and nonce management — prevents replayed requests |
| [freshness.md](./freshness.md) | Timestamp validation — prevents stale request replay and clock-skew attacks |
| [envelope-format.md](./envelope-format.md) | Complete wire format specification — JSON schema, field descriptions, and versioning |
| [threat-model.md](./threat-model.md) | Threat model — what the protocol mitigates, what it doesn't, and trust assumptions |
| [examples/](./examples/) | Example request and response envelopes in JSON |

---

## Related Repositories

- **SDK**: [`@crelay/sdk`](https://github.com/Alsawi/crelay-open) — Drop-in client SDK for encrypting and decrypting payloads
- **Quickstart**: [`crelay-quickstart`](https://github.com/Alsawi/crelay-open) — Get up and running in 5 minutes

---

## Protocol at a Glance

```
Client                  Gateway                  API Server
  |                        |                        |
  |  Encrypt payload       |                        |
  |  Bind AAD to route     |                        |
  |  Attach freshness ts   |                        |
  |-------- envelope ----->|                        |
  |                        |  Decrypt & validate    |
  |                        |  Check replay          |
  |                        |  Verify freshness      |
  |                        |  Verify AAD binding    |
  |                        |-------- plaintext ---->|
  |                        |                        |
  |                        |<-- response payload ---|
  |                        |                        |
  |                        |  Encrypt response      |
  |                        |  Bind AAD to route     |
  |<------- envelope ------|                        |
  |                        |                        |
  |  Decrypt & verify      |                        |
```

---

## License

This specification is licensed under **Creative Commons Attribution 4.0 International (CC BY 4.0)**.

You are free to share and adapt this material for any purpose, including commercial, as long as you give appropriate credit. This ensures the protocol remains open and implementable by anyone while preserving attribution.

---

## Contributing

This is a protocol specification. Contributions that improve clarity, add threat analysis, or propose backward-compatible extensions are welcome. Breaking changes require a new protocol version.
