"""
SHAP explanations for the saved provider-level XGBoost model (Phase 3).

* Uses the exact Phase 2 artifacts: reference statistics fitted on development providers and the
  saved XGBoost model. Nothing is refitted.
* TreeExplainer with tree-path-dependent perturbation (exact TreeSHAP, no background sample),
  so explanations are deterministic. Output scale = the model's raw output (log-odds):
      model log-odds  =  base_value + sum(SHAP values)
      model score     =  sigmoid(model log-odds)   (= predict_proba)
* The model was trained with class weighting, so the score is a RANKING score, not a calibrated
  probability: the base value corresponds to ~0.58 although only ~9% of providers are labelled "Yes".
* SHAP values describe how THIS MODEL arrived at its score. They are not causal effects and not
  evidence of fraud. They apply only to provider-level risk scores (never to claims or the
  Isolation Forest). PotentialFraud labels are provider-level with undocumented provenance.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import shap

from .features_provider import SPEC, provider_matrix
from .pipeline import Prepared
from .predict import Predictor

DISCLAIMER = ("SHAP values show how this model arrived at its score for this provider. They are not causal effects "
              "and not evidence of fraud. The model reproduces the dataset's provider-level PotentialFraud labels, "
              "whose provenance is undocumented, and its score is a class-weighted ranking score, not a calibrated probability.")
GROUP_ORDER = ["Volume", "Amounts", "Inpatient", "Coding", "Timing", "Patient mix", "Network", "Fitted"]
ADDITIVITY_TOL = 1e-4


def _sigmoid(x):
    return 1.0 / (1.0 + np.exp(-x))


class ProviderExplainer:
    def __init__(self, prep: Prepared, run_id: str | None = None, model: str = "XGBoost"):
        if model != "XGBoost":
            raise ValueError("Phase 3 explains the selected XGBoost model only")
        self.predictor = Predictor(run_id)
        self.run_id = self.predictor.run_id
        bundle = self.predictor.provider_model(model)
        self.model, self.features, self.threshold = bundle["model"], list(bundle["feature_names"]), float(bundle["threshold"])
        booster_names = list(self.model.get_booster().feature_names or [])
        if booster_names != self.features:
            raise RuntimeError("Saved feature order does not match the model's input features")
        providers = list(prep.static.index)
        self.X = provider_matrix(prep.static, prep.claims, self.predictor.reference, providers)[self.features]
        s = prep.splits
        self.dev_ids = s.loc[s["split"] == "dev", "Provider"].tolist()
        self.test_ids = s.loc[s["split"] == "test", "Provider"].tolist()
        self._dev_sorted = {f: np.sort(self.X.loc[self.dev_ids, f].to_numpy()) for f in self.features}
        self.explainer = shap.TreeExplainer(self.model)          # exact, deterministic TreeSHAP
        # SHAP fills expected_value lazily on the first explanation, so take the base value from a real
        # explanation (it is the same for every provider) and check it matches the explainer afterwards.
        probe = self.explainer(self.X.iloc[:1])
        self.base_value = float(probe.base_values[0])
        if abs(self.base_value - float(np.ravel(self.explainer.expected_value)[0])) > 1e-9:
            raise RuntimeError("Inconsistent SHAP base value")
        self._cache: dict[str, shap.Explanation] = {}

    # ── SHAP values ───────────────────────────────────────────
    def shap_values(self, provider_ids) -> shap.Explanation:
        ids = [self._validate_id(p) for p in provider_ids]
        X = self.X.loc[ids]
        exp = self.explainer(X)
        margin = self.model.predict(X, output_margin=True)
        err = float(np.abs(exp.base_values + exp.values.sum(axis=1) - margin).max())
        if err > ADDITIVITY_TOL:
            raise RuntimeError(f"SHAP additivity check failed (max error {err:.2e})")
        if float(np.abs(exp.base_values - self.base_value).max()) > 1e-9:
            raise RuntimeError("SHAP base value differs from the explainer's base value")
        exp.feature_names = self.features
        return exp

    # ── Global ────────────────────────────────────────────────
    def global_importance(self, provider_ids) -> pd.DataFrame:
        exp = self.shap_values(provider_ids)
        V, X = exp.values, self.X.loc[list(provider_ids)].to_numpy()
        rows = []
        for j, f in enumerate(self.features):
            sv, xv = V[:, j], X[:, j]
            corr = float(np.corrcoef(xv, sv)[0, 1]) if np.std(xv) > 0 and np.std(sv) > 0 else 0.0
            direction = ("higher values raise the score" if corr > 0.1 else
                         "higher values lower the score" if corr < -0.1 else "mixed / non-monotonic")
            rows.append({"feature": f, "group": SPEC[f][0], "mean_abs_shap": float(np.abs(sv).mean()),
                         "mean_shap": float(sv.mean()), "value_shap_correlation": round(corr, 4), "direction": direction,
                         "description": SPEC[f][2]})
        df = pd.DataFrame(rows).sort_values("mean_abs_shap", ascending=False).reset_index(drop=True)
        df["share_of_total"] = df["mean_abs_shap"] / df["mean_abs_shap"].sum()
        df.index = df.index + 1
        df.index.name = "rank"
        return df

    def group_importance(self, provider_ids) -> pd.DataFrame:
        """Group contribution = |sum of the group's SHAP values| per provider (SHAP is additive), averaged."""
        exp = self.shap_values(provider_ids)
        V = pd.DataFrame(exp.values, columns=self.features)
        rows = []
        for g in GROUP_ORDER:
            cols = [f for f in self.features if SPEC[f][0] == g]
            gs = V[cols].sum(axis=1)
            rows.append({"group": g, "n_features": len(cols), "mean_abs_group_shap": float(gs.abs().mean()),
                         "mean_group_shap": float(gs.mean())})
        df = pd.DataFrame(rows)
        df["share"] = df["mean_abs_group_shap"] / df["mean_abs_group_shap"].sum()
        return df.sort_values("mean_abs_group_shap", ascending=False).reset_index(drop=True)

    # ── Individual ────────────────────────────────────────────
    def _validate_id(self, provider_id) -> str:
        if provider_id is None or not isinstance(provider_id, str):
            raise TypeError(f"provider_id must be a non-empty string, got {type(provider_id).__name__}")
        pid = provider_id.strip()
        if not pid:
            raise ValueError("provider_id must be a non-empty string")
        if pid not in self.X.index:
            raise KeyError(f"Unknown provider '{pid}': no claims for this provider in the prepared data")
        return pid

    def _dev_percentile(self, feature: str, value: float) -> float:
        """Share of development providers with a strictly lower value."""
        arr = self._dev_sorted[feature]
        return float(np.searchsorted(arr, value, side="left") / len(arr))

    def explain(self, provider_id, top_k: int = 10) -> dict:
        if isinstance(top_k, bool) or not isinstance(top_k, (int, np.integer)) or not 1 <= top_k <= len(self.features):
            raise ValueError(f"top_k must be an integer between 1 and {len(self.features)}")
        pid = self._validate_id(provider_id)
        if pid not in self._cache:
            self._cache[pid] = self.shap_values([pid])[0]
        e = self._cache[pid]
        log_odds = float(e.base_values + e.values.sum())
        score = float(self.model.predict_proba(self.X.loc[[pid]])[0, 1])
        order = np.argsort(-np.abs(e.values), kind="stable")[:top_k]
        contribs = []
        for j in order:
            f, v, s = self.features[j], float(e.data[j]), float(e.values[j])
            contribs.append({"feature": f, "group": SPEC[f][0], "value": v,
                             "dev_percentile": round(self._dev_percentile(f, v), 4), "shap_log_odds": s,
                             "direction": "increases risk score" if s > 0 else "decreases risk score" if s < 0 else "no effect",
                             "description": SPEC[f][2]})
        rest = float(e.values.sum() - sum(c["shap_log_odds"] for c in contribs))
        out = {
            "provider": pid, "run_id": self.run_id, "model": "XGBoost",
            "risk_score": score, "threshold": self.threshold, "flagged": bool(score >= self.threshold),
            "base_value_log_odds": self.base_value, "base_score": float(_sigmoid(self.base_value)),
            "model_log_odds": log_odds, "additivity_error": abs(float(_sigmoid(log_odds)) - score),
            "top_contributions": contribs, "other_features_shap_log_odds": rest,
            "split": "test" if pid in set(self.test_ids) else "dev",
            "disclaimer": DISCLAIMER,
        }
        out["summary"] = self.narrative(out)
        return out

    @staticmethod
    def narrative(x: dict) -> str:
        """Readable explanation built only from the computed values in `x`."""
        def item(c):
            pct = c["dev_percentile"] * 100      # share of development providers with a strictly lower value
            rel = f"above {pct:.0f}% of development providers"
            return (f"  - {c['feature']} = {c['value']:.4g} ({rel}; {c['description']}): "
                    f"{c['shap_log_odds']:+.3f} log-odds")
        up = [c for c in x["top_contributions"] if c["shap_log_odds"] > 0]
        down = [c for c in x["top_contributions"] if c["shap_log_odds"] < 0]
        lines = [
            f"Provider {x['provider']}: model risk score {x['risk_score']:.3f} "
            f"({'at or above' if x['flagged'] else 'below'} the decision threshold {x['threshold']:.3f}, so "
            f"{'flagged for review' if x['flagged'] else 'not flagged'}).",
            f"The model starts from a baseline of {x['base_value_log_odds']:+.3f} log-odds (score {x['base_score']:.3f}) "
            f"and the provider's features move it to {x['model_log_odds']:+.3f} log-odds.",
        ]
        if up:
            lines.append("Features that raised the score most:")
            lines += [item(c) for c in up]
        if down:
            lines.append("Features that lowered the score most:")
            lines += [item(c) for c in down]
        lines.append(f"All other features together: {x['other_features_shap_log_odds']:+.3f} log-odds.")
        lines.append("Note: " + x["disclaimer"])
        return "\n".join(lines)
