# Freshness — Timestamp Validation

**Protocol Version:** 1  
**Status:** Stable

---

## 1. Why Freshness Matters

A replay attack is not limited to immediate resubmission. An attacker can capture a valid encrypted request, wait hours or days, and then replay it. Without timestamp validation, the server has no way to determine whether a request was created recently or was captured long ago.

Freshness validation ensures that every encrypted request was created within a recent time window. Old requests — even if their encryption, AAD, and requestId are all valid — are rejected because they are stale. This closes the time window during which replay attacks are possible.

Without freshness validation, an attacker who gains access to a log of historical encrypted requests can replay any of them. With freshness validation, only requests created within the last few minutes are accepted.

Freshness also protects against more subtle attacks. A compromised intermediary might buffer requests and release them at a strategically chosen time. A malicious actor with access to backup tapes could replay old encrypted payloads. Timestamp validation renders all of these attacks ineffective by constraining the acceptable time window.

---

## 2. Timestamp Format

The timestamp is a Unix epoch value in **milliseconds**, stored as an integer in the inner payload's `timestamp` field and mirrored in the envelope's `ts` field.

| Property | Value |
|----------|-------|
| Format | Unix epoch milliseconds |
| Precision | Milliseconds (1/1000 of a second) |
| Type | 64-bit signed integer |
| Example | `1741234567890` represents 2025-03-06T02:56:07.890Z |

The millisecond precision is sufficient for API request timing. The 64-bit integer range ensures that timestamps will not overflow in any foreseeable timeframe.

**Important**: JSON parsers must support 64-bit integer precision. Parsers that truncate to 32-bit integers will produce incorrect timestamps after the Year 2038 problem threshold.

---

## 3. Maximum Staleness

The default maximum staleness window is **5 minutes (300,000 milliseconds)**. A request is considered stale if:

```
serverTime - requestTimestamp > 300000
```

Where `serverTime` is the current time on the gateway server and `requestTimestamp` is the `ts` value from the envelope.

The 5-minute window provides a balance between security and reliability:

- **Too short** (e.g., 30 seconds): Legitimate requests may be rejected due to network latency, client clock drift, or processing delays. Mobile clients on unstable networks are particularly affected.
- **Too long** (e.g., 1 hour): The replay window is large, reducing the security benefit of freshness validation.
- **5 minutes**: Sufficient for normal network conditions, client-server clock differences, and processing time, while keeping the replay window small enough to be operationally irrelevant.

The staleness window can be configured per gateway deployment but must not exceed 15 minutes (900,000 ms) for compliance with this specification.

---

## 4. Future Skew Tolerance

A request with a timestamp slightly in the future is accepted if the future skew is within **1 second (1,000 milliseconds)**. A request is considered "future" if:

```
requestTimestamp - serverTime > 0
```

And is rejected if:

```
requestTimestamp - serverTime > 1000
```

The 1-second tolerance accommodates minor clock synchronization differences between the client and the server. Clocks that are synchronized via NTP typically differ by less than 100 milliseconds, so 1 second provides ample margin.

Requests with timestamps significantly in the future (more than 1 second ahead) are rejected because they indicate either:
- Severe clock drift on the client machine
- A manipulated timestamp
- A potential attack (e.g., pre-generating requests for future replay)

---

## 5. Server-Side Freshness Validation

The gateway validates freshness as part of the request processing pipeline:

1. After successful decryption, extract the `timestamp` from the inner payload
2. Compare with the current server time
3. If `serverTime - timestamp > maxStaleness`, reject with `TIMESTAMP_TOO_OLD`
4. If `timestamp - serverTime > futureSkewTolerance`, reject with `TIMESTAMP_FUTURE`
5. Otherwise, the request passes freshness validation

Freshness validation is performed **after** decryption but **before** business logic processing. This ordering ensures that stale or future-dated requests never reach the upstream API.

The gateway also cross-validates the envelope's `ts` field with the inner payload's `timestamp` field. If these values differ by more than 1 second, the envelope is rejected with `FRESHNESS_FAILED`. This prevents an attacker from modifying the outer timestamp without modifying the inner payload.

---

## 6. Error Codes

Freshness validation failures produce the following error codes:

| Error Code | HTTP Status | Condition |
|------------|-------------|-----------|
| `FRESHNESS_FAILED` | 400 Bad Request | Generic freshness failure (e.g., inner/outer timestamp mismatch) |
| `TIMESTAMP_TOO_OLD` | 400 Bad Request | Request timestamp is older than the maximum staleness window |
| `TIMESTAMP_FUTURE` | 400 Bad Request | Request timestamp is too far in the future |

Error responses include the server's current timestamp to help clients diagnose clock drift:

```json
{
  "error": "TIMESTAMP_TOO_OLD",
  "message": "Request timestamp is outside the acceptable window.",
  "serverTime": 1741234600000,
  "requestTime": 1741234200000,
  "maxStalenessMs": 300000
}
```

---

## 7. Clock Drift Considerations

Clock drift between clients and servers is a reality in distributed systems. The protocol accounts for this through:

- **5-minute staleness window**: Accommodates clock drift in the "too old" direction
- **1-second future tolerance**: Accommodates clock drift in the "too fast" direction
- **Server time in error responses**: Helps clients detect and correct clock drift

For systems where client clock synchronization cannot be guaranteed, consider the following strategies:

1. **NTP synchronization**: Ensure all client machines run NTP with a reliable time source
2. **Server-provided timestamps**: Some implementations have the client fetch the server's current time before constructing requests. This eliminates client clock drift but adds a round trip.
3. **Adjusted staleness window**: Increase the maximum staleness window for deployments with known clock synchronization challenges (at the cost of a larger replay window)

---

## 8. When to Disable Freshness Validation

Freshness validation is mandatory in the default protocol configuration. However, it may be **disabled** in the following specific scenarios:

### 8.1 Internal Trusted Networks

In air-gapped or fully trusted internal networks where replay attacks are not a threat (e.g., communication between services within the same rack), freshness validation can be disabled to reduce latency and avoid clock synchronization overhead.

### 8.2 Asynchronous Processing

In systems where requests are queued for later processing (e.g., job queues, event-driven architectures), the timestamp at encryption time may be significantly earlier than the processing time. Disabling freshness validation for these workloads prevents false rejections.

### 8.3 Long-Running Operations

For operations that take longer than the staleness window to prepare (e.g., batch file uploads), freshness validation may need to be disabled or the staleness window may need to be extended.

### 8.4 Warnings

Disabling freshness validation removes a layer of the protocol's defense in depth. When freshness is disabled:
- Replay protection relies entirely on requestId deduplication
- Stale request replay becomes possible within the deduplication TTL window
- The protocol's security guarantees are reduced

Any deployment that disables freshness validation must document this decision and accept the resulting risk.
