"""
Label-free cleaning and per-claim derived columns.

Everything here is a deterministic, row-local transformation (no statistics are
learned), so it can be applied to all claims without leakage. Anything that
learns from data (code rarity, reference amounts, scaling, imputation) lives in
fitted transformers that are fitted on training providers only.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from .config import CHRONIC_COLS, DIAG_COLS, PROC_COLS


def clean_beneficiaries(bene: pd.DataFrame) -> pd.DataFrame:
    b = bene.copy()
    b["renal"] = (b["RenalDiseaseIndicator"] == "Y").astype("int8")
    # ChronicCond_* coded 1/2; 1 = condition present (CMS convention; undocumented in this dataset).
    chronic = (b[CHRONIC_COLS] == 1).astype("int8")
    b["chronic_count"] = chronic.sum(axis=1).astype("int8")
    b["partial_coverage"] = ((b["NoOfMonths_PartACov"] < 12) | (b["NoOfMonths_PartBCov"] < 12)).astype("int8")
    b["deceased"] = b["DOD"].notna().astype("int8")
    # A few annual totals are negative (likely adjustments): clip to 0 and keep a flag.
    neg = (b["IPAnnualReimbursementAmt"] < 0) | (b["OPAnnualReimbursementAmt"] < 0)
    b["annual_amount_negative"] = neg.astype("int8")
    b["ip_annual_amt"] = b["IPAnnualReimbursementAmt"].clip(lower=0)
    b["op_annual_amt"] = b["OPAnnualReimbursementAmt"].clip(lower=0)
    return b[["BeneID", "renal", "chronic_count", "partial_coverage", "deceased", "annual_amount_negative",
              "ip_annual_amt", "op_annual_amt", "State"]]


def build_claim_table(claims: pd.DataFrame, bene_clean: pd.DataFrame) -> pd.DataFrame:
    """One row per claim with cleaned, row-local columns used by both feature modules."""
    c = pd.DataFrame({
        "ClaimID": claims["ClaimID"].astype("string"),
        "Provider": claims["Provider"],
        "BeneID": claims["BeneID"],
        "start": claims["ClaimStartDt"],
        "end": claims["ClaimEndDt"],
        "is_inpatient": claims["is_inpatient"],
        "amount": claims["InscClaimAmtReimbursed"].astype("float32"),
        # Missing deductible = none recorded (inpatient is constant 1068 when present; informative only via outpatient)
        "deductible": claims["DeductibleAmtPaid"].fillna(0).astype("float32"),
        "attending": claims["AttendingPhysician"],
        "operating": claims["OperatingPhysician"],
        "primary_dx": claims["ClmDiagnosisCode_1"].astype("string").fillna("NONE").astype("category"),
        "drg": claims["DiagnosisGroupCode"],
    })
    c["claim_days"] = (claims["ClaimEndDt"] - claims["ClaimStartDt"]).dt.days.astype("float32")
    c["los_days"] = (claims["DischargeDt"] - claims["AdmissionDt"]).dt.days.fillna(0).astype("float32")
    c["n_diag"] = claims[DIAG_COLS].notna().sum(axis=1).astype("int8")
    c["n_proc"] = claims[PROC_COLS].notna().sum(axis=1).astype("int8")
    c["has_attending"] = claims["AttendingPhysician"].notna().astype("int8")
    c["has_operating"] = claims["OperatingPhysician"].notna().astype("int8")
    c["has_other_phys"] = claims["OtherPhysician"].notna().astype("int8")
    c["has_admit_dx"] = claims["ClmAdmitDiagnosisCode"].notna().astype("int8")
    c["zero_amount"] = (c["amount"] == 0).astype("int8")
    c = c.merge(bene_clean, on="BeneID", how="left", validate="many_to_one")
    for col in ("Provider", "BeneID"):
        c[col] = c[col].astype("category")
    return c


def add_patient_history(c: pd.DataFrame) -> pd.DataFrame:
    """Per-claim patient history using ONLY claims that started on earlier dates
    (same-day claims are excluded: their submission order is unknown)."""
    c = c.sort_values(["BeneID", "start"], kind="stable").copy()
    d = c["start"].values.astype("datetime64[D]").astype(np.int64)
    bene = c["BeneID"].cat.codes.to_numpy()
    prev_days = np.full(len(c), np.nan, dtype="float32")
    prior_30d = np.zeros(len(c), dtype="int32")
    # Group boundaries over the sorted array
    starts = np.flatnonzero(np.r_[True, bene[1:] != bene[:-1]])
    ends = np.r_[starts[1:], len(c)]
    for s, e in zip(starts, ends):
        dd = d[s:e]
        first_same = np.searchsorted(dd, dd, "left")               # first claim on the same date
        has_prev = first_same > 0
        prev_days[s:e][has_prev] = (dd[has_prev] - dd[first_same[has_prev] - 1]).astype("float32")
        prior_30d[s:e] = first_same - np.searchsorted(dd, dd - 30, "left")  # earlier-date claims within 30 days
    c["days_since_prev_claim"] = prev_days
    c["prior_claims_30d"] = prior_30d
    return c.sort_index()
