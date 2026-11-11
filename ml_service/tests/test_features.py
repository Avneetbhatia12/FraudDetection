"""Run: .venv/Scripts/python.exe -m unittest discover -s tests -v  (from ml_service/)"""
import sys
import unittest
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from app.features import FEATURE_NAMES, FeatureBuilder  # noqa: E402

POLICIES = pd.DataFrame([{"POLICY_ID": 1, "POLICY_TYPE": "Individual", "START_DATE": "2024-01-01", "END_DATE": "2024-12-31",
                          "COVERAGE_AMOUNT": 50000, "PATIENT_ID": 1}])
PATIENTS = pd.DataFrame([{"PATIENT_ID": 1, "GENDER": "Female", "DOB": "1990-01-01"}])
PROVIDERS = pd.DataFrame([{"PROVIDER_ID": 1, "PROVIDER_TYPE": "Clinic"}, {"PROVIDER_ID": 2, "PROVIDER_TYPE": "Dental"}])


def claims(rows):
    return pd.DataFrame(rows, columns=["CLAIM_ID", "CLAIM_DATE", "CLAIM_AMOUNT", "DIAGNOSIS", "POLICY_ID", "PROVIDER_ID"])


BASE = claims([(1, "2024-03-01", 500, "Flu", 1, 1), (2, "2024-03-10", 520, "Flu", 1, 1),
               (3, "2024-03-12", 520, "Flu", 1, 1), (4, "2024-05-01", 400, "Flu", 1, 1)])


class FeatureTests(unittest.TestCase):
    def setUp(self):
        self.fb = FeatureBuilder().fit(BASE, POLICIES, PATIENTS, PROVIDERS)

    def X(self, c):
        return self.fb.transform(c, POLICIES, PATIENTS, PROVIDERS)

    def test_columns_and_no_leakage(self):
        X = self.X(BASE.assign(IS_FRAUD=1, STATUS="Rejected", APPROVED_AMOUNT=0))  # extra cols must be ignored
        self.assertEqual(list(X.columns), FEATURE_NAMES)
        for banned in ("IS_FRAUD", "FRAUD_PATTERN", "STATUS", "APPROVED_AMOUNT", "CLAIM_ID"):
            self.assertNotIn(banned, X.columns)
        self.assertFalse(X.isna().any().any())

    def test_window_counts_only_look_back(self):
        X = self.X(BASE)
        self.assertEqual(X.loc[1, "policy_claims_30d"], 1)  # later claims must not count
        self.assertEqual(X.loc[3, "policy_claims_30d"], 3)
        self.assertEqual(X.loc[4, "policy_claims_30d"], 1)

    def test_near_duplicate_and_policy_period(self):
        c = pd.concat([BASE, claims([(5, "2024-03-14", 520, "Flu", 1, 1), (6, "2025-02-01", 500, "Flu", 1, 1)])])
        X = self.X(c)
        self.assertEqual(X.loc[1, "near_duplicate_7d"], 0)
        self.assertGreaterEqual(X.loc[5, "near_duplicate_7d"], 1)    # same bill re-sent 2 days later
        self.assertEqual(X.loc[6, "outside_policy_period"], 1)
        self.assertEqual(X.loc[1, "outside_policy_period"], 0)

    def test_provider_mismatch_and_unseen_diagnosis(self):
        X = self.X(pd.concat([BASE, claims([(7, "2024-06-01", 500, "Flu", 1, 2),               # Dental billing Flu
                                            (8, "2024-06-02", 500, "Brain Tumor Removal", 1, 1)])]))  # unseen diagnosis
        self.assertEqual(X.loc[7, "provider_diag_compat"], 0.0)
        self.assertEqual(X.loc[1, "provider_diag_compat"], 1.0)
        self.assertGreater(X.loc[8, "provider_diag_compat"], 0.0)       # neutral fallback, not "mismatch"
        self.assertFalse(X.isna().any().any())

    def test_mysql_types_accepted(self):
        from datetime import date
        from decimal import Decimal
        # mysql2/PyMySQL return DECIMAL as Decimal and DATE as datetime.date
        c = BASE.assign(CLAIM_AMOUNT=[Decimal(f"{a:.2f}") for a in BASE["CLAIM_AMOUNT"]],
                        CLAIM_DATE=[date.fromisoformat(d) for d in BASE["CLAIM_DATE"]])
        pd.testing.assert_frame_equal(self.X(c), self.X(BASE))

    def test_unfitted_builder_refuses(self):
        with self.assertRaises(RuntimeError):
            FeatureBuilder().transform(BASE, POLICIES, PATIENTS, PROVIDERS)


class RegistryTests(unittest.TestCase):
    def test_active_models_load_and_predict(self):
        from app import registry
        try:
            clf, meta = registry.load_active("classifier")
            iso, _ = registry.load_active("anomaly")
        except FileNotFoundError:
            self.skipTest("no trained artifacts; run training/train.py")
        X = clf["feature_builder"].transform(BASE, POLICIES, PATIENTS, PROVIDERS)
        p = clf["model"].predict_proba(X[clf["feature_names"]])[:, 1]
        self.assertTrue(((p >= 0) & (p <= 1)).all())
        self.assertEqual(meta["model_role"], "classifier")
        self.assertTrue(len(iso["model"].score_samples(X)) == len(X))


if __name__ == "__main__":
    unittest.main()
