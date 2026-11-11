"""
Claim-level features for the Isolation Forest anomaly experiment (NO labels used).

Prediction time: when a claim is submitted. A feature may use the claim's own fields, the patient's
clinical profile, claims of the same patient that STARTED ON EARLIER DATES, and reference stats
fitted on training providers' claims. It must not use provider identity or provider aggregates
(those would turn this into a provider-level model), patient annual totals (year-end values that
include later claims), or any label.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from .features_reference import ReferenceStats

NO_PREVIOUS_CLAIM_DAYS = 400  # sentinel used when the patient has no earlier claim

SPEC: dict[str, tuple[str, str, str]] = {
    "log_amount": ("InscClaimAmtReimbursed", "log1p(amount)", "Price level"),
    "is_inpatient": ("file of origin", "1 = inpatient, 0 = outpatient", "Very different amount scales"),
    "claim_days": ("ClaimStartDt, ClaimEndDt", "end - start (days)", "Claim span"),
    "los_days": ("AdmissionDt, DischargeDt", "length of stay; 0 for outpatient", "Inflated stays"),
    "n_diag": ("ClmDiagnosisCode_1..10", "number of diagnosis codes present", "Diagnosis padding"),
    "n_proc": ("ClmProcedureCode_1..6", "number of procedure codes present", "Procedure intensity"),
    "has_operating": ("OperatingPhysician", "1 if present", "Surgical claim"),
    "has_other_phys": ("OtherPhysician", "1 if present", "Extra physicians"),
    "has_admit_dx": ("ClmAdmitDiagnosisCode", "1 if present", "Coding pattern"),
    "log_deductible": ("DeductibleAmtPaid", "log1p(deductible); missing = 0", "Cost-sharing"),
    "log_amount_vs_dx_ref": ("amount, ClmDiagnosisCode_1", "log1p(amount) - log1p(training median for same claim type and code)", "Overbilling vs peers"),
    "dx_log_freq": ("ClmDiagnosisCode_1", "log1p(count of the primary code in training claims)", "Rare coding"),
    "chronic_count": ("ChronicCond_*", "number of chronic conditions", "Clinical context: sicker patients cost more"),
    "renal": ("RenalDiseaseIndicator", "1 if Y", "Clinical context"),
    "partial_coverage": ("NoOfMonths_PartACov/PartBCov", "1 if < 12 months of Part A or B", "Coverage gap"),
    "days_since_prev_claim": ("BeneID, ClaimStartDt", f"days since the patient's previous claim on an earlier date; {NO_PREVIOUS_CLAIM_DAYS} if none", "Rapid repeat visits"),
    "prior_claims_30d": ("BeneID, ClaimStartDt", "patient's claims (any provider) on earlier dates within 30 days", "Claim bursts"),
}
FEATURES = list(SPEC)


def claim_matrix(c_hist: pd.DataFrame, ref: ReferenceStats) -> pd.DataFrame:
    """`c_hist` = claim table with patient history (preprocessing.add_patient_history)."""
    sig = ref.claim_signals(c_hist)
    X = pd.DataFrame({
        "log_amount": np.log1p(c_hist["amount"]),
        "is_inpatient": c_hist["is_inpatient"],
        "claim_days": c_hist["claim_days"],
        "los_days": c_hist["los_days"],
        "n_diag": c_hist["n_diag"],
        "n_proc": c_hist["n_proc"],
        "has_operating": c_hist["has_operating"],
        "has_other_phys": c_hist["has_other_phys"],
        "has_admit_dx": c_hist["has_admit_dx"],
        "log_deductible": np.log1p(c_hist["deductible"]),
        "log_amount_vs_dx_ref": sig["log_amount_vs_dx_ref"],
        "dx_log_freq": sig["dx_log_freq"],
        "chronic_count": c_hist["chronic_count"],
        "renal": c_hist["renal"],
        "partial_coverage": c_hist["partial_coverage"],
        "days_since_prev_claim": c_hist["days_since_prev_claim"].fillna(NO_PREVIOUS_CLAIM_DAYS),
        "prior_claims_30d": c_hist["prior_claims_30d"],
    }, index=c_hist.index)
    return X[FEATURES].astype("float32")
