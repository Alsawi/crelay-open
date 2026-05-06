# Envelope Format — Wire Format Specification

**Protocol Version:** 1  
**Status:** Stable

---

## 1. Overview

The CRelay Protocol transmits encrypted payloads as JSON envelopes. Every request and response is wrapped in an envelope that contains the metadata needed for decryption, verification, and replay protection, alongside the encrypted payload itself.

This document specifies the complete JSON schema, field descriptions, encoding rules, and version migration strategy for the envelope format.

---

## 2. Complete JSON Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "CRelayEnvelope",
  "type": "object",
  "required": ["v", "alg", "kid", "nonce", "ciphertext", "aadContext", "ts"],
  "properties": {
    "v": {
      "type": "integer",
      "const": 1,
      "description": "Protocol version"
    },
    "alg": {
      "type": "string",
      "const": "A256GCM",
      "description": "Algorithm identifier"
    },
    "kid": {
      "type": "string",
      "minLength": 1,
      "description": "Key identifier"
    },
    "nonce": {
      "type": "string",
      "description": "Base64-encoded 12-byte nonce"
    },
    "ciphertext": {
      "type": "string",
      "description": "Base64-encoded encrypted data with 16-byte auth tag appended"
    },
    "aadContext": {
      "type": "string",
      "description": "AAD binding string used during encryption"
    },
    "ts": {
      "type": "integer",
      "minimum": 0,
      "description": "Unix epoch milliseconds timestamp"
    },
    "meta": {
      "type": "object",
      "description": "Optional metadata",
      "properties": {
        "requestId": {
          "type": "string",
          "format": "uuid",
          "description": "UUID v4 request identifier"
        }
      }
    }
  },
  "additionalProperties": false
}
```

---

## 3. Field Descriptions

### 3.1 `v` — Protocol Version

- **Type**: Integer
- **Required**: Yes
- **Value**: `1`

Identifies the version of the CRelay Protocol used to construct the envelope. Implementations must verify this field before processing. If the version is not supported, the implementation must reject the envelope with a clear error indicating the unsupported version.

### 3.2 `alg` — Algorithm Identifier

- **Type**: String
- **Required**: Yes
- **Value**: `"A256GCM"`

Identifies the authenticated encryption algorithm. The identifier `"A256GCM"` corresponds to AES-256-GCM. This field enables future protocol versions to support additional algorithms without changing the envelope structure.

The algorithm identifier follows the naming convention used by JWE (JSON Web Encryption) where applicable, but it is not a JWE implementation.

### 3.3 `kid` — Key Identifier

- **Type**: String
- **Required**: Yes

Identifies which encryption key was used to produce the ciphertext. The gateway uses this field to select the correct decryption key. Key identifiers enable seamless key rotation — during a rotation period, the gateway accepts envelopes encrypted with either the old or new key, identified by different `kid` values.

Key identifiers should be human-readable and include a creation date or version component (e.g., `key-2025-03-01-a`). This makes operational debugging and key lifecycle management easier.

### 3.4 `nonce` — Initialization Vector

- **Type**: String
- **Required**: Yes
- **Encoding**: Base64 (RFC 4648, standard alphabet with padding)

A base64-encoded 12-byte (96-bit) random nonce. The nonce must be generated using a cryptographically secure random number generator for each encryption operation. The same nonce must never be used twice with the same key.

After base64 decoding, the nonce must be exactly 12 bytes. If the decoded length is not 12 bytes, the envelope is malformed and must be rejected.

### 3.5 `ciphertext` — Encrypted Payload

- **Type**: String
- **Required**: Yes
- **Encoding**: Base64 (RFC 4648, standard alphabet with padding)

The base64-encoded encrypted data. The binary representation consists of the AES-GCM ciphertext immediately followed by the 16-byte authentication tag. There is no delimiter between the ciphertext and the tag — the tag is simply appended.

After base64 decoding, the binary data must be at least 16 bytes (auth tag only, indicating an empty plaintext, which is unlikely but technically valid). The last 16 bytes are the authentication tag. All preceding bytes are the ciphertext.

### 3.6 `aadContext` — Additional Authenticated Data Context

- **Type**: String
- **Required**: Yes

The AAD string that was provided to AES-GCM during encryption. For requests, this is in the format `METHOD:/path:tenantId`. For responses, this is `RESPONSE:/path:tenantId`.

This field serves as documentation of the AAD used. The actual AAD verification is performed by AES-GCM during decryption — the recipient computes the expected AAD independently and provides it to the decryption function. If the computed AAD does not match the AAD used during encryption, the authentication tag verification fails.

### 3.7 `ts` — Timestamp

- **Type**: Integer
- **Required**: Yes

The Unix epoch timestamp in milliseconds at the time the envelope was created. This field is used for freshness validation (see [freshness.md](./freshness.md)). It should match the `timestamp` field inside the inner payload.

### 3.8 `meta` — Metadata

- **Type**: Object
- **Required**: No

An optional object containing metadata about the request. The only standardized field in version 1 is:

- **`requestId`**: A UUID v4 that uniquely identifies the request. This field is required for request envelopes and is used for replay protection (see [replay-protection.md](./replay-protection.md)). Response envelopes do not require a requestId.

Implementations may include additional fields in the `meta` object, but unknown fields should be ignored by recipients that do not recognize them.

---

## 4. Inner Payload Structure

The plaintext that is encrypted and placed into the `ciphertext` field has a defined structure:

```json
{
  "data": "<business_payload>",
  "timestamp": 1741234567890,
  "requestId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `data` | any | Yes | The actual business payload (can be any JSON-serializable value) |
| `timestamp` | integer | Yes | Unix epoch milliseconds (must match the envelope's `ts` within 1 second) |
| `requestId` | string | Yes (request), No (response) | UUID v4 request identifier |

The `data` field contains the actual business data that the client wants to send to the API or that the API returns in its response. It can be any JSON value: an object, array, string, number, boolean, or null.

---

## 5. Ciphertext Construction

The ciphertext is constructed through the following steps:

1. **Construct the inner payload**: Create a JSON object with `data`, `timestamp`, and `requestId` fields
2. **Serialize to JSON**: Convert the inner payload to a UTF-8 JSON string
3. **Generate nonce**: Create a 12-byte random nonce using a CSPRNG
4. **Encrypt**: Call AES-256-GCM encrypt with:
   - Key: 256-bit encryption key identified by `kid`
   - Nonce: the 12-byte random nonce
   - Plaintext: the UTF-8 JSON bytes
   - AAD: the `aadContext` string encoded as UTF-8
5. **Append auth tag**: Concatenate the ciphertext output and the 16-byte authentication tag: `ciphertext || authTag`
6. **Base64 encode**: Encode the concatenated bytes as a standard Base64 string

Pseudocode:

```
innerPayload = JSON.stringify({ data, timestamp, requestId })
plaintext = UTF8.encode(innerPayload)
nonce = CSPRNG(12)
(ciphertext, authTag) = AES256GCM.encrypt(key, nonce, plaintext, aadContext)
ciphertextField = Base64.encode(ciphertext || authTag)
nonceField = Base64.encode(nonce)
```

---

## 6. Ciphertext and Auth Tag Splitting During Decryption

During decryption, the recipient must separate the ciphertext from the authentication tag:

1. **Base64 decode**: Decode the `ciphertext` field to obtain the raw bytes
2. **Split**: The last 16 bytes are the authentication tag. All preceding bytes are the ciphertext
3. **Decrypt**: Call AES-256-GCM decrypt with:
   - Key: the key identified by `kid`
   - Nonce: the base64-decoded `nonce` field
   - Ciphertext: the bytes before the last 16
   - Auth tag: the last 16 bytes
   - AAD: the computed `aadContext` string
4. **Verify**: AES-GCM will verify the authentication tag. If verification fails, reject the envelope.
5. **Parse**: Decode the resulting plaintext as UTF-8 JSON

Pseudocode:

```
rawBytes = Base64.decode(ciphertextField)
ciphertext = rawBytes[0 .. length - 17]
authTag = rawBytes[length - 16 .. length - 1]
nonce = Base64.decode(nonceField)
plaintext = AES256GCM.decrypt(key, nonce, ciphertext, authTag, aadContext)
innerPayload = JSON.parse(UTF8.decode(plaintext))
```

---

## 7. Version Migration Strategy

The protocol is designed for forward-compatible evolution. The following rules govern version migration:

### 7.1 Adding Fields

New protocol versions may add optional fields to the envelope. Version 1 implementations must **ignore** unknown fields in incoming envelopes. This allows newer clients to communicate with older gateways.

### 7.2 Removing Fields

Fields may not be removed across versions. A field that exists in version 1 must be accepted (even if ignored) in all future versions.

### 7.3 Changing Semantics

The semantic meaning of an existing field must not change across versions. If a field's behavior needs to change, a new field with a different name must be introduced.

### 7.4 Version Negotiation

If a gateway receives an envelope with `v: 2` but only supports `v: 1`, it must reject the envelope with a `400 UNSUPPORTED_VERSION` error. The client can then decide whether to downgrade or seek a compatible gateway.

### 7.5 Algorithm Rotation

Future protocol versions may introduce new algorithm identifiers. The `alg` field enables algorithm negotiation without envelope format changes. A gateway that supports multiple algorithms can select the appropriate decryption routine based on the `alg` field.

---

## 8. Wire Format Examples

### 8.1 Minimal Request Envelope

```json
{
  "v": 1,
  "alg": "A256GCM",
  "kid": "key-2025-03-01-a",
  "nonce": "dGVzdC1ub25jZS0xMg==",
  "ciphertext": "ZW5jcnlwdGVkLWRhdGEtd2l0aC1hdXRoLXRhZw==",
  "aadContext": "POST:/api/internal/transfer:tenant_acme",
  "ts": 1741234567890,
  "meta": {
    "requestId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  }
}
```

### 8.2 Minimal Response Envelope

```json
{
  "v": 1,
  "alg": "A256GCM",
  "kid": "key-2025-03-01-a",
  "nonce": "cmVzcG9uc2Utbm9uY2UtMTI=",
  "ciphertext": "cmVzcG9uc2UtZW5jcnlwdGVkLWRhdGE=",
  "aadContext": "RESPONSE:/api/internal/transfer:tenant_acme",
  "ts": 1741234567900
}
```

### 8.3 Approximate Wire Size

For a typical API request with a 1 KB JSON payload:

| Component | Size (approximate) |
|-----------|-------------------|
| Inner payload (JSON) | ~1,050 bytes |
| AES-GCM ciphertext | ~1,050 bytes |
| Auth tag | 16 bytes |
| Base64-encoded ciphertext+tag | ~1,432 bytes |
| Base64-encoded nonce | 16 bytes |
| Envelope overhead (JSON) | ~250 bytes |
| **Total envelope** | **~1,700 bytes** |

The overhead of the protocol is approximately 65% over the raw JSON payload size, which is consistent with the combination of encryption, Base64 encoding, and envelope metadata. This overhead is acceptable for most API workloads.
