"""Render reports/shap_explanations.md from computed SHAP results (no hand-typed numbers)."""
from __future__ import annotations


def render(r: dict) -> str:
    c, st = r["checks"], r["stability_dev_vs_test"]
    G, groups = r["global_importance_test"], r["group_importance_test"]
    L: list[str] = []
    w = L.append
    w("# Phase 3: SHAP explanations for the provider-level XGBoost model\n")
    w(f"_Generated {r['generated_utc']} by `training/explain_shap.py` for run `{r['run_id']}` "
      f"(SHAP {r['shap_version']}, XGBoost {r['xgboost_version']}). The model was not retrained "
      f"(SHA-256 `{r['model_sha256'][:16]}…`, unchanged: {c['model_file_unchanged']})._\n")
    w("> **How to read these explanations**")
    w("> - They explain the **provider-level risk score** of the Phase 2 XGBoost model only. They do not apply to individual claims "
      "or to the Isolation Forest.")
    w("> - A SHAP value shows how much a feature moved **this model's** output for a provider. It is **not a causal effect** and "
      "**not evidence of fraud**.")
    w("> - The model reproduces the dataset's `PotentialFraud` provider labels, whose provenance is **undocumented**.\n")

    w("## 1. Scale, base value and interpretation\n")
    w(f"- **Explainer:** {r['explainer']}. No background sample is needed, and results are deterministic.")
    w("- **Output scale:** the model's raw output, **log-odds**. For each provider: "
      "`log-odds = base value + Σ SHAP values`, and `risk score = sigmoid(log-odds)` (the same as `predict_proba`).")
    w(f"- **Base value:** {r['base_value_log_odds']:+.4f} log-odds, i.e. a score of {r['base_score']:.3f}. This is the model's "
      "average output over its training data (tree cover).")
    w(f"- **Why the base score is {r['base_score']:.2f} although about 9% of providers are labelled \"Yes\":** the model was trained "
      "with class weighting (`scale_pos_weight`), which shifts its output upward. **The risk score is a ranking score, not a "
      f"calibrated probability.** The decision threshold ({r['threshold']:.3f}) was chosen on development out-of-fold predictions (Phase 2).")
    w("- A positive SHAP value raises the score above the base; a negative value lowers it. Values add up exactly, so "
      "contributions can be compared in log-odds.\n")

    w("## 2. Consistency checks (all labelled providers)\n")
    w("| Check | Result |\n|---|---|")
    w(f"| Providers checked | {c['n_providers']:,} |")
    w(f"| Feature order matches the model's input features | {c['feature_order_matches_model']} |")
    w(f"| max \\|base + Σ SHAP − model log-odds\\| | {c['max_abs_additivity_error_log_odds']:.1e} |")
    w(f"| max \\|sigmoid(base + Σ SHAP) − model risk score\\| | {c['max_abs_score_error']:.1e} |")
    w(f"| max \\|SHAP − XGBoost's built-in exact contributions\\| | {c['max_abs_diff_vs_xgboost_native_contribs']:.1e} |")
    w(f"| max \\|score − Phase 2 inference score (`fraud_ml/predict.py`)\\| | {c['max_abs_diff_vs_phase2_inference_scores']:.1e} |")
    w(f"| Identical values from two independent explainer instances | {c['reproducible_across_explainer_instances']} |")
    w(f"| Saved model file unchanged | {c['model_file_unchanged']} |\n")

    w("## 3. Global feature importance (held-out test providers)\n")
    w("![SHAP summary](shap/global/summary_beeswarm.png)\n")
    w("![Mean |SHAP|](shap/global/importance_bar.png)\n")
    w("Mean |SHAP| = average size of a feature's effect on the log-odds. *Direction* comes from the correlation between the feature's "
      "value and its SHAP value across providers. This describes the model's learned pattern, not a causal relationship.\n")
    w("| Rank | Feature | Group | Mean \\|SHAP\\| | Share | Direction | What it measures |\n|---|---|---|---|---|---|---|")
    for g in G[:15]:
        w(f"| {g['rank']} | `{g['feature']}` | {g['group']} | {g['mean_abs_shap']:.3f} | {g['share_of_total']:.1%} | {g['direction']} | {g['description']} |")
    w(f"\nThe remaining {len(G) - 15} features account for {sum(g['share_of_total'] for g in G[15:]):.1%} of total mean |SHAP|. "
      "The full table is in `shap_explanations.json`.\n")
    top3 = sum(g["share_of_total"] for g in G[:3])
    w(f"**Concentration:** the top 3 features account for {top3:.0%} of total mean |SHAP|, and the top 10 for "
      f"{sum(g['share_of_total'] for g in G[:10]):.0%}.\n")
    w(f"**Stability:** the ranking computed on development providers agrees with the test-provider ranking "
      f"(Spearman ρ = {st['spearman_mean_abs_shap']:.3f}; {st['top10_overlap']}/10 of the top-10 features shared).\n")

    w("## 4. Contribution by feature group\n")
    w("![Group contribution](shap/global/group_contribution.png)\n")
    w("Group contribution = the absolute value of the **sum** of a group's SHAP values for each provider (valid because SHAP values add up), "
      "averaged over test providers. A group whose features push in opposite directions can therefore show a smaller total than "
      "its individual features suggest.\n")
    w("| Group | Features | Mean \\|group SHAP\\| | Share | Mean signed group SHAP |\n|---|---|---|---|---|")
    for g in groups:
        w(f"| {g['group']} | {g['n_features']} | {g['mean_abs_group_shap']:.3f} | {g['share']:.1%} | {g['mean_group_shap']:+.3f} |")
    w("\nFeature groups follow `docs/FEATURES.md`. \"Fitted\" = training-reference features (code rarity, amount vs typical "
      "for the diagnosis/DRG). This grouping is finer than the Phase 2 ablation groups. Ablation measures performance lost "
      "when a group is removed; SHAP measures how much the trained model's output moves. The two answer different questions and need not rank groups identically.\n")

    w("## 5. Individual provider explanations (illustrative examples)\n")
    w("Examples were chosen by a fixed rule from the held-out test providers: the highest-scored provider, the highest-scored "
      "flagged provider labelled \"No\", and the lowest-scored provider labelled \"Yes\". They illustrate the output and are not "
      "a sample of typical cases. Explanations are generated from the model's actual prediction and SHAP values.\n")
    for pid, e in r["examples"].items():
        w(f"### {pid}: {e['selection_rule']}\n")
        w(f"Dataset label: **{e['label']}** · risk score **{e['risk_score']:.3f}** · threshold {e['threshold']:.3f} · "
          f"{'flagged' if e['flagged'] else 'not flagged'}\n")
        w("| # | Feature | Value | Above this share of development providers | SHAP (log-odds) | Effect |\n|---|---|---|---|---|---|")
        for i, t in enumerate(e["top_contributions"], 1):
            w(f"| {i} | `{t['feature']}` | {t['value']:.4g} | {t['dev_percentile']:.0%} | {t['shap_log_odds']:+.3f} | {t['direction']} |")
        w(f"| | *all other features* | | | {e['other_features_shap_log_odds']:+.3f} | |\n")
        w(f"![waterfall](shap/providers/{pid}_waterfall.png)\n")
        w("Generated explanation:\n")
        w("```text\n" + e["summary"] + "\n```\n")

    w("## 6. Limitations\n")
    w("- SHAP explains the model, not the world. A feature with a large SHAP value is one the model relies on, not one that causes fraud.")
    w("- Correlated features (e.g. inpatient-related features, claim-volume features) can share or swap credit. Interpret individual "
      "feature values within their group.")
    w("- Tree-path-dependent SHAP follows the model's training-data structure. Values for unusual providers are less certain.")
    w("- Scores are class-weighted ranking scores, not calibrated probabilities.")
    w("- Explanations inherit every Phase 2 limitation: provider-level labels of undocumented provenance, a strong link with provider "
      "size and inpatient mix, 2008–09 ICD-9 era data, and dataset-specific features the application database does not have.")
    w("- Explanations cover provider-level scores only. The claim-level Isolation Forest is separate and not explained here.\n")
    w("## 7. Reproduce\n")
    w("```bash\n.venv/Scripts/python.exe training/explain_shap.py                          # this report and all figures\n"
      ".venv/Scripts/python.exe scripts/explain_provider.py --provider PRV51001 --top 10   # one provider\n```")
    return "\n".join(L)
