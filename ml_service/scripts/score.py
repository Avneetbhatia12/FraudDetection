"""
Score providers and/or claims with SAVED artifacts (inference only, no retraining).

    .venv/Scripts/python.exe scripts/score.py --providers test                 # held-out test providers
    .venv/Scripts/python.exe scripts/score.py --claims --percentile 99         # claim anomaly flags, top 1% per claim type

Writes CSVs to artifacts/<run_id>/. Provider `risk_score` values are uncalibrated ranking scores for matching
the dataset's provider-level PotentialFraud label (undocumented provenance). They are not probabilities of
fraud and not verified fraud findings.
Claim flags mean "unusual for its claim type", not fraud.
"""
import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from fraud_ml import artifacts  # noqa: E402
from fraud_ml.cv import dev_test_providers  # noqa: E402
from fraud_ml.pipeline import prepare  # noqa: E402
from fraud_ml.predict import Predictor  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--providers", choices=["test", "dev", "all"])
    ap.add_argument("--model", default=None, help="LogisticRegression | RandomForest | XGBoost (default: selected)")
    ap.add_argument("--claims", action="store_true")
    ap.add_argument("--percentile", type=float, default=None, help="anomaly threshold percentile per claim type (default 95)")
    ap.add_argument("--run", default=None)
    a = ap.parse_args()
    if not a.providers and not a.claims:
        ap.error("choose --providers and/or --claims")
    pred = Predictor(a.run)
    prep = prepare()
    out = artifacts.run_dir(pred.run_id)
    if a.providers:
        dev, test = dev_test_providers(prep)
        ids = {"test": test, "dev": dev, "all": dev + test}[a.providers]
        s = pred.score_providers(prep.static, prep.claims, ids, model=a.model)
        path = out / f"provider_scores_{a.providers}.csv"
        s.to_csv(path, index=False)
        print(f"{len(s)} providers scored with {s['model'].iloc[0]}; {int(s['flagged'].sum())} above threshold -> {path}")
    if a.claims:
        s = pred.score_claims(prep.claims, percentile=a.percentile)
        path = out / f"claim_anomalies_p{a.percentile or 95:g}.csv"
        s.to_csv(path, index=False)
        print(f"{len(s):,} claims scored; {int(s['is_anomaly'].sum()):,} flagged as unusual -> {path}")


if __name__ == "__main__":
    main()
