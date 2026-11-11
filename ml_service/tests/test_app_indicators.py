"""Phase 4.1 tests: application-native indicators (hand-built fixtures in the application's schema;
fixtures are test inputs only, never training data). A final test class runs read-only against the
live MySQL database if it is reachable (skipped otherwise).

Run from ml_service/:  .venv/Scripts/python.exe -m unittest tests.test_app_indicators -v
"""
import os
import sys
import unittest
from datetime import date
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from app_risk import config as C  # noqa: E402
from app_risk.data import SQL, AppData, normalize_diagnosis  # noqa: E402
from app_risk.indicators import CLAIM_SPEC, PROVIDER_SPEC, assess_claim, provider_profile, review_priority  # noqa: E402

POLICIES = pd.DataFrame([
    {"POLICY_ID": 1, "POLICY_TYPE": "Individual", "START_DATE": date(2024, 1, 1), "END_DATE": date(2024, 12, 31), "COVERAGE_AMOUNT": 10000, "PATIENT_ID": 100},
    {"POLICY_ID": 2, "POLICY_TYPE": "Family", "START_DATE": date(2024, 1, 1), "END_DATE": date(2024, 12, 31), "COVERAGE_AMOUNT": 50000, "PATIENT_ID": 100},  # same patient
    {"POLICY_ID": 3, "POLICY_TYPE": "Individual", "START_DATE": date(2024, 3, 1), "END_DATE": date(2024, 6, 30), "COVERAGE_AMOUNT": 20000, "PATIENT_ID": 200},
])
PROVIDERS = pd.DataFrame([{"PROVIDER_ID": i, "PROVIDER_TYPE": t} for i, t in [(1, "Clinic"), (2, "Clinic"), (3, "Dental")]])
NO_RULES = pd.DataFrame(columns=["CLAIM_ID", "RULE_ID", "RULE_NAME"])


def claims(rows):
    """rows: (claim_id, 'YYYY-MM-DD', amount, diagnosis, policy_id, provider_id)"""
    return pd.DataFrame(rows, columns=["CLAIM_ID", "CLAIM_DATE", "CLAIM_AMOUNT", "DIAGNOSIS", "POLICY_ID", "PROVIDER_ID"])


def data(rows, rule_hits=NO_RULES, policies=POLICIES, providers=PROVIDERS):
    return AppData.from_frames(claims(rows), policies, providers, rule_hits)


def ind(assessment, code):
    return next(i for i in assessment["indicators"] if i["code"] == code)


class DataSafetyTests(unittest.TestCase):
    def test_forbidden_columns_rejected(self):
        for col in ("STATUS", "APPROVED_AMOUNT"):
            c = claims([(1, "2024-02-01", 100, "Flu", 1, 1)]).assign(**{col: 0})
            with self.assertRaises(ValueError):
                AppData.from_frames(c, POLICIES, PROVIDERS, NO_RULES)
        with self.assertRaises(ValueError):
            AppData.from_frames(claims([]), POLICIES.assign(DOB="1990-01-01"), PROVIDERS, NO_RULES)

    def test_loader_sql_never_selects_forbidden_columns(self):
        for sql in SQL.values():
            for col in C.FORBIDDEN_COLUMNS:
                self.assertNotRegex(sql.upper(), rf"\b{col}\b")

    def test_diagnosis_normalization(self):
        self.assertEqual(normalize_diagnosis("  Back   PAIN "), "back pain")
        self.assertEqual(normalize_diagnosis(None), "")

    def test_dates_are_calendar_dates_not_shifted(self):
        """IST safety: date objects, ISO strings and naive timestamps give the same calendar day."""
        for v in (date(2024, 1, 10), "2024-01-10", pd.Timestamp("2024-01-10")):
            d = data([(1, v, 100, "Flu", 1, 1)])
            self.assertEqual(d.claims.loc[0, "CLAIM_DATE"], pd.Timestamp("2024-01-10"))
            self.assertIsNone(d.claims["CLAIM_DATE"].dt.tz)


class ClaimIndicatorTests(unittest.TestCase):
    def test_coverage_share(self):
        a = assess_claim(data([(1, "2024-02-01", 6000, "Flu", 1, 1), (2, "2024-02-01", 4000, "Flu", 1, 1)]), 1)
        self.assertEqual(ind(a, "coverage_share")["value"], 0.6)
        self.assertTrue(ind(a, "coverage_share")["triggered"])
        self.assertFalse(ind(assess_claim(data([(2, "2024-02-01", 4000, "Flu", 1, 1)]), 2), "coverage_share")["triggered"])

    def test_outside_policy_period(self):
        d = data([(1, "2024-02-28", 10, "Flu", 3, 1), (2, "2024-07-05", 10, "Flu", 3, 1), (3, "2024-04-01", 10, "Flu", 3, 1)])
        self.assertEqual(ind(assess_claim(d, 1), "outside_policy_period")["value"], 2)      # 2 days before start
        self.assertEqual(ind(assess_claim(d, 2), "outside_policy_period")["value"], 5)      # 5 days after end
        self.assertFalse(ind(assess_claim(d, 3), "outside_policy_period")["triggered"])

    def test_amount_vs_diagnosis_median_and_insufficient_history(self):
        hist = [(i, "2024-02-01", 100, "back pain" if i % 2 else "Back  Pain", 3, 2) for i in range(1, 5)]
        a = assess_claim(data(hist + [(10, "2024-03-01", 500, "BACK PAIN", 1, 1)]), 10)
        self.assertEqual(ind(a, "amount_vs_diagnosis_median")["status"], "insufficient_history")    # only 4 earlier
        self.assertIsNone(ind(a, "amount_vs_diagnosis_median")["triggered"])
        a = assess_claim(data(hist + [(5, "2024-02-02", 100, "back pain", 3, 2), (10, "2024-03-01", 500, "BACK PAIN", 1, 1)]), 10)
        i = ind(a, "amount_vs_diagnosis_median")
        self.assertEqual((i["status"], i["value"], i["triggered"]), ("ok", 5.0, True))

    def test_diagnosis_new_for_provider_type(self):
        hist = [(i, "2024-02-01", 50, "Flu", 3, 1 if i % 2 else 2) for i in range(1, 10)]     # 9 clinic claims
        d = data(hist + [(20, "2024-03-01", 50, "Fracture", 1, 1)])
        self.assertEqual(ind(assess_claim(d, 20), "diagnosis_new_for_provider_type")["status"], "insufficient_history")
        d = data(hist + [(10, "2024-02-01", 50, "Flu", 3, 2), (20, "2024-03-01", 50, "Fracture", 1, 1), (21, "2024-03-01", 50, "flu", 1, 1)])
        self.assertTrue(ind(assess_claim(d, 20), "diagnosis_new_for_provider_type")["triggered"])
        self.assertFalse(ind(assess_claim(d, 21), "diagnosis_new_for_provider_type")["triggered"])

    def test_patient_history_across_policies(self):
        d = data([(1, "2024-05-01", 10, "A", 1, 1), (2, "2024-05-10", 10, "B", 2, 2), (3, "2024-05-20", 10, "C", 1, 3),
                  (4, "2024-05-25", 10, "D", 2, 1), (5, "2024-03-01", 10, "E", 3, 1)])
        a = assess_claim(d, 4)
        self.assertEqual(ind(a, "patient_claims_prior_30d")["value"], 3)                   # claims 1-3, patient 100, two policies
        self.assertTrue(ind(a, "patient_claims_prior_30d")["triggered"])
        self.assertEqual(ind(a, "days_since_patient_previous_claim")["value"], 5)
        self.assertEqual(ind(assess_claim(d, 1), "days_since_patient_previous_claim")["status"], "not_applicable")

    def test_near_duplicates(self):
        d = data([(1, "2024-05-01", 1000, "Flu", 1, 1), (2, "2024-05-04", 1005, " flu", 2, 1), (3, "2024-05-04", 1100, "Flu", 1, 1)])
        self.assertEqual(ind(assess_claim(d, 2), "near_duplicate_claims")["value"], 1)       # same patient/provider/dx, 0.5% apart
        self.assertEqual(ind(assess_claim(d, 3), "near_duplicate_claims")["value"], 0)       # amount 10% different

    def test_provider_volume_surge(self):
        base = [(i, f"2024-{m:02d}-15", 10, "Flu", 3, 1) for i, m in enumerate([2, 3, 4, 5, 6], start=1)]
        burst = [(10 + i, "2024-11-1" + str(i), 10, "Flu", 3, 1) for i in range(4)]
        d = data(base + burst + [(20, "2024-11-20", 10, "Flu", 3, 1)])
        i = ind(assess_claim(d, 20), "provider_volume_surge")
        self.assertEqual(i["status"], "ok")
        self.assertTrue(i["triggered"])                                                     # 4 recent vs ~0.45 per 30 days
        self.assertEqual(ind(assess_claim(data(base[:4] + [(20, "2024-11-20", 10, "Flu", 3, 1)]), 20), "provider_volume_surge")["status"],
                         "insufficient_history")

    def test_no_look_ahead(self):
        """Claims inserted later (higher CLAIM_ID), even with earlier or identical dates, never change an earlier claim's result."""
        rows = [(1, "2024-05-01", 1000, "Flu", 1, 1), (2, "2024-05-10", 1000, "Flu", 1, 1)]
        before = assess_claim(data(rows), 2)
        later = rows + [(3, "2024-05-09", 1000, "Flu", 1, 1),      # back-dated, same patient/provider/dx: would be a "duplicate"
                        (4, "2024-05-10", 9999, "Flu", 2, 1),      # same day
                        (5, "2024-04-20", 50, "Flu", 1, 2)]        # earlier date
        after = assess_claim(data(later), 2)
        self.assertEqual(before, after)
        self.assertEqual(assess_claim(data(later), 3)["history_claims_used"], 2)

    def test_reproducible(self):
        d = data([(1, "2024-05-01", 1000, "Flu", 1, 1), (2, "2024-05-03", 1000, "Flu", 1, 1)])
        self.assertEqual(assess_claim(d, 2), assess_claim(d, 2))

    def test_rule_hits_and_priority(self):
        rh = pd.DataFrame([{"CLAIM_ID": 2, "RULE_ID": 1, "RULE_NAME": "High Claim Amount"}])
        a = assess_claim(data([(1, "2024-05-01", 10, "Flu", 1, 1), (2, "2024-05-03", 10, "Flu", 1, 1)], rule_hits=rh), 2)
        self.assertEqual(a["rule_hits"], [{"rule_id": 1, "rule_name": "High Claim Amount"}])
        self.assertEqual(a["review_priority"], "High")
        self.assertEqual(review_priority([], [{"reason": "x"}])[0], "Elevated")
        self.assertEqual(review_priority([], [{"reason": "x"}, {"reason": "y"}])[0], "High")
        self.assertEqual(review_priority([], [])[0], "Routine")

    def test_output_contract(self):
        a = assess_claim(data([(1, "2024-05-01", 10, "Flu", 1, 1)]), 1)
        self.assertEqual([i["code"] for i in a["indicators"]], list(CLAIM_SPEC))
        for i in a["indicators"]:
            self.assertIn(i["status"], {"ok", "insufficient_history", "not_applicable"})
            self.assertTrue(i["status"] == "ok" or i["triggered"] is None)
            self.assertTrue(i["reason"])
        for k in ("probability", "score", "hybrid"):
            self.assertFalse(any(k in key for key in a), k)
        self.assertIn("not machine-learning predictions", a["disclaimer"])

    def test_unknown_claim(self):
        with self.assertRaises(KeyError):
            assess_claim(data([(1, "2024-05-01", 10, "Flu", 1, 1)]), 99)


class ProviderProfileTests(unittest.TestCase):
    def test_insufficient_history_and_cutoff(self):
        d = data([(1, "2024-05-01", 10, "Flu", 1, 1), (2, "2024-05-03", 10, "Flu", 3, 1), (3, "2024-09-01", 10, "Flu", 1, 1)])
        p = provider_profile(d, 1, as_of="2024-06-30")
        self.assertEqual(p["claim_count"], 2)                                               # claim 3 after the cutoff
        get = {i["code"]: i for i in p["indicators"]}
        self.assertEqual(get["claim_count"]["value"], 2)
        self.assertEqual(get["claims_per_patient"]["status"], "insufficient_history")       # < 5 claims
        self.assertEqual(list(get), list(PROVIDER_SPEC))
        self.assertEqual(provider_profile(d, 3, as_of="2024-06-30")["profile_status"], "insufficient_data")

    def test_peer_comparison(self):
        pol = pd.DataFrame([{"POLICY_ID": i, "POLICY_TYPE": "Individual", "START_DATE": date(2024, 1, 1), "END_DATE": date(2024, 12, 31),
                             "COVERAGE_AMOUNT": 10000, "PATIENT_ID": i} for i in range(1, 200)])
        prov = pd.DataFrame([{"PROVIDER_ID": i, "PROVIDER_TYPE": "Clinic"} for i in range(1, 13)])
        rows, cid = [], 1
        for p in range(1, 12):                                                              # 11 normal peers: 5 patients x 1 claim
            for k in range(5):
                rows.append((cid, "2024-03-01", 10, "Flu", p * 10 + k, p)); cid += 1
        for k in range(6):                                                                  # provider 12: 2 patients, 6 claims
            rows.append((cid, f"2024-03-0{1 + k}", 10, "Flu", 150 + (k % 2), 12)); cid += 1
        d = AppData.from_frames(claims(rows), pol, prov, NO_RULES)
        get = {i["code"]: i for i in provider_profile(d, 12, as_of="2024-12-31")["indicators"]}
        self.assertEqual(get["claims_per_patient"]["status"], "ok")
        self.assertTrue(get["claims_per_patient"]["triggered"])                             # 3.0 vs peers' 1.0
        thin = {i["code"]: i for i in provider_profile(AppData.from_frames(claims(rows[-6:] + rows[:5]), pol, prov, NO_RULES), 12, "2024-12-31")["indicators"]}
        self.assertEqual(thin["claims_per_patient"]["status"], "insufficient_history")       # < 10 peers

    def test_unknown_provider(self):
        with self.assertRaises(KeyError):
            provider_profile(data([(1, "2024-05-01", 10, "Flu", 1, 1)]), 999)


def _db_settings():
    from app_risk.settings import Settings
    env = ROOT.parent / "backend" / ".env"
    if not os.environ.get("ML_ENV_FILE") and env.exists():
        os.environ["ML_ENV_FILE"] = str(env)
    return Settings.from_env()


def _db_available():
    try:
        import pymysql
        s = _db_settings()
        pymysql.connect(host=s.db_host, port=s.db_port, user=s.db_user, password=s.db_password, database=s.db_name, connect_timeout=2).close()
        return True
    except Exception:
        return False


@unittest.skipUnless(_db_available(), "application MySQL database not reachable")
class LiveDatabaseReadOnlyTests(unittest.TestCase):
    """Read-only checks against the real application database. Nothing is written."""

    @classmethod
    def setUpClass(cls):
        from app_risk.data import load_from_mysql
        cls.s = _db_settings()
        cls.d = load_from_mysql(cls.s.db_host, cls.s.db_port, cls.s.db_user, cls.s.db_password, cls.s.db_name)

    def _query(self, sql):
        import pymysql
        conn = pymysql.connect(host=self.s.db_host, port=self.s.db_port, user=self.s.db_user, password=self.s.db_password,
                               database=self.s.db_name)
        try:
            with conn.cursor() as cur:
                cur.execute("SET SESSION TRANSACTION READ ONLY")
                cur.execute(sql)
                return cur.fetchall()
        finally:
            conn.close()

    def test_dates_match_mysql_calendar_dates(self):
        """IST correctness: compare with the server's own DATE_FORMAT strings (no client timezone conversion)."""
        rows = dict(self._query("SELECT CLAIM_ID, DATE_FORMAT(CLAIM_DATE, '%Y-%m-%d') FROM CLAIM"))
        for cid, d in zip(self.d.claims["CLAIM_ID"], self.d.claims["CLAIM_DATE"]):
            self.assertEqual(str(d.date()), rows[cid])

    def test_session_is_read_only(self):
        self.assertEqual(self._query("SELECT @@SESSION.transaction_read_only")[0][0], 1)

    def test_every_claim_and_provider_assessable(self):
        self.assertNotIn("STATUS", self.d.claims.columns)
        self.assertNotIn("APPROVED_AMOUNT", self.d.claims.columns)
        for cid in self.d.claims["CLAIM_ID"]:
            a = assess_claim(self.d, int(cid))
            self.assertIn(a["review_priority"], {"Routine", "Elevated", "High"})
        for pid in self.d.providers.index:
            provider_profile(self.d, int(pid))


if __name__ == "__main__":
    unittest.main()
