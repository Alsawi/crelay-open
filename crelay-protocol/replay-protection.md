# Replay Protection — Request Deduplication and Nonce Management

**Protocol Version:** 1  
**Status:** Stable

---

## 1. Why Replay Protection Matters

A replay attack occurs when an attacker captures a valid encrypted request and resends it to the server at a later time. Without replay protection, the server has no way to distinguish the replayed request from a legitimate one — both contain valid ciphertext, valid AAD, and valid authentication tags.

Replay attacks are particularly dangerous in financial and state-changing APIs. Consider a request that transfers funds between accounts. If an attacker captures and replays this request ten times, the transfer executes ten times. The encryption is valid. The AAD is valid. The server processes each replay as if it were a new, legitimate request.

Replay protection ensures that each encrypted request can be processed **exactly once**. After a request is processed, any subsequent submission of the same request is detected and rejected.

---

## 2. Nonce Uniqueness Requirements

AES-GCM requires that the same nonce is **never used twice** with the same key. If a nonce is reused with the same key, the security of AES-GCM collapses — an attacker can recover the authentication key and forge ciphertexts.

The CRelay Protocol mandates the following nonce generation strategy:

| Property | Requirement |
|----------|-------------|
| Nonce length | 96 bits (12 bytes) |
| Generation method | Cryptographically secure random number generator |
| Uniqueness scope | Must never repeat with the same key |

With 96-bit random nonces, the probability of a collision reaches approximately 2⁻³² after 2³² encryptions with the same key (by the birthday bound). For most deployments, this provides an ample safety margin. However, keys should be rotated well before approaching 2³² encryptions.

**Nonces must not be:**
- Sequential counters (they leak request ordering)
- Derived from timestamps (they create collision risk under high concurrency)
- Hardcoded or reused from previous requests
- Generated from non-CSPRNG sources

Every encryption operation must generate a fresh, random 12-byte nonce.

---

## 3. RequestId — Application-Level Deduplication

While the nonce provides cryptographic-level replay protection (by ensuring AES-GCM security), the protocol also requires an application-level deduplication mechanism via the `requestId` field.

### 3.1 RequestId Requirements

| Property | Requirement |
|----------|-------------|
| Format | UUID v4 |
| Uniqueness | Must be unique per request across the entire tenant |
| Generation | Client-side, using a UUID v4 generator |
| Location | Inside the inner payload and mirrored in the `meta` object |

UUID v4 provides 122 bits of randomness, making collisions astronomically unlikely in practice. The combination of a random nonce (crypto level) and a UUID v4 requestId (application level) provides defense in depth.

### 3.2 Why Both Nonce and RequestId

The nonce and the requestId serve different purposes:

| Aspect | Nonce | RequestId |
|--------|-------|-----------|
| Purpose | Ensures AES-GCM cryptographic security | Enables application-level deduplication |
| Scope | Per encryption operation | Per business request |
| Visibility | Inside the envelope (not in plaintext) | Extractable without decryption (in `meta`) |
| Storage | Not tracked server-side | Tracked in deduplication store |
| Failure mode | AES-GCM authentication failure | 409 REPLAY_DETECTED response |

The nonce prevents cryptographic attacks on AES-GCM. The requestId prevents business-level replay. Both are necessary. A nonce alone cannot prevent replay because the same business request encrypted with a different nonce produces a different ciphertext — but both are valid. A requestId alone cannot prevent cryptographic attacks from nonce reuse.

---

## 4. Server-Side Deduplication

### 4.1 RequestId Tracking

The gateway maintains a deduplication store that records every processed requestId. When a new request arrives:

1. The gateway decrypts the envelope and extracts the `requestId`
2. The gateway checks the deduplication store for the requestId
3. If the requestId is found, the gateway rejects the request with `409 REPLAY_DETECTED`
4. If the requestId is not found, the gateway processes the request and records the requestId

### 4.2 TTL-Based Expiration

Each requestId entry in the deduplication store has a **time-to-live (TTL)**. After the TTL expires, the entry is automatically removed. This prevents unbounded growth of the deduplication store while maintaining replay protection for the window of time that matters.

The TTL should be set to at least the maximum request staleness window (5 minutes by default, as specified in [freshness.md](./freshness.md)) plus a safety margin. A typical TTL is **10 minutes** (600,000 ms). This ensures that even if a stale request arrives just before the freshness window closes, its requestId remains in the store long enough to catch replays.

### 4.3 Cleanup

The deduplication store must handle cleanup through one of the following mechanisms:

- **Redis EXPIRE**: Automatic key expiration (recommended for production)
- **Periodic sweep**: A background process that scans and removes expired entries
- **LRU eviction**: When the store reaches capacity, least-recently-used entries are evicted

Redis with TTL is the recommended approach because it provides automatic, distributed cleanup without requiring a background process.

---

## 5. Redis-Backed Replay Rejection

The hosted CRelay gateway uses Redis as the deduplication store. The implementation follows this pattern:

```
SET requestId:<uuid> 1 EX 600 NX
```

Where:
- `NX` — only set if the key does not already exist (atomic check-and-set)
- `EX 600` — expire after 600 seconds (10 minutes)

If the `SET` returns `OK`, the requestId is new — process the request.
If the `SET` returns `nil`, the requestId already exists — reject with `409 REPLAY_DETECTED`.

This approach is atomic, distributed, and requires no additional coordination. Multiple gateway instances sharing the same Redis cluster will correctly deduplicate requests without race conditions.

---

## 6. Replay Detection Response

When a replay is detected, the gateway returns:

```
HTTP/1.1 409 Conflict
Content-Type: application/json

{
  "error": "REPLAY_DETECTED",
  "message": "This request has already been processed.",
  "requestId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

The `409 Conflict` status code indicates that the request conflicts with the current state of the server (i.e., the requestId has already been seen). The response includes the `requestId` so that the client can correlate the rejection with a specific request.

Replay detection is not a transient error. Retrying the same request will produce the same result. The client must generate a new requestId (which means creating a new request, not simply resubmitting the same one).

---

## 7. Difference Between Nonce and RequestId

This distinction is critical and often misunderstood:

**Nonce** — A random 12-byte value that ensures each AES-GCM encryption operation is unique. Its purpose is to maintain the cryptographic security of AES-GCM. If two plaintexts are encrypted with the same key and the same nonce, AES-GCM's confidentiality and integrity guarantees are broken. The nonce is opaque to the business logic and is not used for deduplication.

**RequestId** — A UUID v4 that identifies a specific business request. Its purpose is to enable application-level deduplication. The gateway tracks requestIds to ensure that no business request is processed more than once. The requestId is meaningful to the business logic and is explicitly checked against the deduplication store.

They operate at different layers of the security stack. The nonce operates at the cryptographic layer. The requestId operates at the application layer. The protocol requires both because neither alone provides complete replay protection.

---

## 8. Edge Cases and Considerations

### 8.1 Retries

Clients that implement automatic retries (e.g., with exponential backoff) must generate a new requestId for each retry attempt. Retrying with the same requestId will be treated as a replay and rejected.

### 8.2 Idempotent Operations

Even for idempotent operations, replay protection is enforced. An idempotent operation executed twice produces the same result, but the protocol still rejects the replay. This ensures consistent observability — every accepted request is unique.

### 8.3 Distributed Gateways

When multiple gateway instances share a Redis cluster, deduplication works correctly across all instances. When gateway instances do not share a deduplication store (e.g., in air-gapped deployments), the system administrator must accept the risk of cross-instance replay or implement an alternative deduplication mechanism.

### 8.4 Nonce Reuse Detection

If a nonce is accidentally reused with the same key, AES-GCM will still decrypt successfully (assuming the plaintext is the same), but the security of subsequent encryptions with that key is compromised. Key rotation should be performed immediately if nonce reuse is detected.
