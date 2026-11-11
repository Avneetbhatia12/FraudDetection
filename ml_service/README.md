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
| 2 | Train LR / RF / XGBoost / Isolation Forest, evaluate, model registry | **Done**. See [reports/phase2_model_comparison.md](reports/phase2_model_comparison.md) |
| 3 | SHAP explanations | Next |
| 4 | FastAPI service, hybrid engine, Express integration behind `ML_ENABLED` | |
| 5 | AI dashboard and investigation UI | |
| 6 | Investigator feedback loop, retraining, deployment | |

## Guarantees
- **Fail-open:** if this service is down, claims are still created and rule-based flags still
  work exactly as before. The score is recorded as `failed` and can be retried.
- **New claims only:** no automatic backfill. Any historical scoring will be a separate
  script with `--dry-run`, and it will only ever add `CLAIM_RISK_SCORE` rows. It never
  touches flags or decisions.
- **Data separation:** training data lives in `datasets/` and is documented there.
  See [datasets/README.md](datasets/README.md).

## Environment
- Python **3.12** (`py -3.12`). Avoid 3.14 for now: SHAP depends on numba, whose wheels
  lag behind new Python releases.
- `artifacts/` holds trained model files (git-ignored). Model metadata goes into `ML_MODEL`.

## Commands (run from `ml_service/`)
```bash
py -3.12 -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements.txt
.venv/Scripts/python.exe training/generate_synthetic.py        # datasets/synthetic_v1 (CSV, git-ignored)
.venv/Scripts/python.exe training/train.py                     # trains all models, writes reports/ and artifacts/
.venv/Scripts/python.exe -m unittest discover -s tests -v
```

## Layout
| Path | Purpose |
|---|---|
| `app/features.py` | The single feature pipeline for training and serving. Only looks at past claims, never reads labels. |
| `app/registry.py` | Versioned model artifacts and the active classifier/anomaly model |
| `training/` | Data generation and training/evaluation |
| `reports/` | Model comparison reports (tracked in git) |
