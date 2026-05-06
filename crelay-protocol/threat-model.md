# Threat Model — CRelay Protocol

**Protocol Version:** 1  
**Status:** Stable

---

## 1. Scope

This threat model defines what the CRelay Protocol protects against, what it does not protect against, and the trust assumptions underlying its design. The scope is limited to the security properties provided by the protocol specification itself — not the security of any particular implementation, deployment configuration, or operational practice.

The protocol operates at the **application payload layer**. It protects the content of API requests and responses, independent of the transport layer. It is not a replacement for TLS, network security, or access control. It is a complementary layer that adds payload-level security guarantees that TLS alone cannot provide.

---

## 2. Threats Mitigated

### 2.1 Man-in-the-Middle (Payload Encryption Beyond TLS)

**Threat**: An attacker who can observe or modify traffic at a TLS termination point (load balancer, reverse proxy, CDN) can read or alter API payloads in plaintext.

**Mitigation**: The CRelay Protocol encrypts the payload using AES-256-GCM before it enters the network. Even if TLS is terminated at an intermediary, the payload remains encrypted and cannot be read without the encryption key. The payload is only decrypted at the designated gateway, which holds the key.

**Residual risk**: The plaintext exists briefly in memory at the client, the gateway, and the API server. Memory-scraping attacks at these points are not mitigated by the protocol.

### 2.2 Replay Attacks (Nonce + RequestId Dedup)

**Threat**: An attacker captures a valid encrypted request and resends it to the server to cause the same operation to execute multiple times.

**Mitigation**: Each request includes a UUID v4 `requestId`. The gateway tracks processed requestIds in a deduplication store (Redis-backed in the hosted version). If a requestId is seen more than once, the duplicate is rejected with `409 REPLAY_DETECTED`.

Additionally, AES-GCM nonce uniqueness (96-bit random, never reused with the same key) ensures that the same plaintext encrypted twice produces different ciphertexts, preventing ciphertext-level replay correlation.

**Residual risk**: Within the deduplication TTL window (typically 10 minutes), replays are reliably detected. After the TTL expires, a technically new submission of the same requestId would not be detected. However, the freshness validation (5-minute staleness window) makes this scenario infeasible — the request would be rejected as stale before the deduplication entry expires.

### 2.3 Cross-Route Replay (AAD Binding)

**Threat**: An attacker captures a valid encrypted request intended for one API endpoint and replays it to a different endpoint.

**Mitigation**: The AAD binding cryptographically ties each encrypted payload to the specific HTTP method, path, and tenant ID. If the AAD used during decryption does not match the AAD used during encryption, AES-GCM authentication fails and the request is rejected.

**Example**: A payload encrypted for `POST:/api/users:tenant_acme` cannot be successfully submitted as a request to `POST:/api/admin/escalate:tenant_acme`. The AAD mismatch causes cryptographic rejection.

**Residual risk**: None at the protocol level. AAD binding is a cryptographic guarantee enforced by AES-GCM.

### 2.4 Stale Request Replay (Timestamp Freshness)

**Threat**: An attacker captures a valid encrypted request and holds it for an extended period before replaying it.

**Mitigation**: Each envelope includes a timestamp. The gateway validates that the timestamp is within the acceptable window (5 minutes by default). Requests older than the maximum staleness are rejected with `TIMESTAMP_TOO_OLD`. Requests with timestamps too far in the future are rejected with `TIMESTAMP_FUTURE`.

**Residual risk**: Within the 5-minute staleness window, replay is theoretically possible but is mitigated by requestId deduplication. The combination of freshness validation and requestId deduplication creates overlapping defenses.

### 2.5 Payload Tampering (GCM Authentication)

**Threat**: An attacker modifies the ciphertext in transit (e.g., flipping bits) to alter the decrypted payload.

**Mitigation**: AES-GCM produces a 16-byte authentication tag that covers both the ciphertext and the AAD. Any modification to the ciphertext, the AAD, or the nonce is detected during decryption. The authentication tag verification fails, and the request is rejected.

**Residual risk**: None at the protocol level. AES-GCM authentication is a cryptographic guarantee. However, implementation bugs (e.g., failing to check the authentication tag, or using a non-constant-time comparison for the tag) could introduce vulnerabilities. Implementations must use well-tested cryptographic libraries.

### 2.6 Key Extraction (HSM-Backed in Hosted Version)

**Threat**: An attacker gains access to the gateway server and attempts to extract encryption keys.

**Mitigation**: In the hosted CRelay gateway, encryption keys are stored in a Hardware Security Module (HSM). Keys never leave the HSM in plaintext — all encryption and decryption operations are performed inside the HSM's tamper-resistant boundary. Even if the gateway server is fully compromised, the keys cannot be extracted.

**Residual risk**: Self-hosted deployments that do not use HSMs are vulnerable to key extraction if the server is compromised. The protocol specification does not mandate HSM usage, but it is strongly recommended for high-security deployments.

---

## 3. Threats NOT Mitigated

It is equally important to understand what the protocol does not protect against. Overstating security guarantees is more dangerous than understating them.

### 3.1 Compromised Client (Malicious Insider)

If a client has legitimate access to encryption keys and valid credentials, the protocol cannot prevent that client from making authorized requests. A malicious insider with valid keys can encrypt any payload they want, and the gateway will correctly process it.

The protocol authenticates the **payload**, not the **intent** of the person who created it. Authorization and business-logic validation must be handled by the API server.

### 3.2 Side-Channel Attacks on Client Machines

The protocol does not protect against side-channel attacks (timing attacks, power analysis, cache attacks) on the machines where encryption or decryption is performed. These are physical security concerns that must be addressed at the hardware and operating system level.

### 3.3 Denial of Service

The protocol does not mitigate denial-of-service (DoS) attacks. An attacker can flood the gateway with invalid envelopes, consuming CPU resources on decryption attempts. While AES-GCM decryption is fast, it is not free.

Rate limiting, connection throttling, and request size limits should be implemented at the infrastructure level to mitigate DoS attacks.

### 3.4 Traffic Analysis (Metadata Still Visible)

While the protocol encrypts the payload, metadata is still visible in the envelope and the HTTP request:

- The HTTP method and path are transmitted in plaintext (necessary for routing)
- The `kid`, `aadContext`, and `ts` fields in the envelope are not encrypted
- The size of the ciphertext reveals the approximate size of the plaintext
- Request timing patterns can reveal information about client behavior

An attacker performing traffic analysis can determine which endpoints are being called, how frequently, and by which tenants. The protocol does not attempt to hide this metadata because doing so would require fundamentally different network architecture (e.g., onion routing, mix networks).

---

## 4. Trust Assumptions

The protocol's security depends on the following trust assumptions:

### 4.1 Key Secrecy

The encryption keys are known only to the client and the gateway. If a key is compromised, all envelopes encrypted with that key can be decrypted by the attacker. Key management is therefore the single most critical operational concern.

### 4.2 Secure Random Number Generation

Nonce generation and requestId generation depend on cryptographically secure random number generators. If the RNG is compromised or predictable, nonce reuse becomes possible, breaking AES-GCM's security guarantees.

### 4.3 Clock Synchronization

Freshness validation assumes that client and server clocks are roughly synchronized (within the 5-minute staleness window). If the client's clock is severely skewed, legitimate requests may be rejected.

### 4.4 Deduplication Store Availability

Replay protection depends on the availability of the deduplication store. If the store is unavailable (e.g., Redis is down), the gateway must either reject all requests (fail-closed) or accept requests without replay protection (fail-open). The fail-closed approach is recommended for security-sensitive deployments.

### 4.5 Gateway Integrity

The protocol assumes the gateway operates correctly — it decrypts, validates, and forwards payloads without modification. If the gateway is compromised, the plaintext is exposed at the gateway layer.

---

## 5. Key Management Threats

Key management is the most operationally complex aspect of the protocol. The following key-related threats must be considered:

| Threat | Mitigation |
|--------|------------|
| Key leakage | HSM storage, access controls, audit logging |
| Key rotation failures | Overlapping key acceptance periods, `kid`-based routing |
| Key distribution | Out-of-band key exchange, key management service |
| Key destruction | Crypto-shredding — deleting a key renders all envelopes encrypted with that key permanently unreadable |
| Insider key access | Least-privilege access, key usage auditing, HSM enforcement |

The `kid` field in the envelope is the primary mechanism for key rotation. During rotation, the gateway accepts envelopes encrypted with both the old and new keys (identified by different `kid` values). Once all clients have transitioned to the new key, the old key can be retired.

---

## 6. Comparison with Alternatives

### 6.1 TLS Alone

TLS provides confidentiality and integrity for data in transit, but only between TLS endpoints. Once TLS terminates (at a load balancer, CDN, or reverse proxy), the payload is in plaintext. TLS also provides no replay protection, no route binding, and no freshness guarantees.

**CRelay advantage**: Payload protection survives TLS termination. Replay, route binding, and freshness are built in.

### 6.2 Mutual TLS (mTLS)

mTLS authenticates both the client and the server using certificates. It is effective for identity verification but does not provide payload-level encryption beyond the TLS session. mTLS also requires certificate management infrastructure (PKI, CRLs/OCSP, rotation), which is operationally complex.

**CRelay advantage**: Simpler key management (symmetric keys vs. PKI), payload protection beyond TLS, route binding, replay protection. mTLS can be used alongside CRelay for defense in depth.

### 6.3 JSON Web Encryption (JWE)

JWE is a standard for encrypting JSON content. It supports multiple algorithms and key agreement modes. However, JWE does not define AAD binding, replay protection, or freshness validation. A JWE token is a generic encrypted blob — it does not know which API route it belongs to, whether it has been replayed, or when it was created.

**CRelay advantage**: Purpose-built for API payload security with AAD binding, replay protection, and freshness built into the specification. JWE would require these features to be implemented ad hoc by each developer.

---

## 7. Why the Protocol Is Designed This Way

The CRelay Protocol is designed around three principles:

### 7.1 Composition of Independent Mechanisms

No single mechanism provides all security properties. AES-GCM provides confidentiality, integrity, and authenticity. AAD binding provides route binding. RequestId dedup provides replay protection. Timestamp validation provides freshness. Each mechanism is simple and well-understood. Their composition provides comprehensive payload security.

### 7.2 Fail-Closed by Default

Every verification step in the protocol fails closed. AAD mismatch → rejection. Auth tag failure → rejection. Stale timestamp → rejection. Duplicate requestId → rejection. The default behavior is to reject, not to accept. This ensures that any ambiguity or error results in a safe state.

### 7.3 Implementation Simplicity

The protocol is designed to be implementable correctly. AES-256-GCM is available in every major programming language's standard library or widely-used cryptographic library. UUID v4 generation is trivial. Timestamp comparison is trivial. The protocol avoids custom cryptographic constructions, novel algorithms, or complex state machines that are prone to implementation errors.

The hardest part of implementing the protocol is key management, which is an operational concern rather than a specification concern. The hosted gateway handles this for users who do not want to manage keys themselves.
