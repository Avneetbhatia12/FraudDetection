"""Evaluation metrics for imbalanced provider-level classification."""
from __future__ import annotations

import numpy as np
from sklearn.metrics import (accuracy_score, average_precision_score, confusion_matrix, f1_score,
                             precision_recall_curve, precision_score, recall_score, roc_auc_score)

from .config import SEED


def threshold_max_f1(y, p) -> float:
    """Threshold maximising F1; chosen on out-of-fold development predictions, never on the test set."""
    prec, rec, thr = precision_recall_curve(y, p)
    f1 = 2 * prec[:-1] * rec[:-1] / np.maximum(prec[:-1] + rec[:-1], 1e-12)
    return float(thr[int(np.argmax(f1))])


def _r(x, n=4):
    return None if x is None else round(float(x), n)


def classification_metrics(y, p, threshold: float) -> dict:
    y, p = np.asarray(y), np.asarray(p)
    pred = (p >= threshold).astype(int)
    both = len(np.unique(y)) == 2
    tn, fp, fn, tp = confusion_matrix(y, pred, labels=[0, 1]).ravel()
    return {
        "n": int(len(y)), "positives": int(y.sum()), "threshold": _r(threshold),
        "accuracy": _r(accuracy_score(y, pred)),
        "precision": _r(precision_score(y, pred, zero_division=0)),
        "recall": _r(recall_score(y, pred, zero_division=0)),
        "f1": _r(f1_score(y, pred, zero_division=0)),
        "roc_auc": _r(roc_auc_score(y, p)) if both else None,
        "pr_auc": _r(average_precision_score(y, p)) if both else None,
        "confusion_matrix": {"tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp)},
        "flagged": int(pred.sum()),
    }


def bootstrap_ci(y, p, n_boot: int = 1000, alpha: float = 0.05) -> dict:
    """Stratified bootstrap 95% CIs for PR-AUC and ROC-AUC (small positive count -> wide intervals)."""
    y, p = np.asarray(y), np.asarray(p)
    rng = np.random.default_rng(SEED)
    pos, neg = np.flatnonzero(y == 1), np.flatnonzero(y == 0)
    pr, roc = [], []
    for _ in range(n_boot):
        idx = np.r_[rng.choice(pos, len(pos)), rng.choice(neg, len(neg))]
        pr.append(average_precision_score(y[idx], p[idx]))
        roc.append(roc_auc_score(y[idx], p[idx]))
    q = [100 * alpha / 2, 100 * (1 - alpha / 2)]
    return {"pr_auc_95ci": [_r(v) for v in np.percentile(pr, q)], "roc_auc_95ci": [_r(v) for v in np.percentile(roc, q)]}
