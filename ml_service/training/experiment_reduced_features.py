"""
Phase 4.0 experiment: how well do ONLY the app-compatible provider features reproduce the Kaggle
provider labels? (Kaggle data, 5-fold CV on development providers; held-out test set NOT used;
no model is saved; existing artifacts are not touched.)

App-compatible = features the application can derive with the same meaning from its own tables
(claims per provider, patients via policies, claim dates). See docs/PHASE4_ARCHITECTURE.md.
This model is NOT integrated into the application: the populations differ (US Medicare 2008-09
vs the application's claims), and the application has no labels to validate it against.

    .venv/Scripts/python.exe training/experiment_reduced_features.py
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from fraud_ml import artifacts  # noqa: E402
from fraud_ml.config import REPORTS_DIR  # noqa: E402
from fraud_ml.cv import build_cv_folds  # noqa: E402
from fraud_ml.features_provider import ABLATION_GROUPS, FEATURES, SPEC  # noqa: E402
from fraud_ml.metrics import classification_metrics, threshold_max_f1  # noqa: E402
from fraud_ml.models import MODEL_NAMES  # noqa: E402
from fraud_ml.pipeline import prepare  # noqa: E402
from training.train import run_cv  # noqa: E402

# Derivable from the application's tables with the same meaning (compatibility matrix: ✓)
APP_COMPATIBLE = ["log_n_claims", "log_n_patients", "claims_per_patient", "active_months", "claims_per_active_month",
                  "share_same_day_repeat", "median_days_between_patient_claims", "share_patients_3plus_claims",
                  "patient_mean_other_providers"]


def summarise(r: dict) -> dict:
    o = r["_oof"]
    thr = threshold_max_f1(o["y"], o["p"])
    m = classification_metrics(o["y"], o["p"], thr)
    return {"params": r["params"], "cv_pr_auc_mean": r["pr_auc_mean"], "cv_pr_auc_std": r["pr_auc_std"],
            "cv_roc_auc_mean": r["roc_auc_mean"], "cv_roc_auc_std": r["roc_auc_std"], "pr_auc_folds": r["pr_auc_folds"],
            "oof_threshold": round(thr, 4), "oof_precision": m["precision"], "oof_recall": m["recall"], "oof_f1": m["f1"],
            "oof_confusion_matrix": m["confusion_matrix"]}


def main() -> None:
    assert set(APP_COMPATIBLE) <= set(FEATURES), "unknown feature"
    run_id = artifacts.latest_run_id()
    best = artifacts.load_json(run_id, "cv_results")["best"]
    prep = prepare()
    folds = build_cv_folds(prep)
    vol = ABLATION_GROUPS["Volume-only baseline"]
    res = {"app_compatible_features": APP_COMPATIBLE, "volume_only_features": vol, "results": {}}
    for name in MODEL_NAMES:
        p = best[name]["params"]
        res["results"][f"{name} | app-compatible (9)"] = summarise(run_cv(folds, name, p, APP_COMPATIBLE))
        res["results"][f"{name} | volume-only (5)"] = summarise(run_cv(folds, name, p, vol))
        res["results"][f"{name} | all 47 (Phase 2 reference)"] = summarise(run_cv(folds, name, p, FEATURES))
    for k, v in res["results"].items():
        print(f"  {k:<48} CV PR-AUC {v['cv_pr_auc_mean']:.3f} +/- {v['cv_pr_auc_std']:.3f} | ROC {v['cv_roc_auc_mean']:.3f} "
              f"| P {v['oof_precision']:.3f} R {v['oof_recall']:.3f} F1 {v['oof_f1']:.3f}")
    res["base_rate"] = round(float(folds[0].y_train.mean()), 4)
    res["generated_utc"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    res["phase2_run_id"] = run_id
    (REPORTS_DIR / "reduced_feature_experiment.json").write_text(json.dumps(res, indent=2), encoding="utf-8")
    (REPORTS_DIR / "reduced_feature_experiment.md").write_text(render(res), encoding="utf-8")
    print("Wrote reports/reduced_feature_experiment.{md,json}")


def render(r: dict) -> str:
    R = r["results"]
    L = ["# Phase 4.0 experiment: app-compatible provider features only", "",
         f"_Generated {r['generated_utc']} by `training/experiment_reduced_features.py` (Phase 2 run `{r['phase2_run_id']}`, same tuned settings)._", "",
         "> **Kaggle public US Medicare data, 5-fold CV on development providers only.** The held-out test set was not used. "
         "No model was saved, and this model is **not** integrated into the application. Scores are uncalibrated; "
         "`PotentialFraud` labels are provider-level with undocumented provenance.", "",
         "## Feature sets", "",
         "| Set | Features |", "|---|---|",
         "| App-compatible (9) | " + ", ".join(f"`{f}`" for f in r["app_compatible_features"]) + " |",
         "| Volume-only baseline (5) | " + ", ".join(f"`{f}`" for f in r["volume_only_features"]) + " |",
         "| All 47 | Phase 2 reference |", "",
         "## Cross-validation results", "",
         f"Chance level (positive rate): PR-AUC ≈ {r['base_rate']:.3f}. Precision, recall and F1 are at the F1-maximising threshold on out-of-fold predictions.", "",
         "| Model | Features | CV PR-AUC (mean ± sd) | CV ROC-AUC | OOF precision | OOF recall | OOF F1 |", "|---|---|---|---|---|---|---|"]
    for k, v in R.items():
        m, fs = k.split(" | ")
        L.append(f"| {m} | {fs} | {v['cv_pr_auc_mean']:.3f} ± {v['cv_pr_auc_std']:.3f} | {v['cv_roc_auc_mean']:.3f} | "
                 f"{v['oof_precision']:.3f} | {v['oof_recall']:.3f} | {v['oof_f1']:.3f} |")
    x = lambda s: R[f"XGBoost | {s}"]  # noqa: E731
    gain = x("app-compatible (9)")["cv_pr_auc_mean"] - x("volume-only (5)")["cv_pr_auc_mean"]
    gap = x("all 47 (Phase 2 reference)")["cv_pr_auc_mean"] - x("app-compatible (9)")["cv_pr_auc_mean"]
    sd = max(x("app-compatible (9)")["cv_pr_auc_std"], x("volume-only (5)")["cv_pr_auc_std"])
    L += ["", "## Findings", "",
          f"- XGBoost on the 9 app-compatible features: CV PR-AUC {x('app-compatible (9)')['cv_pr_auc_mean']:.3f}. That is "
          f"{gain:+.3f} vs the volume-only baseline (" + ("**within** one fold standard deviation, so no clear gain" if abs(gain) <= sd
          else "more than one fold standard deviation") + f") and {gap:.3f} below the full 47-feature model.",
          "- Most of the signal the full model uses (inpatient stays, amounts paid, physicians, chronic conditions) "
          "is simply absent from the application's data.", "",
          "## Why this model is still not applied to the application", "",
          "- **Different population:** US Medicare providers 2008–09 (median 31 claims each) vs application providers "
          "(most have 1–2 claims), so per-provider ratios are unstable or undefined at the application's volume.",
          "- **Different meaning of the same feature name:** e.g. claim counts depend on the observation window and on how claims are "
          "recorded; `patient_mean_other_providers` depends on the size of the provider network.",
          "- **No application labels:** there is no way to check whether patterns learned from these labels hold for the application.",
          "- **Undocumented label provenance and uncalibrated scores:** inherited from Phase 2.", "",
          "Conclusion: this result supports the Phase 4 decision. Live claims are assessed with transparent app-native indicators "
          "(Track 2), and any supervised model for the application must be trained on the application's own investigator "
          "outcomes (Track 3).", ""]
    return "\n".join(L)


if __name__ == "__main__":
    main()
