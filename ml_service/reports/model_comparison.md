# Phase 2: provider-level fraud-risk models and claim-level anomaly detection

_Generated 2026-11-11 10:26 UTC from run `run-20261111-102008` (code commit `acd0a23`) by `training/evaluate.py`._

> **Read this first.**
> - **Dataset:** public Kaggle "Healthcare Provider Fraud Detection Analysis" (CC0 as declared by the uploader). See `reports/dataset_exploration_kaggle.md`.
> - **Labels:** `PotentialFraud` is a **provider-level** label of **undocumented provenance**. These results measure how well models reproduce *these labels*. They are **not** verified fraud detection, and **not** claim-level fraud accuracy.
> - **Task:** the supervised models predict **provider-level risk at the end of the observation period**. They are not real-time claim-level fraud detectors.
> - **Isolation Forest** flags statistically **unusual claims**. An anomaly is not a fraud finding.

## 1. Method

- **Split:** 4,598 development providers (5-fold stratified CV) and 812 held-out test providers (15%, stratified, seed 42). Each provider and all of its claims belong to exactly one partition.
- **Leakage control:** fitted statistics (code rarity, typical amount per diagnosis/DRG, network counts) are refitted inside each fold on that fold's training providers only. The final model uses development providers only. Labels are never inputs.
- **Tuning and selection:** small grids per model; best setting and model chosen by **mean CV PR-AUC** on development providers. Decision thresholds maximise F1 on out-of-fold development predictions. **The test set was used only for the final evaluation below.**
- **Class imbalance:** class weights (LR, RF) and `scale_pos_weight` (XGBoost). PR-AUC is the primary metric, since with 9.35% positives a model that flags nobody would still be about 90.6% accurate.

## 2. Cross-validation (development providers)

| Model | Best setting | CV PR-AUC (mean ± sd) | CV ROC-AUC | OOF precision | OOF recall | OOF F1 |
|---|---|---|---|---|---|---|
| LogisticRegression | `{'C': 0.1}` | 0.701 ± 0.030 | 0.946 ± 0.004 | 0.615 | 0.712 | 0.659 |
| RandomForest | `{'max_depth': None, 'min_samples_leaf': 5}` | 0.726 ± 0.018 | 0.946 ± 0.011 | 0.614 | 0.774 | 0.685 |
| XGBoost ✅ | `{'max_depth': 3, 'n_estimators': 300}` | 0.737 ± 0.017 | 0.948 ± 0.007 | 0.630 | 0.767 | 0.692 |
| Volume-only baseline (XGBoost, 5 count features) | same | 0.436 ± 0.023 | 0.821 | 0.372 | 0.472 | 0.416 |
| Chance level (positive rate) | — | 0.094 | 0.500 | | | |

**Selection:** XGBoost has the highest mean CV PR-AUC. Its lead over RandomForest is 0.011, **smaller than or about one fold standard deviation** (about 0.018), so the ranking between them is **not decisive**. ROC-AUC is nearly identical across models (range 0.946–0.948); the differences show up mainly in the precision–recall trade-off.

## 3. Held-out test set (evaluated once)

| Model | PR-AUC (95% CI) | ROC-AUC (95% CI) | Accuracy | Precision | Recall | F1 | Threshold |
|---|---|---|---|---|---|---|---|
| LogisticRegression | 0.745 (0.656–0.835) | 0.964 (0.949–0.977) | 0.935 | 0.621 | 0.776 | 0.690 | 0.797 |
| RandomForest | 0.780 (0.696–0.860) | 0.969 (0.956–0.981) | 0.938 | 0.635 | 0.803 | 0.709 | 0.465 |
| XGBoost ✅ | 0.808 (0.730–0.882) | 0.972 (0.959–0.983) | 0.942 | 0.659 | 0.789 | 0.719 | 0.643 |
| Volume-only baseline | 0.493 (0.397–0.594) | 0.847 (0.804–0.891) | 0.866 | 0.359 | 0.553 | 0.435 | 0.701 |

**Confusion matrices (test providers; positive = labelled PotentialFraud "Yes")**

| Model | True negatives | False positives | False negatives | True positives |
|---|---|---|---|---|
| LogisticRegression | 700 | 36 | 17 | 59 |
| RandomForest | 701 | 35 | 15 | 61 |
| XGBoost | 705 | 31 | 16 | 60 |
| Volume-only baseline | 661 | 75 | 34 | 42 |

The test set has 76 positive providers, so the intervals are wide. The PR-AUC intervals of XGBoost and LogisticRegression, RandomForest **overlap**, so the test set does not separate them reliably. Test PR-AUC for XGBoost (0.808) is higher than its CV mean (0.737). That is within the expected variation for this sample size; nothing was tuned on it.

### 3a. How the decision thresholds were chosen (development data only)

1. **Model and setting:** highest mean 5-fold CV PR-AUC. PR-AUC summarises all thresholds, so it does not pick one.
2. **Threshold:** the selected setting's out-of-fold predictions for all 4,598 development providers (each predicted by the fold model that did not train on it) are pooled. The threshold is the point on the precision–recall curve with the **highest F1**. The test set is not used.
3. The final model, refitted on all development providers, is applied at that threshold to the test set exactly once. The out-of-fold scores come from fold models trained on 80% of the development data, so the threshold may be slightly off for the final model. Reselecting it on the test set would leak, so it is not done.

| Model | Threshold | OOF precision | OOF recall | OOF F1 |
|---|---|---|---|---|
| LogisticRegression | 0.797 | 0.615 | 0.712 | 0.659 |
| RandomForest | 0.465 | 0.614 | 0.774 | 0.685 |
| XGBoost | 0.643 | 0.630 | 0.767 | 0.692 |

**Sensitivity of XGBoost to the threshold (development out-of-fold predictions only):** the trade-off is gradual, so a different operating point (e.g. favouring recall for investigator triage) can be chosen on development data without retraining.

| Threshold | Precision | Recall | F1 | Providers flagged |
|---|---|---|---|---|
| 0.300 | 0.480 | 0.879 | 0.621 | 787 |
| 0.400 | 0.521 | 0.840 | 0.643 | 693 |
| 0.500 | 0.562 | 0.816 | 0.666 | 624 |
| 0.600 | 0.605 | 0.784 | 0.683 | 557 |
| 0.643 (chosen) | 0.629 | 0.765 | 0.691 | 523 |
| 0.700 | 0.637 | 0.719 | 0.675 | 485 |
| 0.800 | 0.684 | 0.626 | 0.654 | 393 |

## 4. Performance across provider-size groups

Size bands are claim-count quartiles of development providers (cut points 10 / 31 / 86 claims). Out-of-fold development predictions (about 4,600 providers) are the main view here. Test bands are small, and some contain only a few positives.

**Out-of-fold (development)**

| Size band | Providers | Positives | Base rate | XGBoost PR-AUC | XGBoost ROC-AUC | XGBoost recall | Volume-only PR-AUC |
|---|---|---|---|---|---|---|---|
| Q1 (smallest) | 1212 | 14 | 0.012 | 0.517 | 0.867 | 0.429 | 0.012 |
| Q2 | 1109 | 46 | 0.042 | 0.553 | 0.928 | 0.543 | 0.074 |
| Q3 | 1133 | 86 | 0.076 | 0.572 | 0.908 | 0.698 | 0.127 |
| Q4 (largest) | 1144 | 284 | 0.248 | 0.809 | 0.918 | 0.842 | 0.556 |

**Held-out test**

| Size band | Providers | Positives | Base rate | XGBoost PR-AUC | XGBoost ROC-AUC | XGBoost recall | Volume-only PR-AUC |
|---|---|---|---|---|---|---|---|
| Q1 (smallest) | 223 | 2 | 0.009 | 0.750 | 0.996 | 0.500 | 0.018 |
| Q2 | 185 | 4 | 0.022 | 0.854 | 0.996 | 0.750 | 0.070 |
| Q3 | 180 | 14 | 0.078 | 0.546 | 0.922 | 0.500 | 0.113 |
| Q4 (largest) | 224 | 56 | 0.250 | 0.876 | 0.950 | 0.875 | 0.602 |

**Interpretation:** positives concentrate in large providers (base rate 24.8% in the largest band vs 1.2% in the smallest). Within each band the volume-only baseline is close to that band's base rate, as expected, because size is roughly fixed inside a band. XGBoost stays well above the base rate in every band. So the model has learned more than provider size, though it is clearly strongest on large providers.

## 5. Feature-group ablation (5-fold CV, development providers only)

Same folds, same per-fold fitted statistics, same model (XGBoost, `{'max_depth': 3, 'n_estimators': 300}`). Test set not used.

| Feature group | Features | Group alone: CV PR-AUC | All features **minus** this group: CV PR-AUC | Drop when removed |
|---|---|---|---|---|
| Volume-only baseline | 5 | 0.436 ± 0.023 | — | — |
| Volume + amounts | 20 | 0.677 ± 0.013 | 0.721 ± 0.012 | +0.015 |
| Patient history | 12 | 0.579 ± 0.029 | 0.732 ± 0.025 | +0.005 |
| Diagnosis & procedure | 13 | 0.705 ± 0.028 | 0.678 ± 0.017 | +0.059 |
| Provider/physician network | 2 | 0.203 ± 0.032 | 0.731 ± 0.013 | +0.005 |
| All approved features | 47 | 0.737 ± 0.017 | — | — |

Group definitions: *Volume + amounts* = Volume and Amounts groups; *Patient history* = Timing and Patient mix; *Diagnosis & procedure* = Coding, Inpatient and the fitted code/amount-reference features; *Network* = the two training-provider-only network features. See `docs/FEATURES.md`.

**Findings:**
- Strongest group on its own: **Diagnosis & procedure** (CV PR-AUC 0.705, vs 0.737 for all features).
- Groups whose removal costs more than one fold standard deviation (0.017), i.e. a meaningful *unique* contribution: **Diagnosis & procedure** (+0.059).
- Groups whose removal costs less than that, i.e. their signal is largely duplicated by other groups: Volume + amounts (+0.015), Patient history (+0.005), Provider/physician network (+0.005). They still carry signal on their own (see the "alone" column).
- Caveat: the Diagnosis & procedure group includes the inpatient features, which are non-zero only for providers with inpatient claims. Inpatient presence is strongly linked to the labels (dataset exploration report, section 10), so part of this group's strength is claim mix, not coding behaviour alone.

## 6. Isolation Forest: claim-level anomaly detection (separate from the supervised model)

Fitted on development providers' claims **without labels**. The threshold is configurable as a percentile of the development score distribution (default: the most unusual 5%). Claims are **never** labelled as fraud. The analysis below only asks whether *providers* with more anomalous claims are more often labelled "Yes", and whether that adds anything beyond size and claim mix.

### 6.1 Design check: a single global forest is a proxy for "inpatient"

A single forest over all claims flags **95.0% inpatient claims** at the 95th percentile (inpatient flag rate 64.5% vs outpatient 0.3%). Inpatient claims are only about 7% of all claims, but they are rare and far more expensive, so they look "unusual" by default. Its provider anomaly rate correlates 0.93 with the provider's inpatient share. The **deployed design therefore uses one forest per claim type**, each with its own threshold. That design was chosen from this label-free check. The global variant is kept only as a diagnostic.

### 6.2 Results (per-claim-type forests)

| Percentile | Claims flagged | Of flagged, inpatient | Test claims flagged: providers labelled Yes / No | Test median provider anomaly rate (Yes / No) | Test anomaly-rate ROC-AUC | PR-AUC | Mann–Whitney p |
|---|---|---|---|---|---|---|---|
| 90 | 10.1% | 7.2% | 10.34% / 10.24% | 0.104 / 0.095 | 0.568 | 0.097 | 0.05 |
| 95 | 5.0% | 7.2% | 5.15% / 5.14% | 0.051 / 0.038 | 0.619 | 0.110 | 0.00047 |
| 99 | 1.0% | 7.2% | 1.03% / 1.05% | 0.008 / 0.000 | 0.664 | 0.140 | 6.4e-08 |

**Accounting for provider volume and claim mix** (simple logistic models fitted on development providers, scored on test providers):

| Percentile | Volume only | + inpatient share | + inpatient share + anomaly rate |
|---|---|---|---|
| 90 | PR-AUC 0.479 / ROC 0.837 | 0.670 / 0.928 | 0.671 / 0.928 |
| 95 | PR-AUC 0.479 / ROC 0.837 | 0.670 / 0.928 | 0.672 / 0.928 |
| 99 | PR-AUC 0.479 / ROC 0.837 | 0.670 / 0.928 | 0.672 / 0.929 |

**Within provider-size bands** (95th percentile, all providers; the forests never saw labels):

| Size band | Providers | Positives | Median anomaly rate Yes / No | ROC-AUC within band |
|---|---|---|---|---|
| Q1 (smallest) | 1435 | 16 | 0.111 / 0.000 | 0.682 |
| Q2 | 1294 | 50 | 0.056 / 0.040 | 0.582 |
| Q3 | 1313 | 100 | 0.054 / 0.048 | 0.530 |
| Q4 (largest) | 1368 | 340 | 0.050 / 0.049 | 0.519 |

**Interpretation:**
- Claims of providers labelled "Yes" are flagged at 5.15%, vs 5.14% for providers labelled "No". That is **essentially the same rate**.
- At provider level the anomaly rate is weakly associated with the labels (test ROC-AUC 0.619). Within size bands the association is concentrated in the smallest providers, where rates rest on very few claims, and is near chance in the larger bands.
- Adding the anomaly rate to volume and inpatient share changes test PR-AUC by +0.002: **negligible**. The anomaly detector does not add provider-level signal for these labels.
- So the Isolation Forest is best treated as an **independent claim-review signal** ("this claim is unusual for its type"), not as a predictor of the provider labels. That fits its intended role in the hybrid design: catching unusual claims the labels and rules may not describe. Its usefulness for real fraud cannot be measured on this dataset, because there are no claim-level labels.

## 7. Selected model and saved artifacts

- **Selected supervised model:** XGBoost (`{'max_depth': 3, 'n_estimators': 300}`). The **model and setting** were chosen by mean CV PR-AUC (threshold-independent). The **decision threshold 0.643** was chosen separately, as the F1-maximising threshold on development out-of-fold predictions (section 3a). Its margin over the runner-up is within noise (section 2), so Random Forest is a statistically comparable alternative.
- **Artifacts** (`ml_service/artifacts/run-20261111-102008/`, git-ignored, reproducible): `reference_stats.joblib` (fitted preprocessing statistics), `provider_<Model>.joblib` for all three models plus `provider_volume_baseline.joblib`, `isolation_forest.joblib` (per claim type), `isolation_forest_global.joblib` (diagnostic), `metadata.json`, `cv_results.json`, `oof_predictions.csv`, `ablation_results.json`, `test_results.json`.
- **Inference** uses `fraud_ml/predict.py` (loads artifacts and never retrains). This evaluation itself ran through that module.

## 8. Limitations

- The labels are provider-level and of undocumented provenance. Every metric here measures agreement with those labels, not verified fraud.
- Only 76 positive test providers: wide confidence intervals, and the model ranking is not decisive.
- Strong link between labels and provider size or inpatient mix. Performance is best on large providers. Size-normalised features and size-band reporting reduce this risk but cannot remove it.
- A single period (2008–09) and a single label snapshot, so no forward-in-time validation. ICD-9 era US Medicare data.
- Age, gender and race are excluded for fairness. Their effect on performance has not been measured (a planned later experiment).
- The Isolation Forest cannot be validated against fraud at claim level (no claim labels exist).
- These models use dataset-specific fields (ICD-9 codes, physicians, deductibles) that the application database does not have, so they cannot directly score the application's claims. Integration needs a separate design.
