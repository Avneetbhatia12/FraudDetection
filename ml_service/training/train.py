"""
Train provider-level classifiers (LR / RF / XGBoost) and the claim-level Isolation Forest.

  1. Prepare data; stratified provider-level split (15% test held out, 5-fold CV on the rest).
  2. For each model and grid setting: 5-fold CV on development providers only, with
     reference statistics refitted inside each fold. Score = mean PR-AUC.
  3. Per model: best setting -> out-of-fold predictions -> decision threshold (max F1).
  4. Selected model = highest mean CV PR-AUC. The test set plays no part in steps 2-4.
  5. Final fit on all development providers; save artifacts. Volume-only baseline trained the same way.
  6. Isolation Forest fitted on development providers' claims (no labels).

Test-set evaluation is a separate script (training/evaluate.py).

    .venv/Scripts/python.exe training/train.py          # from ml_service/
"""
from __future__ import annotations

import platform
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import sklearn
import xgboost
from sklearn.metrics import average_precision_score, roc_auc_score

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from fraud_ml import anomaly, artifacts  # noqa: E402
from fraud_ml.config import N_FOLDS, SEED, TEST_SIZE  # noqa: E402
from fraud_ml.cv import build_cv_folds, build_final_matrices, dev_test_providers  # noqa: E402
from fraud_ml.features_claim import FEATURES as CLAIM_FEATURES  # noqa: E402
from fraud_ml.features_provider import ABLATION_GROUPS, FEATURES  # noqa: E402
from fraud_ml.metrics import classification_metrics, threshold_max_f1  # noqa: E402
from fraud_ml.models import GRIDS, MODEL_NAMES, make_model  # noqa: E402
from fraud_ml.pipeline import claims_of, prepare  # noqa: E402


def run_cv(folds, name: str, params: dict, features: list[str]) -> dict:
    """5-fold CV for one model/setting/feature set. Returns per-fold scores and out-of-fold predictions."""
    oof_p, oof_y, oof_id, pr, roc = [], [], [], [], []
    for f in folds:
        pos_w = float((f.y_train == 0).sum() / max(1, f.y_train.sum()))
        m = make_model(name, params, pos_w).fit(f.X_train[features], f.y_train)
        p = m.predict_proba(f.X_val[features])[:, 1]
        pr.append(average_precision_score(f.y_val, p))
        roc.append(roc_auc_score(f.y_val, p))
        oof_p.append(p), oof_y.append(f.y_val), oof_id.extend(f.X_val.index)
    p, y = np.concatenate(oof_p), np.concatenate(oof_y)
    return {"params": params, "pr_auc_folds": [round(v, 4) for v in pr], "pr_auc_mean": round(float(np.mean(pr)), 4),
            "pr_auc_std": round(float(np.std(pr)), 4), "roc_auc_mean": round(float(np.mean(roc)), 4),
            "roc_auc_std": round(float(np.std(roc)), 4), "_oof": pd.DataFrame({"Provider": oof_id, "y": y, "p": p})}


def git_commit() -> str | None:
    try:
        return subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT, capture_output=True, text=True, check=True).stdout.strip()
    except Exception:
        return None


def main() -> None:
    t0 = time.time()
    run_id = datetime.now(timezone.utc).strftime("run-%Y%m%d-%H%M%S")
    prep = prepare()
    dev, test = dev_test_providers(prep)
    print(f"[{run_id}] dev providers {len(dev)} | test providers {len(test)} (held out, untouched here)")

    folds = build_cv_folds(prep)
    print(f"built {N_FOLDS} CV folds with per-fold reference statistics ({time.time() - t0:.0f}s)")

    # ── CV tuning per model ───────────────────────────────────
    cv_results, best, oof_frames = {}, {}, {}
    for name in MODEL_NAMES:
        cv_results[name] = []
        for params in GRIDS[name]:
            r = run_cv(folds, name, params, FEATURES)
            cv_results[name].append(r)
            print(f"  {name:<18} {str(params):<45} CV PR-AUC {r['pr_auc_mean']:.4f} +/- {r['pr_auc_std']:.4f} | ROC-AUC {r['roc_auc_mean']:.4f}")
        best[name] = max(cv_results[name], key=lambda r: r["pr_auc_mean"])
        o = best[name]["_oof"]
        best[name]["threshold"] = threshold_max_f1(o["y"], o["p"])
        best[name]["oof_metrics"] = classification_metrics(o["y"], o["p"], best[name]["threshold"])
        oof_frames[name] = o.rename(columns={"p": f"p_{name}"})

    selected = max(MODEL_NAMES, key=lambda n: best[n]["pr_auc_mean"])
    ranked = sorted(MODEL_NAMES, key=lambda n: -best[n]["pr_auc_mean"])
    print(f"Selected by CV PR-AUC: {selected}  (ranking: {ranked})")

    # ── Volume-only baseline: selected model class + its tuned settings, volume features only ─
    vol_feats = ABLATION_GROUPS["Volume-only baseline"]
    vol = run_cv(folds, selected, best[selected]["params"], vol_feats)
    vol["threshold"] = threshold_max_f1(vol["_oof"]["y"], vol["_oof"]["p"])
    vol["oof_metrics"] = classification_metrics(vol["_oof"]["y"], vol["_oof"]["p"], vol["threshold"])
    oof_frames["volume_baseline"] = vol["_oof"].rename(columns={"p": "p_volume_baseline"})
    print(f"  volume-only baseline ({selected}) CV PR-AUC {vol['pr_auc_mean']:.4f} +/- {vol['pr_auc_std']:.4f}")

    # ── Final fit on all development providers ────────────────
    ref, X_dev, y_dev, _, _ = build_final_matrices(prep)
    artifacts.save_joblib(run_id, "reference_stats", ref)
    pos_w = float((y_dev == 0).sum() / y_dev.sum())
    for name in MODEL_NAMES:
        m = make_model(name, best[name]["params"], pos_w).fit(X_dev[FEATURES], y_dev)
        artifacts.save_joblib(run_id, f"provider_{name}", {"model": m, "feature_names": FEATURES,
                                                            "threshold": best[name]["threshold"], "params": best[name]["params"]})
    mv = make_model(selected, best[selected]["params"], pos_w).fit(X_dev[vol_feats], y_dev)
    artifacts.save_joblib(run_id, "provider_volume_baseline", {"model": mv, "feature_names": vol_feats,
                                                                "threshold": vol["threshold"], "params": best[selected]["params"],
                                                                "model_class": selected})

    # ── Isolation Forest (claim level, no labels) ─────────────
    dev_claims = claims_of(prep, dev)
    iso = anomaly.fit_isolation_forest(dev_claims, ref, mode="per_type")
    artifacts.save_joblib(run_id, "isolation_forest", iso)
    # Diagnostic only: a single global forest (shown in the report to explain the per-type design)
    artifacts.save_joblib(run_id, "isolation_forest_global", anomaly.fit_isolation_forest(dev_claims, ref, mode="global"))
    print(f"Isolation Forests (per claim type + global diagnostic) fitted on {iso['n_fit_claims']:,} development claims (labels not used)")

    # ── Save results and metadata ─────────────────────────────
    oof = oof_frames[MODEL_NAMES[0]]
    for k, f in list(oof_frames.items())[1:]:
        oof = oof.merge(f.drop(columns="y"), on="Provider")
    oof.to_csv(artifacts.run_dir(run_id) / "oof_predictions.csv", index=False)
    strip = lambda r: {k: v for k, v in r.items() if k != "_oof"}  # noqa: E731
    artifacts.save_json(run_id, "cv_results", {
        "grid": {n: [strip(r) for r in rs] for n, rs in cv_results.items()},
        "best": {n: strip(best[n]) for n in MODEL_NAMES},
        "volume_baseline": strip(vol) | {"model_class": selected, "features": vol_feats},
        "selected_model": selected, "selection_rule": "highest mean 5-fold CV PR-AUC on development providers"})
    manifest = (ROOT / "datasets" / "public_kaggle_provider_fraud" / "manifest.json").read_text(encoding="utf-8")
    import json
    artifacts.save_json(run_id, "metadata", {
        "run_id": run_id, "created_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"), "git_commit": git_commit(),
        "dataset": json.loads(manifest),
        "label_caveat": "PotentialFraud is a provider-level label of undocumented provenance; not verified fraud and not a claim-level label.",
        "task": "Provider-level risk at the end of the observation period (not real-time claim-level fraud detection).",
        "split": {"seed": SEED, "test_size": TEST_SIZE, "n_folds": N_FOLDS, "n_dev": len(dev), "n_test": len(test)},
        "selected_model": selected, "thresholds": {n: best[n]["threshold"] for n in MODEL_NAMES} | {"volume_baseline": vol["threshold"]},
        "provider_features": FEATURES, "claim_features": CLAIM_FEATURES,
        "isolation_forest": {"mode": iso["mode"], "default_percentile": iso["default_percentile"], "n_fit_claims": iso["n_fit_claims"]},
        "versions": {"python": platform.python_version(), "scikit-learn": sklearn.__version__, "xgboost": xgboost.__version__,
                     "pandas": pd.__version__, "numpy": np.__version__},
        "train_seconds": round(time.time() - t0, 1)})
    artifacts.mark_latest(run_id)
    print(f"Saved artifacts to artifacts/{run_id} ({time.time() - t0:.0f}s)")


if __name__ == "__main__":
    main()
