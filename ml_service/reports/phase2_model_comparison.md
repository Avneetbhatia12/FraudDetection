# Phase 2: model comparison

> **Dataset: `synthetic_v1` (SYNTHETIC).** These metrics show the pipeline works.
> They do not estimate real-world accuracy (see `datasets/README.md`, Known limitations).

- Generated: 2026-11-11 09:24 UTC by `training/train.py`
- Time-based split: train on claims before **2025-07-01** (10,465 claims, 7.84% fraud); test on later claims (3,135, 8.33% fraud)
- Model selection: 5-fold stratified CV PR-AUC on the training period only. The holdout was used once, for this report.
- Classifier threshold: the one that maximises F1 on out-of-fold training predictions.
- Isolation Forest: trained and thresholded **without labels** (flags the most unusual 5% of the training period).

## Holdout results

| Model | CV PR-AUC | PR-AUC | ROC-AUC | Precision | Recall | F1 | Flagged | Precision@top5pct | Recall@top5pct |
|---|---|---|---|---|---|---|---|---|---|
| SQL rules (existing trigger) | — | 0.088 | 0.519 | 0.086 | 0.586 | 0.150 | 1774 | 0.076 | 0.046 |
| LogisticRegression | 0.896 ± 0.015 | 0.926 | 0.989 | 0.894 | 0.808 | 0.849 | 236 | 0.968 | 0.582 |
| RandomForest | 0.896 ± 0.022 | 0.947 | 0.993 | 0.847 | 0.935 | 0.889 | 288 | 0.968 | 0.582 |
| XGBoost ✅ | 0.935 ± 0.013 | 0.959 | 0.994 | 0.935 | 0.885 | 0.909 | 247 | 0.981 | 0.590 |
| IsolationForest | — | 0.404 | 0.833 | 0.497 | 0.306 | 0.379 | 161 | 0.503 | 0.303 |

PR-AUC is the main metric because fraud is rare: a classifier that never flags anything would still be ~92% accurate.

### Existing SQL rules, one by one (seed thresholds)

| Rule | Share of claims flagged | Precision |
|---|---|---|
| High Claim Amount | 5.5% | 0.208 |
| Frequent Claims | 3.2% | 0.314 |
| Provider Overuse | 53.5% | 0.067 |
| Abnormal Diagnosis Repeat | 4.9% | 0.000 |
| Claim Exceeds Coverage | 0.1% | 1.000 |

The fixed count thresholds were set for a 35-claim demo database. At realistic volume, the count rules (especially Provider Overuse) flag a large share of legitimate claims. That is why the hybrid engine (Phase 4) treats rule hits as one weighted signal rather than a verdict. The rules still add value: they beat every ML model on `claim_burst` below.

## Recall by fraud pattern (holdout)

| Pattern | SQL rules (existing trigger) | LogisticRegression | RandomForest | XGBoost | IsolationForest |
|---|---|---|---|---|---|
| `claim_burst` | 0.84 | 0.63 | 0.77 | 0.67 | 0.37 |
| `duplicate_claim` | 0.62 | 1.00 | 1.00 | 1.00 | 0.46 |
| `near_threshold` | 0.47 | 1.00 | 1.00 | 1.00 | 0.60 |
| `out_of_policy_period` | 0.75 | 1.00 | 1.00 | 1.00 | 0.00 |
| `provider_mismatch` | 0.44 | 0.56 | 1.00 | 1.00 | 0.12 |
| `provider_ring` | 0.43 | 0.79 | 0.98 | 0.94 | 0.24 |
| `upcoding` | 0.56 | 0.87 | 0.94 | 0.85 | 0.14 |

## Selected models

- **Classifier:** `xgb-20261111-092359` (XGBoost), the highest CV PR-AUC
- **Anomaly detector:** `iforest-20261111-092359` (IsolationForest)
- Artifacts: `ml_service/artifacts/` (git-ignored, reproducible by re-running this script)

## Top features: XGBoost (built-in importance; per-claim SHAP comes in Phase 3)

| Feature | Importance |
|---|---|
| `near_duplicate_7d` | 0.2134 |
| `amount_vs_diag_median` | 0.1963 |
| `outside_policy_period` | 0.0928 |
| `provider_diag_compat` | 0.0647 |
| `policy_claims_14d` | 0.0590 |
| `same_diag_policy_60d` | 0.0437 |
| `provider_type=Optometry` | 0.0278 |
| `log_amount` | 0.0260 |
| `days_since_policy_start` | 0.0232 |
| `provider_hist_overbilling` | 0.0213 |
