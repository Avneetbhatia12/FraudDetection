#!/usr/bin/env node
/**
 * Phase 4.4 end-to-end test: React-side HTTP -> Express (/api/ai) -> FastAPI -> MySQL, on a TEMPORARY schema.
 *
 * It WRITES (claims, assessments, outcomes), so it refuses to run against fraud_detection. Prepare a throwaway schema
 * (restored from a backup, with database/ml_schema.sql applied) and start the ML service against it first.
 *
 * Env:
 *   E2E_DB_NAME   temporary schema (must start with "fd_" and must not be fraud_detection)
 *   E2E_ML_URL    FastAPI base URL serving E2E_DB_NAME (e.g. http://127.0.0.1:8055)
 *   E2E_ML_KEY    its X-ML-API-Key (test value; never printed)
 *   E2E_ML_URL_IST  second FastAPI instance on the same schema started with an IST host time zone
 *                   (E2E_ML_URL's instance runs with a UTC host time zone), for the date-policy checks
 *   DB_* credentials are read from backend/.env (never printed).
 * The test starts six Express instances (ports 5101-5106) with a test-only JWT secret, plus a stub ML server.
 *
 *   node tools/ai_integration/e2e.cjs
 */
'use strict';
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');

const BACKEND = path.join(__dirname, '..', '..', 'backend');
require(path.join(BACKEND, 'node_modules', 'dotenv')).config({ path: path.join(BACKEND, '.env') });
const mysql = require(path.join(BACKEND, 'node_modules', 'mysql2', 'promise'));
const jwt = require(path.join(BACKEND, 'node_modules', 'jsonwebtoken'));

const DB = process.env.E2E_DB_NAME || '';
const ML_URL = process.env.E2E_ML_URL || '';
const ML_KEY = process.env.E2E_ML_KEY || '';
const ML_URL_IST = process.env.E2E_ML_URL_IST || '';
if (!/^fd_[a-z0-9_]+$/.test(DB) || DB === 'fraud_detection' || !ML_URL || !ML_KEY) {
  console.error('Refusing to run: set E2E_DB_NAME (fd_*, never fraud_detection), E2E_ML_URL and E2E_ML_KEY.');
  process.exit(2);
}
const JWT_SECRET = crypto.randomBytes(32).toString('hex');   // test-only secret for the test Express instances
const STUB_PORT = 5199;
const DEAD_PORT = 5198;
const results = [];
const responses = [];   // every response body, scanned for secret leakage at the end

const check = (name, ok, detail = '') => {
  results.push([name, Boolean(ok)]);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${detail}` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const token = (id, email, role) => jwt.sign({ id, email, role }, JWT_SECRET, { expiresIn: '1h' });
const T = {
  admin: token(1, 'admin@frauddetect.com', 'Admin'),
  investigator: token(2, 'investigator@frauddetect.com', 'Investigator'),
  analyst: token(3, 'analyst@frauddetect.com', 'Analyst'),
  reviewer: token(4, 'reviewer@frauddetect.com', 'Reviewer'),
};

async function call(port, method, p, tok, body) {
  const t0 = Date.now();
  const res = await fetch(`http://127.0.0.1:${port}/api${p}`, {
    method, headers: { ...(tok ? { Authorization: `Bearer ${tok}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const ct = res.headers.get('content-type') || '';
  const raw = Buffer.from(await res.arrayBuffer());
  const text = ct.includes('json') ? raw.toString('utf8') : '';
  responses.push(text + JSON.stringify([...res.headers]));
  return { status: res.status, ct, raw, body: text ? JSON.parse(text) : null, ms: Date.now() - t0, retry: res.headers.get('retry-after') };
}

// ── stub ML server for timeout / breaker / tampering tests ─────────────────
const stub = { mode: 'slow', hits: 0 };
const stubServer = http.createServer(async (req, res) => {
  stub.hits += 1;
  if (stub.mode === 'slow') { setTimeout(() => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{}'); }, 5000); return; }
  const r = await fetch(ML_URL + req.url, { headers: { 'X-ML-API-Key': req.headers['x-ml-api-key'] || '' } });
  let b = Buffer.from(await r.arrayBuffer());
  if (stub.mode === 'wrong_version' && (r.headers.get('content-type') || '').includes('json')) {
    const j = JSON.parse(b.toString('utf8'));
    if (j.indicator_set_version) j.indicator_set_version = '9.9.9';
    b = Buffer.from(JSON.stringify(j));
  }
  res.writeHead(r.status, { 'Content-Type': r.headers.get('content-type') || 'application/json' });
  res.end(b);
});

// ── Express instances ─────────────────────────────────────────
const children = [];
async function startExpress(port, extraEnv) {
  const env = { ...process.env, PORT: String(port), DB_NAME: DB, JWT_SECRET, ML_API_KEY: ML_KEY, ...extraEnv };
  const child = spawn(process.execPath, ['server.js'], { cwd: BACKEND, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.output = '';
  child.stdout.on('data', (d) => { child.output += d; });
  child.stderr.on('data', (d) => { child.output += d; });
  children.push(child);
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) return child; } catch { /* starting */ }
    await sleep(250);
  }
  throw new Error(`Express on ${port} did not start`);
}

async function main() {
  const db = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: DB, timezone: '+00:00' });
  const [[{ d }]] = await db.query('SELECT DATABASE() AS d');
  if (d !== DB || d === 'fraud_detection') throw new Error('wrong database');
  const q = async (sql, args) => (await db.query(sql, args))[0];
  const one = async (sql, args) => (await q(sql, args))[0];
  const utcText = (v) => (v instanceof Date ? v.toISOString() : v);   // the API serialises dates exactly like this (ISO 8601, UTC "Z")

  await new Promise((r) => stubServer.listen(STUB_PORT, '127.0.0.1', r));
  const A = 5101; const B = 5102; const C = 5103; const D = 5104;
  await startExpress(A, { ML_SERVICE_URL: ML_URL, TZ: 'UTC' });
  await startExpress(B, { ML_SERVICE_URL: `http://127.0.0.1:${STUB_PORT}`, ML_CIRCUIT_COOLDOWN_MS: '4000' });
  await startExpress(C, { ML_SERVICE_URL: `http://127.0.0.1:${DEAD_PORT}` });
  await startExpress(D, { ML_SERVICE_URL: ML_URL, ML_ENABLED: 'false' });
  const E = 5105; const F = 5106;
  await startExpress(E, { ML_SERVICE_URL: ML_URL_IST || ML_URL, TZ: 'Asia/Kolkata' });
  await startExpress(F, { ML_SERVICE_URL: `http://127.0.0.1:${STUB_PORT}`, AI_RATE_COMPUTE_PER_USER: '3', AI_RATE_RECOMPUTE_PER_USER: '2',
    AI_RATE_OUTCOME_PER_USER: '2', AI_RATE_READ_PER_USER: '5', AI_RATE_COMPUTE_GLOBAL: '8', AI_RATE_WINDOW_MS: '60000' });

  const statusesBefore = await q('SELECT CLAIM_ID, STATUS, APPROVED_AMOUNT FROM CLAIM ORDER BY CLAIM_ID');
  const flagsBefore = await one('SELECT COUNT(*) AS n FROM FRAUD_FLAG');
  const [c1, c2] = (await q('SELECT CLAIM_ID FROM CLAIM ORDER BY CLAIM_ID LIMIT 2')).map((r) => r.CLAIM_ID);
  const prov = (await one('SELECT PROVIDER_ID FROM MEDICAL_PROVIDER ORDER BY PROVIDER_ID LIMIT 1')).PROVIDER_ID;

  console.log('\n[1] Authentication and authorisation');
  const aiPaths = [['GET', '/ai/status'], ['GET', '/ai/dashboard'], ['GET', `/ai/claims/${c1}/assessment`], ['POST', `/ai/claims/${c1}/assessment`],
    ['GET', `/ai/claims/${c1}/assessments`], ['GET', `/ai/claims/${c1}/outcomes`], ['POST', `/ai/claims/${c1}/outcomes`],
    ['GET', `/ai/providers/${prov}/profile`], ['GET', '/ai/research/models'], ['GET', '/ai/research/shap/global'],
    ['GET', '/ai/research/providers/PRV51001/explanation'], ['GET', '/ai/research/figures/importance_bar']];
  let unauth = 0; let badTok = 0;
  for (const [m, p] of aiPaths) {
    if ((await call(A, m, p)).status === 401) unauth += 1;
    if ((await call(A, m, p, 'not-a-token')).status === 403) badTok += 1;
  }
  check(`all ${aiPaths.length} AI endpoints reject requests without a token (401)`, unauth === aiPaths.length, `${unauth}/${aiPaths.length}`);
  check(`all ${aiPaths.length} AI endpoints reject an invalid token (403, existing auth middleware)`, badTok === aiPaths.length);
  const login = await call(A, 'POST', '/auth/login', null, { email: 'admin@frauddetect.com', password: 'admin123' });
  check('real login flow issues a token that the AI routes accept', login.status === 200 && (await call(A, 'GET', '/ai/dashboard', login.body.token)).status === 200);
  const roleOk = [];
  for (const r of ['admin', 'investigator', 'analyst', 'reviewer']) roleOk.push((await call(A, 'GET', '/ai/dashboard', T[r])).status === 200);
  check('every authenticated role can read AI results (dashboard)', roleOk.every(Boolean));
  for (const r of ['analyst', 'reviewer']) {
    check(`${r} cannot record outcomes (403)`, (await call(A, 'POST', `/ai/claims/${c1}/outcomes`, T[r], { outcome: 'Legitimate', assessment_id: 1 })).status === 403);
    check(`${r} cannot force a recompute (403)`, (await call(A, 'POST', `/ai/claims/${c1}/assessment`, T[r])).status === 403);
  }
  const direct = await fetch(`${ML_URL}/v1/claims/${c1}/indicators`);
  const wrongKey = await fetch(`${ML_URL}/v1/claims/${c1}/indicators`, { headers: { 'X-ML-API-Key': 'wrong' } });
  check('FastAPI internal routes require the API key (401 without / with a wrong key)', direct.status === 401 && wrongKey.status === 401);

  console.log('\n[2] Assessments: storage, digest de-duplication, append-only');
  const g1 = await call(A, 'GET', `/ai/claims/${c1}/assessment`, T.analyst);
  const a1 = g1.body && g1.body.assessment;
  const row1 = await one('SELECT ASSESSMENT_ID, MODEL_ID, INDICATOR_SET_VERSION, SNAPSHOT_CLAIM_COUNT, INDICATORS_DIGEST, TRIGGER_SOURCE, REQUESTED_BY_USER_ID, ASSESSED_AT, TIMESTAMPDIFF(SECOND, ASSESSED_AT, UTC_TIMESTAMP()) AS age FROM CLAIM_RISK_ASSESSMENT WHERE CLAIM_ID=?', [c1]);
  const reg = await one("SELECT MODEL_ID, VERSION FROM MODEL_REGISTRY WHERE MODEL_KEY='app-indicators-v2'");
  check('first view stores a new snapshot (200, snapshot=new)', g1.status === 200 && g1.body.snapshot === 'new' && a1.assessment_id === row1.ASSESSMENT_ID, `assessment ${a1 && a1.assessment_id}`);
  check('stored row: MODEL_ID resolved by MODEL_KEY, version 2.0.0 = registry, digest, snapshot count, on_view, requesting user',
    row1.MODEL_ID === reg.MODEL_ID && row1.INDICATOR_SET_VERSION === reg.VERSION && row1.INDICATORS_DIGEST === a1.indicators_digest
    && row1.SNAPSHOT_CLAIM_COUNT === a1.snapshot_claim_count && row1.TRIGGER_SOURCE === 'on_view' && row1.REQUESTED_BY_USER_ID === 3);
  check('assessed_at returned = database ASSESSED_AT, ISO UTC (Z), generated by MySQL now',
    a1.assessed_at === utcText(row1.ASSESSED_AT) && a1.assessed_at.endsWith('Z') && Math.abs(row1.age) <= 10, `${a1.assessed_at}, age ${row1.age}s`);
  check('review priority / indicators / rule hits stored and returned', Array.isArray(a1.indicators) && a1.indicators.length === 8 && ['Routine', 'Elevated', 'High'].includes(a1.review_priority));
  const g2 = await call(A, 'GET', `/ai/claims/${c1}/assessment`, T.admin);
  const p2 = await call(A, 'POST', `/ai/claims/${c1}/assessment`, T.investigator);
  const n1 = (await one('SELECT COUNT(*) AS n FROM CLAIM_RISK_ASSESSMENT WHERE CLAIM_ID=?', [c1])).n;
  check('unchanged digest: repeat view and manual recompute return the SAME stored snapshot, no new row',
    g2.body.snapshot === 'unchanged' && p2.body.snapshot === 'unchanged' && g2.body.assessment.assessment_id === a1.assessment_id
    && p2.body.assessment.assessment_id === a1.assessment_id && n1 === 1 && g2.body.assessment.assessed_at === a1.assessed_at);

  // Change the knowledge: a near-duplicate claim entered through the existing claim API (SQL trigger runs as before).
  const base = await one('SELECT DATE_FORMAT(CLAIM_DATE, "%Y-%m-%d") AS dt, CLAIM_AMOUNT, DIAGNOSIS, POLICY_ID, PROVIDER_ID FROM CLAIM WHERE CLAIM_ID=?', [c1]);
  const created = await call(A, 'POST', '/claims', T.analyst, { CLAIM_DATE: base.dt, CLAIM_AMOUNT: Number(base.CLAIM_AMOUNT), DIAGNOSIS: base.DIAGNOSIS,
    POLICY_ID: base.POLICY_ID, PROVIDER_ID: base.PROVIDER_ID });
  check('existing claim creation works with the AI router mounted (201)', created.status === 201 && created.body.data.CLAIM_ID > 0);
  const g3 = await call(A, 'GET', `/ai/claims/${c1}/assessment`, T.analyst);
  const a3 = g3.body.assessment;
  const old = await one('SELECT INDICATORS_DIGEST, ASSESSED_AT FROM CLAIM_RISK_ASSESSMENT WHERE ASSESSMENT_ID=?', [a1.assessment_id]);
  const dup = a3.indicators.find((i) => i.code === 'near_duplicate_claims');
  check('changed indicators (new near-duplicate) append a NEW snapshot; the old one is untouched',
    g3.body.snapshot === 'new' && a3.assessment_id > a1.assessment_id && a3.indicators_digest !== a1.indicators_digest
    && old.INDICATORS_DIGEST === a1.indicators_digest && utcText(old.ASSESSED_AT) === a1.assessed_at
    && dup && dup.comparison_claim_ids.includes(created.body.data.CLAIM_ID), `snapshots ${a1.assessment_id} -> ${a3.assessment_id}`);

  console.log('\n[3] ML service unavailable / failed attempts');
  const f1 = await call(C, 'GET', `/ai/claims/${c1}/assessment`, T.analyst);
  const latestAny = await one('SELECT ASSESSMENT_ID, ASSESSMENT_STATUS FROM CLAIM_LATEST_ASSESSMENT WHERE CLAIM_ID=?', [c1]);
  const latestValid = await one('SELECT ASSESSMENT_ID FROM CLAIM_LATEST_VALID_ASSESSMENT WHERE CLAIM_ID=?', [c1]);
  check('FastAPI down: 503 ai_status=unavailable, no invented assessment, last valid snapshot returned marked stale',
    f1.status === 503 && f1.body.ai_status === 'unavailable' && f1.body.reason === 'network_error' && !f1.body.assessment
    && f1.body.last_valid_assessment.assessment_id === a3.assessment_id && f1.body.last_valid_assessment.stale === true);
  check('failed attempt stored as its own row (newest attempt), never the digest baseline',
    f1.body.failed_attempt_id === latestAny.ASSESSMENT_ID && latestAny.ASSESSMENT_STATUS === 'failed' && latestValid.ASSESSMENT_ID === a3.assessment_id);
  const g4 = await call(A, 'GET', `/ai/claims/${c1}/assessment`, T.analyst);
  check('after a failure, the next successful view compares with the latest NON-failed snapshot (unchanged, no duplicate)',
    g4.body.snapshot === 'unchanged' && g4.body.assessment.assessment_id === a3.assessment_id);
  const dis = await call(D, 'GET', `/ai/claims/${c1}/assessment`, T.analyst);
  const nAfterDis = (await one('SELECT COUNT(*) AS n FROM CLAIM_RISK_ASSESSMENT WHERE CLAIM_ID=?', [c1])).n;
  check('ML_ENABLED=false: 503 reason=disabled, nothing stored', dis.status === 503 && dis.body.reason === 'disabled' && dis.body.failed_attempt_id === null && nAfterDis === 3);
  for (const [label, p] of [['claims list', '/claims?limit=5'], ['claim detail', `/claims/${c1}`], ['fraud flags', '/fraud-flags?limit=5'],
    ['dashboard stats', '/dashboard/stats'], ['high-risk claims', '/high-risk-claims'], ['fraud rules', '/fraud-rules']]) {
    check(`FastAPI down: existing ${label} endpoint still works (200)`, (await call(C, 'GET', p, T.analyst)).status === 200);
  }
  const hiAmount = 999999;
  const cDown = await call(C, 'POST', '/claims', T.analyst, { CLAIM_DATE: base.dt, CLAIM_AMOUNT: hiAmount, DIAGNOSIS: 'E2E high amount', POLICY_ID: base.POLICY_ID, PROVIDER_ID: base.PROVIDER_ID });
  check('FastAPI down: claim creation works and the SQL rules still raise fraud flags', cDown.status === 201 && cDown.body.fraud_detected === true && cDown.body.fraud_flags.length >= 1,
    `${cDown.body && cDown.body.fraud_flags && cDown.body.fraud_flags.length} flag(s)`);
  const stDown = await call(C, 'GET', '/ai/status', T.analyst);
  check('FastAPI down: /api/ai/status reports unreachable, not ready', stDown.status === 200 && stDown.body.ml_service.reachable === false && stDown.body.ready === false);
  check('FastAPI down: research endpoints return 503 unavailable', (await call(C, 'GET', '/ai/research/models', T.analyst)).status === 503);

  console.log('\n[4] Timeout (3 s) and circuit breaker');
  stub.mode = 'slow'; stub.hits = 0;
  const t1 = await call(B, 'GET', `/ai/claims/${c2}/assessment`, T.analyst);
  check('slow ML service: request times out after ~3 s with reason=timeout', t1.status === 503 && t1.body.reason === 'timeout' && t1.ms >= 2900 && t1.ms < 4500, `${t1.ms} ms`);
  await call(B, 'GET', `/ai/claims/${c2}/assessment`, T.analyst);
  await call(B, 'GET', `/ai/claims/${c2}/assessment`, T.analyst);
  const failedRows = (await one("SELECT COUNT(*) AS n FROM CLAIM_RISK_ASSESSMENT WHERE CLAIM_ID=? AND ASSESSMENT_STATUS='failed'", [c2])).n;
  const t4 = await call(B, 'GET', `/ai/claims/${c2}/assessment`, T.analyst);
  check('after 3 failures the circuit opens: the next call fails fast (circuit_open) without contacting the service',
    t4.status === 503 && t4.body.reason === 'circuit_open' && t4.ms < 500 && stub.hits === 3, `${t4.ms} ms, stub hits ${stub.hits}`);
  const failedRows2 = (await one("SELECT COUNT(*) AS n FROM CLAIM_RISK_ASSESSMENT WHERE CLAIM_ID=? AND ASSESSMENT_STATUS='failed'", [c2])).n;
  check('each real timeout is recorded as a failed attempt; skipped (circuit-open) calls are not', failedRows === 3 && failedRows2 === 3);
  const st = await call(B, 'GET', '/ai/status', T.analyst);
  check('/api/ai/status shows the open circuit', st.body.circuit.state === 'open');
  await sleep(4200);
  stub.mode = 'proxy';
  const t5 = await call(B, 'GET', `/ai/claims/${c2}/assessment`, T.analyst);
  check('after the cool-down a half-open trial succeeds and closes the circuit', t5.status === 200 && t5.body.snapshot === 'new'
    && (await call(B, 'GET', '/ai/status', T.analyst)).body.circuit.state === 'closed');

  console.log('\n[5] Model registry safeguards');
  stub.mode = 'wrong_version';
  const before = (await one("SELECT COUNT(*) AS n FROM CLAIM_RISK_ASSESSMENT WHERE ASSESSMENT_STATUS<>'failed'")).n;
  const wv = await call(B, 'GET', `/ai/claims/${c2}/assessment`, T.analyst);
  const after = (await one("SELECT COUNT(*) AS n FROM CLAIM_RISK_ASSESSMENT WHERE ASSESSMENT_STATUS<>'failed'")).n;
  check('ML service reporting a version different from the registry: rejected, nothing stored', wv.status === 503 && wv.body.reason === 'model_version_mismatch' && before === after);
  stub.mode = 'proxy';
  await db.query("UPDATE MODEL_REGISTRY SET IS_ACTIVE = 0 WHERE MODEL_KEY='app-indicators-v2'");   // temp schema only
  const inactive = await call(A, 'POST', `/ai/claims/${c2}/assessment`, T.investigator);
  await db.query("UPDATE MODEL_REGISTRY SET IS_ACTIVE = 1 WHERE MODEL_KEY='app-indicators-v2'");
  check('inactive registry entry: not used for live assessments (503 model_not_approved), nothing stored',
    inactive.status === 503 && inactive.body.reason === 'model_not_approved'
    && (await one("SELECT COUNT(*) AS n FROM CLAIM_RISK_ASSESSMENT WHERE ASSESSMENT_STATUS<>'failed'")).n === after);

  console.log('\n[6] Investigation outcomes: strict snapshot linking');
  const other = (await call(A, 'GET', `/ai/claims/${c2}/assessment`, T.analyst)).body.assessment.assessment_id;
  const failedId = f1.body.failed_attempt_id;
  const countOutcomes = async () => (await one('SELECT COUNT(*) AS n FROM CLAIM_INVESTIGATION_OUTCOME')).n;
  const o0 = await countOutcomes();
  const bad = [
    ['missing assessment_id', { outcome: 'Legitimate' }, 400],
    ['non-existent snapshot', { outcome: 'Legitimate', assessment_id: 999999 }, 422],
    ["another claim's snapshot", { outcome: 'Legitimate', assessment_id: other }, 422],
    ['failed snapshot', { outcome: 'Legitimate', assessment_id: failedId }, 422],
    ['client-supplied decided_at', { outcome: 'Legitimate', assessment_id: a3.assessment_id, decided_at: '2000-01-01T00:00:00Z' }, 400],
    ['invalid outcome value', { outcome: 'Fraud', assessment_id: a3.assessment_id }, 400],
    ['invalid assessment_id', { outcome: 'Legitimate', assessment_id: 'abc' }, 400],
  ];
  for (const [label, body, want] of bad) {
    const r = await call(A, 'POST', `/ai/claims/${c1}/outcomes`, T.investigator, body);
    check(`outcome rejected: ${label} (${want})`, r.status === want, `${r.status} ${r.body && r.body.message}`);
  }
  check('no row stored for any rejected outcome', (await countOutcomes()) === o0);
  const ok1 = await call(A, 'POST', `/ai/claims/${c1}/outcomes`, T.investigator, { outcome: 'Confirmed Fraud', outcome_basis: 'documentary_evidence', notes: 'E2E', assessment_id: a1.assessment_id });
  const o1 = await one('SELECT ASSESSMENT_ID, DECIDED_AT, DECIDED_BY_ROLE, DECIDED_BY_USER_ID, TIMESTAMPDIFF(SECOND, DECIDED_AT, UTC_TIMESTAMP()) AS age FROM CLAIM_INVESTIGATION_OUTCOME WHERE OUTCOME_ID=?', [ok1.body.data.outcome_id]);
  check('investigator outcome linked to the EXACT supplied snapshot (older one, even though a newer valid snapshot exists): no substitution',
    ok1.status === 201 && o1.ASSESSMENT_ID === a1.assessment_id && ok1.body.data.linked_assessment.assessment_id === a1.assessment_id && a3.assessment_id !== a1.assessment_id);
  check('decided_at returned = database DECIDED_AT (UTC, Z), generated by MySQL, after the snapshot',
    ok1.body.data.decided_at === utcText(o1.DECIDED_AT) && ok1.body.data.decided_at.endsWith('Z') && Math.abs(o1.age) <= 10
    && new Date(ok1.body.data.decided_at) >= new Date(a1.assessed_at));
  check('decision recorded with the user identity from the token; training-eligible with its linked snapshot',
    o1.DECIDED_BY_ROLE === 'Investigator' && o1.DECIDED_BY_USER_ID === 2 && ok1.body.data.training.eligible === true);
  const ok2 = await call(A, 'POST', `/ai/claims/${c1}/outcomes`, T.admin, { outcome: 'Requires Further Investigation', assessment_id: a3.assessment_id });
  check('Admin can record outcomes; outcome history keeps both decisions (append-only)', ok2.status === 201
    && (await call(A, 'GET', `/ai/claims/${c1}/outcomes`, T.analyst)).body.data.length === 2);
  let dbErr = '';
  try {
    await db.query("INSERT INTO CLAIM_INVESTIGATION_OUTCOME (CLAIM_ID,OUTCOME,DECIDED_BY_USER_ID,DECIDED_BY_EMAIL,DECIDED_BY_ROLE,ASSESSMENT_ID) VALUES (?, 'Legitimate', 2, 'x@y', 'Investigator', ?)", [c1, other]);
  } catch (e) { dbErr = e.sqlMessage || e.message; }
  check('database is the final safeguard: a direct insert bypassing Express with a wrong-claim link is rejected', /Linked assessment/.test(dbErr), dbErr.slice(0, 80));
  const stillCount = (await one('SELECT COUNT(*) AS n FROM CLAIM_INVESTIGATION_OUTCOME')).n;
  let appendErr = '';
  try { await db.query('UPDATE CLAIM_INVESTIGATION_OUTCOME SET OUTCOME = "Legitimate"'); } catch (e) { appendErr = e.sqlMessage; }
  check('stored decisions and their snapshots are permanent (append-only)', /append-only/.test(appendErr) && stillCount === o0 + 2);
  const hist = await call(A, 'GET', `/ai/claims/${c1}/assessments`, T.analyst);
  check('assessment history lists every snapshot incl. the failed attempt, newest first',
    hist.status === 200 && hist.body.data.length === 3 && hist.body.data.some((h) => h.assessment_status === 'failed'));

  console.log('\n[7] Provider profiles');
  const istToday = (await one("SELECT DATE_FORMAT(UTC_TIMESTAMP() + INTERVAL 330 MINUTE, '%Y-%m-%d') AS d")).d;
  const pr1 = await call(A, 'GET', `/ai/providers/${prov}/profile`, T.analyst);
  const pr2 = await call(A, 'GET', `/ai/providers/${prov}/profile`, T.analyst);
  const prRow = await one('SELECT COMPUTED_AT, MODEL_ID FROM PROVIDER_RISK_PROFILE WHERE PROFILE_ID=?', [pr1.body.profile && pr1.body.profile.profile_id]);
  check('provider profile computed and stored (new), MODEL_ID from registry, computed_at = DB UTC value',
    pr1.status === 200 && pr1.body.snapshot === 'new' && prRow.MODEL_ID === reg.MODEL_ID && pr1.body.profile.computed_at === utcText(prRow.COMPUTED_AT));
  check('repeat with identical content returns the same stored profile (no duplicate)', pr2.body.snapshot === 'unchanged' && pr2.body.profile.profile_id === pr1.body.profile.profile_id);
  const pr3 = await call(A, 'GET', `/ai/providers/${prov}/profile?as_of=2024-01-01`, T.analyst);
  check('explicit as_of date produces a separate profile for that date', pr3.status === 200 && pr3.body.profile.as_of_date === '2024-01-01' && pr3.body.profile.profile_id !== pr1.body.profile.profile_id);
  check('default as-of date = today in IST on the MySQL clock (as_of_source=default_today_ist)',
    pr1.body.as_of_source === 'default_today_ist' && pr1.body.profile.as_of_date === istToday, `${pr1.body.profile.as_of_date} vs MySQL IST ${istToday}`);
  check('explicit as_of reported as requested', pr3.body.as_of_source === 'requested');
  const nodeOffsets = {};
  for (const tz of ['UTC', 'Asia/Kolkata']) {
    nodeOffsets[tz] = await new Promise((r) => {
      const c = spawn(process.execPath, ['-e', 'console.log(new Date().getTimezoneOffset())'], { env: { ...process.env, TZ: tz } });
      let o = ''; c.stdout.on('data', (x) => { o += x; }); c.on('close', () => r(o.trim()));
    });
  }
  check('the two Express host configurations really differ (Node local offset UTC vs IST)', nodeOffsets.UTC === '0' && nodeOffsets['Asia/Kolkata'] === '-330', JSON.stringify(nodeOffsets));
  const prE = await call(E, 'GET', `/ai/providers/${prov}/profile`, T.analyst);
  check('IST-host Express + IST-host FastAPI: same default date and the SAME stored profile reused (unchanged)',
    prE.status === 200 && prE.body.profile.as_of_date === istToday && prE.body.snapshot === 'unchanged' && prE.body.profile.profile_id === pr1.body.profile.profile_id);
  const prE3 = await call(E, 'GET', `/ai/providers/${prov}/profile?as_of=2024-01-01`, T.analyst);
  check('explicit date via the other host configuration reuses the same profile for that date',
    prE3.body.snapshot === 'unchanged' && prE3.body.profile.profile_id === pr3.body.profile.profile_id);
  const directDates = [];
  for (const u of [ML_URL, ML_URL_IST].filter(Boolean)) {
    directDates.push((await (await fetch(`${u}/v1/providers/${prov}/indicators`, { headers: { 'X-ML-API-Key': ML_KEY } })).json()).as_of_date);
  }
  check('FastAPI own default (no as_of) under UTC and IST host time zones = MySQL IST date',
    directDates.length === 2 && directDates.every((x) => x === istToday), directDates.join(', '));
  check('invalid as_of rejected (400); unknown provider 404', (await call(A, 'GET', `/ai/providers/${prov}/profile?as_of=01-01-2024`, T.analyst)).status === 400
    && (await call(A, 'GET', '/ai/providers/999999/profile', T.analyst)).status === 404);

  console.log('\n[8] Research (Kaggle) endpoints, dashboard, status');
  const rm = await call(A, 'GET', '/ai/research/models', T.analyst);
  check('research metrics: labelled research_benchmark, not applicable to live data', rm.status === 200 && rm.body.kind === 'research_benchmark' && rm.body.scope.applies_to_live_application_data === false);
  const rs = await call(A, 'GET', '/ai/research/shap/global', T.analyst);
  check('global SHAP results', rs.status === 200 && rs.body.kind === 'research_benchmark' && rs.body.data && Object.keys(rs.body.data).length > 0);
  const re = await call(A, 'GET', '/ai/research/providers/PRV51001/explanation', T.analyst);
  check('individual Kaggle provider explanation', re.status === 200 && re.body.kind === 'research_benchmark', `${re.status}`);
  check('application-style provider ID rejected for research explanations (400)', (await call(A, 'GET', `/ai/research/providers/${prov}/explanation`, T.analyst)).status === 400);
  const fig = await call(A, 'GET', '/ai/research/figures/importance_bar', T.analyst);
  check('approved SHAP figure served as PNG', fig.status === 200 && fig.ct === 'image/png' && fig.raw.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])), `${fig.raw.length} bytes`);
  check('unknown figure 404; malformed name 400', (await call(A, 'GET', '/ai/research/figures/not_a_figure', T.analyst)).status === 404
    && (await call(A, 'GET', '/ai/research/figures/..%2F..%2Fsecret', T.analyst)).status === 400);
  const dash = await call(A, 'GET', '/ai/dashboard', T.reviewer);
  const valid = (await one('SELECT COUNT(*) AS n FROM CLAIM_LATEST_VALID_ASSESSMENT')).n;
  check('AI dashboard: counts match the database; review queue; Track 3 checkpoint shown as a review point',
    dash.status === 200 && dash.body.claims.with_valid_assessment === valid && dash.body.future_supervised_model.eligible_final_outcomes >= 0
    && Object.values(dash.body.review_priority).reduce((x, y) => x + y, 0) === valid);
  const stA = await call(A, 'GET', '/ai/status', T.analyst);
  check('/api/ai/status: service reachable, registry app-indicators-v2 2.0.0 registered, live, active, consistent -> ready',
    stA.body.ml_service.reachable && stA.body.registry.version === '2.0.0' && stA.body.registry.approved_for_live_data && stA.body.ready === true);

  console.log('\n[9] Rate limiting (instance with low limits: compute 3, recompute 2, outcome 2, read 5 per user; compute 8 for all users)');
  stub.mode = 'proxy';
  const comp = [];
  for (let i = 0; i < 3; i++) comp.push(await call(F, 'GET', '/ai/claims/' + c1 + '/assessment', T.analyst));
  const hits0 = stub.hits;                                                            // measured just before the limited request
  const rows0 = (await one('SELECT COUNT(*) AS n FROM CLAIM_RISK_ASSESSMENT')).n;
  comp.push(await call(F, 'GET', '/ai/claims/' + c1 + '/assessment', T.analyst));
  const lim = comp[3];
  check('per-user compute limit: 3 allowed, 4th gets 429 with Retry-After', comp.slice(0, 3).every((r) => r.status === 200) && lim.status === 429
    && Number(lim.retry) > 0 && lim.body.retry_after_seconds === Number(lim.retry) && lim.body.limit.name === 'ai_compute', 'Retry-After ' + lim.retry + 's');
  check('the limited request never reached the ML service or the database',
    stub.hits === hits0 && (await one('SELECT COUNT(*) AS n FROM CLAIM_RISK_ASSESSMENT')).n === rows0);
  check('429 body contains no internal details', !/127\.0\.0\.1|http:|X-ML|api.key|stack/i.test(JSON.stringify(lim.body)));
  check('a limited user can still read stored AI results (history, separate read bucket)',
    (await call(F, 'GET', '/ai/claims/' + c1 + '/assessments', T.analyst)).status === 200);
  check('Analyst recompute is still 403 (role check first; does not use the quota)',
    (await call(F, 'POST', '/ai/claims/' + c1 + '/assessment', T.analyst)).status === 403);
  const rc = [];
  for (let i = 0; i < 3; i++) rc.push((await call(F, 'POST', '/ai/claims/' + c1 + '/assessment', T.investigator)).status);
  check('recompute limit: 2 allowed, 3rd 429', JSON.stringify(rc) === '[200,200,429]', JSON.stringify(rc));
  const ad = [];
  for (let i = 0; i < 3; i++) ad.push((await call(F, 'GET', '/ai/claims/' + c1 + '/assessment', T.admin)).status);
  const glob = await call(F, 'GET', '/ai/providers/' + prov + '/profile', T.reviewer);
  check('per-user isolation: another user is not blocked by the first user limit', JSON.stringify(ad) === '[200,200,200]', JSON.stringify(ad));
  check('all-users compute cap (8) protects the ML service: further compute requests get 429',
    glob.status === 429 && glob.body.limit.name === 'ai_compute_all_users');
  const oc = [];
  for (let i = 0; i < 3; i++) {
    oc.push((await call(F, 'POST', '/ai/claims/' + c1 + '/outcomes', T.investigator, { outcome: 'Requires Further Investigation', assessment_id: a3.assessment_id })).status);
  }
  check('outcome limit: 2 allowed, 3rd 429', JSON.stringify(oc) === '[201,201,429]', JSON.stringify(oc));
  const rd = [];
  for (let i = 0; i < 5; i++) rd.push((await call(F, 'GET', '/ai/dashboard', T.analyst)).status);
  check('read limit: analyst had 1 read; 4 more allowed, then 429', JSON.stringify(rd) === '[200,200,200,200,429]', JSON.stringify(rd));
  const existing = [];
  for (let i = 0; i < 25; i++) existing.push((await call(F, 'GET', '/claims?limit=5', T.analyst)).status);
  for (const pth of ['/fraud-flags?limit=5', '/dashboard/stats', '/high-risk-claims', '/fraud-rules']) {
    for (let i = 0; i < 8; i++) existing.push((await call(F, 'GET', pth, T.analyst)).status);
  }
  check('existing endpoints are not rate limited (' + existing.length + ' requests by a limited user, all 200)', existing.every((s) => s === 200));
  const cF = await call(F, 'POST', '/claims', T.analyst, { CLAIM_DATE: base.dt, CLAIM_AMOUNT: 999999, DIAGNOSIS: 'E2E rate-limited user',
    POLICY_ID: base.POLICY_ID, PROVIDER_ID: base.PROVIDER_ID });
  check('existing claim creation unaffected for a rate-limited user; SQL rules raise flags', cF.status === 201 && cF.body.fraud_flags.length >= 1);

  console.log('\n[10] Safety');
  const statusesAfter = await q('SELECT CLAIM_ID, STATUS, APPROVED_AMOUNT FROM CLAIM WHERE CLAIM_ID IN (?) ORDER BY CLAIM_ID', [statusesBefore.map((r) => r.CLAIM_ID)]);
  check('no claim STATUS or APPROVED_AMOUNT changed by any AI operation', JSON.stringify(statusesAfter) === JSON.stringify(statusesBefore));
  const flagsAfter = await one('SELECT COUNT(*) AS n FROM FRAUD_FLAG WHERE CLAIM_ID IN (?)', [statusesBefore.map((r) => r.CLAIM_ID)]);
  check('existing fraud flags unchanged (only the new test claims added flags)', flagsAfter.n === flagsBefore.n);
  const leaked = responses.some((t) => t.includes(ML_KEY) || t.includes(process.env.DB_PASSWORD || '\u0000') || t.includes(JWT_SECRET));
  check(`no response (${responses.length}) contains the ML API key, DB password or JWT secret`, !leaked);
  check('no response mentions the internal ML service URL', !responses.some((t) => t.includes(ML_URL) || t.includes(`127.0.0.1:${STUB_PORT}`)));

  await db.end();
}

main()
  .catch((e) => { console.error('E2E ERROR:', e.message); results.push(['e2e completed without error', false]); })
  .finally(async () => {
    for (const c of children) c.kill();
    stubServer.closeAllConnections();
    stubServer.close();
    const failed = results.filter(([, ok]) => !ok).map(([n]) => n);
    console.log(`\nE2E SUMMARY: ${results.length - failed.length}/${results.length} checks passed${failed.length ? `; FAILED: ${failed.join(' | ')}` : ''}`);
    process.exit(failed.length ? 1 : 0);
  });
