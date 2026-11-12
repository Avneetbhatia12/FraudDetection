/**
 * Rate limiting for the AI routes only (/api/ai). Existing routes are not affected.
 *
 * Fixed-window counters kept in memory (per Express process). Keys are the authenticated user ID (the limiter
 * runs after middleware/auth.js); requests over the limit get HTTP 429 with Retry-After and no internal details.
 * Rejected requests never reach the ML service or the database.
 *
 * Buckets (per user, per window) and their environment variables:
 *   compute    GET claim assessment, GET provider profile (each may call the ML service)   AI_RATE_COMPUTE_PER_USER   default 60
 *   recompute  POST claim assessment (manual recompute)                                   AI_RATE_RECOMPUTE_PER_USER default 10
 *   outcome    POST investigation outcome                                                 AI_RATE_OUTCOME_PER_USER   default 30
 *   read       stored results, status, dashboard, research                                AI_RATE_READ_PER_USER      default 120
 *   global     all ML-computing requests from all users together (protects the service)   AI_RATE_COMPUTE_GLOBAL     default 600
 * AI_RATE_WINDOW_MS (default 60000) sets the window; AI_RATE_LIMIT_ENABLED=false disables all AI limits.
 */
'use strict';

function createRateLimiter({ name, limit, windowMs = 60000, keyFn = (req) => `u:${req.user && req.user.id}`, now = Date.now, maxKeys = 10000 }) {
  const windows = new Map();   // key -> { start, count }

  const middleware = (req, res, next) => {
    const t = now();
    const key = keyFn(req);
    let w = windows.get(key);
    if (!w || t - w.start >= windowMs) {
      if (windows.size >= maxKeys) {                       // drop expired windows before growing further
        for (const [k, v] of windows) if (t - v.start >= windowMs) windows.delete(k);
      }
      w = { start: t, count: 0 };
      windows.set(key, w);
    }
    if (w.count >= limit) {
      const retryAfter = Math.max(1, Math.ceil((w.start + windowMs - t) / 1000));
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({
        success: false,
        message: 'Too many AI requests. Please wait and try again.',
        retry_after_seconds: retryAfter,
        limit: { name, max_requests: limit, window_seconds: Math.round(windowMs / 1000) },
      });
    }
    w.count += 1;
    return next();
  };
  middleware.reset = () => windows.clear();
  return middleware;
}

const passThrough = (req, res, next) => next();

function createAiRateLimits(env = process.env, { now = Date.now } = {}) {
  const int = (name, dflt) => {
    const v = parseInt(env[name], 10);
    return Number.isInteger(v) && v > 0 ? v : dflt;
  };
  const enabled = String(env.AI_RATE_LIMIT_ENABLED || 'true').toLowerCase() !== 'false';
  const windowMs = int('AI_RATE_WINDOW_MS', 60000);
  const config = {
    enabled,
    window_ms: windowMs,
    compute_per_user: int('AI_RATE_COMPUTE_PER_USER', 60),
    recompute_per_user: int('AI_RATE_RECOMPUTE_PER_USER', 10),
    outcome_per_user: int('AI_RATE_OUTCOME_PER_USER', 30),
    read_per_user: int('AI_RATE_READ_PER_USER', 120),
    compute_global: int('AI_RATE_COMPUTE_GLOBAL', 600),
  };
  if (!enabled) return { config, compute: passThrough, recompute: passThrough, outcome: passThrough, read: passThrough, computeGlobal: passThrough };
  return {
    config,
    compute: createRateLimiter({ name: 'ai_compute', limit: config.compute_per_user, windowMs, now }),
    recompute: createRateLimiter({ name: 'ai_recompute', limit: config.recompute_per_user, windowMs, now }),
    outcome: createRateLimiter({ name: 'ai_outcome', limit: config.outcome_per_user, windowMs, now }),
    read: createRateLimiter({ name: 'ai_read', limit: config.read_per_user, windowMs, now }),
    computeGlobal: createRateLimiter({ name: 'ai_compute_all_users', limit: config.compute_global, windowMs, now, keyFn: () => 'global' }),
  };
}

module.exports = { createRateLimiter, createAiRateLimits };
