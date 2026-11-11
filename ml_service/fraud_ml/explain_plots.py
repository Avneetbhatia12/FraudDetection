"""SHAP visualisations (headless). All values plotted come from ProviderExplainer."""
from __future__ import annotations

from pathlib import Path

import matplotlib

matplotlib.use("Agg")  # no display needed
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
import shap  # noqa: E402

RAISE, LOWER = "#c0392b", "#2c7fb8"
SCALE_NOTE = "SHAP values on the model's log-odds scale (not causal; not evidence of fraud)"


def _save(path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    plt.savefig(path, dpi=120, bbox_inches="tight")
    plt.close("all")
    return path


def summary_beeswarm(exp: shap.Explanation, path: Path, max_display: int = 20) -> Path:
    shap.summary_plot(exp.values, exp.data, feature_names=exp.feature_names, max_display=max_display, show=False)
    plt.title(f"SHAP summary: top {max_display} features\n{SCALE_NOTE}", fontsize=10)
    return _save(path)


def importance_bar(exp: shap.Explanation, path: Path, max_display: int = 20) -> Path:
    shap.summary_plot(exp.values, exp.data, feature_names=exp.feature_names, plot_type="bar", max_display=max_display, show=False)
    plt.title(f"Mean |SHAP value|: top {max_display} features\n{SCALE_NOTE}", fontsize=10)
    return _save(path)


def group_bar(groups: pd.DataFrame, path: Path) -> Path:
    g = groups.sort_values("mean_abs_group_shap")
    fig, ax = plt.subplots(figsize=(7, 4))
    ax.barh(g["group"], g["mean_abs_group_shap"], color="#555")
    for y, (v, s) in enumerate(zip(g["mean_abs_group_shap"], g["share"])):
        ax.text(v, y, f"  {s:.0%}", va="center", fontsize=9)
    ax.set_xlabel("Mean |sum of group SHAP values| (log-odds)")
    ax.set_title("Contribution by feature group\n" + SCALE_NOTE, fontsize=10)
    return _save(path)


def waterfall(exp_row: shap.Explanation, path: Path, title: str, max_display: int = 11) -> Path:
    shap.plots.waterfall(exp_row, max_display=max_display, show=False)
    plt.title(title + "\n" + SCALE_NOTE, fontsize=10, pad=34)   # leave room for SHAP's f(x) label
    return _save(path)


def contribution_bar(explanation: dict, path: Path) -> Path:
    c = list(reversed(explanation["top_contributions"]))
    vals = [x["shap_log_odds"] for x in c]
    labels = [f"{x['feature']} = {x['value']:.3g}" for x in c]
    fig, ax = plt.subplots(figsize=(8, 0.45 * len(c) + 1.5))
    ax.barh(labels, vals, color=[RAISE if v > 0 else LOWER for v in vals])
    ax.axvline(0, color="black", linewidth=0.8)
    ax.set_xlabel("SHAP value (log-odds); red raises the risk score, blue lowers it")
    ax.set_title(f"Provider {explanation['provider']}: risk score {explanation['risk_score']:.3f} "
                 f"(threshold {explanation['threshold']:.3f})\n{SCALE_NOTE}", fontsize=10)
    lim = max(np.abs(vals)) * 1.15 if vals else 1
    ax.set_xlim(-lim, lim)
    return _save(path)
