"""Unit tests for the Kaggle provider-fraud pipeline, on small hand-built fixtures
(test inputs only; they are not data and are never used for training).

Run from ml_service/:  .venv/Scripts/python.exe -m unittest discover -s tests -v
"""
import sys
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fraud_ml import preprocessing, splits  # noqa: E402
from fraud_ml.config import CHRONIC_COLS, DIAG_COLS, EXCLUDED_INPUTS, PROC_COLS  # noqa: E402
from fraud_ml.features_claim import FEATURES as CLAIM_FEATURES, claim_matrix  # noqa: E402
from fraud_ml.features_provider import FEATURES, SPEC, provider_matrix, provider_static_features  # noqa: E402
from fraud_ml.features_reference import ReferenceStats  # noqa: E402


def raw_claims(rows):
    """rows: (claim, bene, provider, start, end, amount, dx1, inpatient)"""
    out = []
    for cid, bene, prov, s, e, amt, dx, ip in rows:
        r = {"ClaimID": cid, "BeneID": bene, "Provider": prov, "ClaimStartDt": pd.Timestamp(s), "ClaimEndDt": pd.Timestamp(e),
             "InscClaimAmtReimbursed": np.float32(amt), "AttendingPhysician": "PHY1", "OperatingPhysician": None,
             "OtherPhysician": None, "DeductibleAmtPaid": np.float32(0), "ClmAdmitDiagnosisCode": None,
             "AdmissionDt": pd.Timestamp(s) if ip else pd.NaT, "DischargeDt": pd.Timestamp(e) if ip else pd.NaT,
             "DiagnosisGroupCode": "100" if ip else None, "is_inpatient": np.int8(ip)}
        r.update({c: None for c in DIAG_COLS + PROC_COLS})
        r["ClmDiagnosisCode_1"] = dx
        out.append(r)
    df = pd.DataFrame(out)
    for c in ["BeneID", "Provider", "AttendingPhysician", "OperatingPhysician", "OtherPhysician", "ClmAdmitDiagnosisCode",
              "DiagnosisGroupCode"] + DIAG_COLS + PROC_COLS:
        df[c] = df[c].astype("category")
    return df


def bene_table(ids):
    b = pd.DataFrame({"BeneID": ids, "DOD": pd.NaT, "RenalDiseaseIndicator": "0", "State": np.int16(1),
                      "NoOfMonths_PartACov": np.int8(12), "NoOfMonths_PartBCov": np.int8(12),
                      "IPAnnualReimbursementAmt": np.float32(0), "OPAnnualReimbursementAmt": np.float32(-50)})
    for c in CHRONIC_COLS:
        b[c] = np.int8(2)
    b.loc[0, "ChronicCond_Cancer"] = 1
    return b


ROWS = [  # B1 at P1: three claims, two on the same day; B2 at P1 and P2; exact resubmission at P2
    ("C1", "B1", "P1", "2009-01-01", "2009-01-01", 100, "4019", 0),
    ("C2", "B1", "P1", "2009-01-11", "2009-01-11", 100, "4019", 0),
    ("C3", "B1", "P1", "2009-01-11", "2009-01-11", 300, "2724", 0),
    ("C4", "B2", "P1", "2009-03-01", "2009-03-05", 9000, "4019", 1),
    ("C5", "B2", "P2", "2009-02-01", "2009-02-01", 0, "V5866", 0),
    ("C6", "B2", "P2", "2009-02-01", "2009-02-01", 0, "V5866", 0),
]


class PreprocessingTests(unittest.TestCase):
    def setUp(self):
        self.b = preprocessing.clean_beneficiaries(bene_table(["B1", "B2"]))
        self.c = preprocessing.add_patient_history(preprocessing.build_claim_table(raw_claims(ROWS), self.b))

    def test_beneficiary_cleaning(self):
        self.assertEqual(self.b.set_index("BeneID").loc["B1", "chronic_count"], 1)   # 1 = present, 2 = absent
        self.assertTrue((self.b["op_annual_amt"] >= 0).all())                        # negatives clipped
        self.assertTrue((self.b["annual_amount_negative"] == 1).all())
        for banned in ("Race", "Gender", "DOB", "County"):
            self.assertNotIn(banned, self.b.columns)

    def test_history_uses_only_earlier_dates(self):
        h = self.c.set_index("ClaimID")
        self.assertTrue(np.isnan(h.loc["C1", "days_since_prev_claim"]))
        self.assertEqual(h.loc["C2", "days_since_prev_claim"], 10)
        self.assertEqual(h.loc["C3", "days_since_prev_claim"], 10)   # same-day C2 is NOT "previous"
        self.assertEqual(h.loc["C3", "prior_claims_30d"], 1)          # only C1 (earlier date)
        self.assertEqual(h.loc["C4", "days_since_prev_claim"], 28)    # B2's earlier claims at another provider count
        self.assertEqual(h.loc["C1", "prior_claims_30d"], 0)


class ProviderFeatureTests(unittest.TestCase):
    def setUp(self):
        b = preprocessing.clean_beneficiaries(bene_table(["B1", "B2"]))
        self.c = preprocessing.add_patient_history(preprocessing.build_claim_table(raw_claims(ROWS), b))
        self.static = provider_static_features(self.c)

    def test_spec_matches_columns_and_excludes_inputs(self):
        ref = ReferenceStats().fit(self.c)
        X = provider_matrix(self.static, self.c, ref, ["P1", "P2"])
        self.assertEqual(list(X.columns), list(SPEC))
        self.assertFalse(X.isna().any().any())
        for name in FEATURES:
            tokens = set(name.lower().split("_"))       # whole name parts ("coverage" is not "age")
            for banned in ("race", "gender", "sex", "fraud", "label", "potential", "age", "dob", "county", "y"):
                self.assertNotIn(banned, tokens, name)
        self.assertIn("PotentialFraud", EXCLUDED_INPUTS)

    def test_gaps_same_day_and_duplicates(self):
        p1, p2 = self.static.loc["P1"], self.static.loc["P2"]
        self.assertEqual(p1["median_days_between_patient_claims"], 5.0)   # B1 gaps at P1: 10, 0 -> median 5; B2 has one claim
        self.assertAlmostEqual(p1["share_same_day_repeat"], 2 / 4)         # C2, C3
        self.assertAlmostEqual(p2["share_near_duplicate"], 1 / 2)          # C6 repeats C5
        self.assertAlmostEqual(p1["share_inpatient"], 1 / 4)
        self.assertEqual(p2["share_inpatient"], 0)
        self.assertEqual(p2["ip_los_mean"], 0)                             # documented default when no inpatient claims
        self.assertAlmostEqual(p2["share_zero_amount"], 1.0)
        self.assertEqual(p1["patient_mean_n_providers"], 1.5)              # B1 uses 1 provider, B2 uses 2

    def test_reference_stats_only_see_fit_claims(self):
        ref = ReferenceStats().fit(self.c[self.c["Provider"] == "P1"])     # "training provider" = P1 only
        self.assertNotIn("V5866", ref.dx_count)                           # P2's code unseen
        X = provider_matrix(self.static, self.c, ref, ["P2"])
        self.assertEqual(X.loc["P2", "share_rare_primary_dx"], 1.0)
        self.assertEqual(X.loc["P2", "mean_log_amount_vs_dx_ref"], 0.0)   # zero-paid claims excluded from price ratio

    def test_unfitted_reference_refuses(self):
        with self.assertRaises(RuntimeError):
            ReferenceStats().claim_signals(self.c)


class ClaimFeatureTests(unittest.TestCase):
    def test_claim_matrix(self):
        b = preprocessing.clean_beneficiaries(bene_table(["B1", "B2"]))
        c = preprocessing.add_patient_history(preprocessing.build_claim_table(raw_claims(ROWS), b))
        X = claim_matrix(c, ReferenceStats().fit(c))
        self.assertEqual(list(X.columns), CLAIM_FEATURES)
        self.assertFalse(X.isna().any().any())
        for banned in ("Provider", "provider", "annual"):
            self.assertFalse(any(banned in col for col in X.columns))


class SplitTests(unittest.TestCase):
    def test_provider_level_stratified_split(self):
        rng = np.random.default_rng(0)
        labels = pd.DataFrame({"Provider": [f"P{i}" for i in range(1000)], "y": (rng.random(1000) < 0.1).astype("int8")})
        s = splits.make_splits(labels)
        self.assertTrue(s["Provider"].is_unique)
        self.assertEqual(set(s["Provider"]), set(labels["Provider"]))
        self.assertAlmostEqual((s["split"] == "test").mean(), 0.15, delta=0.01)
        self.assertNotIn("y", s.columns)
        m = s.merge(labels, on="Provider")
        rates = m.groupby(["split", "fold"])["y"].mean()
        self.assertLess(rates.max() - rates.min(), 0.03)                  # stratified
        pd.testing.assert_frame_equal(s, splits.make_splits(labels))      # deterministic


if __name__ == "__main__":
    unittest.main()
