"""
Saving/loading trained artifacts (joblib + JSON). Layout:

artifacts/<run_id>/
  reference_stats.joblib            fitted preprocessing statistics (development providers only)
  provider_<Model>.joblib           {"model", "feature_names", "threshold", "params"} per supervised model
  provider_volume_baseline.joblib   volume-only baseline
  isolation_forest.joblib           claim-level anomaly bundle
  metadata.json                     selection, thresholds, features, dataset and label caveats, versions
  cv_results.json, oof_predictions.csv, ablation_results.json, test_results.json
artifacts/LATEST                    run_id of the most recent completed training run
"""
from __future__ import annotations

import json
from pathlib import Path

import joblib

from .config import ARTIFACTS_DIR


def run_dir(run_id: str) -> Path:
    d = ARTIFACTS_DIR / run_id
    d.mkdir(parents=True, exist_ok=True)
    return d


def save_joblib(run_id: str, name: str, obj) -> None:
    joblib.dump(obj, run_dir(run_id) / f"{name}.joblib")


def save_json(run_id: str, name: str, obj) -> None:
    (run_dir(run_id) / f"{name}.json").write_text(json.dumps(obj, indent=2, default=str), encoding="utf-8")


def mark_latest(run_id: str) -> None:
    (ARTIFACTS_DIR / "LATEST").write_text(run_id, encoding="utf-8")


def latest_run_id() -> str:
    p = ARTIFACTS_DIR / "LATEST"
    if not p.exists():
        raise FileNotFoundError("No trained run found; run training/train.py first")
    return p.read_text(encoding="utf-8").strip()


def load_json(run_id: str, name: str) -> dict:
    return json.loads((ARTIFACTS_DIR / run_id / f"{name}.json").read_text(encoding="utf-8"))


def load_joblib(run_id: str, name: str):
    return joblib.load(ARTIFACTS_DIR / run_id / f"{name}.joblib")
