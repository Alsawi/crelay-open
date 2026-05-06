/**
 * ⚠️ MOCK GATEWAY — For demo only. Not production-grade.
 *
 * This is a LIMITED local mock of the CRelay gateway. It is intentionally simple
 * and does NOT implement the full security features of the real hosted gateway.
 *
 * The real CRelay gateway includes production-grade replay protection with Redis,
 * rate limiting, HSM-backed key management, key rotation, audit trails, and more.
 *
 * This mock implements in-memory replay protection for demo purposes only.
 * Do NOT use this in production.
 */

const express = require('express');
const crypto = require('crypto');

const app = express();
const PORT = process.env.GATEWAY_PORT || 3000;
const UPSTREAM_URL = process.env.UPSTREAM_URL || 'http://localhost:4010';

// In-memory replay protection for demo (NOT production-grade)
const seenRequestIds = new Set();
const REPLAY_TTL_MS = 10 * 60 * 1000; // 10 minutes for demo

// Periodically clean up old requestIds
setInterval(() => {
  seenRequestIds.clear();
  console.log('[mock-gateway] Replay cache cleared (demo TTL expired)');
}, REPLAY_TTL_MS);

// ── Middleware ────────────────────────────────────────────────────────────────

app.use(express.json({ limit: '1mb' }));

app.use((req, res, next) => {
  console.log(`[mock-gateway] ${req.method} ${req.url}`);
  next();
});

// ── Health check ─────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'mock-gateway',
    timestamp: Date.now(),
    notice: '⚠️ This is a demo mock gateway — not the real CRelay gateway',
  });
});

// ── AES-256-GCM helpers (SDK/protocol envelope format) ──────────────────────

const KEY_LEN = 32;
const NONCE_LEN = 12;
const TAG_LEN = 16;

/**
 * Decrypt an SDK/protocol envelope.
 *
 * Envelope format: { v: 1, alg: "A256GCM", kid, nonce, ciphertext, aadContext, ts }
 * Ciphertext contains encrypted payload + 16-byte auth tag appended.
 * Inner payload: { data, timestamp, requestId }
 */
function decryptEnvelope(envelope, keyB64, expectedAad) {
  const key = Buffer.from(keyB64, 'base64');
  if (key.length !== KEY_LEN) {
    throw new Error(`Invalid key length: expected ${KEY_LEN} bytes, got ${key.length}`);
  }

  // Validate AAD context
  if (envelope.aadContext !== expectedAad) {
    throw new Error(`AAD mismatch: expected "${expectedAad}", got "${envelope.aadContext}"`);
  }

  const nonce = Buffer.from(envelope.nonce, 'base64');
  const ciphertextBuf = Buffer.from(envelope.ciphertext, 'base64');

  if (ciphertextBuf.length <= TAG_LEN) {
    throw new Error('Ciphertext too short');
  }

  const body = ciphertextBuf.subarray(0, ciphertextBuf.length - TAG_LEN);
  const tag = ciphertextBuf.subarray(ciphertextBuf.length - TAG_LEN);
  const aadBuf = Buffer.from(envelope.aadContext, 'utf8');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
  decipher.setAAD(aadBuf);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(body), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8'));
}

/**
 * Encrypt a response into SDK/protocol envelope format.
 *
 * Returns: { v: 1, alg: "A256GCM", kid, nonce, ciphertext, aadContext, ts }
 */
function encryptEnvelope(payload, keyB64, kid, aadContext) {
  const key = Buffer.from(keyB64, 'base64');
  const nonce = crypto.randomBytes(NONCE_LEN);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);

  if (aadContext) {
    cipher.setAAD(Buffer.from(aadContext, 'utf8'));
  }

  const plaintext = JSON.stringify(payload);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const ciphertext = Buffer.concat([encrypted, tag]);

  return {
    v: 1,
    alg: 'A256GCM',
    kid,
    nonce: nonce.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    aadContext: aadContext || '',
    ts: Date.now(),
  };
}

// ── Secure forward endpoint ──────────────────────────────────────────────────

/**
 * POST /secure/forward
 *
 * Accepts the SDK/protocol envelope format:
 * {
 *   targetUrl,
 *   method,
 *   headers,
 *   envelope: { v: 1, alg: "A256GCM", kid, nonce, ciphertext, aadContext, ts }
 * }
 */
app.post('/secure/forward', async (req, res) => {
  const { targetUrl, method, headers, envelope } = req.body;

  // ── Validate the envelope structure ─────────────────────────────────────
  if (!envelope || envelope.v !== 1 || envelope.alg !== 'A256GCM' ||
      !envelope.kid || !envelope.nonce || !envelope.ciphertext ||
      !envelope.aadContext || typeof envelope.ts !== 'number') {
    return res.status(400).json({
      error: 'Invalid envelope: must match protocol format { v:1, alg:"A256GCM", kid, nonce, ciphertext, aadContext, ts }',
    });
  }

  // ── Validate API key ────────────────────────────────────────────────────
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) {
    return res.status(401).json({
      error: 'Missing x-api-key header',
    });
  }

  // ── Resolve tenant ID ───────────────────────────────────────────────────
  const tenantId = process.env.SECURE_GATEWAY_TENANT_ID ||
    req.headers['x-tenant-id'] ||
    'tenant_demo';

  // ── Resolve path from targetUrl ─────────────────────────────────────────
  let path;
  try {
    path = new URL(targetUrl).pathname;
  } catch {
    return res.status(400).json({
      error: 'Invalid targetUrl',
    });
  }

  // ── Reconstruct expected request AAD ────────────────────────────────────
  const requestMethod = (method || 'POST').toUpperCase();
  const expectedAad = `${requestMethod}:${path}:${tenantId}`;

  // ── Resolve the decryption key ──────────────────────────────────────────
  const keyB64 = process.env.SECURE_GATEWAY_KEY_B64;
  if (!keyB64) {
    return res.status(500).json({
      error: 'Server misconfiguration: SECURE_GATEWAY_KEY_B64 not set',
    });
  }

  // ── Decrypt the envelope ────────────────────────────────────────────────
  let decrypted;
  try {
    decrypted = decryptEnvelope(envelope, keyB64, expectedAad);
  } catch (err) {
    console.error('[mock-gateway] Decryption failed:', err.message);
    return res.status(400).json({
      error: 'Decryption failed — check key, AAD, and envelope integrity',
    });
  }

  const requestId = decrypted.requestId || req.headers['x-request-id'] || 'unknown';
  const timestamp = decrypted.timestamp;

  // ── Check timestamp freshness (demo) ────────────────────────────────────
  const now = Date.now();
  const FRESHNESS_LIMIT = 5 * 60 * 1000; // 5 minutes
  if (timestamp > now + 1000) {
    return res.status(400).json({
      error: 'FRESHNESS_FAILED',
      detail: `Timestamp is in the future: ${timestamp} > ${now + 1000}`,
    });
  }
  if (now - timestamp > FRESHNESS_LIMIT) {
    return res.status(400).json({
      error: 'FRESHNESS_FAILED',
      detail: `Timestamp too old: ${now - timestamp}ms staleness exceeds ${FRESHNESS_LIMIT}ms`,
    });
  }

  // ── Demo replay protection ──────────────────────────────────────────────
  if (seenRequestIds.has(requestId)) {
    console.warn(`[mock-gateway] REPLAY_DETECTED: requestId=${requestId}`);
    return res.status(409).json({
      error: 'REPLAY_DETECTED',
      detail: `RequestId "${requestId}" was already processed`,
    });
  }
  seenRequestIds.add(requestId);

  console.log(`[mock-gateway] Decrypted: requestId=${requestId}, ` +
    `method=${requestMethod}, path=${path}, timestamp=${timestamp}`);

  // ── Forward to the upstream API ─────────────────────────────────────────
  const upstreamUrl = `${UPSTREAM_URL}${path}`;
  const fetchOptions = {
    method: requestMethod,
    headers: { 'Content-Type': 'application/json' },
  };

  // Attach body for non-GET requests
  if (requestMethod !== 'GET' && decrypted.data) {
    fetchOptions.body = JSON.stringify(decrypted.data);
  }

  let upstreamResponse;
  try {
    const resp = await fetch(upstreamUrl, fetchOptions);
    upstreamResponse = await resp.json();

    if (!resp.ok) {
      console.warn('[mock-gateway] Upstream returned non-OK:', resp.status);
    }
  } catch (err) {
    console.error('[mock-gateway] Upstream request failed:', err.message);
    return res.status(502).json({
      error: 'Failed to reach upstream API',
      detail: err.message,
    });
  }

  // ── Encrypt the response using response AAD ────────────────────────────
  // Wrap the upstream response in the same inner payload format the SDK expects:
  // { data, timestamp, requestId }
  const responseAad = `RESPONSE:${path}:${tenantId}`;
  const innerPayload = {
    data: upstreamResponse,
    timestamp: Date.now(),
    requestId,
  };
  const responseEnvelope = encryptEnvelope(innerPayload, keyB64, envelope.kid, responseAad);

  console.log('[mock-gateway] Response encrypted with AAD:', responseAad);

  res.json(responseEnvelope);
});

// ── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[mock-gateway] ⚠️  DEMO MOCK GATEWAY running on http://localhost:${PORT}`);
  console.log('[mock-gateway] ⚠️  This is NOT the real CRelay gateway.');
  console.log('[mock-gateway] ⚠️  Do NOT use this in production.');
  console.log('[mock-gateway] Forwarding to upstream at:', UPSTREAM_URL);
  console.log('[mock-gateway] Envelope format: SDK/protocol v1 (nonce + ciphertext-with-tag + aadContext)');
});
