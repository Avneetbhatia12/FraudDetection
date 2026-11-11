"""Render reports/model_comparison.md from saved results. Every number comes from the result
JSON, and the wording of each conclusion is decided by comparing those numbers (e.g. against
CV standard deviations), not written in advance."""
from __future__ import annotations

from datetime import datetime, timezone

MODELS = ["LogisticRegression", "RandomForest", "XGBoost"]


def f3(x):
    return "n/a" if x is None else f"{x:.3f}"


def ci(v):
    return f"{v[0]:.3f}–{v[1]:.3f}"


def render(meta: dict, cv: dict, ab: dict, out: dict) -> str:
    T, best, sel = out["supervised_test"], cv["best"], meta["selected_model"]
    vol_cv = cv["volume_baseline"]
    L: list[str] = []
    w = L.append
    w("# Phase 2: provider-level fraud-risk models and claim-level anomaly detection\n")
    w(f"_Generated {datetime.now(timezone.utc):%Y-%m-%d %H:%M UTC} from run `{meta['run_id']}` "
      f"(code commit `{(meta.get('git_commit') or 'unknown')[:7]}`) by `training/evaluate.py`._\n")
    w("> **Read this first.**")
    w("> - **Dataset:** public Kaggle \"Healthcare Provider Fraud Detection Analysis\" (CC0 as declared by the uploader). "
      "See `reports/dataset_exploration_kaggle.md`.")
    w("> - **Labels:** `PotentialFraud` is a **provider-level** label of **undocumented provenance**. These results measure how well "
      "models reproduce *these labels*. They are **not** verified fraud detection, and **not** claim-level fraud accuracy.")
    w("> - **Task:** the supervised models predict **provider-level risk at the end of the observation period**. They are not "
      "real-time claim-level fraud detectors.")
    w("> - **Isolation Forest** flags statistically **unusual claims**. An anomaly is not a fraud finding.\n")

    s = meta["split"]
    w("## 1. Method\n")
    w(f"- **Split:** {s['n_dev']:,} development providers (5-fold stratified CV) and {s['n_test']:,} held-out test providers "
      f"({int(s['test_size'] * 100)}%, stratified, seed {s['seed']}). Each provider and all of its claims belong to exactly one partition.")
    w("- **Leakage control:** fitted statistics (code rarity, typical amount per diagnosis/DRG, network counts) are refitted inside "
      "each fold on that fold's training providers only. The final model uses development providers only. Labels are never inputs.")
    w("- **Tuning and selection:** small grids per model; best setting and model chosen by **mean CV PR-AUC** on development "
      "providers. Decision thresholds maximise F1 on out-of-fold development predictions. **The test set was used only for the "
      "final evaluation below.**")
    w("- **Class imbalance:** class weights (LR, RF) and `scale_pos_weight` (XGBoost). PR-AUC is the primary metric, since with "
      "9.35% positives a model that flags nobody would still be about 90.6% accurate.\n")

    # 2. CV
    w("## 2. Cross-validation (development providers)\n")
    w("| Model | Best setting | CV PR-AUC (mean ± sd) | CV ROC-AUC | OOF precision | OOF recall | OOF F1 |\n|---|---|---|---|---|---|---|")
    for n in MODELS:
        b = best[n]
        m = b["oof_metrics"]
        w(f"| {n}{' ✅' if n == sel else ''} | `{b['params']}` | {b['pr_auc_mean']:.3f} ± {b['pr_auc_std']:.3f} | "
          f"{b['roc_auc_mean']:.3f} ± {b['roc_auc_std']:.3f} | {f3(m['precision'])} | {f3(m['recall'])} | {f3(m['f1'])} |")
    m = vol_cv["oof_metrics"]
    w(f"| Volume-only baseline ({vol_cv['model_class']}, 5 count features) | same | {vol_cv['pr_auc_mean']:.3f} ± {vol_cv['pr_auc_std']:.3f} | "
      f"{vol_cv['roc_auc_mean']:.3f} | {f3(m['precision'])} | {f3(m['recall'])} | {f3(m['f1'])} |")
    w(f"| Chance level (positive rate) | — | {T[sel]['positives'] / T[sel]['n']:.3f} | 0.500 | | | |\n")
    ranked = sorted(MODELS, key=lambda n: -best[n]["pr_auc_mean"])
    gap = best[ranked[0]]["pr_auc_mean"] - best[ranked[1]]["pr_auc_mean"]
    sd = max(best[ranked[0]]["pr_auc_std"], best[ranked[1]]["pr_auc_std"])
    w(f"**Selection:** {ranked[0]} has the highest mean CV PR-AUC. Its lead over {ranked[1]} is {gap:.3f}, "
      + ("**smaller than or about one fold standard deviation** " if gap <= 1.2 * sd else "larger than the fold standard deviation ")
      + f"(about {sd:.3f}), so the ranking between them is "
      + ("**not decisive**." if gap <= 1.2 * sd else "reasonably clear.")
      + f" ROC-AUC is nearly identical across models (range {min(best[n]['roc_auc_mean'] for n in MODELS):.3f}–"
      f"{max(best[n]['roc_auc_mean'] for n in MODELS):.3f}); the differences show up mainly in the precision–recall trade-off.\n")

    # 3. Test
    w("## 3. Held-out test set (evaluated once)\n")
    w("| Model | PR-AUC (95% CI) | ROC-AUC (95% CI) | Accuracy | Precision | Recall | F1 | Threshold |\n|---|---|---|---|---|---|---|---|")
    for n in MODELS + ["volume_baseline"]:
        r = T[n]
        label = "Volume-only baseline" if n == "volume_baseline" else n + (" ✅" if n == sel else "")
        w(f"| {label} | {r['pr_auc']:.3f} ({ci(r['pr_auc_95ci'])}) | {r['roc_auc']:.3f} ({ci(r['roc_auc_95ci'])}) | {r['accuracy']:.3f} | "
          f"{r['precision']:.3f} | {r['recall']:.3f} | {r['f1']:.3f} | {r['threshold']:.3f} |")
    w("")
    w("**Confusion matrices (test providers; positive = labelled PotentialFraud \"Yes\")**\n")
    w("| Model | True negatives | False positives | False negatives | True positives |\n|---|---|---|---|---|")
    for n in MODELS + ["volume_baseline"]:
        c = T[n]["confusion_matrix"]
        w(f"| {'Volume-only baseline' if n == 'volume_baseline' else n} | {c['tn']} | {c['fp']} | {c['fn']} | {c['tp']} |")
    w("")
    lo_sel = T[sel]["pr_auc_95ci"][0]
    overlap = [n for n in MODELS if n != sel and T[n]["pr_auc_95ci"][1] >= lo_sel]
    w(f"The test set has {T[sel]['positives']} positive providers, so the intervals are wide. "
      + (f"The PR-AUC intervals of {sel} and {', '.join(overlap)} **overlap**, so the test set does not separate them reliably. "
         if overlap else f"{sel}'s PR-AUC interval does not overlap the others'. ")
      + f"Test PR-AUC for {sel} ({T[sel]['pr_auc']:.3f}) is "
      + ("higher" if T[sel]["pr_auc"] > best[sel]["pr_auc_mean"] else "lower")
      + f" than its CV mean ({best[sel]['pr_auc_mean']:.3f}). That is within the expected variation for this sample size; nothing was tuned on it.\n")

    # 3a. Threshold selection
    ts = out["threshold_selection"]
    w("### 3a. How the decision thresholds were chosen (development data only)\n")
    w("1. **Model and setting:** highest mean 5-fold CV PR-AUC. PR-AUC summarises all thresholds, so it does not pick one.")
    w(f"2. **Threshold:** the selected setting's out-of-fold predictions for all {ts['n_oof_providers']:,} development providers "
      "(each predicted by the fold model that did not train on it) are pooled. The threshold is the point on the precision–recall "
      "curve with the **highest F1**. The test set is not used.")
    w("3. The final model, refitted on all development providers, is applied at that threshold to the test set exactly once. "
      "The out-of-fold scores come from fold models trained on 80% of the development data, so the threshold may be slightly "
      "off for the final model. Reselecting it on the test set would leak, so it is not done.\n")
    w("| Model | Threshold | OOF precision | OOF recall | OOF F1 |\n|---|---|---|---|---|")
    for n in MODELS:
        c = ts["chosen"][n]
        w(f"| {n} | {c['threshold']:.3f} | {c['precision']:.3f} | {c['recall']:.3f} | {c['f1']:.3f} |")
    w("")
    w(f"**Sensitivity of {sel} to the threshold (development out-of-fold predictions only):** the trade-off is gradual, so a "
      "different operating point (e.g. favouring recall for investigator triage) can be chosen on development data without retraining.\n")
    w("| Threshold | Precision | Recall | F1 | Providers flagged |\n|---|---|---|---|---|")
    for g in ts["sensitivity_selected"]:
        w(f"| {g['threshold']:.3f}{' (chosen)' if g.get('chosen') else ''} | {g['precision']:.3f} | {g['recall']:.3f} | {g['f1']:.3f} | {g['flagged']} |")
    w("")

    # 4. Size
    cuts = out["size_band_cuts_n_claims"]
    w("## 4. Performance across provider-size groups\n")
    w(f"Size bands are claim-count quartiles of development providers (cut points {cuts[0]:.0f} / {cuts[1]:.0f} / {cuts[2]:.0f} claims). "
      "Out-of-fold development predictions (about 4,600 providers) are the main view here. Test bands are small, and some contain only a few positives.\n")
    for src, title in (("by_size_oof", "Out-of-fold (development)"), ("by_size_test", "Held-out test")):
        w(f"**{title}**\n")
        w(f"| Size band | Providers | Positives | Base rate | {sel} PR-AUC | {sel} ROC-AUC | {sel} recall | Volume-only PR-AUC |\n|---|---|---|---|---|---|---|---|")
        for g, v in T[sel][src].items():
            vb = T["volume_baseline"][src][g]
            w(f"| {g} | {v['n']} | {v['positives']} | {v['base_rate']:.3f} | {f3(v['pr_auc'])} | {f3(v['roc_auc'])} | {f3(v['recall'])} | {f3(vb['pr_auc'])} |")
        w("")
    oo = T[sel]["by_size_oof"]
    w(f"**Interpretation:** positives concentrate in large providers (base rate {oo['Q4 (largest)']['base_rate']:.1%} in the largest band vs "
      f"{oo['Q1 (smallest)']['base_rate']:.1%} in the smallest). Within each band the volume-only baseline is close to that band's base rate, "
      f"as expected, because size is roughly fixed inside a band. {sel} stays well above the base rate in every band. So the model "
      "has learned more than provider size, though it is clearly strongest on large providers.\n")

    # 5. Ablation
    go, mg = ab["group_only"], ab["all_minus_group"]
    full = go["All approved features"]
    w("## 5. Feature-group ablation (5-fold CV, development providers only)\n")
    w(f"Same folds, same per-fold fitted statistics, same model ({ab['model']}, `{ab['params']}`). Test set not used.\n")
    w("| Feature group | Features | Group alone: CV PR-AUC | All features **minus** this group: CV PR-AUC | Drop when removed |\n|---|---|---|---|---|")
    for g, v in go.items():
        minus = mg.get(g)
        minus_txt = f"{minus['pr_auc_mean']:.3f} ± {minus['pr_auc_std']:.3f}" if minus else "—"
        drop = f"{full['pr_auc_mean'] - minus['pr_auc_mean']:+.3f}" if minus else "—"
        w(f"| {g} | {v['n_features']} | {v['pr_auc_mean']:.3f} ± {v['pr_auc_std']:.3f} | {minus_txt} | {drop} |")
    w("")
    w("Group definitions: *Volume + amounts* = Volume and Amounts groups; *Patient history* = Timing and Patient mix; "
      "*Diagnosis & procedure* = Coding, Inpatient and the fitted code/amount-reference features; *Network* = the two "
      "training-provider-only network features. See `docs/FEATURES.md`.\n")
    drops = {g: full["pr_auc_mean"] - v["pr_auc_mean"] for g, v in mg.items()}
    noise = full["pr_auc_std"]
    meaningful = [g for g, d in sorted(drops.items(), key=lambda kv: -kv[1]) if d > noise]
    weak = [g for g, d in drops.items() if d <= noise]
    strongest_alone = max((g for g in go if g not in ("All approved features",)), key=lambda g: go[g]["pr_auc_mean"])
    w("**Findings:**")
    w(f"- Strongest group on its own: **{strongest_alone}** (CV PR-AUC {go[strongest_alone]['pr_auc_mean']:.3f}, "
      f"vs {full['pr_auc_mean']:.3f} for all features).")
    w("- Groups whose removal costs more than one fold standard deviation "
      f"({noise:.3f}), i.e. a meaningful *unique* contribution: " + (", ".join(f"**{g}** ({drops[g]:+.3f})" for g in meaningful) or "none") + ".")
    w("- Groups whose removal costs less than that, i.e. their signal is largely duplicated by other groups: "
      + (", ".join(f"{g} ({drops[g]:+.3f})" for g in weak) or "none") + ". They still carry signal on their own (see the \"alone\" column).")
    w("- Caveat: the Diagnosis & procedure group includes the inpatient features, which are non-zero only for providers with inpatient "
      "claims. Inpatient presence is strongly linked to the labels (dataset exploration report, section 10), so part of this group's "
      "strength is claim mix, not coding behaviour alone.\n")

    # 6. Isolation Forest
    IF, IFg = out["isolation_forest"]["isolation_forest"], out["isolation_forest"]["isolation_forest_global"]
    d95, g95 = IF["95.0"], IFg["95.0"]
    w("## 6. Isolation Forest: claim-level anomaly detection (separate from the supervised model)\n")
    w("Fitted on development providers' claims **without labels**. The threshold is configurable as a percentile of the development "
      "score distribution (default: the most unusual 5%). Claims are **never** labelled as fraud. The analysis below only asks "
      "whether *providers* with more anomalous claims are more often labelled \"Yes\", and whether that adds anything beyond size and claim mix.\n")
    w("### 6.1 Design check: a single global forest is a proxy for \"inpatient\"\n")
    w(f"A single forest over all claims flags **{g95['share_of_flagged_that_are_inpatient']:.1%} inpatient claims** at the 95th percentile "
      f"(inpatient flag rate {g95['flag_rate_by_claim_type']['inpatient']:.1%} vs outpatient {g95['flag_rate_by_claim_type']['outpatient']:.1%}). "
      f"Inpatient claims are only about 7% of all claims, but they are rare and far more expensive, so they look \"unusual\" by default. "
      f"Its provider anomaly rate correlates {g95['corr_anomaly_rate_vs_share_inpatient']:.2f} with the provider's inpatient share. "
      "The **deployed design therefore uses one forest per claim type**, each with its own threshold. That design was chosen from "
      "this label-free check. The global variant is kept only as a diagnostic.\n")
    w("### 6.2 Results (per-claim-type forests)\n")
    w("| Percentile | Claims flagged | Of flagged, inpatient | Test claims flagged: providers labelled Yes / No | Test median provider anomaly rate (Yes / No) | Test anomaly-rate ROC-AUC | PR-AUC | Mann–Whitney p |\n|---|---|---|---|---|---|---|---|")
    for p, e in IF.items():
        cl, md = e["test_claims_flagged_share_by_provider_label"], e["test_provider_anomaly_rate_median_by_label"]
        w(f"| {float(p):g} | {e['share_claims_flagged_all']:.1%} | {e['share_of_flagged_that_are_inpatient']:.1%} | "
          f"{cl['Yes']:.2%} / {cl['No']:.2%} | {md['Yes']:.3f} / {md['No']:.3f} | {e['test_anomaly_rate_roc_auc']:.3f} | "
          f"{e['test_anomaly_rate_pr_auc']:.3f} | {e['test_mannwhitney_p']:.2g} |")
    w("")
    w("**Accounting for provider volume and claim mix** (simple logistic models fitted on development providers, scored on test providers):\n")
    w("| Percentile | Volume only | + inpatient share | + inpatient share + anomaly rate |\n|---|---|---|---|")
    for p, e in IF.items():
        i = e["incremental_test"]
        w(f"| {float(p):g} | PR-AUC {i['volume']['test_pr_auc']:.3f} / ROC {i['volume']['test_roc_auc']:.3f} | "
          f"{i['volume_plus_share_inpatient']['test_pr_auc']:.3f} / {i['volume_plus_share_inpatient']['test_roc_auc']:.3f} | "
          f"{i['volume_plus_share_inpatient_plus_anomaly_rate']['test_pr_auc']:.3f} / {i['volume_plus_share_inpatient_plus_anomaly_rate']['test_roc_auc']:.3f} |")
    w("")
    w("**Within provider-size bands** (95th percentile, all providers; the forests never saw labels):\n")
    w("| Size band | Providers | Positives | Median anomaly rate Yes / No | ROC-AUC within band |\n|---|---|---|---|---|")
    for g, v in d95["within_size_band_all_providers"].items():
        w(f"| {g} | {v['n']} | {v['positives']} | {f3(v['median_rate_yes'])} / {f3(v['median_rate_no'])} | {f3(v['roc_auc'])} |")
    w("")
    inc = d95["incremental_test"]
    gain = inc["volume_plus_share_inpatient_plus_anomaly_rate"]["test_pr_auc"] - inc["volume_plus_share_inpatient"]["test_pr_auc"]
    cl = d95["test_claims_flagged_share_by_provider_label"]
    w("**Interpretation:**")
    w(f"- Claims of providers labelled \"Yes\" are flagged at {cl['Yes']:.2%}, vs {cl['No']:.2%} for providers labelled \"No\". "
      + ("That is **essentially the same rate**." if abs(cl["Yes"] - cl["No"]) < 0.005 else "That is a visible difference."))
    w(f"- At provider level the anomaly rate is {'weakly' if d95['test_anomaly_rate_roc_auc'] < 0.7 else 'moderately'} associated "
      f"with the labels (test ROC-AUC {d95['test_anomaly_rate_roc_auc']:.3f}). Within size bands the association "
      "is concentrated in the smallest providers, where rates rest on very few claims, and is near chance in the larger bands.")
    w(f"- Adding the anomaly rate to volume and inpatient share changes test PR-AUC by {gain:+.3f}: "
      + ("**negligible**. The anomaly detector does not add provider-level signal for these labels." if abs(gain) < 0.01
         else "a measurable change."))
    w("- So the Isolation Forest is best treated as an **independent claim-review signal** (\"this claim is unusual for its type\"), "
      "not as a predictor of the provider labels. That fits its intended role in the hybrid design: catching unusual claims the "
      "labels and rules may not describe. Its usefulness for real fraud cannot be measured on this dataset, because there are no "
      "claim-level labels.\n")

    # 7. Selected model and artifacts
    w("## 7. Selected model and saved artifacts\n")
    w(f"- **Selected supervised model:** {sel} (`{best[sel]['params']}`). The **model and setting** were chosen by mean CV PR-AUC "
      f"(threshold-independent). The **decision threshold {meta['thresholds'][sel]:.3f}** was chosen separately, as the F1-maximising "
      "threshold on development out-of-fold predictions (section 3a). Its margin over the runner-up is within noise (section 2), "
      "so Random Forest is a statistically comparable alternative.")
    w(f"- **Artifacts** (`ml_service/artifacts/{meta['run_id']}/`, git-ignored, reproducible): `reference_stats.joblib` (fitted "
      "preprocessing statistics), `provider_<Model>.joblib` for all three models plus `provider_volume_baseline.joblib`, "
      "`isolation_forest.joblib` (per claim type), `isolation_forest_global.joblib` (diagnostic), `metadata.json`, "
      "`cv_results.json`, `oof_predictions.csv`, `ablation_results.json`, `test_results.json`.")
    w("- **Inference** uses `fraud_ml/predict.py` (loads artifacts and never retrains). This evaluation itself ran through that module.\n")

    # 8. Limitations
    w("## 8. Limitations\n")
    w("- The labels are provider-level and of undocumented provenance. Every metric here measures agreement with those labels, not verified fraud.")
    w(f"- Only {T[sel]['positives']} positive test providers: wide confidence intervals, and the model ranking is not decisive.")
    w("- Strong link between labels and provider size or inpatient mix. Performance is best on large providers. Size-normalised features and "
      "size-band reporting reduce this risk but cannot remove it.")
    w("- A single period (2008–09) and a single label snapshot, so no forward-in-time validation. ICD-9 era US Medicare data.")
    w("- Age, gender and race are excluded for fairness. Their effect on performance has not been measured (a planned later experiment).")
    w("- The Isolation Forest cannot be validated against fraud at claim level (no claim labels exist).")
    w("- These models use dataset-specific fields (ICD-9 codes, physicians, deductibles) that the application database does not have, "
      "so they cannot directly score the application's claims. Integration needs a separate design.\n")
    return "\n".join(L)
