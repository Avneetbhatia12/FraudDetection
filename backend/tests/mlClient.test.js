/**
 * Unit tests for services/mlClient.js: timeout, circuit breaker, error classification, API-key handling.
 * Uses a local stub HTTP server only (no ML service, no database).   Run: cd backend && npm test
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createMlClient, MlUnavailableError, MlRequestError } = require('../services/mlClient');

const KEY = 'unit-test-key-not-a-secret';

function stub(handler) {
  return new Promise((resolve) => {
    const hits = [];
    const server = http.createServer((req, res) => { hits.push(req); handler(req, res, hits.length); });
    server.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${server.address().port}`, hits, close: () => new Promise((r) => { server.closeAllConnections(); server.close(r); }) }));
  });
}
const json = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
const reason = (p) => p.then(() => 'resolved', (e) => (e instanceof MlUnavailableError ? e.reason : e.name));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('sends the API key header and returns JSON', async () => {
  const s = await stub((req, res) => json(res, 200, { ok: true, key_seen: req.headers['x-ml-api-key'] === KEY }));
  const ml = createMlClient({ baseUrl: s.url, apiKey: KEY });
  assert.deepEqual(await ml.getJson('/v1/status'), { ok: true, key_seen: true });
  await s.close();
});

test('times out after timeoutMs and reports reason "timeout"', async () => {
  const s = await stub((req, res) => setTimeout(() => json(res, 200, {}), 400));
  const ml = createMlClient({ baseUrl: s.url, apiKey: KEY, timeoutMs: 100 });
  const t0 = Date.now();
  assert.equal(await reason(ml.getJson('/slow')), 'timeout');
  assert.ok(Date.now() - t0 < 350, 'did not wait for the slow response');
  await s.close();
});

test('circuit opens after 3 consecutive failures and skips calls; half-open trial closes it on success', async () => {
  let fail = true;
  const s = await stub((req, res) => (fail ? json(res, 503, { detail: 'down' }) : json(res, 200, { ok: true })));
  const ml = createMlClient({ baseUrl: s.url, apiKey: KEY, failureThreshold: 3, cooldownMs: 150 });
  for (let i = 0; i < 3; i++) assert.equal(await reason(ml.getJson('/x')), 'upstream_error');
  assert.equal(ml.status().circuit.state, 'open');
  assert.equal(await reason(ml.getJson('/x')), 'circuit_open');
  assert.equal(s.hits.length, 3, 'no request is sent while the circuit is open');
  await sleep(170);
  assert.equal(ml.status().circuit.state, 'half_open');
  fail = false;
  assert.deepEqual(await ml.getJson('/x'), { ok: true });
  assert.equal(ml.status().circuit.state, 'closed');
  assert.equal(ml.status().circuit.consecutive_failures, 0);
  await s.close();
});

test('failed half-open trial re-opens the circuit; only one trial at a time', async () => {
  const s = await stub((req, res) => setTimeout(() => json(res, 500, {}), 50));
  const ml = createMlClient({ baseUrl: s.url, apiKey: KEY, failureThreshold: 2, cooldownMs: 100 });
  await reason(ml.getJson('/x'));
  await reason(ml.getJson('/x'));
  assert.equal(ml.status().circuit.state, 'open');
  await sleep(120);
  const [a, b] = await Promise.all([reason(ml.getJson('/x')), reason(ml.getJson('/x'))]);
  assert.deepEqual([a, b].sort(), ['circuit_open', 'upstream_error']);
  assert.equal(s.hits.length, 3);
  assert.equal(ml.status().circuit.state, 'open');
  await s.close();
});

test('timeouts count as failures for the breaker', async () => {
  const s = await stub((req, res) => setTimeout(() => json(res, 200, {}), 300));
  const ml = createMlClient({ baseUrl: s.url, apiKey: KEY, timeoutMs: 50, failureThreshold: 2, cooldownMs: 10000 });
  assert.equal(await reason(ml.getJson('/x')), 'timeout');
  assert.equal(await reason(ml.getJson('/x')), 'timeout');
  assert.equal(await reason(ml.getJson('/x')), 'circuit_open');
  await s.close();
});

test('404 / 422 are request errors, not service failures', async () => {
  const s = await stub((req, res) => json(res, req.url.includes('bad') ? 422 : 404, { detail: 'claim 99 not found' }));
  const ml = createMlClient({ baseUrl: s.url, apiKey: KEY, failureThreshold: 1 });
  await assert.rejects(ml.getJson('/missing'), (e) => e instanceof MlRequestError && e.status === 404 && e.message === 'claim 99 not found');
  await assert.rejects(ml.getJson('/bad'), (e) => e instanceof MlRequestError && e.status === 422);
  assert.equal(ml.status().circuit.state, 'closed');
  await s.close();
});

test('rejected API key is a service failure; the key never appears in errors or status', async () => {
  const s = await stub((req, res) => json(res, 401, { detail: 'invalid or missing X-ML-API-Key' }));
  const ml = createMlClient({ baseUrl: s.url, apiKey: KEY, failureThreshold: 5 });
  const err = await ml.getJson('/x').catch((e) => e);
  assert.equal(err.reason, 'auth_rejected');
  assert.ok(!JSON.stringify({ m: err.message, s: err.stack, st: ml.status() }).includes(KEY));
  assert.equal(ml.status().circuit.consecutive_failures, 1);
  await s.close();
});

test('invalid JSON is "bad_response"; unreachable service is "network_error"', async () => {
  const s = await stub((req, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{not json'); });
  const ml = createMlClient({ baseUrl: s.url, apiKey: KEY });
  assert.equal(await reason(ml.getJson('/x')), 'bad_response');
  await s.close();
  const dead = createMlClient({ baseUrl: s.url, apiKey: KEY });
  assert.equal(await reason(dead.getJson('/x')), 'network_error');
});

test('disabled or unconfigured client makes no request', async () => {
  const s = await stub((req, res) => json(res, 200, {}));
  assert.equal(await reason(createMlClient({ baseUrl: s.url, apiKey: KEY, enabled: false }).getJson('/x')), 'disabled');
  assert.equal(await reason(createMlClient({ baseUrl: s.url, apiKey: '' }).getJson('/x')), 'not_configured');
  assert.equal(s.hits.length, 0);
  await s.close();
});

test('binary responses (figures) are returned with their content type', async () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  const s = await stub((req, res) => { res.writeHead(200, { 'Content-Type': 'image/png' }); res.end(png); });
  const f = await createMlClient({ baseUrl: s.url, apiKey: KEY }).getBinary('/v1/research/figures/importance_bar');
  assert.equal(f.contentType, 'image/png');
  assert.deepEqual(f.body, png);
  await s.close();
});

test('fromEnv defaults: enabled, 3000 ms timeout, 3 failures, 30 s cool-down', () => {
  const st = createMlClient.fromEnv({ ML_API_KEY: KEY }).status();
  assert.equal(st.enabled, true);
  assert.equal(st.timeout_ms, 3000);
  const ml = createMlClient.fromEnv({ ML_API_KEY: KEY });
  assert.equal(ml.breaker.failureThreshold, 3);
  assert.equal(ml.breaker.cooldownMs, 30000);
  assert.equal(createMlClient.fromEnv({ ML_ENABLED: 'false' }).status().enabled, false);
});
