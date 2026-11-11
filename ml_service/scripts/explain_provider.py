"""
Explain one provider's risk score with SHAP (saved Phase 2 XGBoost model; no retraining).

    .venv/Scripts/python.exe scripts/explain_provider.py --provider PRV51001
    .venv/Scripts/python.exe scripts/explain_provider.py --provider PRV51001 --top 5 --plots

Prints the generated explanation and writes JSON (+ optional waterfall and contribution plots)
to artifacts/<run_id>/explanations/<provider>/. Exit code 2 for an unknown or invalid provider.
Explanations describe how the model scored a provider. They are not causal and not evidence of fraud.
"""
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from fraud_ml import artifacts  # noqa: E402
from fraud_ml.explain import ProviderExplainer  # noqa: E402
from fraud_ml.pipeline import prepare  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--provider", required=True)
    ap.add_argument("--top", type=int, default=10)
    ap.add_argument("--plots", action="store_true")
    ap.add_argument("--run", default=None)
    a = ap.parse_args()
    ex = ProviderExplainer(prepare(), a.run)
    try:
        e = ex.explain(a.provider, top_k=a.top)
    except (KeyError, ValueError, TypeError) as err:
        print(f"error: {err.args[0] if err.args else err}", file=sys.stderr)
        return 2
    out = artifacts.run_dir(ex.run_id) / "explanations" / e["provider"]
    out.mkdir(parents=True, exist_ok=True)
    (out / "explanation.json").write_text(json.dumps(e, indent=2), encoding="utf-8")
    print(e["summary"])
    if a.plots:
        from fraud_ml import explain_plots as P
        P.waterfall(ex.shap_values([e["provider"]])[0], out / "waterfall.png", f"Provider {e['provider']}: score {e['risk_score']:.3f}")
        P.contribution_bar(e, out / "contributions.png")
    print(f"\nSaved to {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
