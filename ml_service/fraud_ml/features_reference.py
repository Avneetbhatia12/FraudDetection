"""
Reference statistics learned from claims, fitted ONLY on training providers' claims
(re-fitted inside every CV fold). Shared by the provider-level and claim-level features.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from .config import MIN_GROUP_FOR_MEDIAN, RARE_CODE_MIN_COUNT


@dataclass
class ReferenceStats:
    dx_count: dict = field(default_factory=dict)          # primary diagnosis -> count in reference claims
    dx_median: dict = field(default_factory=dict)         # (is_inpatient, primary_dx) -> median amount
    drg_median: dict = field(default_factory=dict)        # DRG -> median inpatient amount
    type_median: dict = field(default_factory=dict)       # is_inpatient -> median amount (fallback)
    n_ref_claims: int = 0
    fitted: bool = False

    def fit(self, ref_claims: pd.DataFrame) -> "ReferenceStats":
        r = ref_claims
        self.n_ref_claims = int(len(r))
        self.dx_count = r["primary_dx"].astype("string").value_counts().to_dict()
        self.type_median = r.groupby("is_inpatient")["amount"].median().to_dict()
        g = r.groupby(["is_inpatient", r["primary_dx"].astype("string")])["amount"].agg(["median", "size"])
        self.dx_median = g.loc[g["size"] >= MIN_GROUP_FOR_MEDIAN, "median"].to_dict()
        ip = r[r["is_inpatient"] == 1]
        gd = ip.groupby(ip["drg"].astype("string"))["amount"].agg(["median", "size"])
        self.drg_median = gd.loc[gd["size"] >= MIN_GROUP_FOR_MEDIAN, "median"].to_dict()
        self.fitted = True
        return self

    def claim_signals(self, c: pd.DataFrame) -> pd.DataFrame:
        """Per-claim signals relative to the reference set."""
        if not self.fitted:
            raise RuntimeError("ReferenceStats.fit() must be called on training claims first")
        dx = c["primary_dx"].astype("string")
        cnt = dx.map(self.dx_count).fillna(0).astype("float32")
        keys = pd.Series(list(zip(c["is_inpatient"].to_numpy(), dx.to_numpy())), index=c.index)
        ref = keys.map(self.dx_median)
        ref = ref.fillna(c["is_inpatient"].map(self.type_median)).astype("float32")
        drg_ref = c["drg"].astype("string").map(self.drg_median)
        drg_ref = drg_ref.fillna(c["is_inpatient"].map(self.type_median)).astype("float32")
        return pd.DataFrame({
            "dx_rare": (cnt < RARE_CODE_MIN_COUNT).astype("int8"),
            "dx_log_freq": np.log1p(cnt).astype("float32"),
            "log_amount_vs_dx_ref": (np.log1p(c["amount"]) - np.log1p(ref)).astype("float32"),
            "log_amount_vs_drg_ref": np.where(c["is_inpatient"] == 1,
                                              np.log1p(c["amount"]) - np.log1p(drg_ref), np.nan).astype("float32"),
        }, index=c.index)
