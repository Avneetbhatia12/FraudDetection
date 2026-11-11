# Phase 4.0 experiment: app-compatible provider features only

_Generated 2026-11-11T10:59:10+00:00 by `training/experiment_reduced_features.py` (Phase 2 run `run-20261111-102008`, same tuned settings)._

> **Kaggle public US Medicare data, 5-fold CV on development providers only.** The held-out test set was not used. No model was saved, and this model is **not** integrated into the application. Scores are uncalibrated; `PotentialFraud` labels are provider-level with undocumented provenance.

## Feature sets

| Set | Features |
|---|---|
| App-compatible (9) | `log_n_claims`, `log_n_patients`, `claims_per_patient`, `active_months`, `claims_per_active_month`, `share_same_day_repeat`, `median_days_between_patient_claims`, `share_patients_3plus_claims`, `patient_mean_other_providers` |
| Volume-only baseline (5) | `log_n_claims`, `log_n_patients`, `log_n_attending`, `active_months`, `claims_per_active_month` |
| All 47 | Phase 2 reference |

## Cross-validation results

Chance level (positive rate): PR-AUC ≈ 0.093. Precision, recall and F1 are at the F1-maximising threshold on out-of-fold predictions.

| Model | Features | CV PR-AUC (mean ± sd) | CV ROC-AUC | OOF precision | OOF recall | OOF F1 |
|---|---|---|---|---|---|---|
| LogisticRegression | app-compatible (9) | 0.388 ± 0.006 | 0.821 | 0.354 | 0.535 | 0.426 |
| LogisticRegression | volume-only (5) | 0.403 ± 0.010 | 0.820 | 0.350 | 0.533 | 0.422 |
| LogisticRegression | all 47 (Phase 2 reference) | 0.701 ± 0.030 | 0.946 | 0.615 | 0.712 | 0.659 |
| RandomForest | app-compatible (9) | 0.410 ± 0.032 | 0.797 | 0.365 | 0.416 | 0.389 |
| RandomForest | volume-only (5) | 0.414 ± 0.031 | 0.801 | 0.411 | 0.393 | 0.402 |
| RandomForest | all 47 (Phase 2 reference) | 0.726 ± 0.018 | 0.946 | 0.614 | 0.774 | 0.685 |
| XGBoost | app-compatible (9) | 0.427 ± 0.020 | 0.817 | 0.418 | 0.444 | 0.431 |
| XGBoost | volume-only (5) | 0.436 ± 0.023 | 0.821 | 0.372 | 0.472 | 0.416 |
| XGBoost | all 47 (Phase 2 reference) | 0.737 ± 0.017 | 0.948 | 0.630 | 0.767 | 0.692 |

## Findings

- XGBoost on the 9 app-compatible features: CV PR-AUC 0.427. That is -0.009 vs the volume-only baseline (**within** one fold standard deviation, so no clear gain) and 0.310 below the full 47-feature model.
- Most of the signal the full model uses (inpatient stays, amounts paid, physicians, chronic conditions) is simply absent from the application's data.

## Why this model is still not applied to the application

- **Different population:** US Medicare providers 2008–09 (median 31 claims each) vs application providers (most have 1–2 claims), so per-provider ratios are unstable or undefined at the application's volume.
- **Different meaning of the same feature name:** e.g. claim counts depend on the observation window and on how claims are recorded; `patient_mean_other_providers` depends on the size of the provider network.
- **No application labels:** there is no way to check whether patterns learned from these labels hold for the application.
- **Undocumented label provenance and uncalibrated scores:** inherited from Phase 2.

Conclusion: this result supports the Phase 4 decision. Live claims are assessed with transparent app-native indicators (Track 2), and any supervised model for the application must be trained on the application's own investigator outcomes (Track 3).
