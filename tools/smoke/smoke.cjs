#!/usr/bin/env node
/**
 * API regression smoke test — READ-ONLY.
 *
 * Records the response *shape* (status code, keys, value types) of every
 * existing GET endpoint, then later verifies that shape is unchanged.
 * Only GET requests and POST /auth/login are sent: nothing is written to the DB.
 * Snapshots contain structure and row counts only — no patient data.
 *
 * Usage (backend must be running):
 *   node tools/smoke/smoke.cjs --record     # save baseline.json
 *   node tools/smoke/smoke.cjs              # compare against baseline.json
 *
 * Env: SMOKE_BASE_URL (default http://localhost:5000/api)
 *      SMOKE_EMAIL / SMOKE_PASSWORD (default: README admin account)
 *
 * Exit code 1 if any shape differs. Row-count differences are reported as
 * warnings only (new claims legitimately change counts).
 */
const fs   = require('fs');
const path = require('path');

const BASE     = process.env.SMOKE_BASE_URL || 'http://localhost:5000/api';
const EMAIL    = process.env.SMOKE_EMAIL    || 'admin@frauddetect.com';
const PASSWORD = process.env.SMOKE_PASSWORD || 'admin123';
const SNAPSHOT = path.join(__dirname, 'baseline.json');
const RECORD   = process.argv.includes('--record');

// Describe structure only. null is recorded as 'null' and treated as a wildcard
// when comparing, because nullable columns legitimately vary per row.
function shape(v) {
  if (v === null || v === undefined) return 'null';
  if (Array.isArray(v)) return { array: v.length ? shape(v[0]) : 'empty' };
  if (typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = shape(v[k]);
    return out;
  }
  return typeof v;
}

function lengths(v, prefix = '', out = {}) {
  if (Array.isArray(v)) { out[prefix || '(root)'] = v.length; return out; }
  if (v && typeof v === 'object') for (const k of Object.keys(v)) lengths(v[k], prefix ? `${prefix}.${k}` : k, out);
  return out;
}

// Returns list of differences; `added` keys are allowed (additive API changes are fine).
function diff(base, cur, p = '') {
  if (base === 'null' || cur === 'null' || base === 'empty' || cur === 'empty') return [];
  if (typeof base === 'string' || typeof cur === 'string') {
    return base === cur ? [] : [`${p || '(root)'}: type ${JSON.stringify(base)} -> ${JSON.stringify(cur)}`];
  }
  if ('array' in base || 'array' in cur) {
    if (!('array' in base && 'array' in cur)) return [`${p}: array/object mismatch`];
    return diff(base.array, cur.array, `${p}[]`);
  }
  const errs = [];
  for (const k of Object.keys(base)) {
    if (!(k in cur)) errs.push(`${p}.${k}: REMOVED`);
    else errs.push(...diff(base[k], cur[k], `${p}.${k}`));
  }
  return errs;
}

async function call(method, url, token, body) {
  const res = await fetch(BASE + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, json };
}

(async () => {
  const login = await call('POST', '/auth/login', null, { email: EMAIL, password: PASSWORD });
  if (login.status !== 200) {
    console.error(`Login failed (${login.status}). Is the backend running at ${BASE}?`);
    process.exit(2);
  }
  const token = login.json.token;
  const loginShape = { ...login.json, token: 'string' };

  // Resolve a real flag id so the investigation endpoint is exercised.
  const flags   = await call('GET', '/fraud-flags?limit=1', token);
  const flagId  = flags.json?.data?.[0]?.FLAG_ID;

  const endpoints = [
    '/health',
    '/dashboard/stats',
    '/claims?limit=5', '/claims/1',
    '/patients?limit=5', '/patients/1',
    '/policies?limit=5', '/policies/1',
    '/providers?limit=5', '/providers/1',
    '/fraud-flags?limit=5', ...(flagId ? [`/fraud-flags/${flagId}`] : []),
    '/fraud-rules',
    '/high-risk-claims',
    '/reports',
    '/users',
  ];

  const results = { 'POST /auth/login': { status: login.status, shape: shape(loginShape), lengths: {} } };
  for (const ep of endpoints) {
    const r = await call('GET', ep, token);
    // fraud-flags/:id varies by id; store under a stable key
    const key = 'GET ' + ep.replace(/^\/fraud-flags\/\d+$/, '/fraud-flags/:id');
    results[key] = { status: r.status, shape: shape(r.json), lengths: lengths(r.json) };
  }

  if (RECORD) {
    fs.writeFileSync(SNAPSHOT, JSON.stringify({ recordedAt: new Date().toISOString(), results }, null, 2));
    console.log(`Baseline recorded: ${Object.keys(results).length} endpoints -> ${path.relative(process.cwd(), SNAPSHOT)}`);
    for (const [k, v] of Object.entries(results)) console.log(`  ${v.status}  ${k}`);
    return;
  }

  if (!fs.existsSync(SNAPSHOT)) { console.error('No baseline.json — run with --record first.'); process.exit(2); }
  const baseline = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8')).results;

  let failed = 0;
  for (const [k, b] of Object.entries(baseline)) {
    const c = results[k];
    if (!c) { console.log(`FAIL ${k}: endpoint not exercised`); failed++; continue; }
    const errs = [];
    if (b.status !== c.status) errs.push(`status ${b.status} -> ${c.status}`);
    errs.push(...diff(b.shape, c.shape));
    if (errs.length) { failed++; console.log(`FAIL ${k}\n   - ${errs.join('\n   - ')}`); }
    else console.log(`ok   ${k}`);
    for (const [lk, lv] of Object.entries(b.lengths)) {
      if (c.lengths[lk] !== undefined && c.lengths[lk] !== lv) console.log(`     warn: ${lk} count ${lv} -> ${c.lengths[lk]}`);
    }
  }
  console.log(failed ? `\n${failed} endpoint(s) changed shape.` : '\nAll existing endpoints unchanged.');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e.message); process.exit(2); });
