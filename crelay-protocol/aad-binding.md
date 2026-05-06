# AAD Binding — Route-Bound Additional Authenticated Data

**Protocol Version:** 1  
**Status:** Stable

---

## 1. What Is AAD?

AAD stands for **Additional Authenticated Data**. In the context of AES-GCM, AAD is data that is included in the authentication tag computation but is **not encrypted**. When AES-GCM decrypts a ciphertext, it also verifies the AAD. If the AAD provided during decryption does not exactly match the AAD provided during encryption, the authentication check fails and decryption is rejected.

This is a standard feature of authenticated encryption with associated data (AEAD) algorithms. AES-GCM computes the authentication tag over both the ciphertext and the AAD, creating a cryptographic binding between them. The AAD is integrity-protected and authenticity-protected, but it remains in plaintext and is not subject to confidentiality protection.

Think of AAD as a tamper-evident label attached to the encrypted payload. Anyone can read the label, but no one can change it without the change being detected during decryption.

---

## 2. Why AAD Binding Matters

Without AAD binding, an encrypted payload is a self-contained blob. An attacker who captures a valid encrypted request to `/api/users` can replay it to `/api/admin/delete` if the same key is used. The decryption will succeed because the ciphertext is valid — the algorithm has no way of knowing the payload was intended for a different endpoint.

This is **cross-route replay**. It is one of the most dangerous attacks on encrypted API payloads because:

- The attacker does not need to decrypt anything — they just replay a valid ciphertext to a different endpoint
- The attack works even when replay protection (requestId dedup) is in place, because the request is technically new at the target endpoint
- The attack is completely invisible to standard monitoring, which only checks whether decryption succeeded

AAD binding prevents this by cryptographically tying each encrypted payload to the specific route it was intended for. A payload encrypted for `POST:/api/users:tenant_abc` cannot be successfully decrypted as a request to `POST:/api/admin/delete:tenant_abc`. The AAD will not match, the authentication tag will fail, and decryption will be rejected.

---

## 3. Request AAD Format

For client-to-gateway requests, the AAD string is constructed as:

```
METHOD:/path:tenantId
```

Where:

| Component | Description | Example |
|-----------|-------------|---------|
| `METHOD` | The HTTP method in uppercase | `POST`, `GET`, `PUT`, `DELETE` |
| `/path` | The request path (no query string, no trailing slash) | `/api/internal/transfer` |
| `tenantId` | The tenant identifier for multi-tenant isolation | `tenant_acme` |

**Examples:**

| Request | AAD String |
|---------|------------|
| `POST /api/users` for tenant `acme` | `POST:/api/users:tenant_acme` |
| `GET /api/orders/123` for tenant `globex` | `GET:/api/orders/123:tenant_globex` |
| `DELETE /api/sessions/current` for tenant `initech` | `DELETE:/api/sessions/current:tenant_initech` |

The AAD string is constructed by the client before encryption. The gateway independently constructs the same string from the incoming HTTP request and uses it during decryption. Any mismatch causes decryption to fail.

---

## 4. Response AAD Format

For gateway-to-client responses, the AAD string is constructed as:

```
RESPONSE:/path:tenantId
```

The `RESPONSE` prefix distinguishes response AAD from request AAD, preventing a request envelope from being used as a response envelope (and vice versa). The path and tenantId are the same values from the original request.

**Examples:**

| Response | AAD String |
|----------|------------|
| Response to `POST /api/internal/transfer` for tenant `acme` | `RESPONSE:/api/internal/transfer:tenant_acme` |
| Response to `GET /api/users` for tenant `globex` | `RESPONSE:/api/users:tenant_globex` |

The client independently constructs the expected response AAD using the same path and tenant ID from the original request. If the AAD in the response envelope does not match, the client rejects the response.

---

## 5. AAD Verification During Decryption

When decrypting, the recipient must:

1. Parse the envelope and extract the `aadContext` field
2. Independently compute the expected AAD from the HTTP method (or `RESPONSE` prefix), path, and tenant ID
3. Provide the computed AAD to the AES-GCM decryption function
4. If the AES-GCM authentication tag verification fails (which it will if the AAD does not match), reject the envelope with an `OperationError`

The `aadContext` field in the envelope serves as a **documentation** of the AAD used during encryption. It is not trusted by itself — the true verification comes from the AES-GCM authentication tag. The `aadContext` field exists for debugging, logging, and diagnostic purposes.

---

## 6. AAD Mismatch Behavior

When AAD verification fails during decryption:

1. AES-GCM returns an authentication failure
2. The implementation throws an `OperationError` with the code `AUTH_FAILED`
3. The request is rejected — no plaintext is revealed
4. The error is logged (without revealing key material)
5. The event may trigger alerting in the hosted gateway

AAD mismatch is a **cryptographic failure**. It is not a soft error that can be retried. It indicates that either:
- The payload was tampered with
- The payload was intended for a different route
- The payload was intended for a different tenant
- The payload was constructed with a different protocol implementation

None of these scenarios should be silently accepted.

---

## 7. Why This Is a Differentiator

Standard encryption APIs provide `encrypt(key, plaintext)` and `decrypt(key, ciphertext)`. They do not bind the ciphertext to any context. If you use a standard AES-GCM library without AAD, you get confidentiality and integrity but you do not get **route binding**.

Most developers do not realize they need route binding until they experience a cross-route replay attack. By the time they discover the gap, they must retrofit AAD into their protocol, which requires changes to both client and server code.

The CRelay Protocol builds AAD binding into the specification. Every implementation — regardless of language or platform — produces envelopes that are cryptographically bound to the route and tenant. This is not an optional feature. It is a mandatory part of the protocol that works by default.

This is what distinguishes a purpose-built payload security protocol from a general-purpose encryption library.

---

## 8. Attack Prevention Examples

### Example 1: Cross-Route Replay

An attacker captures a valid encrypted request:

```
POST /api/users (AAD: POST:/api/users:tenant_acme)
```

The attacker replays the ciphertext to a different endpoint:

```
POST /api/admin/escalate (expected AAD: POST:/api/admin/escalate:tenant_acme)
```

**Result**: The gateway computes `POST:/api/admin/escalate:tenant_acme` as the AAD. The decryption function provides this AAD, but the ciphertext was encrypted with `POST:/api/users:tenant_acme`. The authentication tag fails. The request is rejected.

### Example 2: Cross-Tenant Replay

An attacker with access to tenant A captures a valid request:

```
POST /api/transfer (AAD: POST:/api/transfer:tenant_a)
```

The attacker attempts to use this ciphertext as tenant B:

```
POST /api/transfer (expected AAD: POST:/api/transfer:tenant_b)
```

**Result**: The AAD mismatch causes authentication failure. Tenant A's encrypted payload cannot be used against tenant B, even on the same endpoint.

### Example 3: Request-Response Confusion

An attacker captures an encrypted response from the server:

```
RESPONSE:/api/transfer:tenant_acme
```

The attacker sends this as a request:

```
POST /api/transfer (expected AAD: POST:/api/transfer:tenant_acme)
```

**Result**: The `POST:` prefix does not match `RESPONSE:`. Authentication fails. The protocol prevents request-response confusion by design.
