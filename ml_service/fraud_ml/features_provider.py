"""
Provider-level features for supervised fraud-risk prediction (one row per provider).

Prediction time: the end of the observation period. A provider is scored from the claims it
filed in that period. Every feature uses only claims, beneficiary profiles and reference statistics
fitted on TRAINING providers. PotentialFraud and any label-derived value are never inputs.

Two parts:
  * provider_static_features(): label-free, computed per provider from its own claims
    (plus label-free network counts). No learned statistics, so it can be computed once.
  * provider_fitted_features(): aggregates of claim signals against ReferenceStats fitted
    on training providers only; recomputed inside every CV fold.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from .features_reference import ReferenceStats

# name -> (group, source columns, calculation, justification, depends_on_volume)
SPEC: dict[str, tuple[str, str, str, str, bool]] = {
    # ── Volume (size-dependent: see the size-confound analysis) ──
    "log_n_claims": ("Volume", "ClaimID", "log1p(number of claims)", "Billing volume; reported separately because of the size confound", True),
    "share_inpatient": ("Volume", "file of origin", "inpatient claims / all claims", "Mix of inpatient vs outpatient care", False),
    "log_n_patients": ("Volume", "BeneID", "log1p(distinct patients)", "Size of the patient base", True),
    "claims_per_patient": ("Volume", "ClaimID, BeneID", "claims / distinct patients", "High repeat billing per patient", False),
    "log_n_attending": ("Volume", "AttendingPhysician", "log1p(distinct attending physicians)", "Size of the physician network", True),
    "claims_per_attending": ("Volume", "ClaimID, AttendingPhysician", "claims / distinct attending physicians", "Workload per physician", False),
    "active_months": ("Volume", "ClaimStartDt", "distinct calendar months with a claim", "Activity span", True),
    "claims_per_active_month": ("Volume", "ClaimID, ClaimStartDt", "claims / active months", "Billing intensity", True),
    # ── Amounts ──
    "ip_log_amt_mean": ("Amounts", "InscClaimAmtReimbursed (inpatient)", "mean log1p(amount); 0 if no inpatient claims", "Inpatient price level", False),
    "ip_log_amt_median": ("Amounts", "InscClaimAmtReimbursed (inpatient)", "median log1p(amount); 0 if none", "Robust inpatient price level", False),
    "ip_log_amt_max": ("Amounts", "InscClaimAmtReimbursed (inpatient)", "max log1p(amount); 0 if none", "Extreme inpatient billing", False),
    "ip_log_amt_std": ("Amounts", "InscClaimAmtReimbursed (inpatient)", "std of log1p(amount); 0 if <2 claims", "Price dispersion", False),
    "op_log_amt_mean": ("Amounts", "InscClaimAmtReimbursed (outpatient)", "mean log1p(amount); 0 if none", "Outpatient price level", False),
    "op_log_amt_median": ("Amounts", "InscClaimAmtReimbursed (outpatient)", "median log1p(amount); 0 if none", "Robust outpatient price level", False),
    "op_log_amt_max": ("Amounts", "InscClaimAmtReimbursed (outpatient)", "max log1p(amount); 0 if none", "Extreme outpatient billing", False),
    "op_log_amt_std": ("Amounts", "InscClaimAmtReimbursed (outpatient)", "std of log1p(amount); 0 if <2 claims", "Price dispersion", False),
    "log_total_reimbursed": ("Amounts", "InscClaimAmtReimbursed", "log1p(sum of amounts)", "Total money at risk", True),
    "log_amount_per_patient": ("Amounts", "InscClaimAmtReimbursed, BeneID", "log1p(sum of amounts / distinct patients)", "Spend per patient (size-normalised)", False),
    "share_zero_amount": ("Amounts", "InscClaimAmtReimbursed", "claims with amount 0 / claims", "Unusual zero-paid claims", False),
    "op_log_deductible_mean": ("Amounts", "DeductibleAmtPaid (outpatient)", "mean log1p(deductible); 0 if none", "Patient cost-sharing pattern (inpatient deductible is a constant, so not used)", False),
    # ── Inpatient behaviour ──
    "ip_los_mean": ("Inpatient", "AdmissionDt, DischargeDt", "mean length of stay (days); 0 if none", "Stay length (inflated stays)", False),
    "ip_los_max": ("Inpatient", "AdmissionDt, DischargeDt", "max length of stay; 0 if none", "Extreme stays", False),
    "ip_share_operating": ("Inpatient", "OperatingPhysician", "inpatient claims with an operating physician / inpatient claims", "Surgical intensity", False),
    "ip_proc_per_claim": ("Inpatient", "ClmProcedureCode_1..6", "mean number of procedure codes on inpatient claims", "Procedure intensity (upcoding signal)", False),
    "ip_distinct_drg_per_claim": ("Inpatient", "DiagnosisGroupCode", "distinct DRGs / inpatient claims", "Case-mix diversity", False),
    # ── Coding behaviour ──
    "diag_per_claim": ("Coding", "ClmDiagnosisCode_1..10", "mean number of diagnosis codes per claim", "Diagnosis padding", False),
    "distinct_primary_dx_per_claim": ("Coding", "ClmDiagnosisCode_1", "distinct primary diagnoses / claims", "Coding diversity", False),
    "op_share_admit_dx": ("Coding", "ClmAdmitDiagnosisCode (outpatient)", "outpatient claims with an admit diagnosis / outpatient claims", "Unusual coding on outpatient claims", False),
    "op_share_operating": ("Coding", "OperatingPhysician (outpatient)", "outpatient claims with an operating physician / outpatient claims", "Surgical billing in outpatient care", False),
    "share_other_physician": ("Coding", "OtherPhysician", "claims with an other physician / claims", "Extra physicians on the claim", False),
    # ── Timing / repetition ──
    "claim_days_mean": ("Timing", "ClaimStartDt, ClaimEndDt", "mean claim duration (days)", "Claim span", False),
    "share_same_day_repeat": ("Timing", "BeneID, ClaimStartDt", "claims where the same patient has another claim at this provider starting the same day / claims", "Split or duplicate billing", False),
    "share_near_duplicate": ("Timing", "BeneID, ClaimStartDt, ClaimEndDt, amount, ClmDiagnosisCode_1", "claims repeating an earlier identical claim / claims", "Duplicate submission", False),
    "median_days_between_patient_claims": ("Timing", "BeneID, ClaimStartDt", "median gap between consecutive claims of the same patient at this provider; 400 if no repeats", "Visit churning", False),
    "share_patients_3plus_claims": ("Timing", "BeneID", "patients with >=3 claims at this provider / patients", "Repeat-visit concentration", False),
    # ── Patient mix (clinical, patient-weighted) ──
    "patient_chronic_mean": ("Patient mix", "ChronicCond_* (11 cols)", "mean number of chronic conditions per distinct patient", "Case severity; separates sicker populations from overbilling", False),
    "patient_share_renal": ("Patient mix", "RenalDiseaseIndicator", "share of distinct patients with renal disease", "Case severity", False),
    "patient_share_partial_coverage": ("Patient mix", "NoOfMonths_PartACov/PartBCov", "share of patients with < 12 months Part A or B", "Coverage gaps", False),
    "patient_share_deceased": ("Patient mix", "DOD", "share of patients with a date of death in the period", "End-of-life care mix", False),
    "patient_log_ip_annual_mean": ("Patient mix", "IPAnnualReimbursementAmt", "mean log1p(annual inpatient total, negatives clipped to 0)", "Patients' overall utilisation (year-end value; available at period-end prediction time)", False),
    "patient_log_op_annual_mean": ("Patient mix", "OPAnnualReimbursementAmt", "mean log1p(annual outpatient total, clipped)", "Patients' overall utilisation", False),
    "log_n_states_served": ("Patient mix", "State (count only)", "log1p(distinct patient states)", "Geographically implausible patient base (state is never a direct input)", True),
    # ── Network (label-free) ──
    "patient_mean_n_providers": ("Network", "BeneID, Provider (all labelled-file claims)", "mean over the provider's patients of how many providers each patient uses", "Doctor-shopping / shared patients (no labels used)", False),
    "attending_mean_n_providers": ("Network", "AttendingPhysician, Provider (all labelled-file claims)", "mean over the provider's attending physicians of how many providers each bills under", "Physicians spread across many providers (no labels used)", False),
    # ── Fitted on training providers only ──
    "share_rare_primary_dx": ("Fitted", "ClmDiagnosisCode_1", "share of claims whose primary code appears < 5 times in training providers' claims", "Unusual coding", False),
    "mean_log_amount_vs_dx_ref": ("Fitted", "amount, ClmDiagnosisCode_1", "mean over paid claims of log1p(amount) - log1p(training median amount for same claim type and primary code)", "Overbilling relative to peers for the same diagnosis", False),
    "ip_mean_log_amount_vs_drg_ref": ("Fitted", "amount, DiagnosisGroupCode", "mean over paid inpatient claims of log1p(amount) - log1p(training median for the same DRG); 0 if none", "Overbilling relative to peers for the same DRG", False),
}

STATIC = [k for k, v in SPEC.items() if v[0] != "Fitted"]
FITTED = [k for k, v in SPEC.items() if v[0] == "Fitted"]
FEATURES = list(SPEC)
VOLUME_FEATURES = [k for k, v in SPEC.items() if v[4]]


def _type_stats(c: pd.DataFrame, flag: int, prefix: str) -> pd.DataFrame:
    sub = c[c["is_inpatient"] == flag]
    la = np.log1p(sub["amount"].astype("float64"))
    g = la.groupby(sub["Provider"], observed=True)
    return pd.DataFrame({f"{prefix}_log_amt_mean": g.mean(), f"{prefix}_log_amt_median": g.median(),
                         f"{prefix}_log_amt_max": g.max(), f"{prefix}_log_amt_std": g.std()})


def provider_static_features(c: pd.DataFrame) -> pd.DataFrame:
    """Label-free provider features. `c` is the claim table from preprocessing.build_claim_table."""
    P = c["Provider"]
    g = c.groupby("Provider", observed=True)
    f = pd.DataFrame(index=g.size().index)
    n = g.size()
    n_pat = g["BeneID"].nunique()
    n_att = g["attending"].nunique()
    months = c["start"].dt.to_period("M")
    active = months.groupby(P, observed=True).nunique()
    n_ip = g["is_inpatient"].sum()

    f["log_n_claims"] = np.log1p(n)
    f["share_inpatient"] = n_ip / n
    f["log_n_patients"] = np.log1p(n_pat)
    f["claims_per_patient"] = n / n_pat
    f["log_n_attending"] = np.log1p(n_att)
    f["claims_per_attending"] = n / n_att.clip(lower=1)
    f["active_months"] = active
    f["claims_per_active_month"] = n / active

    f = f.join(_type_stats(c, 1, "ip")).join(_type_stats(c, 0, "op"))
    f["log_total_reimbursed"] = np.log1p(g["amount"].sum().astype("float64"))
    f["log_amount_per_patient"] = np.log1p(g["amount"].sum().astype("float64") / n_pat)
    f["share_zero_amount"] = g["zero_amount"].mean()
    op = c[c["is_inpatient"] == 0]
    f["op_log_deductible_mean"] = np.log1p(op["deductible"].astype("float64")).groupby(op["Provider"], observed=True).mean()

    ip = c[c["is_inpatient"] == 1]
    gi = ip.groupby("Provider", observed=True)
    f["ip_los_mean"] = gi["los_days"].mean()
    f["ip_los_max"] = gi["los_days"].max()
    f["ip_share_operating"] = gi["has_operating"].mean()
    f["ip_proc_per_claim"] = gi["n_proc"].mean()
    f["ip_distinct_drg_per_claim"] = gi["drg"].nunique() / gi.size()

    f["diag_per_claim"] = g["n_diag"].mean()
    f["distinct_primary_dx_per_claim"] = g["primary_dx"].nunique() / n
    go = op.groupby("Provider", observed=True)
    f["op_share_admit_dx"] = go["has_admit_dx"].mean()
    f["op_share_operating"] = go["has_operating"].mean()
    f["share_other_physician"] = g["has_other_phys"].mean()

    f["claim_days_mean"] = g["claim_days"].mean()
    same_day = c.groupby(["Provider", "BeneID", "start"], observed=True)["ClaimID"].transform("size") > 1
    f["share_same_day_repeat"] = same_day.groupby(P, observed=True).mean()
    dup = c.duplicated(subset=["Provider", "BeneID", "start", "end", "amount", "primary_dx"], keep="first")
    f["share_near_duplicate"] = dup.groupby(P, observed=True).mean()
    s = c[["Provider", "BeneID", "start"]].sort_values(["Provider", "BeneID", "start"], kind="stable")
    d = s["start"].to_numpy().astype("datetime64[D]").astype("int64")
    prov, bene = s["Provider"].cat.codes.to_numpy(), s["BeneID"].cat.codes.to_numpy()
    gap = np.full(len(s), np.nan)
    same_pair = np.r_[False, (prov[1:] == prov[:-1]) & (bene[1:] == bene[:-1])]  # previous row is same provider+patient
    gap[same_pair] = (d[1:] - d[:-1])[same_pair[1:]]
    f["median_days_between_patient_claims"] = pd.Series(gap, index=s.index).groupby(s["Provider"], observed=True).median()
    per_pat = c.groupby(["Provider", "BeneID"], observed=True).size()
    f["share_patients_3plus_claims"] = (per_pat >= 3).groupby(level=0, observed=True).mean()

    pairs = c.drop_duplicates(["Provider", "BeneID"])
    gp = pairs.groupby("Provider", observed=True)
    f["patient_chronic_mean"] = gp["chronic_count"].mean()
    f["patient_share_renal"] = gp["renal"].mean()
    f["patient_share_partial_coverage"] = gp["partial_coverage"].mean()
    f["patient_share_deceased"] = gp["deceased"].mean()
    f["patient_log_ip_annual_mean"] = np.log1p(pairs["ip_annual_amt"].astype("float64")).groupby(pairs["Provider"], observed=True).mean()
    f["patient_log_op_annual_mean"] = np.log1p(pairs["op_annual_amt"].astype("float64")).groupby(pairs["Provider"], observed=True).mean()
    f["log_n_states_served"] = np.log1p(gp["State"].nunique())

    bene_nprov = c.groupby("BeneID", observed=True)["Provider"].nunique()
    f["patient_mean_n_providers"] = pairs["BeneID"].map(bene_nprov).astype("float64").groupby(pairs["Provider"], observed=True).mean()
    att = c.dropna(subset=["attending"]).drop_duplicates(["Provider", "attending"])
    att_nprov = c.groupby("attending", observed=True)["Provider"].nunique()
    f["attending_mean_n_providers"] = att["attending"].map(att_nprov).astype("float64").groupby(att["Provider"], observed=True).mean()

    # Structural absences (no inpatient/outpatient claims, no repeats, <2 claims for std) -> documented defaults
    f["median_days_between_patient_claims"] = f["median_days_between_patient_claims"].fillna(400)
    f = f.fillna(0.0)
    f.index = f.index.astype("string")
    f.index.name = "Provider"
    return f[STATIC].astype("float32")


def provider_fitted_features(c: pd.DataFrame, ref: ReferenceStats) -> pd.DataFrame:
    """Aggregate claim signals relative to reference stats fitted on training providers only."""
    sig = ref.claim_signals(c)
    P = c["Provider"]
    # Price ratios use paid claims only: log1p(0) would add an artificial ~-9 per zero-paid claim
    # (zero-paid claims are captured separately by share_zero_amount).
    paid = c["amount"] > 0
    f = pd.DataFrame({
        "share_rare_primary_dx": sig["dx_rare"].groupby(P, observed=True).mean(),
        "mean_log_amount_vs_dx_ref": sig["log_amount_vs_dx_ref"][paid].groupby(P[paid], observed=True).mean(),
        "ip_mean_log_amount_vs_drg_ref": sig["log_amount_vs_drg_ref"][paid].groupby(P[paid], observed=True).mean(),
    }).fillna(0.0)
    f.index = f.index.astype("string")
    f.index.name = "Provider"
    return f[FITTED].astype("float32")


def provider_matrix(static: pd.DataFrame, c: pd.DataFrame, ref: ReferenceStats, providers) -> pd.DataFrame:
    """Full feature matrix for the given providers, columns in FEATURES order."""
    fitted = provider_fitted_features(c, ref)
    X = static.join(fitted, how="left").loc[list(providers)]
    return X[FEATURES]
