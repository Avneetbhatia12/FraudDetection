"""
Phase 3: SHAP explanations for the saved provider-level XGBoost model (no retraining).

Outputs (from ml_service/):
  reports/shap/global/summary_beeswarm.png, importance_bar.png, group_contribution.png
  reports/shap/providers/<Provider>_waterfall.png, <Provider>_contributions.png
  reports/shap_explanations.md / .json

Global explanations use the held-out TEST providers (the model never trained on them); the
development providers are used only to check that the global ranking is stable.
Example providers are chosen by rule (illustration only, nothing is tuned):
highest-scored test provider; highest-scored flagged provider labelled "No";
lowest-scored provider labelled "Yes" (a miss).

    .venv/Scripts/python.exe training/explain_shap.py
"""
from __future__ import annotations

import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import shap
import xgboost as xgb
from scipy.stats import spearmanr

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from fraud_ml import explain_plots as P  # noqa: E402
from fraud_ml.config import ARTIFACTS_DIR, REPORTS_DIR  # noqa: E402
from fraud_ml.cv import labels_for  # noqa: E402
from fraud_ml.explain import ProviderExplainer  # noqa: E402
from fraud_ml.pipeline import prepare  # noqa: E402

OUT = REPORTS_DIR / "shap"
TOP_K = 10


def sha256(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def main() -> None:
    prep = prepare()
    ex = ProviderExplainer(prep)
    model_file = ARTIFACTS_DIR / ex.run_id / "provider_XGBoost.joblib"
    model_hash_before = sha256(model_file)

    # ── Consistency checks on ALL providers ───────────────────
    all_ids = list(ex.X.index)
    exp_all = ex.shap_values(all_ids)                     # raises if additivity fails
    margin = ex.model.predict(ex.X, output_margin=True)
    prob = ex.model.predict_proba(ex.X)[:, 1]
    recon = exp_all.base_values + exp_all.values.sum(axis=1)
    native = ex.model.get_booster().predict(xgb.DMatrix(ex.X), pred_contribs=True)
    saved_scores = ex.predictor.score_providers(prep.static, prep.claims, all_ids)["risk_score"].to_numpy()
    checks = {
        "n_providers": len(all_ids),
        "max_abs_additivity_error_log_odds": float(np.abs(recon - margin).max()),
        "max_abs_score_error": float(np.abs(1 / (1 + np.exp(-recon)) - prob).max()),
        "max_abs_diff_vs_xgboost_native_contribs": float(np.abs(native[:, :-1] - exp_all.values).max()),
        "max_abs_diff_vs_phase2_inference_scores": float(np.abs(prob - saved_scores).max()),
        "feature_order_matches_model": list(ex.model.get_booster().feature_names) == ex.features,
    }
    exp_all2 = ProviderExplainer(prep).shap_values(all_ids)       # fresh explainer: reproducibility
    checks["reproducible_across_explainer_instances"] = bool(np.array_equal(exp_all.values, exp_all2.values))

    # ── Global (test providers) + stability (dev providers) ───
    test, dev = ex.test_ids, ex.dev_ids
    exp_test = ex.shap_values(test)
    glob = ex.global_importance(test)
    glob_dev = ex.global_importance(dev).set_index("feature")
    rho = spearmanr(glob["mean_abs_shap"], glob_dev.loc[glob["feature"], "mean_abs_shap"]).statistic
    top10_overlap = len(set(glob["feature"][:10]) & set(glob_dev.sort_values("mean_abs_shap", ascending=False).index[:10]))
    groups = ex.group_importance(test)

    figs = {"summary_beeswarm": P.summary_beeswarm(exp_test, OUT / "global" / "summary_beeswarm.png"),
            "importance_bar": P.importance_bar(exp_test, OUT / "global" / "importance_bar.png"),
            "group_contribution": P.group_bar(groups, OUT / "global" / "group_contribution.png")}

    # ── Example providers (rule-based selection, illustration only) ─
    y = dict(zip(test, labels_for(prep, test)))
    score = dict(zip(ex.X.index, prob))
    ts = sorted(test, key=lambda p: -score[p])
    examples = {
        "highest-scored test provider": ts[0],
        "flagged but labelled \"No\" (false positive)": next(p for p in ts if y[p] == 0 and score[p] >= ex.threshold),
        "labelled \"Yes\" but lowest score (missed)": next(p for p in reversed(ts) if y[p] == 1),
    }
    ex_out = {}
    for why, pid in examples.items():
        e = ex.explain(pid, top_k=TOP_K)
        e["selection_rule"], e["label"] = why, ("Yes" if y[pid] else "No")
        idx = test.index(pid)
        figs[f"{pid}_waterfall"] = P.waterfall(exp_test[idx], OUT / "providers" / f"{pid}_waterfall.png",
                                               f"Provider {pid} ({why}): score {e['risk_score']:.3f}")
        figs[f"{pid}_contributions"] = P.contribution_bar(e, OUT / "providers" / f"{pid}_contributions.png")
        ex_out[pid] = e
        print(f"  {pid}: {why} | score {e['risk_score']:.3f} | label {e['label']}")

    checks["model_file_unchanged"] = sha256(model_file) == model_hash_before
    result = {"generated_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"), "run_id": ex.run_id,
              "shap_version": shap.__version__, "xgboost_version": xgb.__version__,
              "model_sha256": model_hash_before, "explainer": "shap.TreeExplainer (tree_path_dependent, exact)",
              "base_value_log_odds": ex.base_value, "base_score": float(1 / (1 + np.exp(-ex.base_value))),
              "threshold": ex.threshold, "checks": checks,
              "stability_dev_vs_test": {"spearman_mean_abs_shap": float(rho), "top10_overlap": top10_overlap},
              "global_importance_test": glob.reset_index().to_dict("records"),
              "group_importance_test": groups.to_dict("records"), "examples": ex_out,
              "figures": {k: str(v.relative_to(ROOT)).replace("\\", "/") for k, v in figs.items()}}
    (REPORTS_DIR / "shap_explanations.json").write_text(json.dumps(result, indent=2, default=float), encoding="utf-8")
    from training.shap_report import render
    (REPORTS_DIR / "shap_explanations.md").write_text(render(result), encoding="utf-8")
    print(json.dumps(checks, indent=1))
    print(f"Wrote reports/shap_explanations.md, reports/shap_explanations.json and {len(figs)} figures in reports/shap/")


if __name__ == "__main__":
    main()
