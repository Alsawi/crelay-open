/**
 * CRelay — Client Demo
 *
 * This script demonstrates the full flow of using the CRelay SDK to make
 * encrypted requests through the gateway to the upstream API.
 *
 * It reads configuration from environment variables and can operate in two modes:
 *   1. "gateway" mode — uses the SDK to encrypt/decrypt via the mock gateway
 *   2. "local" mode  — bypasses the gateway entirely (for testing without encryption)
 */

// ── Configuration ────────────────────────────────────────────────────────────

const CONFIG = {
  apiKey:      process.env.CRELAY_API_KEY        || process.env.SECURE_GATEWAY_API_KEY   || 'sk_test_demo_123',
  baseUrl:     process.env.CRELAY_BASE_URL        || process.env.SECURE_GATEWAY_BASE_URL   || 'http://localhost:3000',
  tenantId:    process.env.CRELAY_TENANT_ID       || process.env.SECURE_GATEWAY_TENANT_ID  || 'tenant_demo',
  keyB64:      process.env.CRELAY_KEY_B64         || process.env.SECURE_GATEWAY_KEY_B64    || '',
  kid:         process.env.CRELAY_KID             || process.env.SECURE_GATEWAY_KID         || 'demo-key-001',
  upstreamUrl: process.env.UPSTREAM_URL               || 'http://localhost:4010',
  mode:        process.env.CRELAY_MODE             || process.env.SECURE_GATEWAY_MODE        || 'gateway', // "gateway" | "local"
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function log(section, msg) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${section}`);
  console.log(`${'─'.repeat(60)}`);
  if (msg) console.log(msg);
}

function logResult(label, data) {
  console.log(`  ✅ ${label}:`);
  const str = JSON.stringify(data, null, 2);
  if (str) {
    console.log(str.split('\n').map(l => `     ${l}`).join('\n'));
  }
}

// ── SDK initialization ───────────────────────────────────────────────────────

let crClient = null;

async function initSDK() {
  try {
    const { CRelayClient } = await import('@crelay/sdk');
    crClient = new CRelayClient({
      apiKey: CONFIG.apiKey,
      baseUrl: CONFIG.baseUrl,
      tenantId: CONFIG.tenantId,
      kid: CONFIG.kid,
      keyB64: CONFIG.keyB64,
    });
    console.log('  📦 CRelay SDK loaded');
    return true;
  } catch (err) {
    console.log('  ⚠️  @crelay/sdk not available — using built-in envelope logic');
    console.log('     (Install with: npm install @crelay/sdk)');
    console.log(`     Error: ${err.message}`);
    return false;
  }
}

// ── Built-in envelope helpers (fallback when SDK not installed) ──────────────

import crypto from 'node:crypto';

const KEY_LEN = 32;
const NONCE_LEN = 12;
const TAG_LEN = 16;

function builtinEncrypt(data, keyB64, kid, aadContext, requestId) {
  const key = Buffer.from(keyB64, 'base64');
  const nonce = crypto.randomBytes(NONCE_LEN);
  const payload = JSON.stringify({ data, timestamp: Date.now(), requestId });
  const aadBuf = Buffer.from(aadContext, 'utf8');

  const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(aadBuf);
  const encrypted = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const ciphertext = Buffer.concat([encrypted, tag]);

  return {
    v: 1,
    alg: 'A256GCM',
    kid,
    nonce: nonce.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    aadContext,
    ts: Date.now(),
  };
}

function builtinDecrypt(envelope, keyB64, expectedAad) {
  const key = Buffer.from(keyB64, 'base64');
  const nonce = Buffer.from(envelope.nonce, 'base64');
  const ciphertextBuf = Buffer.from(envelope.ciphertext, 'base64');

  const body = ciphertextBuf.subarray(0, ciphertextBuf.length - TAG_LEN);
  const tag = ciphertextBuf.subarray(ciphertextBuf.length - TAG_LEN);
  const aadBuf = Buffer.from(expectedAad, 'utf8');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
  decipher.setAAD(aadBuf);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(body), decipher.final()]);
  const parsed = JSON.parse(decrypted.toString('utf8'));
  return parsed.data;
}

// ── Gateway mode ─────────────────────────────────────────────────────────────

async function gatewayRequest(method, path, body = null) {
  if (crClient) {
    // Use the real SDK
    const result = await crClient.secureRequest({
      targetUrl: `${CONFIG.upstreamUrl}${path}`,
      method,
      data: body ?? null,
    });
    return result.data;
  }

  // Built-in envelope logic (matches SDK/protocol format)
  if (!CONFIG.keyB64) {
    throw new Error('CRELAY_KEY_B64 is required for gateway mode. Set it in .env');
  }

  const requestId = crypto.randomUUID();
  const aadContext = `${method.toUpperCase()}:${path}:${CONFIG.tenantId}`;
  const envelope = builtinEncrypt(body, CONFIG.keyB64, CONFIG.kid, aadContext, requestId);

  const response = await fetch(`${CONFIG.baseUrl}/secure/forward`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CONFIG.apiKey,
      'x-request-id': requestId,
    },
    body: JSON.stringify({
      targetUrl: `${CONFIG.upstreamUrl}${path}`,
      method: method.toUpperCase(),
      envelope,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gateway returned ${response.status}: ${text}`);
  }

  const respEnvelope = await response.json();

  // Validate envelope format
  if (respEnvelope.v !== 1 || respEnvelope.alg !== 'A256GCM') {
    throw new Error('Invalid response envelope format');
  }

  const responseAad = `RESPONSE:${path}:${CONFIG.tenantId}`;
  return builtinDecrypt(respEnvelope, CONFIG.keyB64, responseAad);
}

// ── Local mode: bypass gateway entirely ──────────────────────────────────────

async function localRequest(method, path, body = null) {
  const url = `${CONFIG.upstreamUrl}${path}`;
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body && method !== 'GET') {
    options.body = JSON.stringify(body);
  }
  const response = await fetch(url, options);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Upstream returned ${response.status}: ${text}`);
  }
  return response.json();
}

// ── Main demo flow ───────────────────────────────────────────────────────────

async function main() {
  console.log('\n🔐  CRelay — Client Demo');
  console.log(`    Mode: ${CONFIG.mode}`);
  console.log(`    Gateway: ${CONFIG.baseUrl}`);
  console.log(`    Upstream: ${CONFIG.upstreamUrl}`);

  const request = CONFIG.mode === 'local' ? localRequest : gatewayRequest;

  // Initialize SDK if in gateway mode
  if (CONFIG.mode === 'gateway') {
    await initSDK();
  }

  // ── Step 1: Create a user ────────────────────────────────────────────────
  log('Step 1: Create a user (POST /users)');
  try {
    const user = await request('POST', '/users', {
      email: 'alice@example.com',
      name: 'Alice Johnson',
    });
    logResult('User created', user);
  } catch (err) {
    console.error(`  ❌ Error: ${err.message}`);
  }

  // ── Step 2: Make a transfer ──────────────────────────────────────────────
  log('Step 2: Make a transfer (POST /transfer)');
  try {
    const transfer = await request('POST', '/transfer', {
      from: 'acc-001',
      to: 'acc-002',
      amount: 42.50,
    });
    logResult('Transfer completed', transfer);
  } catch (err) {
    console.error(`  ❌ Error: ${err.message}`);
  }

  // ── Step 3: Check balance ────────────────────────────────────────────────
  log('Step 3: Check balance (GET /balance/acc-001)');
  try {
    const balance = await request('GET', '/balance/acc-001');
    logResult('Balance retrieved', balance);
  } catch (err) {
    console.error(`  ❌ Error: ${err.message}`);
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  log('Demo Complete');
  console.log(`
  All requests were ${CONFIG.mode === 'local' ? 'sent DIRECTLY to the upstream API (no encryption)' : 'encrypted and routed through CRelay'}.

  ${CONFIG.mode === 'local'
    ? '💡 Try gateway mode to see the encryption in action:\n     CRELAY_MODE=gateway npm start'
    : '💡 The gateway decrypted your request, forwarded it to the upstream API,\n     then encrypted the response before returning it to this client.'}
  `);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
