# Phase 4: Integration architecture (approved three-track design)

Status: **4.0, 4.1 and 4.2 implemented and tested; claim-history correction (indicator set 2.0.0) applied in code.** Not yet done: Express integration (4.4), database migration
(not applied), frontend (Phase 5).

## 1. Decision summary

The trained Kaggle models **cannot** score the application's providers or claims:

- Provider-level XGBoost: only **9 of 47** features are derivable with the same meaning, and they carry **15.6%** of the
  model's SHAP weight. A further 34.5% comes from features with a different meaning in the application; **50%** comes
  from features the application does not store.
- Isolation Forest: only **2 of 17** features are available. `is_inpatient`, which selects the forest, is not stored.
- Phase 4.0 experiment ([reports/reduced_feature_experiment.md](../reports/reduced_feature_experiment.md)): retrained on
  Kaggle with **only the 9 compatible features**, XGBoost reaches CV PR-AUC 0.427 ± 0.020. That is **no better than the
  volume-only baseline** (0.436 ± 0.023) and far below the full model (0.737). The same holds for LR and RF. The model
  was not saved and is not integrated.

Therefore:

| Track | What | Applied to application data? |
|---|---|---|
| 1. Research / benchmark | Kaggle metrics + SHAP served read-only, labelled as public US Medicare data | **Never** (also enforced by a DB CHECK constraint) |
| 2. App-native indicators | Transparent statistics from the application's own tables ([APP_INDICATORS.md](APP_INDICATORS.md)) | Yes; labelled as **not ML predictions** |
| 3. Future supervised ML | Investigator outcomes collected in `CLAIM_INVESTIGATION_OUTCOME` | Training only after review: ≥ 200 final outcomes and ≥ 30 confirmed fraud is a *checkpoint to evaluate* label quality, balance and validation, not permission to train |

## 2. Feature compatibility matrix

✓ derivable with the same meaning · ⚠ only a different quantity can be computed · ✗ not stored.

### Provider-level model (47): 9 ✓ · 8 ⚠ · 30 ✗

| Status | Features |
|---|---|
| ✓ | log_n_claims, log_n_patients, claims_per_patient, active_months, claims_per_active_month, share_same_day_repeat, median_days_between_patient_claims, share_patients_3plus_claims, patient_mean_other_providers |
| ⚠ | log_total_reimbursed, log_amount_per_patient (Kaggle = **paid** amount; the app stores the **claimed** amount, and `APPROVED_AMOUNT` is a post-review decision that would leak the outcome) · share_zero_amount (the form rejects amounts ≤ 0, so it is always 0) · distinct_primary_dx_per_claim, share_rare_primary_dx, mean_log_amount_vs_dx_ref (free-text diagnosis ≠ ICD-9 codes; the reference statistics cannot be transferred) · share_near_duplicate (no end date or code) · log_n_states_served (state embedded in free-text address) |
| ✗ | share_inpatient; log_n_attending, claims_per_attending, attending_mean_other_providers (no physicians); ip_log_amt_{mean,median,max,std}, op_log_amt_{mean,median,max,std} (no inpatient/outpatient type); op_log_deductible_mean; ip_los_mean, ip_los_max (no admission/discharge); ip_share_operating, op_share_operating, share_other_physician; ip_proc_per_claim (no procedure codes); ip_distinct_drg_per_claim, ip_mean_log_amount_vs_drg_ref (no DRG); diag_per_claim (one diagnosis, so always 1); op_share_admit_dx; claim_days_mean (no end date); patient_chronic_mean, patient_share_renal, patient_share_partial_coverage, patient_share_deceased, patient_log_ip_annual_mean, patient_log_op_annual_mean |

### Claim-level Isolation Forest (17): 2 ✓ · 3 ⚠ · 12 ✗
✓ days_since_prev_claim, prior_claims_30d · ⚠ log_amount, log_amount_vs_dx_ref, dx_log_freq · ✗ is_inpatient, claim_days,
los_days, n_diag, n_proc, has_operating, has_other_phys, has_admit_dx, log_deductible, chronic_count, renal, partial_coverage.

Missing features are **never** filled with defaults, and incompatible data is never sent to the trained models.

## 3. Runtime architecture

```
React ──JWT──► Express (only gateway; auth + roles; stores results)
                 │  X-ML-API-Key, 3 s timeout, circuit breaker      (implemented, Phase 4.4)
                 ▼
         FastAPI ml_service (127.0.0.1:8000, internal)
           ├─ Track 2: app_risk indicators ──read-only session──► MySQL (whitelisted columns)
           └─ Track 1: research store (saved Kaggle reports + precomputed SHAP files)
SQL trigger trg_after_claim_insert runs exactly as before; nothing here calls or replaces it.
```

## 4. API contracts

### 4.1 FastAPI (implemented). Machine-readable contract: [openapi_ml_service.json](openapi_ml_service.json)

All `/v1/*` routes require `X-ML-API-Key`. The service refuses to start without a key.

| Method | Path | Response | Errors |
|---|---|---|---|
| GET | `/health` | `{status, service, version}` (no auth, no internals) | — |
| GET | `/v1/status` | indicator-set version, `application_database: reachable/unreachable`, research availability and run ID | 401 |
| GET | `/v1/claims/{claim_id}/indicators` | `ClaimAssessment` (`kind: claim_level_indicators`): rule hits, 8 indicators (each with `comparison_claim_ids`), triggered count, review priority + reasons, `snapshot_claim_count`, `prior_history_claim_count`, `indicators_digest` (SHA-256), `digest_scope`, `snapshot_taken_at` (MySQL UTC clock, provenance only; not the stored `ASSESSED_AT`), disclaimer | 401, 404 unknown claim, 422 invalid ID, 503 DB unavailable (no details leaked) |
| GET | `/v1/providers/{provider_id}/indicators?as_of=YYYY-MM-DD` | `ProviderProfile` (`kind: provider_level_indicators`): 10 indicators with peer references | 401, 404, 422, 503 |
| GET | `/v1/research/models` | `ResearchEnvelope` (`kind: research_benchmark`, `scope.applies_to_live_application_data: false`): CV/test metrics, ablation, compatible-feature experiment | 401, 503 |
| GET | `/v1/research/shap/global` | envelope: base value, checks, global and group importance | 401, 503 |
| GET | `/v1/research/providers/{kaggle_provider_id}/explanation` | envelope: precomputed SHAP explanation for a **Kaggle** provider (`PRV00000`) | 401, 404, **422 for application-style IDs** |
| GET | `/v1/research/figures/{name}` | PNG (whitelist: summary_beeswarm, importance_bar, group_contribution) | 401, 404 |

The indicator endpoints are **GET** (they compute, store nothing and have no side effects). This replaces the POST proposed
during the assessment. Storing results is Express's job.

### 4.2 Express (implemented in 4.4): `backend/routes/ai.js`, `backend/services/mlClient.js`, mounted at `/api/ai`

Every route requires login (existing `middleware/auth.js`: 401 without a token, 403 with an invalid one). The browser only
ever talks to Express; the ML service URL and `X-ML-API-Key` stay on the server.

| Method | Path | Roles | Behaviour |
|---|---|---|---|
| GET | `/api/ai/status` | any | ML enabled/configured, circuit state, ML service reachability and indicator-set version, registry check for `ML_INDICATOR_SET_KEY`; `ready` only if all agree |
| GET | `/api/ai/claims/:id/assessment` | any | call FastAPI; resolve `MODEL_ID` by `MODEL_KEY` (must be registered, active, live-approved, same version); compare `indicators_digest` with `CLAIM_LATEST_VALID_ASSESSMENT`; **append** a snapshot only if it differs (`snapshot: "new"`), else return the stored one (`"unchanged"`). Response = the stored row read back (`assessment_id`, `assessed_at` from MySQL) |
| POST | `/api/ai/claims/:id/assessment` | Admin, Investigator | same, `TRIGGER_SOURCE='manual_recompute'` (still no duplicate if unchanged) |
| GET | `/api/ai/claims/:id/assessments` | any | append-only history incl. failed attempts, newest first |
| GET | `/api/ai/claims/:id/outcomes` | any | outcome history with training eligibility / exclusion reason |
| POST | `/api/ai/claims/:id/outcomes` | **Admin, Investigator** (`requireRole`) | body `{outcome, outcome_basis?, notes?, assessment_id}`. `assessment_id` (the snapshot displayed) is **required** and must be a non-failed snapshot of the same claim; no substitution; timestamps in the body are rejected. The DB trigger is the final safeguard. Returns the stored row with `decided_at` from MySQL. Never changes `CLAIM.STATUS` |
| GET | `/api/ai/providers/:id/profile?as_of=YYYY-MM-DD` | any | call FastAPI with an explicit date (default: today in IST on the MySQL clock, `as_of_source: default_today_ist`); append a `PROVIDER_RISK_PROFILE` only if content differs from the latest stored profile for that date |
| GET | `/api/ai/dashboard` | any | stored results only: priority distribution, review queue (High/Elevated), failed attempts (24 h), latest outcomes, Track 3 checkpoint progress (a review point, not permission to train) |
| GET | `/api/ai/research/models`, `/research/shap/global`, `/research/providers/:PRV00000/explanation`, `/research/figures/:name` | any | proxied Kaggle research results, labelled `research_benchmark`, `applies_to_live_application_data: false`; application provider IDs rejected; figures served as PNG from the FastAPI whitelist |

Failure handling: the ML client uses a 3 s timeout and a circuit breaker (3 consecutive failures → calls skipped for 30 s; then
one half-open trial). Timeouts, network errors, 5xx, a rejected key or a malformed response are recorded as a `failed`
assessment (never the digest baseline) and answered with HTTP 503 `{ai_status: "unavailable", reason, failed_attempt_id,
last_valid_assessment (stale: true)}`. Skipped calls (circuit open, `ML_ENABLED=false`, no key) store nothing. A per-claim MySQL
named lock (`GET_LOCK`) prevents concurrent views from storing the same snapshot twice. Configuration: `backend/.env.example`.

**Provider as-of date policy.** "Today" is the calendar date in IST (UTC+05:30, no daylight saving) on the **MySQL server
clock**, never a host's local date. Express computes it as `DATE(UTC_TIMESTAMP() + INTERVAL 330 MINUTE)` and always sends
`as_of` explicitly (failed rows use the same date). FastAPI's own default (direct calls) derives it from the `UTC_TIMESTAMP()`
read inside its snapshot (`app_risk/dates.py`). Verified identical with Express and FastAPI hosts set to UTC and to IST.

**Rate limits** (`backend/middleware/aiRateLimit.js`, `/api/ai` only; existing routes are not limited). Per authenticated user,
fixed 60 s window, in memory per Express process; over the limit → HTTP 429 with `Retry-After` and no internal details; a
rejected request never reaches FastAPI or the database. Role checks run first, so a 403 does not use quota.

| Bucket | Routes | Default | Variable |
|---|---|---|---|
| compute | GET claim assessment, GET provider profile | 60 / user / min | `AI_RATE_COMPUTE_PER_USER` |
| recompute | POST claim assessment | 10 / user / min | `AI_RATE_RECOMPUTE_PER_USER` |
| outcome | POST outcome | 30 / user / min | `AI_RATE_OUTCOME_PER_USER` |
| read | status, dashboard, histories, research | 120 / user / min | `AI_RATE_READ_PER_USER` |
| compute (all users) | every ML-computing request together (protects FastAPI) | 600 / min | `AI_RATE_COMPUTE_GLOBAL` |

`AI_RATE_WINDOW_MS` changes the window; `AI_RATE_LIMIT_ENABLED=false` disables AI limits. The active values are shown by
`GET /api/ai/status` (`rate_limits`).

Existing routes (`/api/claims`, `/api/fraud-*`, …) are unchanged; `POST /api/claims` is **not** modified (assessment is computed on first view).

Tests: `backend/tests/mlClient.test.js` and `backend/tests/aiRateLimit.test.js` (`npm test`: timeout, breaker, key handling, limits) and
`tools/ai_integration/e2e.cjs` (full Express → FastAPI → MySQL flow; writes, so it refuses to run on `fraud_detection` and
needs a temporary schema restored from a backup with the migration applied).

## 5. Database (`database/ml_schema.sql`, applied to `fraud_detection` on 2026-11-11 after backup and verification)

New objects only: `MODEL_REGISTRY`, `CLAIM_RISK_ASSESSMENT`, `PROVIDER_RISK_PROFILE`, `CLAIM_INVESTIGATION_OUTCOME`; append-only
triggers on the three history tables; clock/version triggers (§5b); the registry seed row `app-indicators-v2` 2.0.0; the views `CLAIM_LATEST_ASSESSMENT` (latest attempt, may be failed), `CLAIM_LATEST_VALID_ASSESSMENT`
(latest non-failed snapshot = digest baseline), `PROVIDER_LATEST_PROFILE`, `CLAIM_LATEST_OUTCOME`, `OUTCOME_TRAINING_SNAPSHOT`
(training rule, §5a). `CLAIM_RISK_ASSESSMENT` records `INDICATOR_SET_VERSION`, `SNAPSHOT_CLAIM_COUNT` and `INDICATORS_DIGEST CHAR(64)`
(replacing the earlier `HISTORY_CUTOFF_CLAIM_ID`); non-failed rows must have all three, with a well-formed digest. No
probability or combined-score column. CHECK constraints block marking a research model as live, block a supervised
application model trained on Kaggle data, require an error message on failed rows, and only accept Admin/Investigator outcomes.
Every table and column is documented inline in the SQL file. Rollback: `database/ml_schema_rollback.sql`.
Validated on a full copy restored from the pre-migration backup (applies three times safely; invalid operations rejected; existing smoke tests pass before, with and after the migration; rollback leaves every pre-existing object identical).

### 5a. Claim-history timelines, snapshots and the training rule (indicator set 2.0.0)

- **Knowledge timeline:** an assessment sees exactly the claims in one consistent read-only snapshot taken at assessment time.
- **Service-date timeline:** prior-history indicators use snapshot claims with `CLAIM_DATE` on or before the assessed claim's date
  (excluding itself); duplicates are searched ±7 calendar days. **`CLAIM_ID` never determines order or history.** Version 1.0.0
  (never deployed) used `CLAIM_ID < claim`; it missed bursts, repeat visits and duplicates entered out of date order.
- **Snapshots:** each assessment records comparison claim IDs per indicator, the snapshot claim count, `ASSESSED_AT` (MySQL clock, §5b), the indicator-set
  version and a SHA-256 digest of its deterministic content. Express appends a new snapshot only when the digest differs from
  `CLAIM_LATEST_VALID_ASSESSMENT` and never updates or deletes snapshots. A back-dated claim entered later therefore produces a new
  snapshot for the affected later-dated claims, while the old one is kept.
- **Training rule (Track 3), strict linking only:** an outcome trains only with its **linked** snapshot (`ASSESSMENT_ID`, the one
  the investigator was shown), and only if it is for the same claim, non-failed, and assessed at or before the decision. Otherwise
  the outcome is **excluded** with a reason. **No other snapshot is ever substituted** (no fallback to an older or newer one).
  Enforced three ways: the insert trigger `trg_cio_valid_snapshot` rejects invalid links; `OUTCOME_TRAINING_SNAPSHOT` returns
  `TRAINING_ASSESSMENT_ID`, `EXCLUSION_REASON` and `IS_TRAINING_ELIGIBLE` (final outcomes with a valid link); and
  `app_risk.snapshots.select_training_snapshot` applies the same rule. Express (4.4) must therefore link the snapshot actually
  displayed when an outcome is recorded. Historical features are **never** recomputed with information entered later.

### 5b. Timestamp policy and version consistency

**One clock: MySQL, in UTC.**
- `ASSESSED_AT`, `COMPUTED_AT` and `DECIDED_AT` are set by `BEFORE INSERT` triggers to `UTC_TIMESTAMP()` (the MySQL server clock,
  independent of each session's `time_zone`). A value sent by a client is **overwritten**, so Express and FastAPI cannot
  introduce a second clock. Express must not send these columns; after inserting it reads the stored row back
  (`SELECT ... WHERE ASSESSMENT_ID = LAST_INSERT_ID()`) and returns **the stored `ASSESSED_AT` / `DECIDED_AT`**.
- FastAPI no longer returns `assessed_at`. It returns `snapshot_taken_at`, MySQL's `UTC_TIMESTAMP()` read inside the snapshot
  transaction (provenance only; not part of the digest, never stored as `ASSESSED_AT`).
- Strict linking compares two values from the same clock: `ASSESSED_AT <= DECIDED_AT` (same second allowed). Because the
  assessment is stored before it is shown, a linked decision is always later on that clock.
- **Conversion and display:** the columns are `DATETIME` holding UTC. The backend pool already uses `timezone: '+00:00'`
  (`backend/config/db.js`), so mysql2 turns them into correct JavaScript `Date` instants and JSON serialises them as ISO 8601
  with `Z`. The frontend formats them for display, e.g. `new Date(v).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })`,
  labelled IST. SQL that compares with "now" must use `UTC_TIMESTAMP()`, never `NOW()`/`CURRENT_TIMESTAMP` (those are IST on
  this server). Existing application tables only have `DATE` columns and are unaffected.
- Caveat: `SET TIMESTAMP` in a session changes `UTC_TIMESTAMP()` for that session (used only by the validation tests); the
  application never issues it.

**Version consistency.** `trg_cra_before_insert` rejects an assessment whose `MODEL_ID` is unknown or not approved for live data
(`APPLIES_TO_LIVE_DATA = 1`; research models can never be), or whose `INDICATOR_SET_VERSION` differs (exact, byte-wise) from the
registry row's `VERSION`. `trg_prp_before_insert` applies the live-model rule to provider profiles. `trg_registry_identity_immutable`
blocks changes to a registry row's key, kind, version, training data, definition, artifact checksum and creation time (only
`IS_ACTIVE`, `APPLIES_TO_LIVE_DATA`, `DESCRIPTION`, `METRICS` may change), so a stored assessment's `MODEL_ID` always means the
same version. A new indicator version = a new registry row.

**Registration before the first assessment.** The migration itself inserts `app-indicators-v2` / `2.0.0` (idempotent), with the
indicator codes and thresholds as `DEFINITION`; `tests/test_app_indicators.py` fails if this seed drifts from `app_risk/config.py`.
Phase 4.4 Express resolves `MODEL_ID` by `MODEL_KEY = indicator_set` from the FastAPI response and stores
`INDICATOR_SET_VERSION = indicator_set_version`; a mismatch is rejected by the database, never silently stored.

**Recommended (not executed):** a dedicated read-only MySQL account for the ML service:
```sql
CREATE USER 'fraud_ml_ro'@'localhost' IDENTIFIED BY '<strong password>';
GRANT SELECT ON fraud_detection.CLAIM TO 'fraud_ml_ro'@'localhost';
GRANT SELECT ON fraud_detection.POLICY TO 'fraud_ml_ro'@'localhost';
GRANT SELECT ON fraud_detection.MEDICAL_PROVIDER TO 'fraud_ml_ro'@'localhost';
GRANT SELECT ON fraud_detection.CLAIM_RULE TO 'fraud_ml_ro'@'localhost';
GRANT SELECT ON fraud_detection.FRAUD_RULE TO 'fraud_ml_ro'@'localhost';
```
Until then, the service puts its session in `READ ONLY` transaction mode (verified by test).

## 6. Fallback
- Claim creation and the SQL rules never depend on Python (verified with the ML service down).
- With `ML_ENABLED=false`, no key, an open circuit, or when FastAPI is down or times out (3 s), the AI routes answer 503
  `ai_status: "unavailable"` with the last stored valid snapshot marked `stale`; no assessment is invented. Only real failed
  calls are stored as `failed` rows. A circuit breaker skips calls for 30 s after 3 consecutive failures.
- The UI (Phase 5) should show "AI assessment unavailable" with a retry option.

## 7. `backend/server.js` change (applied in 4.4)
Two additive lines (router import and `app.use('/api/ai', aiRoutes)`). The separate, uncommitted startup-log edit is preserved
and is a separate hunk; when committing, only the two integration lines are staged (partial patch).

## 8. Limitations

- Most indicators currently report **insufficient history**, because the database holds 38 claims and most providers have 1–2.
  That is the correct, honest output, not a defect.
- Thresholds are configured design choices, not learned (no labels exist). Changes require a new indicator-set version.
- Claim history no longer depends on `CLAIM_ID` order (resolved in indicator set 2.0.0, §5a). Remaining caveat: without an insertion
  timestamp on `CLAIM`, we cannot reconstruct what was known at a past moment. That is why stored snapshots, not recomputation,
  are the record of what an investigator saw.
- `comparison_claim_ids` lists every compared claim. That is small at current volume, but for large histories (e.g. provider-type history)
  it will need summarising (counts plus a sample) to keep snapshots compact.
- The service reloads the (small) application tables on every request. At larger volume, this should move to incremental queries.
- Research outputs describe Kaggle providers only and inherit every Phase 2/3 limitation.
