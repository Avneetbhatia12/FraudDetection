"""
File-based model registry.

artifacts/
  registry.json                 {"active": {"classifier": ver, "anomaly": ver}, "models": [metadata...]}
  <version>/model.joblib        {"model", "feature_builder", "feature_names", "threshold", ...}
  <version>/metadata.json       mirrors the ML_MODEL table columns (synced to MySQL in Phase 4)

Artifacts are git-ignored; they are reproducible from training/train.py.
"""
from __future__ import annotations

import json
from pathlib import Path

import joblib

ARTIFACTS = Path(__file__).resolve().parents[1] / "artifacts"
REGISTRY = ARTIFACTS / "registry.json"


def _read() -> dict:
    if REGISTRY.exists():
        return json.loads(REGISTRY.read_text(encoding="utf-8"))
    return {"active": {}, "models": []}


def save(version: str, bundle: dict, metadata: dict) -> Path:
    d = ARTIFACTS / version
    d.mkdir(parents=True, exist_ok=True)
    joblib.dump(bundle, d / "model.joblib")
    (d / "metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    reg = _read()
    reg["models"] = [m for m in reg["models"] if m["model_version"] != version] + [metadata]
    REGISTRY.write_text(json.dumps(reg, indent=2), encoding="utf-8")
    return d


def set_active(role: str, version: str) -> None:
    reg = _read()
    if not any(m["model_version"] == version and m["model_role"] == role for m in reg["models"]):
        raise ValueError(f"No {role} model with version {version}")
    reg["active"][role] = version
    for m in reg["models"]:
        if m["model_role"] == role:
            m["is_active"] = m["model_version"] == version
    REGISTRY.write_text(json.dumps(reg, indent=2), encoding="utf-8")


def load_active(role: str) -> tuple[dict, dict]:
    reg = _read()
    version = reg["active"].get(role)
    if not version:
        raise FileNotFoundError(f"No active {role} model; run training/train.py")
    d = ARTIFACTS / version
    return joblib.load(d / "model.joblib"), json.loads((d / "metadata.json").read_text(encoding="utf-8"))
