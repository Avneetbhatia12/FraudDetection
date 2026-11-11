"""
Feature engineering shared by training (CSV) and serving (MySQL rows).

Input frames use the application's column names:
  claims    : CLAIM_ID, CLAIM_DATE, CLAIM_AMOUNT, DIAGNOSIS, POLICY_ID, PROVIDER_ID
  policies  : POLICY_ID, POLICY_TYPE, START_DATE, END_DATE, COVERAGE_AMOUNT, PATIENT_ID
  patients  : PATIENT_ID, GENDER, DOB
  providers : PROVIDER_ID, PROVIDER_TYPE
Extra columns are ignored. Labels (IS_FRAUD, FRAUD_PATTERN) and post-review
fields (STATUS, APPROVED_AMOUNT) are never read.

History features look only at claims dated on/before each claim (the same
window semantics as the MySQL trigger), so there is no look-ahead leakage.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd

POLICY_TYPES = ["Individual", "Family", "Senior", "Group"]
PROVIDER_TYPES = [
    "Hospital", "Clinic", "Laboratory", "Specialist", "Pharmacy", "Dental", "Optometry",
    "Mental Health", "Surgery", "Radiology", "Therapy", "Urgent Care", "Pediatrics",
]

NUMERIC_FEATURES = [
    "log_amount",               # log(1 + claim amount)
    "amount_to_coverage",       # claim / policy coverage
    "amount_vs_diag_median",    # claim / typical amount for this diagnosis
    "diag_typical_log_cost",    # how expensive this diagnosis normally is
    "outside_policy_period",    # 1 if service date outside policy dates
    "days_since_policy_start",
    "days_to_policy_end",
    "policy_claims_14d",
    "policy_claims_30d",        # cf. SQL rule "Frequent Claims"
    "provider_claims_30d",      # cf. SQL rule "Provider Overuse"
    "same_diag_policy_60d",     # cf. SQL rule "Abnormal Diagnosis Repeat"
    "near_duplicate_7d",        # same policy+provider+diagnosis, amount within 1%, within 7 days
    "provider_diag_compat",     # share of this diagnosis normally billed by this provider type
    "provider_prior_claims",
    "provider_hist_overbilling",  # provider's smoothed mean of amount_vs_diag_median on prior claims
    "patient_age",
    "gender_male",
]
CATEGORICAL_FEATURES = [f"policy_type={t}" for t in POLICY_TYPES] + [f"provider_type={t}" for t in PROVIDER_TYPES]
FEATURE_NAMES = NUMERIC_FEATURES + CATEGORICAL_FEATURES

_EPOCH = pd.Timestamp("1970-01-01")
_SMOOTHING = 5.0  # pseudo-claims pulling sparse provider history toward "normal" (ratio 1.0)


def _days(s: pd.Series) -> np.ndarray:
    return ((pd.to_datetime(s) - _EPOCH).dt.days).to_numpy(dtype=np.int64)


def _window_count(df: pd.DataFrame, keys: list[str], days: int) -> np.ndarray:
    """Claims in the same group dated within [d - days, d] (includes the claim itself)."""
    out = np.zeros(len(df), dtype=np.int64)
    d_all = df["_d"].to_numpy()
    for idx in df.groupby(keys, sort=False).indices.values():
        d = d_all[idx]
        order = np.argsort(d, kind="stable")
        ds = d[order]
        out[idx[order]] = np.searchsorted(ds, ds, "right") - np.searchsorted(ds, ds - days, "left")
    return out


def _near_duplicates(df: pd.DataFrame, days: int = 7, tol: float = 0.01) -> np.ndarray:
    """Other claims with same policy/provider/diagnosis, amount within tol, dated within [d - days, d]."""
    out = np.zeros(len(df), dtype=np.int64)
    d_all, a_all = df["_d"].to_numpy(), df["CLAIM_AMOUNT"].to_numpy(dtype=float)
    for idx in df.groupby(["POLICY_ID", "PROVIDER_ID", "DIAGNOSIS"], sort=False).indices.values():
        if len(idx) < 2:
            continue
        d, a = d_all[idx], a_all[idx]
        for j in range(len(idx)):
            m = (d <= d[j]) & (d >= d[j] - days) & (np.abs(a - a[j]) <= tol * a[j])
            out[idx[j]] = int(m.sum()) - 1
    return out


@dataclass
class FeatureBuilder:
    """Fit reference statistics on training claims, then transform any claim set."""
    diag_median: dict[str, float] = field(default_factory=dict)
    global_median: float = 1.0
    compat: dict[tuple[str, str], float] = field(default_factory=dict)
    compat_default: float = 0.0
    fitted: bool = False

    @staticmethod
    def _join(claims, policies, patients, providers) -> pd.DataFrame:
        df = (claims[["CLAIM_ID", "CLAIM_DATE", "CLAIM_AMOUNT", "DIAGNOSIS", "POLICY_ID", "PROVIDER_ID"]]
              .merge(policies[["POLICY_ID", "POLICY_TYPE", "START_DATE", "END_DATE", "COVERAGE_AMOUNT", "PATIENT_ID"]],
                     on="POLICY_ID", how="left")
              .merge(patients[["PATIENT_ID", "GENDER", "DOB"]], on="PATIENT_ID", how="left")
              .merge(providers[["PROVIDER_ID", "PROVIDER_TYPE"]], on="PROVIDER_ID", how="left"))
        df["CLAIM_AMOUNT"] = df["CLAIM_AMOUNT"].astype(float)       # MySQL DECIMAL arrives as str/Decimal
        df["COVERAGE_AMOUNT"] = df["COVERAGE_AMOUNT"].astype(float)
        df["DIAGNOSIS"] = df["DIAGNOSIS"].astype(str).str.strip()
        return df

    def fit(self, claims, policies, patients, providers) -> "FeatureBuilder":
        df = self._join(claims, policies, patients, providers)
        self.diag_median = df.groupby("DIAGNOSIS")["CLAIM_AMOUNT"].median().to_dict()
        self.global_median = float(df["CLAIM_AMOUNT"].median())
        share = df.groupby(["DIAGNOSIS", "PROVIDER_TYPE"]).size() / df.groupby("DIAGNOSIS").size()
        self.compat = {k: float(v) for k, v in share.items()}
        self.compat_default = float(np.median(list(self.compat.values())))  # neutral for unseen diagnoses
        self.fitted = True
        return self

    def transform(self, claims, policies, patients, providers) -> pd.DataFrame:
        """Return features indexed by CLAIM_ID, columns in FEATURE_NAMES order.

        Pass the full claim history (not just the rows to score) so window and
        provider-history features see prior claims.
        """
        if not self.fitted:
            raise RuntimeError("FeatureBuilder.fit() must be called first")
        df = self._join(claims, policies, patients, providers)
        df["_d"] = _days(df["CLAIM_DATE"])
        df = df.sort_values(["_d", "CLAIM_ID"], kind="stable").reset_index(drop=True)

        amt = df["CLAIM_AMOUNT"].to_numpy()
        diag_ref = df["DIAGNOSIS"].map(self.diag_median).fillna(self.global_median).to_numpy()
        start, end = _days(df["START_DATE"]), _days(df["END_DATE"])
        f = pd.DataFrame(index=df.index)

        f["log_amount"] = np.log1p(amt)
        f["amount_to_coverage"] = amt / np.maximum(df["COVERAGE_AMOUNT"].to_numpy(), 1.0)
        f["amount_vs_diag_median"] = amt / np.maximum(diag_ref, 1.0)
        f["diag_typical_log_cost"] = np.log1p(diag_ref)
        f["outside_policy_period"] = ((df["_d"] < start) | (df["_d"] > end)).astype(int).to_numpy()
        f["days_since_policy_start"] = np.clip(df["_d"].to_numpy() - start, -365, 1825)
        f["days_to_policy_end"] = np.clip(end - df["_d"].to_numpy(), -365, 1825)
        f["policy_claims_14d"] = _window_count(df, ["POLICY_ID"], 14)
        f["policy_claims_30d"] = _window_count(df, ["POLICY_ID"], 30)
        f["provider_claims_30d"] = _window_count(df, ["PROVIDER_ID"], 30)
        f["same_diag_policy_60d"] = _window_count(df, ["POLICY_ID", "DIAGNOSIS"], 60)
        f["near_duplicate_7d"] = _near_duplicates(df)
        f["provider_diag_compat"] = [self.compat.get((d, t), self.compat_default if d not in self.diag_median else 0.0)
                                     for d, t in zip(df["DIAGNOSIS"], df["PROVIDER_TYPE"])]

        # Provider history: smoothed mean overbilling ratio over strictly prior claims
        ratio = pd.Series(f["amount_vs_diag_median"].to_numpy(), index=df.index)
        g = ratio.groupby(df["PROVIDER_ID"])
        prior_n = g.cumcount().to_numpy()
        prior_sum = g.cumsum().to_numpy() - ratio.to_numpy()
        f["provider_prior_claims"] = prior_n
        f["provider_hist_overbilling"] = (prior_sum + _SMOOTHING) / (prior_n + _SMOOTHING)

        f["patient_age"] = ((pd.to_datetime(df["CLAIM_DATE"]) - pd.to_datetime(df["DOB"])).dt.days / 365.25).fillna(40).to_numpy()
        f["gender_male"] = (df["GENDER"] == "Male").astype(int).to_numpy()
        for t in POLICY_TYPES:
            f[f"policy_type={t}"] = (df["POLICY_TYPE"] == t).astype(int).to_numpy()
        for t in PROVIDER_TYPES:
            f[f"provider_type={t}"] = (df["PROVIDER_TYPE"] == t).astype(int).to_numpy()

        f.index = df["CLAIM_ID"].to_numpy()
        f.index.name = "CLAIM_ID"
        return f[FEATURE_NAMES].astype(float)


def sql_rules_baseline(features: pd.DataFrame, claim_amount: pd.Series, coverage: pd.Series) -> pd.DataFrame:
    """Re-express the five MySQL trigger rules (seed thresholds) on the same claims,
    for evaluation only — production keeps using the real trigger/CLAIM_RULE."""
    return pd.DataFrame({
        "High Claim Amount": claim_amount > 10_000,
        "Frequent Claims": features["policy_claims_30d"] > 3,
        "Provider Overuse": features["provider_claims_30d"] > 5,
        "Abnormal Diagnosis Repeat": features["same_diag_policy_60d"] > 2,
        "Claim Exceeds Coverage": claim_amount > coverage,
    }, index=features.index)
