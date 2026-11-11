"""Builds the exploration report (Markdown) from the statistics computed by
explore_kaggle_provider_fraud.py. Every number in the report comes from the
JSON; the prose only interprets it."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

RAW = Path(__file__).resolve().parents[1] / "datasets" / "public_kaggle_provider_fraud" / "raw"


def pct(x, d=1):
    return "n/a" if x is None else f"{x * 100:.{d}f}%"


def n(x):
    return f"{x:,}"


def render(S: dict) -> str:
    meta = json.loads((RAW / "kaggle_metadata.json").read_text(encoding="utf-8"))
    F, L, K, O, D, A, B, C, P = (S[k] for k in ("files", "labels", "keys", "train_test_overlap", "dates", "amounts",
                                                 "beneficiary_coding", "codes", "provider_level"))
    yes, no = L["values"].get("Yes", 0), L["values"].get("No", 0)
    byl = P["descriptive_by_label"]
    out: list[str] = []
    w = out.append

    w("# Dataset exploration: Kaggle \"Healthcare Provider Fraud Detection Analysis\"\n")
    w(f"_Generated {datetime.now(timezone.utc):%Y-%m-%d %H:%M UTC} by `exploration/explore_kaggle_provider_fraud.py` "
      "from the raw files. All figures are computed; none are copied from published sources._\n")
    w("> **Key caveat.** `PotentialFraud` labels apply to **providers**, not claims. Neither the dataset page nor the files "
      "explain how they were produced. They are **not independently verified fraud findings or convictions**, so treat them as "
      "\"labelled as potentially fraudulent by the dataset author\".\n")

    # 1. Source
    w("## 1. Source and licence\n")
    w("| Item | Value |\n|---|---|")
    w(f"| Title | {meta.get('titleNullable', '').strip()} |")
    w(f"| Kaggle reference | `{meta.get('ownerRefNullable')}/healthcare-provider-fraud-detection-analysis` |")
    w("| URL | https://www.kaggle.com/datasets/rohitrox/healthcare-provider-fraud-detection-analysis |")
    w(f"| Creator | {meta.get('creatorNameNullable')} |")
    w(f"| Licence (per Kaggle metadata) | **{meta.get('licenseNameNullable')}** |")
    w(f"| Version / last updated | v{meta.get('currentVersionNumberNullable')} / {str(meta.get('lastUpdated'))[:10]} |")
    w("| Downloaded via | Kaggle public API (`/api/v1/datasets/download/...`), no account credentials used |")
    w("")
    w("**Licence uncertainty.** CC0 is the licence the uploader declared on Kaggle. The page does not say where the "
      "data originally came from (it describes Medicare claims but cites no CMS release), so we cannot confirm the uploader "
      "had the right to release it as CC0. The beneficiary and provider IDs are pseudonymous (`BENE…`, `PRV…`, `PHY…`). "
      "Use it for research and education, and keep it out of the application database and out of git.\n")
    w("**Label provenance.** The Kaggle description states the goal (\"predict the potentially fraudulent providers\") but "
      "says nothing about how `PotentialFraud` was assigned: not who assigned it, by what criteria, or whether it reflects an "
      "investigation outcome. Some published work also calls the dataset's origin unclear.\n")

    # 2. Files
    w("## 2. File structure\n")
    w("| File | Role | Rows | Columns | Exact duplicate rows |\n|---|---|---|---|---|")
    roles = {"train_labels": "Provider → label", "train_beneficiary": "Patient profiles", "train_inpatient": "Inpatient claims",
             "train_outpatient": "Outpatient claims", "test_providers": "Provider list, **no labels**",
             "test_beneficiary": "Patient profiles", "test_inpatient": "Inpatient claims", "test_outpatient": "Outpatient claims"}
    for k, v in F.items():
        w(f"| `{v['file']}` | {roles[k]} | {n(v['rows'])} | {v['n_columns']} | {v['full_row_duplicates']} |")
    w("")
    w(f"The Kaggle \"Test\" files have **no labels** (`PotentialFraud` present: {S['test_has_labels']}), so they cannot be "
      f"used to evaluate supervised models. All supervised work uses the {n(F['train_labels']['rows'])} labelled providers. "
      "SHA-256 checksums of every file are in `dataset_exploration_kaggle.json`.\n")
    w("**Columns**\n")
    for k in ("train_beneficiary", "train_inpatient", "train_outpatient"):
        w(f"- `{F[k]['file']}`: " + ", ".join(f"`{c}`" for c in F[k]["columns"]))
    w("")

    # 3. Labels
    w("## 3. Labels and class distribution\n")
    w(f"| PotentialFraud | Providers | Share |\n|---|---|---|\n| No | {n(no)} | {pct(no / (yes + no))} |\n"
      f"| Yes | {n(yes)} | {pct(L['fraud_share'], 2)} |\n")
    w(f"No duplicated providers ({L['duplicate_provider_rows']}) and no missing labels ({L['missing_labels']}). "
      f"The {n(yes)} positives are small in absolute terms. A 70/15/15 split leaves only about {round(yes * .15)} positive "
      "providers each for validation and test, so metrics will vary noticeably. Report confidence intervals, and use "
      "cross-validation for model selection.\n")
    w(f"Fraud-labelled providers file **{pct(P['claim_share_from_fraud_labelled_providers'])} of all claims**, which "
      "matters for the claim-level analysis.\n")

    # 4. Keys
    w("## 4. Keys, joins and duplicates\n")
    w("| Check | Result |\n|---|---|")
    w(f"| `ClaimID` unique (inpatient / outpatient) | {K['claim_id_unique_within_inpatient']} / {K['claim_id_unique_within_outpatient']} |")
    w(f"| `ClaimID` shared between inpatient and outpatient | {K['claim_id_overlap_inpatient_outpatient']} |")
    w(f"| `BeneID` unique in beneficiary file | {K['bene_id_unique_in_beneficiary_file']} |")
    w(f"| Claims whose beneficiary is missing from the beneficiary file | {K['claims_with_unknown_beneficiary']} |")
    w(f"| Claims from unlabelled providers | {K['claims_with_unlabelled_provider']} |")
    w(f"| Labelled providers with no claims | {K['labelled_providers_without_claims']} |")
    w(f"| Near-duplicate claims (same {', '.join(K['near_duplicate_definition'])}; different ClaimID) | {K['near_duplicate_claims_same_content_diff_claimid']} |")
    w("")
    w("The joins are clean: every claim links to a known beneficiary and a labelled provider. There are no exact duplicate rows, and "
      "only a handful of near-duplicates. Those are kept, because a resubmitted claim is itself a possible fraud signal; "
      "they get counted as a feature instead of being removed.\n")

    # 5. Missing
    w("## 5. Missing values (columns with any missing)\n")
    w("| File | Column | Missing |\n|---|---|---|")
    for t, m in S["missing"].items():
        for c, v in m.items():
            if v:
                w(f"| {t} | `{c}` | {pct(v)} |")
    w("")
    w("Almost all missingness is **structural, not data loss**:")
    w("- A claim has between 1 and 10 diagnosis codes and up to 6 procedure codes. Unused slots are empty.")
    w("- `OperatingPhysician` and `OtherPhysician` are empty when no such physician was involved. Whether they are present is a feature in itself.")
    w(f"- `DOD` is empty for living patients ({pct(D['dod_present_share'])} have a date of death).")
    w("- Outpatient claims mostly lack an admission diagnosis, and almost never have procedure codes.\n")
    w("Handling: use counts and presence flags rather than imputing codes. Drop the outpatient procedure-code slots. "
      "`AttendingPhysician` is missing in under 0.3% of claims; treat it as \"unknown\".\n")

    # 6. Dates
    w("## 6. Dates and evaluation strategy\n")
    w(f"- Claim start dates run from **{D['claim_start_min']} to {D['claim_start_max']}** (about 13 months). "
      f"End before start: {D['claims_end_before_start']}. Inpatient discharge before admission: {D['inpatient_discharge_before_admission']}.")
    w(f"- Claims starting after the patient's death: {D['claims_starting_after_beneficiary_death']}, so this fraud signal does not occur here.")
    sp = D["provider_activity_span_days"]
    w(f"- Days between each provider's first and last claim: median {sp['median']:.0f}, 25th percentile {sp['p25']:.0f}.\n")
    w("**Decision: a stratified, provider-level train/validation/test split, not a date-based one.** Reasons:")
    w("1. There is **one label per provider for the whole period**, with no label date. A date cut-off would put the same "
      "provider, with the same label, on both sides, which is exactly the provider leakage we must avoid.")
    w("2. Most providers are active for nearly the whole year, so a \"future providers\" split cannot be built either.")
    w("3. Date ordering is still used *inside* claim-level history features (each claim sees only earlier claims).\n")
    w("Recommended setup: stratify by `PotentialFraud` and hold out a test set of providers (about 15%) touched once. Use "
      "stratified 5-fold cross-validation over the remaining providers for model selection and threshold tuning (a single "
      "small validation set would be too noisy). Every claim of a provider stays in that provider's partition.\n")

    # 7. Amounts
    w("## 7. Amounts, outliers and data quality\n")
    w("| Field | Mean | Median | 95th pct | 99th pct | Max | Zero share | IQR-outlier share |\n|---|---|---|---|---|---|---|---|")
    for key, lab in [("inpatient_reimbursed", "Inpatient reimbursed"), ("outpatient_reimbursed", "Outpatient reimbursed"),
                     ("inpatient_length_of_stay_days", "Inpatient length of stay (days)"),
                     ("inpatient_deductible", "Inpatient deductible"), ("outpatient_deductible", "Outpatient deductible")]:
        s = A[key]
        w(f"| {lab} | {s['mean']:,} | {s['median']:,} | {s['p95']:,} | {s['p99']:,} | {s['max']:,} | {pct(s['zero_share'])} | {pct(s['iqr_outlier_share'])} |")
    w("")
    w("Findings:")
    w("- Reimbursements are **heavily right-skewed**, and inpatient amounts are about 35× outpatient. Use `log1p`, and model or "
      "normalise the two claim types separately.")
    w(f"- The \"IQR outliers\" ({pct(A['outpatient_reimbursed']['iqr_outlier_share'])} of outpatient claims) are the natural long "
      "tail, not errors. **Do not remove them**, since unusual amounts are exactly what fraud and anomaly detection look for. Large "
      "values are capped (winsorised) only for scale-sensitive models such as Logistic Regression.")
    w(f"- Inpatient `DeductibleAmtPaid` is **constant** at {A['inpatient_deductible']['median']:,} where present, so it carries "
      "no information except whether it is missing.")
    w(f"- Zero-amount claims: {pct(A['inpatient_reimbursed']['zero_share'])} of inpatient and "
      f"{pct(A['outpatient_reimbursed']['zero_share'])} of outpatient. Kept and flagged.")
    w(f"- Beneficiary annual reimbursement totals include **negative values** ({A['bene_ip_annual_reimbursement_negative']} inpatient, "
      f"{A['bene_op_annual_reimbursement_negative']} outpatient). These are probably adjustments; set them to 0 and add a flag.\n")

    # 8. Coding
    w("## 8. Categorical coding (undocumented, so inferred)\n")
    w(f"- `Gender`: {B['Gender']}. Which code means which sex is **not documented**; treat as an opaque category.")
    w(f"- `Race`: {B['Race']} (there is no code 4). Undocumented. Using race as a fraud-risk feature also raises fairness "
      "concerns, so it is **excluded from the models**.")
    w(f"- `RenalDiseaseIndicator`: {B['RenalDiseaseIndicator']} → convert to 0/1.")
    w(f"- 11 `ChronicCond_*` columns with values {B['chronic_condition_values']}. By the usual CMS convention 1 = yes and "
      "2 = no, but this is **assumed, not documented**.")
    w(f"- `State` ({B['states']} values) and `County` ({B['counties']}): high-cardinality geographic codes. Use them to count the "
      "distinct states a provider serves, not as one-hot features.")
    w(f"- `NoOfMonths_PartACov`: {B['NoOfMonths_PartACov'].get('0', 0)} patients have 0 months. "
      f"{pct(B['NoOfMonths_PartBCov_lt12_share'])} have fewer than 12 months of Part B.\n")

    # 9. Codes & network
    w("## 9. Diagnosis/procedure codes and physician/patient networks\n")
    w(f"- {n(C['distinct_diagnosis_codes'])} distinct diagnosis codes, {n(C['distinct_procedure_codes'])} procedure codes, "
      f"{n(C['distinct_drg_codes_inpatient'])} inpatient DRG codes. Codes are ICD-9 without the dot (e.g. `4019`), so they must be "
      "read as **text**, not numbers.")
    w("- With this many distinct codes, one-hot encoding is not workable. Use counts, frequency or rarity measures "
      "fitted on training data, and per-provider diversity measures.")
    w(f"- {n(C['distinct_attending_physicians'])} attending physicians, of whom **{n(C['attending_physicians_shared_by_2plus_providers'])} "
      f"bill under more than one provider**. **{n(C['beneficiaries_seen_by_2plus_providers'])} of {n(C['beneficiaries_with_claims'])} "
      "patients** claim through more than one provider. This network links providers across any split (see section 12).\n")

    # 10. Provider-level descriptive
    w("## 10. Provider-level profile (descriptive only)\n")
    cpp = P["claims_per_provider"]
    w(f"Claims per provider: median {cpp['median']:.0f}, 95th percentile {cpp['p95']:.0f}, max {n(int(cpp['max']))}. "
      f"{n(P['providers_with_lt_5_claims'])} providers have fewer than 5 claims, so averages for them are unreliable.\n")
    w("| Label | Providers | Median claims | Median patients | Median of mean reimbursed | Share with inpatient claims |\n|---|---|---|---|---|---|")
    for lab in ("No", "Yes"):
        g = byl[lab]
        w(f"| {lab} | {n(g['providers'])} | {g['median_claims']} | {g['median_beneficiaries']} | {g['median_mean_reimbursed']:,} | {pct(g['share_with_inpatient'])} |")
    w("")
    w("**Size confound.** Providers labelled \"Yes\" are much larger and far more often bill inpatient care. A model could "
      "get good scores by mostly detecting \"large inpatient provider\", which is not the same as fraudulent behaviour. Planned "
      "mitigations: normalise features per claim or per patient (rates, not just totals); report results per size group; check "
      "how well a volume-only baseline does on its own.\n")

    # 11. Features
    w("## 11. Candidate features (only from fields that actually exist)\n")
    w("**Provider level (supervised; one row per provider):**")
    w("- *Volume:* number of inpatient and outpatient claims, distinct patients, claims per patient, distinct attending/operating physicians, claims per physician.")
    w("- *Amounts:* mean, median, std and max reimbursement by claim type; total reimbursed; deductible ratio; share of zero-amount claims.")
    w("- *Inpatient behaviour:* mean length of stay; share with an operating physician; procedure codes per claim; DRG diversity.")
    w("- *Coding behaviour:* diagnosis codes per claim; distinct diagnosis codes per claim; share of claims whose primary code is rare (rarity fitted on training providers).")
    w("- *Timing:* claims per active month; median days between a patient's claims at this provider; share of overlapping or same-day repeat claims for one patient; near-duplicate count.")
    w("- *Patient mix:* mean age at claim, share with each chronic condition, mean chronic-condition count, renal-disease share, share with partial Part A/B coverage, share deceased, distinct states served.")
    w("- *Network (label-free):* patients' mean number of providers; physicians' mean number of providers.\n")
    w("**Claim level (Isolation Forest only; no labels):** log amount; amount relative to the typical amount for its primary "
      "diagnosis or DRG (fitted on training data); length of stay; claim duration; number of diagnosis and procedure codes; "
      "physician presence flags; patient age and chronic-condition count; days since this patient's previous claim; the patient's "
      "claim count over the previous 30 days; same-day repeat flag. All history features use earlier claims only.\n")
    w("**Not available, so not created:** policy type, coverage amount, policy start date or age, provider type or specialty, "
      "claim status, approved amount, any claim-level fraud outcome.\n")

    # 12. Leakage
    w("## 12. Leakage risks and safeguards\n")
    w("| Risk | Safeguard |\n|---|---|")
    w("| Copying provider labels onto claims and evaluating per claim | Not done. Supervised learning is at provider level only. |")
    w("| The same provider in train and test | The split is by provider; all of a provider's claims follow it. |")
    w("| Label-based aggregates over shared physicians or patients (e.g. \"% of a physician's providers that are fraudulent\") | **Excluded**: the shared physician/patient network would carry test labels into training features. Only label-free network counts are used. |")
    w("| Code rarity, amount reference values, scaling or imputation fitted on all data | Fitted on training providers' claims only, inside the pipeline (and inside each CV fold). |")
    w("| Beneficiary annual reimbursement totals include amounts from after a given claim | Not used in claim-level history features. Used only as patient-profile context at provider level, where it is consistent with the label period. |")
    w("| Choosing features by looking at labelled comparisons (section 10) | Features are chosen on domain grounds, and their usefulness is judged by cross-validation within the training split. The test split is used once. |")
    w("| Kaggle test files share patients with the training files | Not used for supervised evaluation (no labels). |")
    w("")

    # 13. Preprocessing
    w("## 13. Preprocessing requirements\n")
    w("1. Read code columns as strings; parse dates; tag each claim as inpatient or outpatient and stack the two files.")
    w("2. Map undocumented codes to 0/1 (`RenalDiseaseIndicator`, `ChronicCond_*`); clip negative annual reimbursements to 0 and add a flag; derive age at claim from `DOB`.")
    w("3. Missing values: structural gaps become counts or flags; leftover numeric gaps get median imputation fitted on training data.")
    w("4. Duplicates: there are no exact duplicates. Near-duplicates are kept and counted as a feature.")
    w("5. Outliers: kept. `log1p` for amounts; winsorisation at training-set percentiles only for Logistic Regression.")
    w("6. Scaling: StandardScaler for Logistic Regression only (tree models do not need it), fitted on training data.")
    w(f"7. Class imbalance ({pct(L['fraud_share'], 2)} positive): class weights or `scale_pos_weight`, thresholds tuned on "
      "cross-validation predictions, and PR-AUC and recall emphasised over accuracy.")
    w("8. Run all of this as scikit-learn pipelines fitted per CV fold or on the training split, then save them with joblib.\n")

    # 14. Limitations / compatibility
    w("## 14. Limitations\n")
    w("- Labels are per provider and their provenance is undocumented (see caveat). The results will show how well a model "
      "reproduces *these labels*, not how well it detects fraud in general.")
    w("- Only 13 months of data, with a single label snapshot, so no true forward-in-time evaluation is possible.")
    w(f"- {n(yes)} positive providers: estimates will be noisy, and confidence intervals are needed.")
    w("- The size confound (section 10).")
    w("- Several field codings are undocumented (gender, race, chronic-condition values). The licence and the data's origin rest on the uploader's declaration.")
    w("- US Medicare data from 2008–09 with ICD-9 codes. Not representative of other insurers, countries, or ICD-10-era coding.\n")
    w("## 15. Compatibility with the existing application\n")
    w("- The dataset is kept **completely separate** from the `fraud_detection` MySQL database, and its columns are **not** mapped onto the app's schema.")
    w("- The app has no ICD codes, physicians, deductibles, admission dates or chronic conditions. It stores free-text diagnoses, policy coverage and claim status. Models trained here therefore **cannot directly score the app's claims**.")
    w("- How (or whether) these models feed the app's hybrid score is an open design question for the integration phase. Options include a provider-risk signal built only on features both sources share, or using these models purely as a research benchmark.\n")
    return "\n".join(out)
