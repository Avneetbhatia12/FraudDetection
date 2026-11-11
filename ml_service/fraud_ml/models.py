"""Supervised provider-level model definitions and their (deliberately small) tuning grids."""
from __future__ import annotations

import numpy as np
from sklearn.base import BaseEstimator, TransformerMixin
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from xgboost import XGBClassifier

from .config import SEED

MODEL_NAMES = ["LogisticRegression", "RandomForest", "XGBoost"]

# Small grids: tuned by 5-fold CV PR-AUC on the development providers only.
GRIDS: dict[str, list[dict]] = {
    "LogisticRegression": [{"C": 0.01}, {"C": 0.1}, {"C": 1.0}],
    "RandomForest": [{"max_depth": None, "min_samples_leaf": 1}, {"max_depth": None, "min_samples_leaf": 5},
                     {"max_depth": 10, "min_samples_leaf": 1}, {"max_depth": 10, "min_samples_leaf": 5}],
    "XGBoost": [{"max_depth": 3, "n_estimators": 300}, {"max_depth": 3, "n_estimators": 600},
                {"max_depth": 5, "n_estimators": 300}, {"max_depth": 5, "n_estimators": 600}],
}


class Winsorizer(BaseEstimator, TransformerMixin):
    """Clip each feature to its training 1st/99th percentile (for the scale-sensitive linear model only)."""

    def __init__(self, lower: float = 1.0, upper: float = 99.0):
        self.lower, self.upper = lower, upper

    def fit(self, X, y=None):
        X = np.asarray(X, dtype=float)
        self.lo_, self.hi_ = np.percentile(X, self.lower, axis=0), np.percentile(X, self.upper, axis=0)
        return self

    def transform(self, X):
        return np.clip(np.asarray(X, dtype=float), self.lo_, self.hi_)


def make_model(name: str, params: dict, pos_weight: float):
    """Class imbalance: class_weight='balanced' (LR), 'balanced_subsample' (RF), scale_pos_weight (XGB)."""
    if name == "LogisticRegression":
        return Pipeline([("winsorize", Winsorizer()), ("scale", StandardScaler()),
                         ("clf", LogisticRegression(class_weight="balanced", max_iter=5000, random_state=SEED, **params))])
    if name == "RandomForest":
        return RandomForestClassifier(n_estimators=500, class_weight="balanced_subsample", n_jobs=-1,
                                      random_state=SEED, **params)
    if name == "XGBoost":
        return XGBClassifier(learning_rate=0.05, subsample=0.8, colsample_bytree=0.8, min_child_weight=1,
                             scale_pos_weight=pos_weight, eval_metric="aucpr", tree_method="hist", n_jobs=-1,
                             random_state=SEED, **params)
    raise ValueError(name)
