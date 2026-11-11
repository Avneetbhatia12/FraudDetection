"""Phase 3 SHAP tests against the REAL saved Phase 2 model and data (skipped if absent).

Run from ml_service/:  .venv/Scripts/python.exe -m unittest tests.test_explain -v
"""
import hashlib
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
import xgboost as xgb

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from fraud_ml.config import ARTIFACTS_DIR, RAW_DIR  # noqa: E402
from fraud_ml.features_provider import FEATURES  # noqa: E402

HAVE_DATA = (ARTIFACTS_DIR / "LATEST").exists() and (RAW_DIR / "Train-1542865627584.csv").exists()


def model_hash():
    run = (ARTIFACTS_DIR / "LATEST").read_text().strip()
    return hashlib.sha256((ARTIFACTS_DIR / run / "provider_XGBoost.joblib").read_bytes()).hexdigest()


@unittest.skipUnless(HAVE_DATA, "trained artifacts / raw data not present")
class ExplainTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from fraud_ml.explain import ProviderExplainer
        from fraud_ml.pipeline import prepare
        cls.hash_before = model_hash()
        cls.prep = prepare()
        cls.ex = ProviderExplainer(cls.prep)
        rng = np.random.default_rng(0)
        cls.sample = list(rng.choice(np.array(cls.ex.X.index), 300, replace=False))
        cls.pid = cls.ex.test_ids[0]

    # ── technical correctness ───────────────────────────────────
    def test_feature_order_matches_model(self):
        self.assertEqual(self.ex.features, FEATURES)
        self.assertEqual(list(self.ex.model.get_booster().feature_names), self.ex.features)
        self.assertEqual(list(self.ex.X.columns), self.ex.features)

    def test_shap_consistent_with_model(self):
        e = self.ex.shap_values(self.sample)
        X = self.ex.X.loc[self.sample]
        margin = self.ex.model.predict(X, output_margin=True)
        self.assertLess(np.abs(e.base_values + e.values.sum(1) - margin).max(), 1e-4)
        p = self.ex.model.predict_proba(X)[:, 1]
        self.assertLess(np.abs(1 / (1 + np.exp(-(e.base_values + e.values.sum(1)))) - p).max(), 1e-5)
        native = self.ex.model.get_booster().predict(xgb.DMatrix(X), pred_contribs=True)
        np.testing.assert_allclose(native[:, :-1], e.values, atol=1e-6)
        np.testing.assert_allclose(e.base_values, self.ex.base_value, atol=1e-9)
        self.assertNotEqual(self.ex.base_value, 0.0)          # regression: base value must not be read before SHAP computes it

    def test_scores_match_phase2_inference(self):
        s = self.ex.predictor.score_providers(self.prep.static, self.prep.claims, self.sample[:50])
        for pid, score in zip(s["Provider"], s["risk_score"]):
            self.assertAlmostEqual(self.ex.explain(pid)["risk_score"], float(score), places=6)

    # ── global ──────────────────────────────────────────────────
    def test_global_importance(self):
        g = self.ex.global_importance(self.ex.test_ids)
        self.assertEqual(len(g), len(FEATURES))
        self.assertEqual(set(g["feature"]), set(FEATURES))
        self.assertTrue((np.diff(g["mean_abs_shap"].to_numpy()) <= 1e-12).all())   # sorted descending
        self.assertAlmostEqual(g["share_of_total"].sum(), 1.0, places=6)
        self.assertTrue(set(g["direction"]) <= {"higher values raise the score", "higher values lower the score", "mixed / non-monotonic"})
        groups = self.ex.group_importance(self.ex.test_ids)
        self.assertAlmostEqual(groups["share"].sum(), 1.0, places=6)
        self.assertEqual(groups["n_features"].sum(), len(FEATURES))

    # ── individual ──────────────────────────────────────────────
    def test_individual_explanation(self):
        for k in (5, 10):
            e = self.ex.explain(self.pid, top_k=k)
            c = e["top_contributions"]
            self.assertEqual(len(c), k)
            mags = [abs(x["shap_log_odds"]) for x in c]
            self.assertEqual(mags, sorted(mags, reverse=True))
            total = e["base_value_log_odds"] + sum(x["shap_log_odds"] for x in c) + e["other_features_shap_log_odds"]
            self.assertAlmostEqual(total, e["model_log_odds"], places=4)
            self.assertEqual(e["flagged"], e["risk_score"] >= e["threshold"])
            for x in c:
                self.assertEqual(x["direction"], "increases risk score" if x["shap_log_odds"] > 0 else "decreases risk score")
                self.assertTrue(0.0 <= x["dev_percentile"] <= 1.0)
                self.assertAlmostEqual(x["value"], float(self.ex.X.loc[self.pid, x["feature"]]), places=5)

    def test_narrative_generated_from_values(self):
        a, b = self.ex.explain(self.ex.test_ids[0]), self.ex.explain(self.ex.test_ids[1])
        for e in (a, b):
            s = e["summary"]
            self.assertIn(e["provider"], s)
            self.assertIn(f"{e['risk_score']:.3f}", s)
            self.assertIn(f"{e['threshold']:.3f}", s)
            self.assertIn(f"{e['base_value_log_odds']:+.3f}", s)
            for x in e["top_contributions"]:
                self.assertIn(f"{x['shap_log_odds']:+.3f}", s)
            self.assertIn("not causal", s)
            self.assertIn("not evidence of fraud", s)
        self.assertNotEqual(a["summary"], b["summary"])

    # ── invalid inputs ──────────────────────────────────────────
    def test_missing_and_invalid_providers(self):
        for bad in (None, 123, 1.5, ["PRV51001"]):
            with self.assertRaises(TypeError):
                self.ex.explain(bad)
        for bad in ("", "   "):
            with self.assertRaises(ValueError):
                self.ex.explain(bad)
        for unknown in ("PRV00000", "prv51001", "BENE11001"):
            with self.assertRaises(KeyError):
                self.ex.explain(unknown)
        for bad_k in (0, -1, len(FEATURES) + 1, 2.5, True, "5", None):
            with self.assertRaises(ValueError):
                self.ex.explain(self.pid, top_k=bad_k)
        self.assertEqual(self.ex.explain(f"  {self.pid}  ")["provider"], self.pid)   # surrounding spaces tolerated
        with self.assertRaises(KeyError):
            self.ex.shap_values([self.pid, "PRV00000"])

    def test_only_xgboost_explained(self):
        from fraud_ml.explain import ProviderExplainer
        with self.assertRaises(ValueError):
            ProviderExplainer(self.prep, model="RandomForest")

    # ── reproducibility ─────────────────────────────────────────
    def test_reproducible(self):
        from fraud_ml.explain import ProviderExplainer
        a = self.ex.explain(self.pid)
        b = self.ex.explain(self.pid)
        c = ProviderExplainer(self.prep).explain(self.pid)
        self.assertEqual(a, b)
        self.assertEqual(a["top_contributions"], c["top_contributions"])
        self.assertEqual(a["summary"], c["summary"])

    # ── plots ───────────────────────────────────────────────────
    def test_plots_written(self):
        from fraud_ml import explain_plots as P
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            e = self.ex.explain(self.pid)
            exp = self.ex.shap_values(self.ex.test_ids[:100])
            paths = [P.summary_beeswarm(exp, d / "s.png"), P.importance_bar(exp, d / "b.png"),
                     P.group_bar(self.ex.group_importance(self.ex.test_ids[:100]), d / "g.png"),
                     P.waterfall(self.ex.shap_values([self.pid])[0], d / "w.png", "t"), P.contribution_bar(e, d / "c.png")]
            for p in paths:
                self.assertTrue(p.exists() and p.stat().st_size > 5000, p)

    @classmethod
    def tearDownClass(cls):
        assert model_hash() == cls.hash_before, "saved model changed during tests"


if __name__ == "__main__":
    unittest.main()
