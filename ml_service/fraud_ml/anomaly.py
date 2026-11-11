"""
Claim-level anomaly detection with Isolation Forest. Separate from the supervised model.

* Fitted on development providers' claims only, WITHOUT labels.
* One Isolation Forest PER CLAIM TYPE (inpatient / outpatient), each with its own score
  distribution and threshold. A single global forest was found to flag inpatient claims almost
  by default (they are rare and ~35x more expensive), which made "anomaly" a proxy for
  "inpatient". The global variant is kept only as a documented diagnostic (mode="global").
* anomaly_score = -score_samples (higher = more unusual WITHIN its claim type).
* The threshold is configurable as a percentile of the development score distribution of the
  same claim type (default: the most unusual 5%), or as an absolute score.
* An "anomaly" is a statistically unusual claim. It is NOT a fraud finding, and these outputs
  must never be read as claim-level fraud accuracy.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest

from .config import SEED
from .features_claim import FEATURES, claim_matrix
from .features_reference import ReferenceStats

DEFAULT_PERCENTILE = 95.0
_QUANTILE_GRID = np.round(np.arange(0, 100.01, 0.1), 1)
# Features that are constant within a claim type are dropped for that type's forest.
TYPE_FEATURES = {
    1: [f for f in FEATURES if f != "is_inpatient"],
    0: [f for f in FEATURES if f not in ("is_inpatient", "los_days")],   # outpatient: no length of stay
}


def _fit_one(X: pd.DataFrame) -> tuple[IsolationForest, dict]:
    m = IsolationForest(n_estimators=300, max_samples=256, contamination="auto", random_state=SEED, n_jobs=-1).fit(X)
    s = -m.score_samples(X)
    return m, dict(zip(_QUANTILE_GRID.tolist(), np.percentile(s, _QUANTILE_GRID).tolist()))


def fit_isolation_forest(dev_claims: pd.DataFrame, ref: ReferenceStats, mode: str = "per_type") -> dict:
    X = claim_matrix(dev_claims, ref)
    bundle = {"mode": mode, "reference": ref, "default_percentile": DEFAULT_PERCENTILE, "n_fit_claims": int(len(X)),
              "models": {}, "score_quantiles": {}, "feature_names": {}}
    groups = {"all": X.index} if mode == "global" else {t: X.index[X["is_inpatient"] == t] for t in (0, 1)}
    for key, idx in groups.items():
        feats = FEATURES if mode == "global" else TYPE_FEATURES[key]
        bundle["models"][key], bundle["score_quantiles"][key] = _fit_one(X.loc[idx, feats])
        bundle["feature_names"][key] = feats
    return bundle


def threshold_for(bundle: dict, key, percentile: float | None = None) -> float:
    pct = round(float(percentile if percentile is not None else bundle["default_percentile"]), 1)
    if pct not in bundle["score_quantiles"][key]:
        raise ValueError("percentile must be between 0 and 100 in steps of 0.1")
    return float(bundle["score_quantiles"][key][pct])


def score_claims(claims: pd.DataFrame, bundle: dict, percentile: float | None = None,
                 threshold: float | dict | None = None) -> pd.DataFrame:
    """`threshold` may be one absolute score, or {claim_type: score}; otherwise a percentile is used."""
    X = claim_matrix(claims, bundle["reference"])
    scores = np.empty(len(X), dtype="float64")
    flags = np.zeros(len(X), dtype="int8")
    keys = ["all"] if bundle["mode"] == "global" else [0, 1]
    for key in keys:
        mask = np.ones(len(X), bool) if key == "all" else (X["is_inpatient"].to_numpy() == key)
        if not mask.any():
            continue
        s = -bundle["models"][key].score_samples(X.loc[mask, bundle["feature_names"][key]])
        t = (threshold.get(key) if isinstance(threshold, dict) else threshold) if threshold is not None \
            else threshold_for(bundle, key, percentile)
        scores[mask], flags[mask] = s, (s >= t)
    return pd.DataFrame({"ClaimID": claims["ClaimID"].to_numpy(), "Provider": claims["Provider"].astype("string").to_numpy(),
                         "is_inpatient": X["is_inpatient"].to_numpy().astype("int8"),
                         "anomaly_score": scores.astype("float32"), "is_anomaly": flags})
