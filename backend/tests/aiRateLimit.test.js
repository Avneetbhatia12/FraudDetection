/**
 * Unit tests for middleware/aiRateLimit.js (no database, no ML service).   Run: cd backend && npm test
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createRateLimiter, createAiRateLimits } = require('../middleware/aiRateLimit');

async function app(mw, users = {}) {
  const a = express();
  a.use((req, res, next) => { req.user = users[req.headers['x-user']] || { id: Number(req.headers['x-user']) }; next(); });
  let handled = 0;
  a.get('/x', mw, (req, res) => { handled += 1; res.json({ ok: true }); });
  const server = await new Promise((r) => { const s = a.listen(0, '127.0.0.1', () => r(s)); });
  const url = `http://127.0.0.1:${server.address().port}/x`;
  const get = async (user) => {
    const res = await fetch(url, { headers: { 'x-user': String(user) } });
    return { status: res.status, retry: res.headers.get('retry-after'), body: await res.json() };
  };
  return { get, handled: () => handled, close: () => new Promise((r) => { server.closeAllConnections(); server.close(r); }) };
}

test('allows up to the limit, then 429 with Retry-After and no internal details; handler not reached', async () => {
  let t = 1000000;
  const s = await app(createRateLimiter({ name: 'ai_compute', limit: 3, windowMs: 60000, now: () => t }));
  for (let i = 0; i < 3; i++) assert.equal((await s.get(1)).status, 200);
  t += 15000;
  const r = await s.get(1);
  assert.equal(r.status, 429);
  assert.equal(r.retry, '45');
  assert.equal(r.body.retry_after_seconds, 45);
  assert.deepEqual(r.body.limit, { name: 'ai_compute', max_requests: 3, window_seconds: 60 });
  assert.ok(!/http|127\.0\.0\.1|8000|key/i.test(JSON.stringify(r.body)));
  assert.equal(s.handled(), 3);
  await s.close();
});

test('limits are per user: one user hitting the limit does not block another', async () => {
  const s = await app(createRateLimiter({ name: 'n', limit: 2, windowMs: 60000 }));
  await s.get(1); await s.get(1);
  assert.equal((await s.get(1)).status, 429);
  assert.equal((await s.get(2)).status, 200);
  assert.equal((await s.get(2)).status, 200);
  await s.close();
});

test('window resets: requests are allowed again after the window', async () => {
  let t = 0;
  const s = await app(createRateLimiter({ name: 'n', limit: 1, windowMs: 60000, now: () => t }));
  assert.equal((await s.get(1)).status, 200);
  assert.equal((await s.get(1)).status, 429);
  t = 60000;
  assert.equal((await s.get(1)).status, 200);
  await s.close();
});

test('global bucket caps all users together', async () => {
  const s = await app(createRateLimiter({ name: 'all', limit: 3, windowMs: 60000, keyFn: () => 'global' }));
  assert.deepEqual([(await s.get(1)).status, (await s.get(2)).status, (await s.get(3)).status, (await s.get(4)).status], [200, 200, 200, 429]);
  await s.close();
});

test('expired windows are pruned when the key table is full', async () => {
  let t = 0;
  const mw = createRateLimiter({ name: 'n', limit: 1, windowMs: 1000, now: () => t, maxKeys: 2 });
  const s = await app(mw);
  await s.get(1); await s.get(2);
  t = 2000;
  assert.equal((await s.get(3)).status, 200);
  assert.equal((await s.get(1)).status, 200);
  await s.close();
});

test('configuration from environment: defaults, overrides, invalid values ignored, disable switch', () => {
  assert.deepEqual(createAiRateLimits({}).config, { enabled: true, window_ms: 60000, compute_per_user: 60, recompute_per_user: 10,
    outcome_per_user: 30, read_per_user: 120, compute_global: 600 });
  const c = createAiRateLimits({ AI_RATE_COMPUTE_PER_USER: '5', AI_RATE_WINDOW_MS: '1000', AI_RATE_READ_PER_USER: 'abc', AI_RATE_OUTCOME_PER_USER: '-3' }).config;
  assert.equal(c.compute_per_user, 5);
  assert.equal(c.window_ms, 1000);
  assert.equal(c.read_per_user, 120);
  assert.equal(c.outcome_per_user, 30);
  const off = createAiRateLimits({ AI_RATE_LIMIT_ENABLED: 'false' });
  assert.equal(off.config.enabled, false);
  let called = false;
  off.compute({}, {}, () => { called = true; });
  assert.ok(called);
});
