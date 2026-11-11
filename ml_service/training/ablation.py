"""
Feature-group ablation on development providers only (5-fold CV, reference statistics refitted
per fold, same model class and settings as the selected model). The test set is not used.

  * "group only":      how much signal each group carries on its own
  * "all minus group": how much each group adds beyond all the others (unique contribution)

    .venv/Scripts/python.exe training/ablation.py       # after train.py
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from fraud_ml import artifacts  # noqa: E402
from fraud_ml.cv import build_cv_folds  # noqa: E402
from fraud_ml.features_provider import ABLATION_GROUPS, FEATURES  # noqa: E402
from fraud_ml.metrics import classification_metrics, threshold_max_f1  # noqa: E402
from fraud_ml.pipeline import prepare  # noqa: E402
from training.train import run_cv  # noqa: E402


def summarise(r: dict, features: list[str]) -> dict:
    o = r["_oof"]
    thr = threshold_max_f1(o["y"], o["p"])
    m = classification_metrics(o["y"], o["p"], thr)
    return {"n_features": len(features), "pr_auc_mean": r["pr_auc_mean"], "pr_auc_std": r["pr_auc_std"],
            "roc_auc_mean": r["roc_auc_mean"], "roc_auc_std": r["roc_auc_std"],
            "oof_precision": m["precision"], "oof_recall": m["recall"], "oof_f1": m["f1"], "features": features}


def main() -> None:
    run_id = artifacts.latest_run_id()
    cv = artifacts.load_json(run_id, "cv_results")
    name, params = cv["selected_model"], cv["best"][cv["selected_model"]]["params"]
    prep = prepare()
    folds = build_cv_folds(prep)
    out = {"model": name, "params": params, "group_only": {}, "all_minus_group": {}}
    for g, feats in ABLATION_GROUPS.items():
        out["group_only"][g] = summarise(run_cv(folds, name, params, feats), feats)
        print(f"  only  {g:<28} ({len(feats):>2} feats) PR-AUC {out['group_only'][g]['pr_auc_mean']:.4f} +/- {out['group_only'][g]['pr_auc_std']:.4f}")
    for g, feats in ABLATION_GROUPS.items():
        if g in ("All approved features", "Volume-only baseline"):
            continue
        rest = [f for f in FEATURES if f not in set(feats)]
        out["all_minus_group"][g] = summarise(run_cv(folds, name, params, rest), rest)
        print(f"  minus {g:<28} ({len(rest):>2} feats) PR-AUC {out['all_minus_group'][g]['pr_auc_mean']:.4f} +/- {out['all_minus_group'][g]['pr_auc_std']:.4f}")
    artifacts.save_json(run_id, "ablation_results", out)
    print(f"Saved artifacts/{run_id}/ablation_results.json")


if __name__ == "__main__":
    main()
