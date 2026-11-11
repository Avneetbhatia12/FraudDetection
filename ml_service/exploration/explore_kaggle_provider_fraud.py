"""
Exploration of the Kaggle "Healthcare Provider Fraud Detection Analysis" dataset.

Reads the raw CSVs (never modifies them), computes every statistic from the
actual files and writes:
  reports/dataset_exploration_kaggle.json   (all numbers)
  reports/dataset_exploration_kaggle.md     (human-readable report built from the JSON)

No model training happens here. Labelled comparisons (fraud vs non-fraud
providers) are descriptive only; feature choices for modelling are made on
domain grounds and later validated on the training split only.

Usage (from ml_service/):
    .venv/Scripts/python.exe exploration/explore_kaggle_provider_fraud.py
"""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "datasets" / "public_kaggle_provider_fraud" / "raw"
OUT_JSON = ROOT / "reports" / "dataset_exploration_kaggle.json"
OUT_MD = ROOT / "reports" / "dataset_exploration_kaggle.md"

FILES = {
    "train_labels": "Train-1542865627584.csv",
    "train_beneficiary": "Train_Beneficiarydata-1542865627584.csv",
    "train_inpatient": "Train_Inpatientdata-1542865627584.csv",
    "train_outpatient": "Train_Outpatientdata-1542865627584.csv",
    "test_providers": "Test-1542969243754.csv",
    "test_beneficiary": "Test_Beneficiarydata-1542969243754.csv",
    "test_inpatient": "Test_Inpatientdata-1542969243754.csv",
    "test_outpatient": "Test_Outpatientdata-1542969243754.csv",
}
CODE_COLS = ([f"ClmDiagnosisCode_{i}" for i in range(1, 11)] + [f"ClmProcedureCode_{i}" for i in range(1, 7)]
             + ["ClmAdmitDiagnosisCode", "DiagnosisGroupCode"])
DATE_COLS = ["ClaimStartDt", "ClaimEndDt", "AdmissionDt", "DischargeDt", "DOB", "DOD"]


def load(name: str) -> pd.DataFrame:
    path = RAW / FILES[name]
    header = pd.read_csv(path, nrows=0).columns
    # Codes are identifiers (e.g. "V5866", "0389"): keep as strings so leading zeros/letters survive.
    dtypes = {c: str for c in header if c in CODE_COLS}
    df = pd.read_csv(path, dtype=dtypes, na_values=["NA"], keep_default_na=True)
    for c in DATE_COLS:
        if c in df.columns:
            df[c] = pd.to_datetime(df[c], errors="coerce")
    return df


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def r(x, n=4):
    return None if x is None or (isinstance(x, float) and np.isnan(x)) else round(float(x), n)


def missing(df: pd.DataFrame) -> dict:
    m = df.isna().mean()
    return {c: r(v, 4) for c, v in m.items()}


def numeric_summary(s: pd.Series) -> dict:
    s = s.dropna().astype(float)
    q1, q3 = s.quantile([0.25, 0.75])
    iqr = q3 - q1
    return {
        "count": int(s.size), "mean": r(s.mean(), 2), "std": r(s.std(), 2), "min": r(s.min(), 2),
        "p25": r(q1, 2), "median": r(s.median(), 2), "p75": r(q3, 2), "p95": r(s.quantile(0.95), 2),
        "p99": r(s.quantile(0.99), 2), "max": r(s.max(), 2),
        "zero_share": r((s == 0).mean()), "negative_count": int((s < 0).sum()),
        "iqr_outlier_share": r(((s < q1 - 1.5 * iqr) | (s > q3 + 1.5 * iqr)).mean()),
    }


def main() -> None:
    missing_files = [f for f in FILES.values() if not (RAW / f).exists()]
    if missing_files:
        sys.exit(f"Missing raw files {missing_files}. Run scripts/download_kaggle_provider_fraud.py first.")

    S: dict = {"files": {}}
    for key, fname in FILES.items():
        p = RAW / fname
        S["files"][key] = {"file": fname, "bytes": p.stat().st_size, "sha256": sha256(p)}

    labels, bene, ip, op = (load(k) for k in ("train_labels", "train_beneficiary", "train_inpatient", "train_outpatient"))
    t_prov, t_bene, t_ip, t_op = (load(k) for k in ("test_providers", "test_beneficiary", "test_inpatient", "test_outpatient"))

    for key, df in [("train_labels", labels), ("train_beneficiary", bene), ("train_inpatient", ip), ("train_outpatient", op),
                    ("test_providers", t_prov), ("test_beneficiary", t_bene), ("test_inpatient", t_ip), ("test_outpatient", t_op)]:
        S["files"][key].update({"rows": int(len(df)), "columns": list(df.columns), "n_columns": int(df.shape[1]),
                                "full_row_duplicates": int(df.duplicated().sum())})
    S["test_has_labels"] = "PotentialFraud" in t_prov.columns

    # ── Labels ────────────────────────────────────────────────
    vc = labels["PotentialFraud"].value_counts()
    S["labels"] = {
        "unit": "provider", "values": {k: int(v) for k, v in vc.items()},
        "fraud_share": r(vc.get("Yes", 0) / len(labels)),
        "duplicate_provider_rows": int(labels["Provider"].duplicated().sum()),
        "missing_labels": int(labels["PotentialFraud"].isna().sum()),
    }

    # ── Missing values ───────────────────────────────────────
    S["missing"] = {"beneficiary": missing(bene), "inpatient": missing(ip), "outpatient": missing(op)}

    # ── Keys and duplicates ──────────────────────────────────
    claims = pd.concat([ip.assign(ClaimType="Inpatient"), op.assign(ClaimType="Outpatient")], ignore_index=True, sort=False)
    dup_cols = ["BeneID", "Provider", "ClaimStartDt", "ClaimEndDt", "InscClaimAmtReimbursed", "ClmDiagnosisCode_1", "ClmProcedureCode_1"]
    S["keys"] = {
        "claim_id_unique_within_inpatient": bool(ip["ClaimID"].is_unique),
        "claim_id_unique_within_outpatient": bool(op["ClaimID"].is_unique),
        "claim_id_overlap_inpatient_outpatient": int(len(set(ip["ClaimID"]) & set(op["ClaimID"]))),
        "bene_id_unique_in_beneficiary_file": bool(bene["BeneID"].is_unique),
        "claims_with_unknown_beneficiary": int((~claims["BeneID"].isin(bene["BeneID"])).sum()),
        "claims_with_unlabelled_provider": int((~claims["Provider"].isin(labels["Provider"])).sum()),
        "labelled_providers_without_claims": int((~labels["Provider"].isin(claims["Provider"])).sum()),
        "near_duplicate_claims_same_content_diff_claimid": int(claims.duplicated(subset=dup_cols).sum()),
        "near_duplicate_definition": dup_cols,
    }

    # ── Train vs Kaggle-test overlap (Kaggle test is unlabelled) ─
    tr_claims_bene = set(claims["BeneID"])
    te_claims = pd.concat([t_ip, t_op], ignore_index=True, sort=False)
    S["train_test_overlap"] = {
        "providers": int(len(set(labels["Provider"]) & set(t_prov["Provider"]))),
        "claim_ids": int(len(set(claims["ClaimID"]) & set(te_claims["ClaimID"]))),
        "beneficiaries_in_both_beneficiary_files": int(len(set(bene["BeneID"]) & set(t_bene["BeneID"]))),
        "beneficiaries_with_claims_in_both": int(len(tr_claims_bene & set(te_claims["BeneID"]))),
        "attending_physicians_in_both": int(len(set(claims["AttendingPhysician"].dropna()) & set(te_claims["AttendingPhysician"].dropna()))),
    }

    # ── Dates (temporal-evaluation feasibility) ──────────────
    S["dates"] = {
        "claim_start_min": str(claims["ClaimStartDt"].min().date()), "claim_start_max": str(claims["ClaimStartDt"].max().date()),
        "claim_end_max": str(claims["ClaimEndDt"].max().date()),
        "claims_end_before_start": int((claims["ClaimEndDt"] < claims["ClaimStartDt"]).sum()),
        "inpatient_discharge_before_admission": int((ip["DischargeDt"] < ip["AdmissionDt"]).sum()),
        "claims_per_month": {str(k): int(v) for k, v in claims["ClaimStartDt"].dt.to_period("M").value_counts().sort_index().items()},
        "dob_min": str(bene["DOB"].min().date()), "dob_max": str(bene["DOB"].max().date()),
        "dod_present_share": r(bene["DOD"].notna().mean()),
        "dod_min": str(bene["DOD"].min().date()) if bene["DOD"].notna().any() else None,
        "dod_max": str(bene["DOD"].max().date()) if bene["DOD"].notna().any() else None,
    }
    span = claims.groupby("Provider")["ClaimStartDt"].agg(["min", "max"])
    S["dates"]["provider_activity_span_days"] = numeric_summary((span["max"] - span["min"]).dt.days)
    cb = claims.merge(bene[["BeneID", "DOD"]], on="BeneID", how="left")
    S["dates"]["claims_starting_after_beneficiary_death"] = int((cb["ClaimStartDt"] > cb["DOD"]).sum())

    # ── Amounts / outliers ───────────────────────────────────
    S["amounts"] = {
        "inpatient_reimbursed": numeric_summary(ip["InscClaimAmtReimbursed"]),
        "outpatient_reimbursed": numeric_summary(op["InscClaimAmtReimbursed"]),
        "inpatient_deductible": numeric_summary(ip["DeductibleAmtPaid"]),
        "outpatient_deductible": numeric_summary(op["DeductibleAmtPaid"]),
        "inpatient_length_of_stay_days": numeric_summary((ip["DischargeDt"] - ip["AdmissionDt"]).dt.days),
        "bene_ip_annual_reimbursement": numeric_summary(bene["IPAnnualReimbursementAmt"]),
        "bene_op_annual_reimbursement": numeric_summary(bene["OPAnnualReimbursementAmt"]),
        "bene_ip_annual_reimbursement_negative": int((bene["IPAnnualReimbursementAmt"] < 0).sum()),
        "bene_op_annual_reimbursement_negative": int((bene["OPAnnualReimbursementAmt"] < 0).sum()),
    }

    # ── Categorical encodings in beneficiary file ────────────
    chronic = [c for c in bene.columns if c.startswith("ChronicCond_")]
    S["beneficiary_coding"] = {
        "Gender": {str(k): int(v) for k, v in bene["Gender"].value_counts().items()},
        "Race": {str(k): int(v) for k, v in bene["Race"].value_counts().items()},
        "RenalDiseaseIndicator": {str(k): int(v) for k, v in bene["RenalDiseaseIndicator"].value_counts().items()},
        "chronic_condition_columns": chronic,
        "chronic_condition_values": sorted({str(v) for c in chronic for v in bene[c].dropna().unique()}),
        "states": int(bene["State"].nunique()), "counties": int(bene["County"].nunique()),
        "NoOfMonths_PartACov": {str(k): int(v) for k, v in bene["NoOfMonths_PartACov"].value_counts().sort_index().items()},
        "NoOfMonths_PartBCov_lt12_share": r((bene["NoOfMonths_PartBCov"] < 12).mean()),
    }

    # ── Codes / physicians cardinality ───────────────────────
    diag_cols = [c for c in CODE_COLS if c.startswith("ClmDiagnosisCode")]
    proc_cols = [c for c in CODE_COLS if c.startswith("ClmProcedureCode")]
    S["codes"] = {
        "distinct_diagnosis_codes": int(pd.unique(claims[diag_cols].stack()).size),
        "distinct_procedure_codes": int(pd.unique(claims[proc_cols].stack()).size),
        "distinct_admit_diagnosis_codes": int(claims["ClmAdmitDiagnosisCode"].nunique()),
        "distinct_drg_codes_inpatient": int(ip["DiagnosisGroupCode"].nunique()),
        "diagnosis_codes_per_claim": numeric_summary(claims[diag_cols].notna().sum(axis=1)),
        "procedure_codes_per_claim": numeric_summary(claims[proc_cols].notna().sum(axis=1)),
        "top_diagnosis_code_1": {k: int(v) for k, v in claims["ClmDiagnosisCode_1"].value_counts().head(10).items()},
        "distinct_attending_physicians": int(claims["AttendingPhysician"].nunique()),
        "attending_physicians_shared_by_2plus_providers": int((claims.groupby("AttendingPhysician")["Provider"].nunique() > 1).sum()),
        "beneficiaries_seen_by_2plus_providers": int((claims.groupby("BeneID")["Provider"].nunique() > 1).sum()),
        "beneficiaries_with_claims": int(claims["BeneID"].nunique()),
    }

    # ── Provider-level structure (descriptive) ───────────────
    per_prov = claims.groupby("Provider").agg(
        claims=("ClaimID", "size"), inpatient_claims=("ClaimType", lambda s: int((s == "Inpatient").sum())),
        beneficiaries=("BeneID", "nunique"), mean_reimbursed=("InscClaimAmtReimbursed", "mean"),
        total_reimbursed=("InscClaimAmtReimbursed", "sum"))
    per_prov = per_prov.join(labels.set_index("Provider"))
    S["provider_level"] = {
        "claims_per_provider": numeric_summary(per_prov["claims"]),
        "providers_with_lt_5_claims": int((per_prov["claims"] < 5).sum()),
        "providers_with_inpatient_claims": int((per_prov["inpatient_claims"] > 0).sum()),
        "claim_share_from_fraud_labelled_providers": r(per_prov.loc[per_prov["PotentialFraud"] == "Yes", "claims"].sum() / per_prov["claims"].sum()),
        "descriptive_by_label": {
            lab: {"providers": int(len(g)), "median_claims": r(g["claims"].median(), 1), "median_beneficiaries": r(g["beneficiaries"].median(), 1),
                  "median_mean_reimbursed": r(g["mean_reimbursed"].median(), 1), "share_with_inpatient": r((g["inpatient_claims"] > 0).mean())}
            for lab, g in per_prov.groupby("PotentialFraud")},
    }

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(S, indent=2, default=str), encoding="utf-8")
    print(f"Wrote {OUT_JSON.relative_to(ROOT)}")
    if "--json-only" not in sys.argv:
        from exploration.render_report import render  # noqa: E402  (renderer kept separate from computation)
        OUT_MD.write_text(render(S), encoding="utf-8")
        print(f"Wrote {OUT_MD.relative_to(ROOT)}")


if __name__ == "__main__":
    sys.path.insert(0, str(ROOT))
    main()
