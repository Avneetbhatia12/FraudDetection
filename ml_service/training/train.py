"""
Phase 2 — train and compare fraud models on a documented dataset.

  * Supervised : Logistic Regression (baseline), Random Forest, XGBoost
  * Anomaly    : Isolation Forest (trained WITHOUT labels)
  * Baseline   : the five existing SQL trigger rules, re-expressed on the same claims

Evaluation is time-based: train on claims before --test-from, test on later
claims (how the system is actually used). Model choice uses 5-fold CV PR-AUC on
the training period only; the holdout is touched once for the final report.

Usage:
    .venv/Scripts/python.exe training/train.py
    .venv/Scripts/python.exe training/train.py --dataset datasets/synthetic_v1 --test-from 2025-07-01
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.ensemble import IsolationForest, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, f1_score, precision_recall_curve, precision_score, recall_score, roc_auc_score
from sklearn.model_selection import StratifiedKFold
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from xgboost import XGBClassifier

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from app import registry  # noqa: E402
from app.features import FEATURE_NAMES, FeatureBuilder, sql_rules_baseline  # noqa: E402

SEED = 42
TOP_K = 0.05  # investigator capacity: review the top 5% riskiest claims


def classifiers(pos_weight: float) -> dict:
    return {
        "LogisticRegression": make_pipeline(
            StandardScaler(), LogisticRegression(class_weight="balanced", max_iter=5000, random_state=SEED)),
        "RandomForest": RandomForestClassifier(
            n_estimators=400, min_samples_leaf=2, class_weight="balanced_subsample", n_jobs=-1, random_state=SEED),
        "XGBoost": XGBClassifier(
            n_estimators=400, max_depth=4, learning_rate=0.05, subsample=0.8, colsample_bytree=0.8,
            scale_pos_weight=pos_weight, eval_metric="aucpr", n_jobs=4, random_state=SEED),
    }


def best_f1_threshold(y, p) -> float:
    prec, rec, thr = precision_recall_curve(y, p)
    f1 = 2 * prec * rec / np.maximum(prec + rec, 1e-12)
    return float(thr[np.argmax(f1[:-1])])


def metrics(y, score, flagged) -> dict:
    k = max(1, int(round(TOP_K * len(y))))
    top = np.argsort(-score, kind="stable")[:k]
    return {
        "pr_auc": round(float(average_precision_score(y, score)), 4),
        "roc_auc": round(float(roc_auc_score(y, score)), 4),
        "precision": round(float(precision_score(y, flagged, zero_division=0)), 4),
        "recall": round(float(recall_score(y, flagged)), 4),
        "f1": round(float(f1_score(y, flagged)), 4),
        "flagged": int(flagged.sum()),
        f"precision_top{int(TOP_K*100)}pct": round(float(y[top].mean()), 4),
        f"recall_top{int(TOP_K*100)}pct": round(float(y[top].sum() / max(1, y.sum())), 4),
    }


def pattern_recall(patterns: pd.Series, flagged: np.ndarray) -> dict:
    df = pd.DataFrame({"p": patterns.to_numpy(), "f": flagged})
    return {p: round(float(g["f"].mean()), 3) for p, g in df[df["p"] != ""].groupby("p")}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dataset", type=Path, default=ROOT / "datasets" / "synthetic_v1")
    ap.add_argument("--test-from", default="2025-07-01")
    ap.add_argument("--report", type=Path, default=ROOT / "reports" / "phase2_model_comparison.md")
    args = ap.parse_args()

    manifest = json.loads((args.dataset / "manifest.json").read_text(encoding="utf-8"))
    claims, policies, patients, providers = (pd.read_csv(args.dataset / f"{n}.csv", keep_default_na=False)
                                             for n in ("claims", "policies", "patients", "providers"))
    claims["CLAIM_DATE"] = pd.to_datetime(claims["CLAIM_DATE"])
    is_train = claims["CLAIM_DATE"] < pd.Timestamp(args.test_from)

    # Reference statistics from the training period only; history features see all prior claims.
    fb = FeatureBuilder().fit(claims[is_train], policies, patients, providers)
    X_all = fb.transform(claims, policies, patients, providers)
    lab = claims.set_index("CLAIM_ID").loc[X_all.index]
    train_ids, test_ids = lab.index[is_train.set_axis(claims["CLAIM_ID"]).loc[X_all.index]], lab.index[~is_train.set_axis(claims["CLAIM_ID"]).loc[X_all.index]]
    Xtr, Xte = X_all.loc[train_ids], X_all.loc[test_ids]
    ytr, yte = lab.loc[train_ids, "IS_FRAUD"].to_numpy(), lab.loc[test_ids, "IS_FRAUD"].to_numpy()
    pat_te = lab.loc[test_ids, "FRAUD_PATTERN"]
    print(f"train {len(ytr)} ({ytr.mean():.2%} fraud) | test {len(yte)} ({yte.mean():.2%} fraud) | {len(FEATURE_NAMES)} features")

    run_ts = datetime.now(timezone.utc)
    stamp = run_ts.strftime("%Y%m%d-%H%M%S")
    results, versions = {}, {}

    # ── SQL rules baseline ───────────────────────────────────
    rules = sql_rules_baseline(Xte, lab.loc[test_ids, "CLAIM_AMOUNT"].astype(float),
                               lab.loc[test_ids, "POLICY_ID"].map(policies.set_index("POLICY_ID")["COVERAGE_AMOUNT"]).astype(float))
    rule_score = rules.sum(axis=1).to_numpy(dtype=float)
    results["SQL rules (existing trigger)"] = {**metrics(yte, rule_score, rule_score > 0),
                                               "pattern_recall": pattern_recall(pat_te, rule_score > 0),
                                               "per_rule": {r: {"hit_rate": round(float(rules[r].mean()), 4),
                                                                "precision": round(float(yte[rules[r].to_numpy()].mean()) if rules[r].any() else 0.0, 4)}
                                                            for r in rules.columns}}

    # ── Supervised classifiers ───────────────────────────────
    skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=SEED)
    for name, est in classifiers(float((ytr == 0).sum() / max(1, ytr.sum()))).items():
        oof, fold_ap = np.zeros(len(ytr)), []
        for tr, va in skf.split(Xtr, ytr):
            m = clone(est).fit(Xtr.iloc[tr], ytr[tr])
            oof[va] = m.predict_proba(Xtr.iloc[va])[:, 1]
            fold_ap.append(average_precision_score(ytr[va], oof[va]))
        thr = best_f1_threshold(ytr, oof)
        model = clone(est).fit(Xtr, ytr)
        p = model.predict_proba(Xte)[:, 1]
        results[name] = {"cv_pr_auc_mean": round(float(np.mean(fold_ap)), 4), "cv_pr_auc_std": round(float(np.std(fold_ap)), 4),
                         "threshold": round(thr, 4), **metrics(yte, p, p >= thr), "pattern_recall": pattern_recall(pat_te, p >= thr)}
        version = f"{ {'LogisticRegression': 'lr', 'RandomForest': 'rf', 'XGBoost': 'xgb'}[name] }-{stamp}"
        meta = {"model_version": version, "algorithm": name, "model_role": "classifier",
                "training_dataset": manifest["dataset"], "dataset_kind": manifest["kind"],
                "features": FEATURE_NAMES, "metrics": {k: v for k, v in results[name].items() if k != "pattern_recall"},
                "is_active": False, "trained_at": run_ts.isoformat(timespec="seconds"), "test_from": args.test_from}
        registry.save(version, {"model": model, "feature_builder": fb, "feature_names": FEATURE_NAMES, "threshold": thr}, meta)
        versions[name] = version
        print(f"  {name:<18} CV PR-AUC {results[name]['cv_pr_auc_mean']:.3f}+/-{results[name]['cv_pr_auc_std']:.3f} | holdout PR-AUC {results[name]['pr_auc']:.3f}")

    # ── Isolation Forest (unsupervised: labels never used for fitting or threshold) ─
    iso = IsolationForest(n_estimators=400, contamination="auto", random_state=SEED, n_jobs=-1).fit(Xtr)
    raw_tr = -iso.score_samples(Xtr)
    lo, hi = np.percentile(raw_tr, [1, 99])
    norm = lambda raw: np.clip((raw - lo) / max(hi - lo, 1e-9), 0, 1)  # noqa: E731
    a_thr = float(np.percentile(norm(raw_tr), 95))  # flag the most unusual 5% of the training period
    a = norm(-iso.score_samples(Xte))
    results["IsolationForest"] = {"threshold": round(a_thr, 4), **metrics(yte, a, a >= a_thr), "pattern_recall": pattern_recall(pat_te, a >= a_thr)}
    iso_version = f"iforest-{stamp}"
    registry.save(iso_version, {"model": iso, "feature_builder": fb, "feature_names": FEATURE_NAMES,
                                "threshold": a_thr, "norm_bounds": [float(lo), float(hi)]},
                  {"model_version": iso_version, "algorithm": "IsolationForest", "model_role": "anomaly",
                   "training_dataset": manifest["dataset"], "dataset_kind": manifest["kind"], "features": FEATURE_NAMES,
                   "metrics": {k: v for k, v in results["IsolationForest"].items() if k != "pattern_recall"},
                   "is_active": False, "trained_at": run_ts.isoformat(timespec="seconds"), "test_from": args.test_from})
    print(f"  {'IsolationForest':<18} holdout PR-AUC {results['IsolationForest']['pr_auc']:.3f} (unsupervised)")

    # ── Select by training-period CV only (holdout not used for selection) ─
    best = max(versions, key=lambda n: results[n]["cv_pr_auc_mean"])
    registry.set_active("classifier", versions[best])
    registry.set_active("anomaly", iso_version)
    print(f"Active classifier: {versions[best]} ({best}) | active anomaly model: {iso_version}")

    # Global feature importance of the selected tree/linear model (SHAP comes in Phase 3)
    sel = registry.load_active("classifier")[0]["model"]
    imp = (sel.feature_importances_ if hasattr(sel, "feature_importances_")
           else np.abs(sel[-1].coef_[0]))
    top_imp = sorted(zip(FEATURE_NAMES, imp), key=lambda t: -t[1])[:10]

    write_report(args, manifest, results, best, versions, iso_version, top_imp, len(ytr), ytr.mean(), len(yte), yte.mean())
    (args.report.with_suffix(".json")).write_text(json.dumps(
        {"generated_at": run_ts.isoformat(timespec="seconds"), "dataset": manifest["dataset"], "dataset_kind": manifest["kind"],
         "test_from": args.test_from, "selected_classifier": versions[best], "anomaly_model": iso_version, "results": results},
        indent=2), encoding="utf-8")
    print(f"Report: {args.report.relative_to(ROOT)}")


def write_report(args, manifest, results, best, versions, iso_version, top_imp, ntr, ftr, nte, fte) -> None:
    k = f"top{int(TOP_K*100)}pct"
    order = ["SQL rules (existing trigger)", "LogisticRegression", "RandomForest", "XGBoost", "IsolationForest"]
    L = [
        "# Phase 2: model comparison", "",
        f"> **Dataset: `{manifest['dataset']}` ({manifest['kind'].upper()}).** These metrics show the pipeline works.",
        "> They do not estimate real-world accuracy (see `datasets/README.md`, Known limitations).", "",
        f"- Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')} by `training/train.py`",
        f"- Time-based split: train on claims before **{args.test_from}** ({ntr:,} claims, {ftr:.2%} fraud); "
        f"test on later claims ({nte:,}, {fte:.2%} fraud)",
        "- Model selection: 5-fold stratified CV PR-AUC on the training period only. The holdout was used once, for this report.",
        "- Classifier threshold: the one that maximises F1 on out-of-fold training predictions.",
        "- Isolation Forest: trained and thresholded **without labels** (flags the most unusual 5% of the training period).",
        "", "## Holdout results", "",
        f"| Model | CV PR-AUC | PR-AUC | ROC-AUC | Precision | Recall | F1 | Flagged | Precision@{k} | Recall@{k} |",
        "|---|---|---|---|---|---|---|---|---|---|",
    ]
    for n in order:
        r = results[n]
        cv = f"{r['cv_pr_auc_mean']:.3f} ± {r['cv_pr_auc_std']:.3f}" if "cv_pr_auc_mean" in r else "—"
        L.append(f"| {n}{' ✅' if n == best else ''} | {cv} | {r['pr_auc']:.3f} | {r['roc_auc']:.3f} | {r['precision']:.3f} | "
                 f"{r['recall']:.3f} | {r['f1']:.3f} | {r['flagged']} | {r['precision_' + k]:.3f} | {r['recall_' + k]:.3f} |")
    L += ["", "PR-AUC is the main metric because fraud is rare: a classifier that never flags anything would still be ~92% accurate.", "",
          "### Existing SQL rules, one by one (seed thresholds)", "",
          "| Rule | Share of claims flagged | Precision |", "|---|---|---|"]
    L += [f"| {r} | {v['hit_rate']:.1%} | {v['precision']:.3f} |" for r, v in results[order[0]]["per_rule"].items()]
    L += ["", "The fixed count thresholds were set for a 35-claim demo database. At realistic volume, the count rules "
          "(especially Provider Overuse) flag a large share of legitimate claims. That is why the hybrid engine (Phase 4) "
          "treats rule hits as one weighted signal rather than a verdict. The rules still add value: they beat every ML "
          "model on `claim_burst` below.", "",
          "## Recall by fraud pattern (holdout)", "", "| Pattern | " + " | ".join(order) + " |", "|---|" + "---|" * len(order)]
    for p in sorted(results["XGBoost"]["pattern_recall"]):
        L.append(f"| `{p}` | " + " | ".join(f"{results[n]['pattern_recall'].get(p, 0):.2f}" for n in order) + " |")
    L += ["", "## Selected models", "",
          f"- **Classifier:** `{versions[best]}` ({best}), the highest CV PR-AUC",
          f"- **Anomaly detector:** `{iso_version}` (IsolationForest)",
          "- Artifacts: `ml_service/artifacts/` (git-ignored, reproducible by re-running this script)", "",
          f"## Top features: {best} (built-in importance; per-claim SHAP comes in Phase 3)", "",
          "| Feature | Importance |", "|---|---|"]
    L += [f"| `{f}` | {v:.4f} |" for f, v in top_imp]
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text("\n".join(L) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
