"""Shared data preparation for training and evaluation (no model fitting here)."""
from __future__ import annotations

from dataclasses import dataclass

import pandas as pd

from . import data, preprocessing, splits
from .features_provider import provider_static_features


@dataclass
class Prepared:
    claims: pd.DataFrame          # cleaned claim table with patient history (one row per claim)
    labels: pd.DataFrame          # Provider, y  (target only)
    splits: pd.DataFrame          # Provider, split, fold
    static: pd.DataFrame          # label-free provider features (index = Provider)


def prepare() -> Prepared:
    raw_claims = data.load_claims()
    bene = preprocessing.clean_beneficiaries(data.load_beneficiaries())
    claims = preprocessing.add_patient_history(preprocessing.build_claim_table(raw_claims, bene))
    del raw_claims
    labels = data.load_labels()
    sp = splits.load_or_create_splits(labels)
    static = provider_static_features(claims)
    missing = set(labels["Provider"]) - set(static.index)
    if missing:
        raise RuntimeError(f"{len(missing)} labelled providers have no claims")
    return Prepared(claims=claims, labels=labels, splits=sp, static=static)


def claims_of(prep: Prepared, providers) -> pd.DataFrame:
    """Claims belonging to the given providers (used to fit ReferenceStats on training providers only)."""
    return prep.claims[prep.claims["Provider"].isin(set(providers))]
