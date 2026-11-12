/**
 * Internal client for the FastAPI ML service (Phase 4.4).
 *
 * - Only Express calls the ML service; the browser never does. The shared key is sent as X-ML-API-Key and is
 *   never logged, returned or included in an error.
 * - Every call has a timeout (ML_TIMEOUT_MS, default 3000 ms).
 * - Circuit breaker: after ML_CIRCUIT_FAILURES (default 3) consecutive failures, calls are skipped for
 *   ML_CIRCUIT_COOLDOWN_MS (default 30000 ms). After the cool-down ONE trial call is allowed (half-open):
 *   success closes the circuit, failure opens it again.
 * - A failure is: timeout, network error, 5xx, rejected API key (401/403) or a non-JSON body where JSON is expected.
 *   404 / 422 are answers about the request (unknown claim, invalid ID), not service failures.
 *
 * Environment: ML_ENABLED ('false' disables all calls), ML_SERVICE_URL (default http://127.0.0.1:8000),
 * ML_API_KEY (required), ML_TIMEOUT_MS, ML_CIRCUIT_FAILURES, ML_CIRCUIT_COOLDOWN_MS.
 */
'use strict';

class MlUnavailableError extends Error {
  /** reason: disabled | not_configured | circuit_open | timeout | network_error | upstream_error | auth_rejected | bad_response */
  constructor(reason, message, status) {
    super(message || reason);
    this.name = 'MlUnavailableError';
    this.reason = reason;
    this.status = status;   // upstream HTTP status, if any
  }
}

class MlRequestError extends Error {
  /** The service answered, but about the request: 404 (not found) or 422 (invalid input). */
  constructor(status, detail) {
    super(typeof detail === 'string' ? detail : 'ML service rejected the request');
    this.name = 'MlRequestError';
    this.status = status;
  }
}

class CircuitBreaker {
  constructor({ failureThreshold = 3, cooldownMs = 30000, now = Date.now } = {}) {
    this.failureThreshold = failureThreshold;
    this.cooldownMs = cooldownMs;
    this.now = now;
    this.failures = 0;
    this.openedAt = null;
    this.trialInFlight = false;
  }

  get state() {
    if (this.openedAt === null) return 'closed';
    return this.now() - this.openedAt >= this.cooldownMs ? 'half_open' : 'open';
  }

  /** true if a call may be made now (reserves the single half-open trial). */
  tryAcquire() {
    const s = this.state;
    if (s === 'closed') return true;
    if (s === 'half_open' && !this.trialInFlight) {
      this.trialInFlight = true;
      return true;
    }
    return false;
  }

  onSuccess() {
    this.failures = 0;
    this.openedAt = null;
    this.trialInFlight = false;
  }

  onFailure() {
    this.trialInFlight = false;
    if (this.openedAt !== null) {          // failed half-open trial: open again
      this.openedAt = this.now();
      return;
    }
    this.failures += 1;
    if (this.failures >= this.failureThreshold) this.openedAt = this.now();
  }

  snapshot() {
    const s = this.state;
    return {
      state: s,
      consecutive_failures: this.failures,
      retry_after_ms: s === 'open' ? Math.max(0, this.cooldownMs - (this.now() - this.openedAt)) : 0,
    };
  }
}

function createMlClient({
  baseUrl = 'http://127.0.0.1:8000', apiKey = '', enabled = true, timeoutMs = 3000,
  failureThreshold = 3, cooldownMs = 30000, fetchImpl = globalThis.fetch, now = Date.now,
} = {}) {
  const breaker = new CircuitBreaker({ failureThreshold, cooldownMs, now });
  const base = String(baseUrl).replace(/\/+$/, '');
  const configured = Boolean(apiKey);

  async function call(path, { binary = false } = {}) {
    if (!enabled) throw new MlUnavailableError('disabled', 'AI service is disabled (ML_ENABLED=false)');
    if (!configured) throw new MlUnavailableError('not_configured', 'AI service is not configured (ML_API_KEY missing)');
    if (!breaker.tryAcquire()) {
      throw new MlUnavailableError('circuit_open', 'AI service temporarily unavailable (circuit open after repeated failures)');
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res;
    try {
      res = await fetchImpl(base + path, {
        method: 'GET',
        headers: { 'X-ML-API-Key': apiKey, Accept: binary ? 'image/png' : 'application/json' },
        signal: ctrl.signal,
      });
      if (res.status === 404 || res.status === 422) {
        let detail;
        try { detail = (await res.json()).detail; } catch { detail = undefined; }
        breaker.onSuccess();                // the service is up and answered
        throw new MlRequestError(res.status, detail);
      }
      if (res.status === 401 || res.status === 403) {
        throw new MlUnavailableError('auth_rejected', 'AI service rejected the internal API key', res.status);
      }
      if (res.status >= 500) throw new MlUnavailableError('upstream_error', `AI service error (HTTP ${res.status})`, res.status);
      if (!res.ok) throw new MlUnavailableError('upstream_error', `Unexpected AI service response (HTTP ${res.status})`, res.status);
      let out;
      if (binary) {
        out = { contentType: res.headers.get('content-type') || 'application/octet-stream', body: Buffer.from(await res.arrayBuffer()) };
      } else {
        try {
          out = await res.json();
        } catch {
          throw new MlUnavailableError('bad_response', 'AI service returned an invalid response');
        }
      }
      breaker.onSuccess();
      return out;
    } catch (err) {
      if (err instanceof MlRequestError) throw err;
      breaker.onFailure();
      if (err instanceof MlUnavailableError) throw err;
      if (err && err.name === 'AbortError') throw new MlUnavailableError('timeout', `AI service did not answer within ${timeoutMs} ms`);
      throw new MlUnavailableError('network_error', 'AI service unreachable');
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    getJson: (path) => call(path),
    getBinary: (path) => call(path, { binary: true }),
    status: () => ({ enabled, configured, timeout_ms: timeoutMs, circuit: breaker.snapshot() }),
    breaker,
  };
}

createMlClient.fromEnv = (env = process.env) => createMlClient({
  baseUrl: env.ML_SERVICE_URL || 'http://127.0.0.1:8000',
  apiKey: env.ML_API_KEY || '',
  enabled: String(env.ML_ENABLED || 'true').toLowerCase() !== 'false',
  timeoutMs: parseInt(env.ML_TIMEOUT_MS, 10) || 3000,
  failureThreshold: parseInt(env.ML_CIRCUIT_FAILURES, 10) || 3,
  cooldownMs: parseInt(env.ML_CIRCUIT_COOLDOWN_MS, 10) || 30000,
});

module.exports = { createMlClient, CircuitBreaker, MlUnavailableError, MlRequestError };
