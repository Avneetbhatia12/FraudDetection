"""
Leakage-safe feature matrices for cross-validation and the final fit.

For every CV fold, ReferenceStats (code rarity, typical amounts, network counts) is
fitted on the fold's TRAINING providers' claims only; validation providers are then
featurised against it. The final model uses ReferenceStats fitted on all development
providers; test providers never contribute to any fitted statistic.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from .config import N_FOLDS
from .features_provider import provider_matrix
from .features_reference import ReferenceStats
from .pipeline import Prepared, claims_of


@dataclass
class Fold:
    k: int
    X_train: pd.DataFrame
    y_train: np.ndarray
    X_val: pd.DataFrame
    y_val: np.ndarray


def labels_for(prep: Prepared, providers) -> np.ndarray:
    return prep.labels.set_index("Provider").loc[list(providers), "y"].to_numpy()


def dev_test_providers(prep: Prepared) -> tuple[list, list]:
    s = prep.splits
    return s.loc[s["split"] == "dev", "Provider"].tolist(), s.loc[s["split"] == "test", "Provider"].tolist()


def build_cv_folds(prep: Prepared) -> list[Fold]:
    dev = prep.splits[prep.splits["split"] == "dev"]
    folds = []
    for k in range(N_FOLDS):
        tr = dev.loc[dev["fold"] != k, "Provider"].tolist()
        va = dev.loc[dev["fold"] == k, "Provider"].tolist()
        ref = ReferenceStats().fit(claims_of(prep, tr))          # training providers of this fold only
        X = provider_matrix(prep.static, prep.claims, ref, tr + va)
        folds.append(Fold(k, X.loc[tr], labels_for(prep, tr), X.loc[va], labels_for(prep, va)))
    return folds


def build_final_matrices(prep: Prepared) -> tuple[ReferenceStats, pd.DataFrame, np.ndarray, pd.DataFrame, np.ndarray]:
    dev, test = dev_test_providers(prep)
    ref = ReferenceStats().fit(claims_of(prep, dev))             # development providers only
    X = provider_matrix(prep.static, prep.claims, ref, dev + test)
    return ref, X.loc[dev], labels_for(prep, dev), X.loc[test], labels_for(prep, test)
