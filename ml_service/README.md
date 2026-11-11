# ML Service: hybrid fraud scoring

A standalone Python service that adds ML-based risk scoring **alongside** the existing
MySQL rule engine (`trg_after_claim_insert`). It never replaces or modifies the rules,
`FRAUD_FLAG`, `CLAIM_RULE` or claim decisions.

```
React ──► Express (only gateway, JWT + roles) ──► MySQL (rules via trigger, unchanged)
                     │  after the claim commits, non-blocking
                     ▼
              ML service (FastAPI, internal only) ──read-only──► MySQL
                     │  returns: probability, anomaly score, hybrid score, SHAP
                     ▼
              Express stores the result in the CLAIM_RISK_SCORE tables (database/ml_schema.sql)
```

## Status
| Phase | Scope | State |
|---|---|---|
| 0 | Safety net: DB backup, API regression baseline (`tools/smoke`) | Done |
| 1 | Data foundation: additive schema, synthetic dataset, role middleware | Done (schema not yet applied) |
| 2 | Public dataset; preprocessing and features; LR / RF / XGBoost (provider level); Isolation Forest (claim level) | **In progress.** Dataset, preprocessing and features done; training is waiting for approval |
| 3 | SHAP explanations | |
| 4 | FastAPI service, hybrid engine, Express integration behind `ML_ENABLED` | |
| 5 | AI dashboard and investigation UI | |
| 6 | Investigator feedback loop, retraining, deployment | |

The earlier synthetic-data prototype (commit `c2341d9`) is superseded and recoverable from git history.

## Data and labels
- Training and evaluation use the **public Kaggle "Healthcare Provider Fraud Detection Analysis"** dataset.
  See [datasets/README.md](datasets/README.md) and [reports/dataset_exploration_kaggle.md](reports/dataset_exploration_kaggle.md).
- `PotentialFraud` is a **provider-level** label of **undocumented provenance**. It is not a verified fraud finding, and
  it is never copied onto individual claims.
- Synthetic data (`datasets/synthetic_v1`) is for pipeline testing only. It is never used to train or report models.

## Guarantees (for later integration)
- **Fail-open:** if this service is down, claims are still created and rule-based flags still work exactly as before.
- **New claims only:** no automatic backfill.
- **Data separation:** datasets never enter the application database.

## Environment
- Python **3.12** (`py -3.12`). `requirements.txt` lists the direct dependencies; `requirements.lock.txt` pins exact versions.

## Commands (run from `ml_service/`)
```bash
py -3.12 -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements.lock.txt
.venv/Scripts/python.exe scripts/download_kaggle_provider_fraud.py            # fetch and verify raw data (git-ignored)
.venv/Scripts/python.exe exploration/explore_kaggle_provider_fraud.py          # reports/dataset_exploration_kaggle.md
.venv/Scripts/python.exe scripts/render_feature_docs.py                        # docs/FEATURES.md
.venv/Scripts/python.exe -m unittest discover -s tests -v
```

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
| `docs/FEATURES.md` | Feature dictionary, generated from the specs |
| `exploration/` | Dataset exploration report generator |
| `scripts/` | Data download; documentation rendering |
| `training/generate_synthetic.py` | Synthetic generator (pipeline testing only) |
