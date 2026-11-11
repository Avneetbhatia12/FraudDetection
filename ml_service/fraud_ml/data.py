"""
Memory-efficient loading of the raw Kaggle files.

Only the needed columns are read; IDs and codes become pandas `category`
(far smaller than object strings for ~560k claims), numbers become float32/int8.
Code columns are read as text so ICD-9 codes like "V5866" / "0389" survive.
Race and Gender are deliberately not loaded at all.
"""
from __future__ import annotations

import pandas as pd

from .config import CHRONIC_COLS, DIAG_COLS, PROC_COLS, RAW_DIR, RAW_FILES

_CLAIM_COMMON = ["BeneID", "ClaimID", "ClaimStartDt", "ClaimEndDt", "Provider", "InscClaimAmtReimbursed",
                 "AttendingPhysician", "OperatingPhysician", "OtherPhysician", "DeductibleAmtPaid",
                 "ClmAdmitDiagnosisCode"] + DIAG_COLS + PROC_COLS
_INPATIENT_ONLY = ["AdmissionDt", "DischargeDt", "DiagnosisGroupCode"]
_CAT = ["BeneID", "Provider", "AttendingPhysician", "OperatingPhysician", "OtherPhysician",
        "ClmAdmitDiagnosisCode", "DiagnosisGroupCode"] + DIAG_COLS + PROC_COLS


def _read_claims(file_key: str, extra: list[str]) -> pd.DataFrame:
    cols = _CLAIM_COMMON + extra
    df = pd.read_csv(RAW_DIR / RAW_FILES[file_key], usecols=cols, na_values=["NA"],
                     dtype={c: "string" for c in cols if c in _CAT} | {"ClaimID": "string",
                            "InscClaimAmtReimbursed": "float32", "DeductibleAmtPaid": "float32"},
                     parse_dates=[c for c in ("ClaimStartDt", "ClaimEndDt", "AdmissionDt", "DischargeDt") if c in cols])
    return df


def load_claims() -> pd.DataFrame:
    """Inpatient + outpatient claims stacked, with an `is_inpatient` flag."""
    ip = _read_claims("inpatient", _INPATIENT_ONLY).assign(is_inpatient=1)
    op = _read_claims("outpatient", []).assign(is_inpatient=0)
    claims = pd.concat([ip, op], ignore_index=True, sort=False)
    claims["is_inpatient"] = claims["is_inpatient"].astype("int8")
    for c in _CAT:
        claims[c] = claims[c].astype("category")
    return claims


def load_beneficiaries() -> pd.DataFrame:
    cols = ["BeneID", "DOD", "RenalDiseaseIndicator", "State", "NoOfMonths_PartACov", "NoOfMonths_PartBCov",
            "IPAnnualReimbursementAmt", "OPAnnualReimbursementAmt"] + CHRONIC_COLS
    df = pd.read_csv(RAW_DIR / RAW_FILES["beneficiary"], usecols=cols, na_values=["NA"], parse_dates=["DOD"],
                     dtype={"BeneID": "string", "RenalDiseaseIndicator": "string", "State": "int16",
                            "NoOfMonths_PartACov": "int8", "NoOfMonths_PartBCov": "int8",
                            "IPAnnualReimbursementAmt": "float32", "OPAnnualReimbursementAmt": "float32"}
                     | {c: "int8" for c in CHRONIC_COLS})
    return df


def load_labels() -> pd.DataFrame:
    """Provider-level labels. Used ONLY as the supervised target, never as a feature input."""
    df = pd.read_csv(RAW_DIR / RAW_FILES["labels"], dtype="string")
    df["y"] = (df["PotentialFraud"] == "Yes").astype("int8")
    return df[["Provider", "y"]]
