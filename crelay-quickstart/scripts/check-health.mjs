#!/usr/bin/env node

/**
 * Quickstart Health Check
 *
 * Verifies that both the upstream API and mock gateway are running
 * and healthy before the client demo is started.
 *
 * Exits 0 if both are healthy, 1 otherwise.
 */

const UPSTREAM_URL = process.env.UPSTREAM_HEALTH_URL || 'http://localhost:4010/health';
const GATEWAY_URL = process.env.GATEWAY_HEALTH_URL || 'http://localhost:3000/health';

async function checkHealth(name, url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) {
      console.log(`FAIL  ${name} at ${url} returned HTTP ${res.status}`);
      return false;
    }
    const body = await res.json();
    if (body.status !== 'ok') {
      console.log(`FAIL  ${name} at ${url} returned status: ${body.status}`);
      return false;
    }
    console.log(`  OK  ${name} at ${url}`);
    return true;
  } catch (err) {
    console.log(`FAIL  ${name} at ${url} — ${err.message}`);
    return false;
  }
}

async function main() {
  console.log('\nCRelay Quickstart — Health Check\n');

  const upstream = await checkHealth('Upstream API ', UPSTREAM_URL);
  const gateway = await checkHealth('Mock Gateway ', GATEWAY_URL);

  console.log('');

  if (upstream && gateway) {
    console.log('All services healthy. Ready to run the client demo.\n');
    process.exit(0);
  } else {
    console.log('Some services are not ready. Start them before running the client:\n');
    if (!upstream) console.log('  npm run upstream   # Terminal 1');
    if (!gateway) console.log('  CRELAY_KEY_B64=<key> npm run gateway   # Terminal 2');
    console.log('');
    process.exit(1);
  }
}

main();
