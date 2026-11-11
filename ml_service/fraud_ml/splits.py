"""
Provider-level splits: a stratified 15% final test set, then stratified 5-fold CV
on the remaining 85%. Each provider appears exactly once; all of its claims follow it.

The split depends only on (provider list, labels, seed), so it is reproducible.
The final test set must not be used for feature selection, tuning or thresholds.
"""
from __future__ import annotations

import pandas as pd
from sklearn.model_selection import StratifiedKFold, train_test_split

from .config import N_FOLDS, SEED, SPLITS_FILE, TEST_SIZE


def make_splits(labels: pd.DataFrame) -> pd.DataFrame:
    """Return Provider, split ('dev' | 'test'), fold (0..N-1 for dev, -1 for test). No label column."""
    dev, test = train_test_split(labels, test_size=TEST_SIZE, stratify=labels["y"], random_state=SEED)
    dev = dev.reset_index(drop=True)
    folds = pd.Series(-1, index=dev.index, dtype="int8")
    skf = StratifiedKFold(n_splits=N_FOLDS, shuffle=True, random_state=SEED)
    for k, (_, va) in enumerate(skf.split(dev, dev["y"])):
        folds.iloc[va] = k
    out = pd.concat([
        pd.DataFrame({"Provider": dev["Provider"], "split": "dev", "fold": folds}),
        pd.DataFrame({"Provider": test["Provider"].to_numpy(), "split": "test", "fold": -1}),
    ], ignore_index=True)
    assert out["Provider"].is_unique, "provider assigned to more than one split"
    return out.sort_values("Provider").reset_index(drop=True)


def load_or_create_splits(labels: pd.DataFrame) -> pd.DataFrame:
    splits = make_splits(labels)
    if SPLITS_FILE.exists():
        saved = pd.read_csv(SPLITS_FILE, dtype={"Provider": "string"})
        if not saved.reset_index(drop=True).astype(str).equals(splits.astype(str)):
            raise RuntimeError(f"{SPLITS_FILE} differs from the deterministic split; refusing to continue. "
                               "Delete it only if you intend to change the split.")
    else:
        splits.to_csv(SPLITS_FILE, index=False)
    return splits
