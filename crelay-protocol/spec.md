# CRelay Protocol — Main Specification

**Version:** 1  
**Status:** Stable  
**Algorithm:** AES-256-GCM

---

## 1. Overview

The CRelay Protocol defines a standard for encrypting, authenticating, and protecting API payloads beyond what TLS alone provides. While TLS secures data in transit between two network endpoints, it offers no protection once the TLS session terminates. Payloads are exposed at load balancers, API gateways, proxies, and any intermediary that terminates TLS.

The CRelay Protocol ensures that the **payload itself** is encrypted and authenticated, independent of the transport layer. An encrypted payload that is intercepted, replayed, or tampered with after TLS termination will be rejected by the protocol's verification steps.

The protocol is designed to be implemented as a drop-in layer between application code and the network. Developers encrypt requests before sending and decrypt responses after receiving. The gateway decrypts incoming requests, verifies their integrity and freshness, forwards the plaintext to the upstream API, then encrypts the response before returning it to the client.

---

## 2. Protocol Version

This document specifies **protocol version 1** (`v: 1`). All envelopes produced under this version must include the `v` field set to `1`. Future versions may introduce new fields, algorithms, or verification steps, but version 1 envelopes will always be processable by version 1 implementations.

Version negotiation is not part of this specification. Systems should agree on the protocol version out-of-band (e.g., via SDK configuration or gateway settings).

---

## 3. Algorithm

The protocol uses **AES-256-GCM** (Advanced Encryption Standard with 256-bit keys in Galois/Counter Mode) as its sole authenticated encryption algorithm for version 1.

### 3.1 Key Requirements

| Parameter | Requirement |
|-----------|------------|
| Key length | 256 bits (32 bytes) |
| Nonce length | 96 bits (12 bytes) |
| Authentication tag length | 128 bits (16 bytes) |

Keys must be generated using a cryptographically secure random number generator. Keys derived from passwords, predictable seeds, or non-CSPRNG sources are not compliant with this specification.

### 3.2 Why AES-256-GCM

AES-256-GCM is an authenticated encryption algorithm. It provides three security properties simultaneously:

1. **Confidentiality** — the ciphertext cannot be read without the key
2. **Integrity** — any modification to the ciphertext is detected
3. **Authenticity** — the authentication tag proves the ciphertext was produced by someone with the key

These three properties are essential for payload security. Using an algorithm that provides only confidentiality (e.g., AES-CBC without a MAC) would leave the protocol vulnerable to padding oracle attacks and bit-flipping attacks.

---

## 4. Envelope Structure

Every CRelay envelope is a JSON object with the following fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `v` | integer | Yes | Protocol version (must be `1`) |
| `alg` | string | Yes | Algorithm identifier (must be `"A256GCM"`) |
| `kid` | string | Yes | Key identifier for key rotation |
| `nonce` | string | Yes | Base64-encoded 12-byte nonce |
| `ciphertext` | string | Yes | Base64-encoded encrypted data with 16-byte auth tag appended |
| `aadContext` | string | Yes | The AAD binding string |
| `ts` | integer | Yes | Unix epoch milliseconds timestamp |
| `meta` | object | No | Optional metadata (e.g., `requestId`) |

See [envelope-format.md](./envelope-format.md) for the complete schema and detailed field descriptions.

---

## 5. Request Flow

The CRelay Protocol defines a symmetric request-response flow:

### 5.1 Client → Gateway (Request)

1. The client constructs the inner payload: `{ data: <business_data>, timestamp: <current_ms>, requestId: <uuid_v4> }`
2. The client serializes the inner payload to JSON
3. The client derives the AAD string from the HTTP method, path, and tenant ID: `METHOD:/path:tenantId`
4. The client generates a 12-byte random nonce
5. The client encrypts the JSON plaintext using AES-256-GCM with the key, nonce, and AAD
6. The client appends the 16-byte authentication tag to the ciphertext
7. The client base64-encodes both the nonce and the ciphertext+tag
8. The client constructs the envelope and sends it as the HTTP request body

### 5.2 Gateway Processing

1. The gateway receives the envelope
2. The gateway resolves the key using `kid`
3. The gateway base64-decodes the nonce and ciphertext
4. The gateway splits the ciphertext (all bytes except the last 16) from the auth tag (last 16 bytes)
5. The gateway reconstructs the AAD from the actual HTTP method, path, and tenant ID
6. The gateway decrypts using AES-256-GCM, providing the AAD — if the AAD does not match, decryption fails with an authentication error
7. The gateway parses the inner payload and validates the timestamp for freshness
8. The gateway checks the `requestId` against a deduplication store — if seen before, rejects with `409 REPLAY_DETECTED`
9. The gateway records the `requestId` in the deduplication store with a TTL
10. The gateway forwards the decrypted `data` to the upstream API

### 5.3 Gateway → Client (Response)

1. The gateway receives the plaintext response from the upstream API
2. The gateway constructs a response inner payload with a fresh timestamp
3. The gateway derives the response AAD: `RESPONSE:/path:tenantId`
4. The gateway encrypts using AES-256-GCM with a new random nonce
5. The gateway returns the response envelope to the client

### 5.4 Client Decryption

1. The client receives the response envelope
2. The client derives the expected response AAD
3. The client decrypts and verifies — any AAD mismatch or authentication failure rejects the response

---

## 6. Security Properties

The CRelay Protocol provides the following security properties:

| Property | Mechanism | Document |
|----------|-----------|----------|
| **Confidentiality** | AES-256-GCM encryption | This document |
| **Integrity** | GCM authentication tag | This document |
| **Authenticity** | GCM authentication tag + shared key | This document |
| **Replay Protection** | Nonce uniqueness + requestId dedup | [replay-protection.md](./replay-protection.md) |
| **Freshness** | Timestamp validation | [freshness.md](./freshness.md) |
| **Route Binding** | AAD context binding | [aad-binding.md](./aad-binding.md) |

No single mechanism provides all properties. The protocol achieves its security through the **composition** of these mechanisms. Removing any one weakens the overall security posture.

---

## 7. Compatibility Notes

- **Transport**: The protocol is transport-agnostic. It works over HTTPS, HTTP/2, WebSockets, or any medium that can carry a JSON payload.
- **Character encoding**: All JSON must be UTF-8 encoded.
- **Base64 variant**: Standard Base64 encoding (RFC 4648) with padding. URL-safe Base64 is not used.
- **Key rotation**: The `kid` field enables key rotation without downtime. Gateways should support multiple active keys simultaneously.
- **Backward compatibility**: New protocol versions may add fields but must not remove or change the semantics of existing fields. Implementations should ignore unknown fields in envelopes from newer versions.
- **Integer precision**: The `ts` field uses Unix epoch milliseconds, which requires 64-bit integer support. JSON parsers that truncate to 32-bit integers will produce incorrect timestamps after January 19, 2038.

---

## 8. Normative References

- [NIST SP 800-38D](https://csrc.nist.gov/publications/detail/sp/800-38d/final) — Recommendation for Block Cipher Modes of Operation: Galois/Counter Mode (GCM)
- [RFC 5116](https://www.rfc-editor.org/rfc/rfc5116) — An Interface and Algorithms for Authenticated Encryption
- [RFC 4648](https://www.rfc-editor.org/rfc/rfc4648) — The Base16, Base32, and Base64 Data Encodings
- [RFC 4122](https://www.rfc-editor.org/rfc/rfc4122) — A Universally Unique Identifier (UUID) URN Namespace
