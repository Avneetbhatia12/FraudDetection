# Dataset exploration: Kaggle "Healthcare Provider Fraud Detection Analysis"

_Generated 2026-11-11 09:36 UTC by `exploration/explore_kaggle_provider_fraud.py` from the raw files. All figures are computed; none are copied from published sources._

> **Key caveat.** `PotentialFraud` labels apply to **providers**, not claims. Neither the dataset page nor the files explain how they were produced. They are **not independently verified fraud findings or convictions**, so treat them as "labelled as potentially fraudulent by the dataset author".

## 1. Source and licence

| Item | Value |
|---|---|
| Title | HEALTHCARE PROVIDER FRAUD DETECTION ANALYSIS |
| Kaggle reference | `rohitrox/healthcare-provider-fraud-detection-analysis` |
| URL | https://www.kaggle.com/datasets/rohitrox/healthcare-provider-fraud-detection-analysis |
| Creator | Rohit Anand Gupta |
| Licence (per Kaggle metadata) | **CC0: Public Domain** |
| Version / last updated | v1 / 2019-05-09 |
| Downloaded via | Kaggle public API (`/api/v1/datasets/download/...`), no account credentials used |

**Licence uncertainty.** CC0 is the licence the uploader declared on Kaggle. The page does not say where the data originally came from (it describes Medicare claims but cites no CMS release), so we cannot confirm the uploader had the right to release it as CC0. The beneficiary and provider IDs are pseudonymous (`BENE…`, `PRV…`, `PHY…`). Use it for research and education, and keep it out of the application database and out of git.

**Label provenance.** The Kaggle description states the goal ("predict the potentially fraudulent providers") but says nothing about how `PotentialFraud` was assigned: not who assigned it, by what criteria, or whether it reflects an investigation outcome. Some published work also calls the dataset's origin unclear.

## 2. File structure

| File | Role | Rows | Columns | Exact duplicate rows |
|---|---|---|---|---|
| `Train-1542865627584.csv` | Provider → label | 5,410 | 2 | 0 |
| `Train_Beneficiarydata-1542865627584.csv` | Patient profiles | 138,556 | 25 | 0 |
| `Train_Inpatientdata-1542865627584.csv` | Inpatient claims | 40,474 | 30 | 0 |
| `Train_Outpatientdata-1542865627584.csv` | Outpatient claims | 517,737 | 27 | 0 |
| `Test-1542969243754.csv` | Provider list, **no labels** | 1,353 | 1 | 0 |
| `Test_Beneficiarydata-1542969243754.csv` | Patient profiles | 63,968 | 25 | 0 |
| `Test_Inpatientdata-1542969243754.csv` | Inpatient claims | 9,551 | 30 | 0 |
| `Test_Outpatientdata-1542969243754.csv` | Outpatient claims | 125,841 | 27 | 0 |

The Kaggle "Test" files have **no labels** (`PotentialFraud` present: False), so they cannot be used to evaluate supervised models. All supervised work uses the 5,410 labelled providers. SHA-256 checksums of every file are in `dataset_exploration_kaggle.json`.

**Columns**

- `Train_Beneficiarydata-1542865627584.csv`: `BeneID`, `DOB`, `DOD`, `Gender`, `Race`, `RenalDiseaseIndicator`, `State`, `County`, `NoOfMonths_PartACov`, `NoOfMonths_PartBCov`, `ChronicCond_Alzheimer`, `ChronicCond_Heartfailure`, `ChronicCond_KidneyDisease`, `ChronicCond_Cancer`, `ChronicCond_ObstrPulmonary`, `ChronicCond_Depression`, `ChronicCond_Diabetes`, `ChronicCond_IschemicHeart`, `ChronicCond_Osteoporasis`, `ChronicCond_rheumatoidarthritis`, `ChronicCond_stroke`, `IPAnnualReimbursementAmt`, `IPAnnualDeductibleAmt`, `OPAnnualReimbursementAmt`, `OPAnnualDeductibleAmt`
- `Train_Inpatientdata-1542865627584.csv`: `BeneID`, `ClaimID`, `ClaimStartDt`, `ClaimEndDt`, `Provider`, `InscClaimAmtReimbursed`, `AttendingPhysician`, `OperatingPhysician`, `OtherPhysician`, `AdmissionDt`, `ClmAdmitDiagnosisCode`, `DeductibleAmtPaid`, `DischargeDt`, `DiagnosisGroupCode`, `ClmDiagnosisCode_1`, `ClmDiagnosisCode_2`, `ClmDiagnosisCode_3`, `ClmDiagnosisCode_4`, `ClmDiagnosisCode_5`, `ClmDiagnosisCode_6`, `ClmDiagnosisCode_7`, `ClmDiagnosisCode_8`, `ClmDiagnosisCode_9`, `ClmDiagnosisCode_10`, `ClmProcedureCode_1`, `ClmProcedureCode_2`, `ClmProcedureCode_3`, `ClmProcedureCode_4`, `ClmProcedureCode_5`, `ClmProcedureCode_6`
- `Train_Outpatientdata-1542865627584.csv`: `BeneID`, `ClaimID`, `ClaimStartDt`, `ClaimEndDt`, `Provider`, `InscClaimAmtReimbursed`, `AttendingPhysician`, `OperatingPhysician`, `OtherPhysician`, `ClmDiagnosisCode_1`, `ClmDiagnosisCode_2`, `ClmDiagnosisCode_3`, `ClmDiagnosisCode_4`, `ClmDiagnosisCode_5`, `ClmDiagnosisCode_6`, `ClmDiagnosisCode_7`, `ClmDiagnosisCode_8`, `ClmDiagnosisCode_9`, `ClmDiagnosisCode_10`, `ClmProcedureCode_1`, `ClmProcedureCode_2`, `ClmProcedureCode_3`, `ClmProcedureCode_4`, `ClmProcedureCode_5`, `ClmProcedureCode_6`, `DeductibleAmtPaid`, `ClmAdmitDiagnosisCode`

## 3. Labels and class distribution

| PotentialFraud | Providers | Share |
|---|---|---|
| No | 4,904 | 90.6% |
| Yes | 506 | 9.35% |

No duplicated providers (0) and no missing labels (0). The 506 positives are small in absolute terms. A 70/15/15 split leaves only about 76 positive providers each for validation and test, so metrics will vary noticeably. Report confidence intervals, and use cross-validation for model selection.

Fraud-labelled providers file **38.1% of all claims**, which matters for the claim-level analysis.

## 4. Keys, joins and duplicates

| Check | Result |
|---|---|
| `ClaimID` unique (inpatient / outpatient) | True / True |
| `ClaimID` shared between inpatient and outpatient | 0 |
| `BeneID` unique in beneficiary file | True |
| Claims whose beneficiary is missing from the beneficiary file | 0 |
| Claims from unlabelled providers | 0 |
| Labelled providers with no claims | 0 |
| Near-duplicate claims (same BeneID, Provider, ClaimStartDt, ClaimEndDt, InscClaimAmtReimbursed, ClmDiagnosisCode_1, ClmProcedureCode_1; different ClaimID) | 3 |

The joins are clean: every claim links to a known beneficiary and a labelled provider. There are no exact duplicate rows, and only a handful of near-duplicates. Those are kept, because a resubmitted claim is itself a possible fraud signal; they get counted as a feature instead of being removed.

## 5. Missing values (columns with any missing)

| File | Column | Missing |
|---|---|---|
| beneficiary | `DOD` | 99.0% |
| inpatient | `AttendingPhysician` | 0.3% |
| inpatient | `OperatingPhysician` | 41.1% |
| inpatient | `OtherPhysician` | 88.4% |
| inpatient | `DeductibleAmtPaid` | 2.2% |
| inpatient | `ClmDiagnosisCode_2` | 0.6% |
| inpatient | `ClmDiagnosisCode_3` | 1.7% |
| inpatient | `ClmDiagnosisCode_4` | 3.8% |
| inpatient | `ClmDiagnosisCode_5` | 7.1% |
| inpatient | `ClmDiagnosisCode_6` | 11.9% |
| inpatient | `ClmDiagnosisCode_7` | 17.9% |
| inpatient | `ClmDiagnosisCode_8` | 24.6% |
| inpatient | `ClmDiagnosisCode_9` | 33.4% |
| inpatient | `ClmDiagnosisCode_10` | 90.3% |
| inpatient | `ClmProcedureCode_1` | 42.8% |
| inpatient | `ClmProcedureCode_2` | 86.5% |
| inpatient | `ClmProcedureCode_3` | 97.6% |
| inpatient | `ClmProcedureCode_4` | 99.7% |
| inpatient | `ClmProcedureCode_5` | 100.0% |
| inpatient | `ClmProcedureCode_6` | 100.0% |
| outpatient | `AttendingPhysician` | 0.3% |
| outpatient | `OperatingPhysician` | 82.5% |
| outpatient | `OtherPhysician` | 62.3% |
| outpatient | `ClmDiagnosisCode_1` | 2.0% |
| outpatient | `ClmDiagnosisCode_2` | 37.7% |
| outpatient | `ClmDiagnosisCode_3` | 60.7% |
| outpatient | `ClmDiagnosisCode_4` | 75.7% |
| outpatient | `ClmDiagnosisCode_5` | 85.6% |
| outpatient | `ClmDiagnosisCode_6` | 90.6% |
| outpatient | `ClmDiagnosisCode_7` | 93.6% |
| outpatient | `ClmDiagnosisCode_8` | 95.6% |
| outpatient | `ClmDiagnosisCode_9` | 97.1% |
| outpatient | `ClmDiagnosisCode_10` | 99.8% |
| outpatient | `ClmProcedureCode_1` | 100.0% |
| outpatient | `ClmProcedureCode_2` | 100.0% |
| outpatient | `ClmProcedureCode_3` | 100.0% |
| outpatient | `ClmProcedureCode_4` | 100.0% |
| outpatient | `ClmProcedureCode_5` | 100.0% |
| outpatient | `ClmProcedureCode_6` | 100.0% |
| outpatient | `ClmAdmitDiagnosisCode` | 79.6% |

Almost all missingness is **structural, not data loss**:
- A claim has between 1 and 10 diagnosis codes and up to 6 procedure codes. Unused slots are empty.
- `OperatingPhysician` and `OtherPhysician` are empty when no such physician was involved. Whether they are present is a feature in itself.
- `DOD` is empty for living patients (1.0% have a date of death).
- Outpatient claims mostly lack an admission diagnosis, and almost never have procedure codes.

Handling: use counts and presence flags rather than imputing codes. Drop the outpatient procedure-code slots. `AttendingPhysician` is missing in under 0.3% of claims; treat it as "unknown".

## 6. Dates and evaluation strategy

- Claim start dates run from **2008-11-27 to 2009-12-31** (about 13 months). End before start: 0. Inpatient discharge before admission: 0.
- Claims starting after the patient's death: 0, so this fraud signal does not occur here.
- Days between each provider's first and last claim: median 346, 25th percentile 298.

**Decision: a stratified, provider-level train/validation/test split, not a date-based one.** Reasons:
1. There is **one label per provider for the whole period**, with no label date. A date cut-off would put the same provider, with the same label, on both sides, which is exactly the provider leakage we must avoid.
2. Most providers are active for nearly the whole year, so a "future providers" split cannot be built either.
3. Date ordering is still used *inside* claim-level history features (each claim sees only earlier claims).

Recommended setup: stratify by `PotentialFraud` and hold out a test set of providers (about 15%) touched once. Use stratified 5-fold cross-validation over the remaining providers for model selection and threshold tuning (a single small validation set would be too noisy). Every claim of a provider stays in that provider's partition.

## 7. Amounts, outliers and data quality

| Field | Mean | Median | 95th pct | 99th pct | Max | Zero share | IQR-outlier share |
|---|---|---|---|---|---|---|---|
| Inpatient reimbursed | 10,087.88 | 7,000.0 | 30,000.0 | 57,000.0 | 125,000.0 | 2.7% | 7.3% |
| Outpatient reimbursed | 286.33 | 80.0 | 1,500.0 | 3,300.0 | 102,500.0 | 3.8% | 15.1% |
| Inpatient length of stay (days) | 5.67 | 4.0 | 17.0 | 32.0 | 35.0 | 1.5% | 6.9% |
| Inpatient deductible | 1,068.0 | 1,068.0 | 1,068.0 | 1,068.0 | 1,068.0 | 0.0% | 0.0% |
| Outpatient deductible | 2.78 | 0.0 | 0.0 | 100.0 | 897.0 | 95.9% | 4.1% |

Findings:
- Reimbursements are **heavily right-skewed**, and inpatient amounts are about 35× outpatient. Use `log1p`, and model or normalise the two claim types separately.
- The "IQR outliers" (15.1% of outpatient claims) are the natural long tail, not errors. **Do not remove them**, since unusual amounts are exactly what fraud and anomaly detection look for. Large values are capped (winsorised) only for scale-sensitive models such as Logistic Regression.
- Inpatient `DeductibleAmtPaid` is **constant** at 1,068.0 where present, so it carries no information except whether it is missing.
- Zero-amount claims: 2.7% of inpatient and 3.8% of outpatient. Kept and flagged.
- Beneficiary annual reimbursement totals include **negative values** (15 inpatient, 12 outpatient). These are probably adjustments; set them to 0 and add a flag.

## 8. Categorical coding (undocumented, so inferred)

- `Gender`: {'2': 79106, '1': 59450}. Which code means which sex is **not documented**; treat as an opaque category.
- `Race`: {'1': 117057, '2': 13538, '3': 5059, '5': 2902} (there is no code 4). Undocumented. Using race as a fraud-risk feature also raises fairness concerns, so it is **excluded from the models**.
- `RenalDiseaseIndicator`: {'0': 118978, 'Y': 19578} → convert to 0/1.
- 11 `ChronicCond_*` columns with values ['1', '2']. By the usual CMS convention 1 = yes and 2 = no, but this is **assumed, not documented**.
- `State` (52 values) and `County` (314): high-cardinality geographic codes. Use them to count the distinct states a provider serves, not as one-hot features.
- `NoOfMonths_PartACov`: 1000 patients have 0 months. 1.2% have fewer than 12 months of Part B.

## 9. Diagnosis/procedure codes and physician/patient networks

- 11,014 distinct diagnosis codes, 1,324 procedure codes, 736 inpatient DRG codes. Codes are ICD-9 without the dot (e.g. `4019`), so they must be read as **text**, not numbers.
- With this many distinct codes, one-hot encoding is not workable. Use counts, frequency or rarity measures fitted on training data, and per-provider diversity measures.
- 82,063 attending physicians, of whom **5,219 bill under more than one provider**. **91,653 of 138,556 patients** claim through more than one provider. This network links providers across any split (see section 12).

## 10. Provider-level profile (descriptive only)

Claims per provider: median 31, 95th percentile 422, max 8,240. 739 providers have fewer than 5 claims, so averages for them are unreliable.

| Label | Providers | Median claims | Median patients | Median of mean reimbursed | Share with inpatient claims |
|---|---|---|---|---|---|
| No | 4,904 | 27.0 | 22.0 | 332.2 | 33.7% |
| Yes | 506 | 155.5 | 117.0 | 2,576.5 | 87.0% |

**Size confound.** Providers labelled "Yes" are much larger and far more often bill inpatient care. A model could get good scores by mostly detecting "large inpatient provider", which is not the same as fraudulent behaviour. Planned mitigations: normalise features per claim or per patient (rates, not just totals); report results per size group; check how well a volume-only baseline does on its own.

## 11. Candidate features (only from fields that actually exist)

**Provider level (supervised; one row per provider):**
- *Volume:* number of inpatient and outpatient claims, distinct patients, claims per patient, distinct attending/operating physicians, claims per physician.
- *Amounts:* mean, median, std and max reimbursement by claim type; total reimbursed; deductible ratio; share of zero-amount claims.
- *Inpatient behaviour:* mean length of stay; share with an operating physician; procedure codes per claim; DRG diversity.
- *Coding behaviour:* diagnosis codes per claim; distinct diagnosis codes per claim; share of claims whose primary code is rare (rarity fitted on training providers).
- *Timing:* claims per active month; median days between a patient's claims at this provider; share of overlapping or same-day repeat claims for one patient; near-duplicate count.
- *Patient mix:* mean age at claim, share with each chronic condition, mean chronic-condition count, renal-disease share, share with partial Part A/B coverage, share deceased, distinct states served.
- *Network (label-free):* patients' mean number of providers; physicians' mean number of providers.

**Claim level (Isolation Forest only; no labels):** log amount; amount relative to the typical amount for its primary diagnosis or DRG (fitted on training data); length of stay; claim duration; number of diagnosis and procedure codes; physician presence flags; patient age and chronic-condition count; days since this patient's previous claim; the patient's claim count over the previous 30 days; same-day repeat flag. All history features use earlier claims only.

**Not available, so not created:** policy type, coverage amount, policy start date or age, provider type or specialty, claim status, approved amount, any claim-level fraud outcome.

## 12. Leakage risks and safeguards

| Risk | Safeguard |
|---|---|
| Copying provider labels onto claims and evaluating per claim | Not done. Supervised learning is at provider level only. |
| The same provider in train and test | The split is by provider; all of a provider's claims follow it. |
| Label-based aggregates over shared physicians or patients (e.g. "% of a physician's providers that are fraudulent") | **Excluded**: the shared physician/patient network would carry test labels into training features. Only label-free network counts are used. |
| Code rarity, amount reference values, scaling or imputation fitted on all data | Fitted on training providers' claims only, inside the pipeline (and inside each CV fold). |
| Beneficiary annual reimbursement totals include amounts from after a given claim | Not used in claim-level history features. Used only as patient-profile context at provider level, where it is consistent with the label period. |
| Choosing features by looking at labelled comparisons (section 10) | Features are chosen on domain grounds, and their usefulness is judged by cross-validation within the training split. The test split is used once. |
| Kaggle test files share patients with the training files | Not used for supervised evaluation (no labels). |

## 13. Preprocessing requirements

1. Read code columns as strings; parse dates; tag each claim as inpatient or outpatient and stack the two files.
2. Map undocumented codes to 0/1 (`RenalDiseaseIndicator`, `ChronicCond_*`); clip negative annual reimbursements to 0 and add a flag; derive age at claim from `DOB`.
3. Missing values: structural gaps become counts or flags; leftover numeric gaps get median imputation fitted on training data.
4. Duplicates: there are no exact duplicates. Near-duplicates are kept and counted as a feature.
5. Outliers: kept. `log1p` for amounts; winsorisation at training-set percentiles only for Logistic Regression.
6. Scaling: StandardScaler for Logistic Regression only (tree models do not need it), fitted on training data.
7. Class imbalance (9.35% positive): class weights or `scale_pos_weight`, thresholds tuned on cross-validation predictions, and PR-AUC and recall emphasised over accuracy.
8. Run all of this as scikit-learn pipelines fitted per CV fold or on the training split, then save them with joblib.

## 14. Limitations

- Labels are per provider and their provenance is undocumented (see caveat). The results will show how well a model reproduces *these labels*, not how well it detects fraud in general.
- Only 13 months of data, with a single label snapshot, so no true forward-in-time evaluation is possible.
- 506 positive providers: estimates will be noisy, and confidence intervals are needed.
- The size confound (section 10).
- Several field codings are undocumented (gender, race, chronic-condition values). The licence and the data's origin rest on the uploader's declaration.
- US Medicare data from 2008–09 with ICD-9 codes. Not representative of other insurers, countries, or ICD-10-era coding.

## 15. Compatibility with the existing application

- The dataset is kept **completely separate** from the `fraud_detection` MySQL database, and its columns are **not** mapped onto the app's schema.
- The app has no ICD codes, physicians, deductibles, admission dates or chronic conditions. It stores free-text diagnoses, policy coverage and claim status. Models trained here therefore **cannot directly score the app's claims**.
- How (or whether) these models feed the app's hybrid score is an open design question for the integration phase. Options include a provider-risk signal built only on features both sources share, or using these models purely as a research benchmark.
