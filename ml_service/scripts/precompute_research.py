"""
Precompute research (Track 1) explanations for every Kaggle provider, for the FastAPI research endpoints.

Writes artifacts/<run_id>/research/provider_explanations.json (git-ignored). Uses the saved Phase 2 model
and Phase 3 explainer (no retraining). These are explanations of PUBLIC US MEDICARE (Kaggle) providers only.
They are never computed for, or applied to, the application's providers or claims.

    .venv/Scripts/python.exe scripts/precompute_research.py
"""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from fraud_ml import artifacts  # noqa: E402
from fraud_ml.explain import ProviderExplainer  # noqa: E402
from fraud_ml.pipeline import prepare  # noqa: E402

TOP_K = 10


def main() -> None:
    ex = ProviderExplainer(prepare())
    ids = list(ex.X.index)
    batch = ex.shap_values(ids)                               # one exact batch computation (with additivity check)
    for i, pid in enumerate(ids):
        ex._cache[pid] = batch[i]
    out = {"run_id": ex.run_id, "generated_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
           "dataset": "Public US Medicare data (Kaggle: Healthcare Provider Fraud Detection Analysis)",
           "applies_to_live_application_data": False, "top_k": TOP_K,
           "explanations": {pid: ex.explain(pid, top_k=TOP_K) for pid in ids}}
    d = artifacts.run_dir(ex.run_id) / "research"
    d.mkdir(exist_ok=True)
    (d / "provider_explanations.json").write_text(json.dumps(out), encoding="utf-8")
    print(f"Wrote {len(ids)} research explanations to {d / 'provider_explanations.json'}")


if __name__ == "__main__":
    main()
