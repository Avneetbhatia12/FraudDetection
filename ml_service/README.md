# ML Service: hybrid fraud scoring

A standalone Python service that adds ML-based risk scoring **alongside** the existing
MySQL rule engine (`trg_after_claim_insert`). It never replaces or modifies the rules,
`FRAUD_FLAG`, `CLAIM_RULE` or claim decisions.

```
React ──JWT──► Express /api/ai (only gateway; auth + roles; the only writer of AI records)
                     │  X-ML-API-Key, 3 s timeout, circuit breaker
                     ▼
              ML service (FastAPI, internal only) ──read-only──► MySQL
                     │  returns: transparent indicators + review priority (Track 2), Kaggle research results (Track 1)
                     ▼
              Express appends snapshots to CLAIM_RISK_ASSESSMENT / PROVIDER_RISK_PROFILE (only if changed) and
              investigator decisions to CLAIM_INVESTIGATION_OUTCOME (database/ml_schema.sql). SQL rules unchanged.
```

## Status
| Phase | Scope | State |
|---|---|---|
| 0 | Safety net: DB backup, API regression baseline (`tools/smoke`) | Done |
| 1 | Data foundation: additive schema, synthetic dataset, role middleware | Done (schema revised and applied in Phase 4) |
| 2 | Public dataset; preprocessing and features; LR / RF / XGBoost (provider level); Isolation Forest (claim level); ablation | Done. See [reports/model_comparison.md](reports/model_comparison.md) |
| 3 | SHAP explanations for the provider-level XGBoost model | Done. See [reports/shap_explanations.md](reports/shap_explanations.md) |
| 4 | Three-track integration: research module, app-native indicators, outcome collection | 4.0–4.3 done (migration applied 2026-11-11); **4.4 Express integration implemented, awaiting review**; UI is Phase 5. See [docs/PHASE4_ARCHITECTURE.md](docs/PHASE4_ARCHITECTURE.md) |
| 5 | AI dashboard and investigation UI | |
| 6 | Investigator feedback loop, retraining, deployment | |

The earlier synthetic-data prototype (commit `c2341d9`) is superseded and recoverable from git history.

## Data and labels
- Training and evaluation use the **public Kaggle "Healthcare Provider Fraud Detection Analysis"** dataset.
  See [datasets/README.md](datasets/README.md) and [reports/dataset_exploration_kaggle.md](reports/dataset_exploration_kaggle.md).
- `PotentialFraud` is a **provider-level** label of **undocumented provenance**. It is not a verified fraud finding, and
  it is never copied onto individual claims.
- Synthetic data (`datasets/synthetic_v1`) is for pipeline testing only. It is never used to train or report models.

## Phase 2 results and limitations (summary; full detail in [reports/model_comparison.md](reports/model_comparison.md))
- **Task:** provider-level risk of matching the dataset's `PotentialFraud` label at the end of the observation period.
  This is **not** real-time, claim-level fraud detection.
- **Label limitation:** `PotentialFraud` is a provider-level label whose provenance is **not documented** by the dataset author.
  The metrics measure agreement with these labels, **not** verified fraud. The labels are never copied onto claims.
- **Model selection:** model and setting by mean 5-fold CV PR-AUC on development providers. The decision threshold is the
  F1-maximising threshold on pooled development out-of-fold predictions. The 15% held-out test providers were used only for the final evaluation.
- **Isolation Forest limitations:** it flags claims that are unusual *for their claim type* (one forest each for inpatient and
  outpatient). An anomaly is **not** a fraud finding. There are no claim-level labels, so its fraud-detection ability cannot be
  measured. In this dataset its provider-level association with the labels is weak, and it adds almost nothing beyond provider
  size and inpatient share.
- **Other limitations:** 76 positive test providers (wide CIs); strong link between labels and provider size or inpatient mix;
  one period (2008–09); age, gender and race excluded; dataset fields (ICD-9 codes, physicians) do not exist in the app database.

## Phase 3: SHAP explanations
- Explains the **saved** Phase 2 XGBoost provider-risk model (no retraining) with exact TreeSHAP (`shap.TreeExplainer`).
- **Scale:** log-odds. `log-odds = base value + sum of SHAP values`, and the risk score is `sigmoid(log-odds)`. The base value
  (+0.302, i.e. a score of 0.575) sits far above the ~9% label rate because of class weighting, so the score is a **ranking
  score, not a calibrated probability**.
- **Checked:** the SHAP values add up to the model output (error below 1e-5) and match XGBoost's built-in exact contributions,
  and the explanations are reproducible.
- SHAP values describe **how the model scored a provider**. They are not causal effects and not evidence of fraud. They apply only to
  provider-level scores (never claims, never the Isolation Forest).

## Guarantees (for later integration)
- **Fail-open:** if this service is down, claims are still created and rule-based flags still work exactly as before.
- **New claims only:** no automatic backfill.
- **Data separation:** datasets never enter the application database.

## Environment
- Python **3.12** (`py -3.12`). `requirements.txt` lists the direct dependencies; `requirements.lock.txt` pins exact versions.

## Commands (run from `ml_service/`)
```bash
# environment
py -3.12 -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements.lock.txt
# data (git-ignored; verified against SHA-256 checksums)
.venv/Scripts/python.exe scripts/download_kaggle_provider_fraud.py
.venv/Scripts/python.exe exploration/explore_kaggle_provider_fraud.py   # reports/dataset_exploration_kaggle.md
# training pipeline (about 4 minutes in total)
.venv/Scripts/python.exe training/train.py       # CV tuning, model selection, final fit, Isolation Forests -> artifacts/<run>/
.venv/Scripts/python.exe training/ablation.py    # feature-group ablation (CV, development providers only)
.venv/Scripts/python.exe training/evaluate.py    # one-time held-out test evaluation -> reports/model_comparison.md
# inference with saved artifacts (never retrains)
.venv/Scripts/python.exe scripts/score.py --providers test
.venv/Scripts/python.exe scripts/score.py --claims --percentile 95
# explanations (Phase 3; uses saved artifacts only)
.venv/Scripts/python.exe training/explain_shap.py                            # reports/shap_explanations.md + reports/shap/*.png
.venv/Scripts/python.exe scripts/explain_provider.py --provider PRV51001 --top 10 --plots
# Phase 4: app-native indicators + internal API (read-only DB; needs ML_API_KEY)
.venv/Scripts/python.exe training/experiment_reduced_features.py               # reports/reduced_feature_experiment.md
.venv/Scripts/python.exe scripts/precompute_research.py                        # research SHAP for Kaggle providers (artifacts/)
set ML_API_KEY=<random secret> & set ML_ENV_FILE=..\backend\.env
.venv/Scripts/python.exe -m uvicorn service.main:app --host 127.0.0.1 --port 8000
.venv/Scripts/python.exe scripts/render_indicator_docs.py                      # docs/APP_INDICATORS.md
# docs and tests
.venv/Scripts/python.exe scripts/render_feature_docs.py
.venv/Scripts/python.exe -m unittest discover -s tests -v
```
Runs are deterministic (seed 42): re-running `train.py` reproduces the same CV results and models.

## Layout
| Path | Purpose |
|---|---|
| `fraud_ml/config.py` | Paths, seed, split sizes, excluded inputs |
| `fraud_ml/data.py` | Memory-efficient loading (only the needed columns; categorical and 32-bit dtypes; Race/Gender never loaded) |
| `fraud_ml/preprocessing.py` | Row-by-row cleaning and patient history (earlier dates only). Nothing is learned here. |
| `fraud_ml/splits.py` | Stratified provider-level split: 15% test plus 5-fold CV |
| `fraud_ml/features_reference.py` | Statistics fitted on training providers only (code rarity, typical amounts) |
| `fraud_ml/features_provider.py` | Provider-level features and their documentation spec |
| `fraud_ml/features_claim.py` | Claim-level Isolation Forest features and their spec |
| `fraud_ml/pipeline.py` | Shared preparation step |
| `fraud_ml/cv.py` | Leakage-safe CV folds and final matrices (statistics refitted per fold) |
| `fraud_ml/models.py` | LR / RF / XGBoost definitions, class weighting, tuning grids |
| `fraud_ml/metrics.py` | Metrics, confusion matrices, F1-optimal threshold, bootstrap CIs |
| `fraud_ml/anomaly.py` | Isolation Forest per claim type, configurable thresholds |
| `fraud_ml/artifacts.py`, `fraud_ml/predict.py` | Artifact storage; inference only (loads, never trains) |
| `training/train.py`, `ablation.py`, `evaluate.py`, `report.py` | Training, ablation, test evaluation, report rendering |
| `fraud_ml/explain.py`, `fraud_ml/explain_plots.py` | SHAP provider explanations (global, group, individual, narrative) and plots |
| `training/explain_shap.py`, `training/shap_report.py` | Phase 3 report and figures (`reports/shap/`) |
| `scripts/explain_provider.py` | Explain one provider from the command line |
| `app_risk/` | **Application-native indicators** (Track 2; not ML): read-only loader, claim and provider indicators |
| `service/` | Internal FastAPI service: live indicators and research endpoints, API-key protected |
| `docs/PHASE4_ARCHITECTURE.md`, `docs/APP_INDICATORS.md`, `docs/openapi_ml_service.json` | Phase 4 design, indicator catalogue, API contract |
| `docs/FEATURES.md` | Feature dictionary, generated from the specs |
| `exploration/` | Dataset exploration report generator |
| `scripts/` | Data download, documentation rendering, scoring CLI |
| `training/generate_synthetic.py` | Synthetic generator (pipeline testing only) |
