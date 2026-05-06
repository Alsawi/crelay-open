/**
 * Upstream API — Demo Server
 *
 * This represents "your existing API" — the backend that the CRelay gateway protects.
 * In production, this would be your real API. Here it returns mock data for the quickstart.
 */

const express = require('express');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 4010;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json());

// Simple request logger
app.use((req, res, next) => {
  console.log(`[upstream-api] ${req.method} ${req.url}`);
  next();
});

// ── Routes ───────────────────────────────────────────────────────────────────

/** Health check */
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'upstream-api',
    timestamp: Date.now(),
  });
});

/** Create a user (echoes back with generated id) */
app.post('/users', (req, res) => {
  const { email, name } = req.body || {};

  if (!email || !name) {
    return res.status(400).json({
      error: 'Missing required fields: email, name',
    });
  }

  res.status(201).json({
    id: crypto.randomUUID(),
    email,
    name,
    created_at: new Date().toISOString(),
  });
});

/** Simulate a financial transfer */
app.post('/transfer', (req, res) => {
  const { from, to, amount } = req.body || {};

  if (!from || !to || amount == null) {
    return res.status(400).json({
      error: 'Missing required fields: from, to, amount',
    });
  }

  if (typeof amount !== 'number' || amount <= 0) {
    return res.status(400).json({
      error: 'Amount must be a positive number',
    });
  }

  res.json({
    transferId: crypto.randomUUID(),
    from,
    to,
    amount,
    status: 'completed',
  });
});

/** Return a fake balance for an account */
app.get('/balance/:accountId', (req, res) => {
  const { accountId } = req.params;

  // Deterministic "balance" from the accountId so it's consistent per account
  const hash = crypto.createHash('sha256').update(accountId).digest();
  const balance = (hash.readUInt32BE(0) % 100000) / 100;

  res.json({
    accountId,
    balance: parseFloat(balance.toFixed(2)),
    currency: 'USD',
    asOf: new Date().toISOString(),
  });
});

// ── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[upstream-api] Demo API running on http://localhost:${PORT}`);
  console.log('[upstream-api] Endpoints:');
  console.log('  GET  /health');
  console.log('  POST /users');
  console.log('  POST /transfer');
  console.log('  GET  /balance/:accountId');
});
