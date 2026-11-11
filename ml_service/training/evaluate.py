"""
Final evaluation, run once after train.py (and ablation.py). Loads saved artifacts through the
inference module (fraud_ml.predict) and evaluates on the held-out test providers.
Nothing is refitted and no setting is changed based on test results.

Writes artifacts/<run>/test_results.json and reports/model_comparison.{md,json}.

    .venv/Scripts/python.exe training/evaluate.py       # from ml_service/
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import mannwhitneyu
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, roc_auc_score

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from fraud_ml import artifacts  # noqa: E402
from fraud_ml.config import REPORTS_DIR  # noqa: E402
from fraud_ml.cv import dev_test_providers, labels_for  # noqa: E402
from fraud_ml.metrics import bootstrap_ci, classification_metrics, threshold_max_f1  # noqa: E402
from fraud_ml.models import MODEL_NAMES  # noqa: E402
from fraud_ml.pipeline import prepare  # noqa: E402
from fraud_ml.predict import Predictor  # noqa: E402

SIZE_LABELS = ["Q1 (smallest)", "Q2", "Q3", "Q4 (largest)"]
IF_PERCENTILES = [90.0, 95.0, 99.0]


def size_groups(n_claims: pd.Series, cuts: np.ndarray) -> pd.Series:
    return pd.cut(n_claims, bins=np.r_[-np.inf, cuts, np.inf], labels=SIZE_LABELS)


def by_size(df: pd.DataFrame, pcol: str, thr: float) -> dict:
    out = {}
    for g, sub in df.groupby("size_group", observed=False):
        m = classification_metrics(sub["y"], sub[pcol], thr) if len(sub) else {}
        out[str(g)] = {k: m.get(k) for k in ("n", "positives", "pr_auc", "roc_auc", "precision", "recall", "f1")}
        out[str(g)]["base_rate"] = round(float(sub["y"].mean()), 4) if len(sub) else None
    return out


def if_analysis(prep, pred, variant: str, pct: float, dev: list, test: list, cuts) -> dict:
    """Association between provider anomaly rates and provider labels, adjusted for size and
    claim mix. Claims are never labelled; this is not claim-level fraud accuracy."""
    flagged = pred.score_claims(prep.claims, percentile=pct, variant=variant)
    bundle = pred.anomaly_bundle(variant)
    rate = flagged.groupby("Provider", observed=True)["is_anomaly"].mean()
    prov = pd.DataFrame({"Provider": dev + test, "split": ["dev"] * len(dev) + ["test"] * len(test)})
    prov["y"] = labels_for(prep, prov["Provider"])
    prov["anomaly_rate"] = rate.reindex(prov["Provider"]).to_numpy()
    prov["log_n_claims"] = prep.static.loc[prov["Provider"], "log_n_claims"].to_numpy()
    prov["share_inpatient"] = prep.static.loc[prov["Provider"], "share_inpatient"].to_numpy()
    prov["size_group"] = size_groups(np.expm1(prov["log_n_claims"]).round(), cuts)
    t, d = prov[prov["split"] == "test"], prov[prov["split"] == "dev"]
    claims_t = flagged[flagged["Provider"].isin(set(test))].merge(prov[["Provider", "y"]], on="Provider")
    entry = {
        "thresholds": {str(k): round(v[round(pct, 1)], 5) for k, v in bundle["score_quantiles"].items()},
        "share_claims_flagged_all": round(float(flagged["is_anomaly"].mean()), 4),
        # Diagnostics (label-free): is "anomaly" just a proxy for claim type?
        "share_of_flagged_that_are_inpatient": round(float(flagged.loc[flagged.is_anomaly == 1, "is_inpatient"].mean()), 4),
        "flag_rate_by_claim_type": {("inpatient" if k else "outpatient"): round(float(v), 4)
                                    for k, v in flagged.groupby("is_inpatient")["is_anomaly"].mean().items()},
        "corr_anomaly_rate_vs_share_inpatient": round(float(prov[["anomaly_rate", "share_inpatient"]].corr().iloc[0, 1]), 4),
        # Descriptive association with provider labels (test providers)
        "test_claims_flagged_share_by_provider_label": {("Yes" if k else "No"): round(float(v), 4)
                                                        for k, v in claims_t.groupby("y")["is_anomaly"].mean().items()},
        "test_provider_anomaly_rate_median_by_label": {("Yes" if k else "No"): round(float(v), 4)
                                                       for k, v in t.groupby("y")["anomaly_rate"].median().items()},
        "test_anomaly_rate_roc_auc": round(float(roc_auc_score(t["y"], t["anomaly_rate"])), 4),
        "test_anomaly_rate_pr_auc": round(float(average_precision_score(t["y"], t["anomaly_rate"])), 4),
        "test_mannwhitney_p": float(mannwhitneyu(t.loc[t.y == 1, "anomaly_rate"], t.loc[t.y == 0, "anomaly_rate"]).pvalue),
    }
    # Adjustment 1: association within provider-size bands (all providers; the forests never saw labels)
    within = {}
    for g, sub in prov.groupby("size_group", observed=False):
        ok = sub["y"].nunique() == 2
        within[str(g)] = {"n": int(len(sub)), "positives": int(sub["y"].sum()),
                          "median_rate_yes": round(float(sub.loc[sub.y == 1, "anomaly_rate"].median()), 4) if ok else None,
                          "median_rate_no": round(float(sub.loc[sub.y == 0, "anomaly_rate"].median()), 4) if ok else None,
                          "roc_auc": round(float(roc_auc_score(sub["y"], sub["anomaly_rate"])), 4) if ok else None}
    entry["within_size_band_all_providers"] = within
    # Adjustment 2: does the anomaly rate add information beyond volume and claim mix?
    # (simple logistic models fitted on development providers, scored on test providers)
    inc = {}
    for label, cols in (("volume", ["log_n_claims"]),
                        ("volume_plus_share_inpatient", ["log_n_claims", "share_inpatient"]),
                        ("volume_plus_share_inpatient_plus_anomaly_rate", ["log_n_claims", "share_inpatient", "anomaly_rate"])):
        lr = LogisticRegression(class_weight="balanced", max_iter=1000).fit(d[cols], d["y"])
        p = lr.predict_proba(t[cols])[:, 1]
        inc[label] = {"test_pr_auc": round(float(average_precision_score(t["y"], p)), 4),
                      "test_roc_auc": round(float(roc_auc_score(t["y"], p)), 4)}
    entry["incremental_test"] = inc
    print(f"  {variant:<24} p{pct:g}: flagged-inpatient share {entry['share_of_flagged_that_are_inpatient']} | "
          f"rate ROC-AUC {entry['test_anomaly_rate_roc_auc']} | vol+IP {inc['volume_plus_share_inpatient']['test_roc_auc']} "
          f"-> +anomaly {inc['volume_plus_share_inpatient_plus_anomaly_rate']['test_roc_auc']}")
    return entry


def main() -> None:
    run_id = artifacts.latest_run_id()
    meta, cv = artifacts.load_json(run_id, "metadata"), artifacts.load_json(run_id, "cv_results")
    ablation = artifacts.load_json(run_id, "ablation_results")
    prep = prepare()
    dev, test = dev_test_providers(prep)
    y_test = labels_for(prep, test)
    pred = Predictor(run_id)

    n_claims = np.expm1(prep.static["log_n_claims"]).round()
    cuts = np.percentile(n_claims.loc[dev], [25, 50, 75])          # size bands defined on development providers

    # ── Supervised models on the held-out test providers ──────
    test_df = pd.DataFrame({"Provider": test, "y": y_test, "n_claims": n_claims.loc[test].to_numpy()})
    test_df["size_group"] = size_groups(test_df["n_claims"], cuts)
    results = {}
    for name in MODEL_NAMES + ["volume_baseline"]:
        s = pred.score_providers(prep.static, prep.claims, test, model=name)
        test_df[f"p_{name}"] = s["risk_probability"].to_numpy()
        thr = float(s["threshold"].iloc[0])
        results[name] = classification_metrics(y_test, test_df[f"p_{name}"], thr) | bootstrap_ci(y_test, test_df[f"p_{name}"].to_numpy())
        results[name]["by_size_test"] = by_size(test_df, f"p_{name}", thr)
        print(f"  {name:<18} test PR-AUC {results[name]['pr_auc']:.4f} {results[name]['pr_auc_95ci']} | ROC-AUC {results[name]['roc_auc']:.4f} "
              f"| P {results[name]['precision']:.3f} R {results[name]['recall']:.3f} F1 {results[name]['f1']:.3f}")

    # Threshold selection record (development out-of-fold predictions only; the test set is not involved)
    oof = pd.read_csv(artifacts.run_dir(run_id) / "oof_predictions.csv", dtype={"Provider": "string"})
    assert set(oof["Provider"]) <= set(dev) and not set(oof["Provider"]) & set(test), "OOF must be development-only"
    sel = meta["selected_model"]
    chosen = {n: classification_metrics(oof["y"], oof[f"p_{n}"], meta["thresholds"][n]) for n in MODEL_NAMES}
    for n in MODEL_NAMES:
        assert abs(threshold_max_f1(oof["y"], oof[f"p_{n}"]) - meta["thresholds"][n]) < 1e-6, f"{n} threshold not reproducible"  # CSV float round-trip
    grid = sorted({0.3, 0.4, 0.5, 0.6, 0.7, 0.8, round(meta["thresholds"][sel], 4)})
    sens = []
    for g in grid:
        m = classification_metrics(oof["y"], oof[f"p_{sel}"], g)
        sens.append({k: m[k] for k in ("threshold", "precision", "recall", "f1", "flagged")} | {"chosen": g == round(meta["thresholds"][sel], 4)})
    threshold_selection = {"rule": "model/setting: max mean CV PR-AUC; threshold: max F1 on pooled development out-of-fold predictions",
                           "n_oof_providers": int(len(oof)),
                           "chosen": {n: {k: chosen[n][k] for k in ("threshold", "precision", "recall", "f1")} for n in MODEL_NAMES},
                           "sensitivity_selected": sens}

    # Size-group analysis on out-of-fold development predictions (larger sample than test)
    oof["size_group"] = size_groups(n_claims.loc[oof["Provider"]].to_numpy(), cuts)
    for name in MODEL_NAMES + ["volume_baseline"]:
        results[name]["by_size_oof"] = by_size(oof, f"p_{name}", meta["thresholds"][name])

    # ── Isolation Forest: provider-group association (NOT claim-level fraud accuracy) ─
    iso_res = {variant: {str(pct): if_analysis(prep, pred, variant, pct, dev, test, cuts) for pct in IF_PERCENTILES}
               for variant in ("isolation_forest", "isolation_forest_global")}

    out = {"run_id": run_id, "size_band_cuts_n_claims": [float(c) for c in cuts], "threshold_selection": threshold_selection, "supervised_test": results,
           "isolation_forest": iso_res, "label_caveat": meta["label_caveat"], "task": meta["task"]}
    artifacts.save_json(run_id, "test_results", out)
    REPORTS_DIR.mkdir(exist_ok=True)
    (REPORTS_DIR / "model_comparison.json").write_text(json.dumps({"metadata": {k: meta[k] for k in (
        "run_id", "git_commit", "split", "selected_model", "thresholds", "versions")}, "cv": {
        n: {k: v for k, v in cv["best"][n].items()} for n in MODEL_NAMES} | {"volume_baseline": cv["volume_baseline"]},
        "ablation": ablation, "test": out}, indent=2, default=str), encoding="utf-8")
    from training.report import render
    (REPORTS_DIR / "model_comparison.md").write_text(render(meta, cv, ablation, out), encoding="utf-8")
    print("Wrote reports/model_comparison.md and reports/model_comparison.json")


if __name__ == "__main__":
    main()
