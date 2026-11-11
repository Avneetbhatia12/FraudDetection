"""
Track 1 research store: read-only access to saved Phase 2/3 results for PUBLIC US MEDICARE (Kaggle) data.
Nothing here touches application data, and nothing is computed for application providers or claims.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPORTS = ROOT / "reports"
ARTIFACTS = ROOT / "artifacts"
KAGGLE_PROVIDER_ID = re.compile(r"^PRV\d{5}$")          # Kaggle IDs; application provider IDs are integers
FIGURES = {                                              # whitelist: name -> file under reports/shap
    "summary_beeswarm": "global/summary_beeswarm.png",
    "importance_bar": "global/importance_bar.png",
    "group_contribution": "global/group_contribution.png",
}

SCOPE = {
    "dataset": "Public US Medicare data (Kaggle: Healthcare Provider Fraud Detection Analysis, 2008-09)",
    "applies_to_live_application_data": False,
    "label_note": "PotentialFraud is a provider-level label of undocumented provenance; not verified fraud and not claim-level.",
    "score_note": "Model outputs are uncalibrated, class-weighted risk scores, not probabilities of fraud.",
}


class ResearchStore:
    def __init__(self, reports_dir: Path = REPORTS, artifacts_dir: Path = ARTIFACTS):
        self.reports, self.artifacts = reports_dir, artifacts_dir
        self._explanations = None

    def _json(self, name: str) -> dict:
        p = self.reports / name
        if not p.exists():
            raise FileNotFoundError(name)
        return json.loads(p.read_text(encoding="utf-8"))

    @property
    def run_id(self) -> str | None:
        p = self.artifacts / "LATEST"
        return p.read_text(encoding="utf-8").strip() if p.exists() else None

    def available(self) -> bool:
        return (self.reports / "model_comparison.json").exists() and (self.reports / "shap_explanations.json").exists()

    def models(self) -> dict:
        mc = self._json("model_comparison.json")
        out = {"run_id": mc["metadata"]["run_id"], "selected_model": mc["metadata"]["selected_model"],
               "thresholds": mc["metadata"]["thresholds"], "split": mc["metadata"]["split"],
               "cross_validation": {k: {m: v.get(m) for m in ("params", "pr_auc_mean", "pr_auc_std", "roc_auc_mean", "roc_auc_std")}
                                    for k, v in mc["cv"].items()},
               "test": {k: {m: v.get(m) for m in ("pr_auc", "pr_auc_95ci", "roc_auc", "roc_auc_95ci", "accuracy", "precision",
                                                     "recall", "f1", "threshold", "confusion_matrix")}
                        for k, v in mc["test"]["supervised_test"].items()},
               "ablation": {k: {m: v[m] for m in ("n_features", "pr_auc_mean", "pr_auc_std")} for k, v in mc["ablation"]["group_only"].items()}}
        rf = self.reports / "reduced_feature_experiment.json"
        if rf.exists():
            r = json.loads(rf.read_text(encoding="utf-8"))
            out["app_compatible_feature_experiment"] = {k: {m: v[m] for m in ("cv_pr_auc_mean", "cv_pr_auc_std", "cv_roc_auc_mean",
                                                                                  "oof_precision", "oof_recall", "oof_f1")}
                                                         for k, v in r["results"].items()}
        return out

    def shap_global(self) -> dict:
        s = self._json("shap_explanations.json")
        return {"run_id": s["run_id"], "base_value_log_odds": s["base_value_log_odds"], "base_score": s["base_score"],
                "threshold": s["threshold"], "checks": s["checks"], "stability": s["stability_dev_vs_test"],
                "global_importance": s["global_importance_test"], "group_importance": s["group_importance_test"],
                "figures": sorted(FIGURES)}

    def provider_explanation(self, kaggle_provider_id: str) -> dict:
        if not KAGGLE_PROVIDER_ID.match(kaggle_provider_id or ""):
            raise ValueError("research explanations exist only for Kaggle provider IDs of the form PRV00000")
        if self._explanations is None:
            run = self.run_id
            p = self.artifacts / run / "research" / "provider_explanations.json" if run else None
            if not p or not p.exists():
                raise FileNotFoundError("research explanations not precomputed; run scripts/precompute_research.py")
            self._explanations = json.loads(p.read_text(encoding="utf-8"))["explanations"]
        if kaggle_provider_id not in self._explanations:
            raise KeyError(kaggle_provider_id)
        return self._explanations[kaggle_provider_id]

    def figure_path(self, name: str) -> Path:
        if name not in FIGURES:
            raise KeyError(name)
        p = self.reports / "shap" / FIGURES[name]
        if not p.exists():
            raise FileNotFoundError(name)
        return p
