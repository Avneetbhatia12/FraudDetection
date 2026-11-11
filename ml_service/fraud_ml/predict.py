"""
Inference only: loads saved artifacts, never trains.

  score_providers(): provider-level risk of matching the dataset's PotentialFraud label, at the
                     end of the observation period. Not a verified fraud finding and not real-time.
  score_claims():    claim-level anomaly scores (unusualness, not fraud).
"""
from __future__ import annotations

import pandas as pd

from . import anomaly, artifacts
from .features_provider import provider_matrix


class Predictor:
    def __init__(self, run_id: str | None = None):
        self.run_id = run_id or artifacts.latest_run_id()
        self.meta = artifacts.load_json(self.run_id, "metadata")
        self.reference = artifacts.load_joblib(self.run_id, "reference_stats")
        self.selected = self.meta["selected_model"]
        self._models: dict = {}
        self._iforest: dict = {}

    def provider_model(self, name: str | None = None) -> dict:
        name = name or self.selected
        if name not in self._models:
            self._models[name] = artifacts.load_joblib(self.run_id, f"provider_{name}")
        return self._models[name]

    def score_providers(self, static: pd.DataFrame, claims: pd.DataFrame, providers, model: str | None = None) -> pd.DataFrame:
        """`static`/`claims` come from fraud_ml.pipeline.prepare() (or the same preprocessing on new data)."""
        b = self.provider_model(model)
        X = provider_matrix(static, claims, self.reference, providers)[b["feature_names"]]
        p = b["model"].predict_proba(X)[:, 1]
        return pd.DataFrame({"Provider": list(providers), "risk_probability": p, "flagged": (p >= b["threshold"]).astype(int),
                             "threshold": b["threshold"], "model": model or self.selected, "run_id": self.run_id})

    def anomaly_bundle(self, variant: str = "isolation_forest") -> dict:
        """variant: 'isolation_forest' (per claim type, the model to use) or 'isolation_forest_global' (diagnostic)."""
        if variant not in self._iforest:
            self._iforest[variant] = artifacts.load_joblib(self.run_id, variant)
        return self._iforest[variant]

    def score_claims(self, claims: pd.DataFrame, percentile: float | None = None, threshold=None,
                     variant: str = "isolation_forest") -> pd.DataFrame:
        return anomaly.score_claims(claims, self.anomaly_bundle(variant), percentile, threshold)
