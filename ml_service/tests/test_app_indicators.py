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


def comparable(a: dict) -> list:
    """Indicator results without claim identities (for comparing datasets whose CLAIM_IDs differ)."""
    return [(i["code"], i["value"], i["status"], i["triggered"], len(i["comparison_claim_ids"])) for i in a["indicators"]] + \
           [a["review_priority"], a["triggered_count"], a["assessment_status"]]


class TimelineTests(unittest.TestCase):
    """Indicator set v2: service-date history within the snapshot; CLAIM_ID never defines order."""

    BURST = [("2024-05-01", 100, "Flu"), ("2024-05-04", 100, "Cold"), ("2024-05-07", 100, "Rash"), ("2024-05-10", 100, "Cough")]

    def _by_date(self, ordered_rows):
        rows = [(i + 1, dt, amt, dx, 1, 1) for i, (dt, amt, dx) in enumerate(ordered_rows)]
        d = data(rows)
        return {str(r.CLAIM_DATE.date()): comparable(assess_claim(d, int(r.CLAIM_ID))) for r in d.claims.itertuples()}

    def test_results_independent_of_insertion_order(self):
        import itertools
        reference = self._by_date(self.BURST)
        for perm in itertools.permutations(self.BURST):          # all 24 insertion orders
            self.assertEqual(self._by_date(list(perm)), reference, perm)
        get = lambda res, day: res[day][4][1]                    # noqa: E731  (patient_claims_prior_30d value)
        self.assertEqual(get(reference, "2024-05-10"), 3)
        self.assertEqual(get(self._by_date(list(reversed(self.BURST))), "2024-05-10"), 3)   # v1 returned 0 here

    def test_later_dated_claims_beyond_window_do_not_change_result(self):
        base = [(1, "2024-05-01", 100, "Flu", 1, 1), (2, "2024-05-03", 100, "Flu", 1, 1)]
        before = assess_claim(data(base), 2)
        later = base + [(3, "2024-05-11", 100, "Flu", 1, 1),     # 8 days after
                        (4, "2024-08-01", 999, "Flu", 2, 1),     # months after, same patient
                        (5, "2024-05-20", 100, "Flu", 3, 1)]     # other patient, later
        after = assess_claim(data(later), 2)
        self.assertEqual(before["indicators"], after["indicators"])
        self.assertEqual(before["indicators_digest"], after["indicators_digest"])
        self.assertEqual((before["snapshot_claim_count"], after["snapshot_claim_count"]), (2, 5))   # provenance differs, digest does not

    def test_backdated_claim_entered_later_updates_affected_assessments(self):
        base = [(1, "2024-06-10", 100, "Flu", 1, 1)]
        a1 = assess_claim(data(base), 1)
        b = data(base + [(2, "2024-06-08", 100, "Cold", 1, 2)])  # older service date, entered later
        a2 = assess_claim(b, 1)
        self.assertEqual(ind(a1, "days_since_patient_previous_claim")["status"], "not_applicable")
        self.assertEqual((ind(a2, "days_since_patient_previous_claim")["value"], ind(a2, "days_since_patient_previous_claim")["triggered"]), (2, True))
        self.assertEqual(ind(a2, "days_since_patient_previous_claim")["comparison_claim_ids"], [2])
        self.assertNotEqual(a1["indicators_digest"], a2["indicators_digest"])
        self.assertEqual(ind(assess_claim(b, 2), "patient_claims_prior_30d")["value"], 0)    # claim 1 is dated after claim 2

    def test_duplicates_found_before_and_after_within_window(self):
        rows = [(1, "2024-06-05", 900, "Flu", 1, 1),             # assessed claim
                (2, "2024-06-01", 900, "flu", 1, 1),             # 4 days before (entered later)
                (3, "2024-06-12", 905, "Flu", 2, 1),             # 7 days after, same patient (other policy), 0.6% apart
                (4, "2024-06-13", 900, "Flu", 1, 1),             # 8 days after: outside window
                (5, "2024-06-06", 900, "Flu", 3, 1)]             # other patient
        i = ind(assess_claim(data(rows), 1), "near_duplicate_claims")
        self.assertEqual((i["value"], i["comparison_claim_ids"], i["triggered"]), (2, [2, 3], True))
        self.assertEqual(ind(assess_claim(data(rows), 2), "near_duplicate_claims")["comparison_claim_ids"], [1])   # symmetric

    def test_assessed_claim_excluded_from_its_own_history(self):
        rows = [(1, "2024-06-05", 900, "Flu", 1, 1), (2, "2024-06-05", 900, "Flu", 1, 1)]    # same day, identical
        a = assess_claim(data(rows), 1)
        for i in a["indicators"]:
            self.assertNotIn(1, i["comparison_claim_ids"], i["code"])
        self.assertEqual(ind(a, "near_duplicate_claims")["comparison_claim_ids"], [2])
        self.assertEqual(ind(a, "days_since_patient_previous_claim")["value"], 0)
        self.assertEqual(a["prior_history_claim_count"], 1)
        solo = assess_claim(data(rows[:1]), 1)
        self.assertEqual((ind(solo, "near_duplicate_claims")["value"], solo["prior_history_claim_count"]), (0, 0))

    def test_comparison_ids_and_snapshot_counts(self):
        rows = [(1, "2024-05-01", 100, "A", 1, 1), (2, "2024-05-20", 100, "B", 2, 2), (3, "2024-05-25", 100, "C", 1, 1),
                (4, "2024-03-01", 100, "D", 1, 1), (5, "2024-06-30", 100, "E", 1, 1), (6, "2024-05-24", 100, "F", 3, 1)]
        a = assess_claim(data(rows), 3)                          # patient 100, 2024-05-25
        self.assertEqual(a["snapshot_claim_count"], 6)
        self.assertEqual(a["prior_history_claim_count"], 4)      # claims 1, 2, 4, 6 (claim 5 is later-dated)
        self.assertEqual(ind(a, "patient_claims_prior_30d")["comparison_claim_ids"], [1, 2])   # claim 4 is > 30 days before
        self.assertEqual(ind(a, "days_since_patient_previous_claim")["comparison_claim_ids"], [2])
        for i in a["indicators"]:
            self.assertEqual(i["comparison_claim_ids"], sorted(i["comparison_claim_ids"]))
            self.assertNotIn(5, i["comparison_claim_ids"])       # later-dated, outside the duplicate window

    def test_digest_deterministic_and_sensitive(self):
        from app_risk import snapshots
        rows = [(1, "2024-05-01", 100, "Flu", 1, 1), (2, "2024-05-03", 100, "Flu", 1, 1)]
        a, b = assess_claim(data(rows), 2), assess_claim(data(list(reversed(rows))), 2)
        self.assertEqual(a["indicators_digest"], b["indicators_digest"])                        # order-independent
        self.assertEqual(a["indicators_digest"], snapshots.assessment_digest(a))                 # recomputable
        self.assertRegex(a["indicators_digest"], r"^[0-9a-f]{64}$")
        changed_value = assess_claim(data([(1, "2024-05-01", 100, "Flu", 1, 1), (2, "2024-05-03", 6000, "Flu", 1, 1)]), 2)
        changed_set = assess_claim(data(rows + [(3, "2024-04-20", 100, "Cold", 1, 2)]), 2)      # comparison set grows
        rules = assess_claim(data(rows, rule_hits=pd.DataFrame([{"CLAIM_ID": 2, "RULE_ID": 1, "RULE_NAME": "X"}])), 2)
        digests = {a["indicators_digest"], changed_value["indicators_digest"], changed_set["indicators_digest"], rules["indicators_digest"]}
        self.assertEqual(len(digests), 4)
        bumped = dict(a, indicator_set_version="9.9.9")
        self.assertNotEqual(snapshots.assessment_digest(bumped), a["indicators_digest"])
        provenance_only = dict(a, snapshot_claim_count=999, prior_history_claim_count=999, disclaimer="x")
        self.assertEqual(snapshots.assessment_digest(provenance_only), a["indicators_digest"])

    def test_previous_snapshots_preserved_on_new_assessment(self):
        """Simulates the future Express rule against an append-only store: append only when the digest changes."""
        from app_risk import snapshots
        store: list[dict] = []

        def record(assessment):
            valid = [s for s in store if s.get("assessment_status") != "failed"]              # CLAIM_LATEST_VALID_ASSESSMENT
            latest = valid[-1]["indicators_digest"] if valid else None
            if snapshots.snapshot_decision(latest, assessment) == "append":
                store.append(dict(assessment))
            return len(store)

        base = [(1, "2024-06-10", 100, "Flu", 1, 1)]
        first = assess_claim(data(base), 1)
        self.assertEqual(record(first), 1)
        self.assertEqual(record(assess_claim(data(base), 1)), 1)                                 # unchanged: nothing appended
        store.append({"assessment_status": "failed", "indicators_digest": None})               # a timeout is recorded...
        self.assertEqual(record(assess_claim(data(base), 1)), 2)                                 # ...but is not the baseline: no duplicate
        store.pop()                                                                              # (keep the rest of the scenario simple)
        self.assertEqual(record(assess_claim(data(base + [(2, "2024-09-01", 5, "X", 3, 2)]), 1)), 1)   # unrelated later claim
        second = assess_claim(data(base + [(3, "2024-06-08", 100, "Cold", 1, 2)]), 1)            # back-dated: content changes
        self.assertEqual(record(second), 2)
        self.assertEqual(store[0], first)                                                        # first snapshot intact
        self.assertNotEqual(store[0]["indicators_digest"], store[1]["indicators_digest"])

    def test_training_snapshot_strict_linking(self):
        """Only the outcome's own linked snapshot is ever used; invalid or absent links exclude the outcome (no fallback)."""
        from datetime import datetime
        from app_risk.snapshots import select_training_snapshot
        snaps = [{"assessment_id": 1, "claim_id": 7, "assessed_at": datetime(2024, 6, 1, 9), "assessment_status": "completed"},
                 {"assessment_id": 2, "claim_id": 7, "assessed_at": datetime(2024, 6, 3, 9), "assessment_status": "failed"},
                 {"assessment_id": 3, "claim_id": 7, "assessed_at": datetime(2024, 6, 5, 9), "assessment_status": "completed"},
                 {"assessment_id": 4, "claim_id": 7, "assessed_at": datetime(2024, 6, 9, 9), "assessment_status": "completed"},
                 {"assessment_id": 5, "claim_id": 8, "assessed_at": datetime(2024, 6, 1, 9), "assessment_status": "completed"}]
        decided = datetime(2024, 6, 6, 12)
        pick = lambda link: select_training_snapshot(snaps, 7, decided, link)  # noqa: E731
        s, why = pick(1)
        self.assertEqual((s["assessment_id"], why), (1, None))          # linked one used, although snapshot 3 is newer and also before the decision
        self.assertEqual(pick(3)[0]["assessment_id"], 3)
        for link, reason in ((None, "no_linked_snapshot"), (99, "linked_snapshot_missing"), (5, "linked_snapshot_other_claim"),
                             (2, "linked_snapshot_failed"), (4, "linked_snapshot_after_decision")):
            self.assertEqual(pick(link), (None, reason), link)           # excluded: nothing substituted
        exact = select_training_snapshot(snaps, 7, datetime(2024, 6, 5, 9), 3)    # assessed exactly at decision time: valid
        self.assertEqual(exact[0]["assessment_id"], 3)
        self.assertEqual(pick(1), pick(1))                              # deterministic


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
class MigrationContractTests(unittest.TestCase):
    """Static checks that database/ml_schema.sql agrees with the code (no database needed)."""
    SQL_TEXT = (ROOT.parent / "database" / "ml_schema.sql").read_text(encoding="utf-8")

    def code(self):  # SQL without comments
        import re
        return re.sub(r"--[^\n]*", "", self.SQL_TEXT)

    def test_registry_seed_matches_indicator_config(self):
        import json
        import re
        m = re.search(r"-- seed-definition-begin\n'(.*)'\n-- seed-definition-end", self.SQL_TEXT)
        self.assertIsNotNone(m, "seed definition markers not found")
        d = json.loads(m.group(1))
        self.assertEqual((d["indicator_set"], d["version"]), (C.INDICATOR_SET_KEY, C.INDICATOR_SET_VERSION))
        self.assertEqual(d["claim_indicators"], list(CLAIM_SPEC))
        self.assertEqual(d["provider_indicators"], list(PROVIDER_SPEC))
        want = {k: getattr(C, k) for k in dir(C) if k.isupper() and k not in ("FORBIDDEN_COLUMNS", "INDICATOR_SET_KEY", "INDICATOR_SET_VERSION")}
        self.assertEqual(d["thresholds"], want)
        seed = re.search(r"SELECT '([^']+)', 'app_indicator_set', '([^']+)', 'none', 1,", self.SQL_TEXT)
        self.assertEqual(seed.groups(), (C.INDICATOR_SET_KEY, C.INDICATOR_SET_VERSION))
        self.assertIn(f"WHERE MODEL_KEY = '{C.INDICATOR_SET_KEY}'", self.SQL_TEXT)

    def test_single_mysql_utc_clock(self):
        code = self.code()
        self.assertNotIn("CURRENT_TIMESTAMP", code.upper())
        self.assertNotIn("NOW()", code.upper())
        for col, trig in (("ASSESSED_AT", "trg_cra_before_insert"), ("COMPUTED_AT", "trg_prp_before_insert"),
                          ("DECIDED_AT", "trg_cio_valid_snapshot")):
            self.assertIn(f"SET NEW.{col} = UTC_TIMESTAMP();", code, col)
            self.assertIn(f"CREATE TRIGGER {trig} BEFORE INSERT", code, trig)

    def test_version_consistency_trigger_present(self):
        code = self.code()
        self.assertIn("CAST(NEW.INDICATOR_SET_VERSION AS BINARY) <> CAST(v_version AS BINARY)", code)
        self.assertIn("CREATE TRIGGER trg_registry_identity_immutable BEFORE UPDATE ON MODEL_REGISTRY", code)

    def test_rollback_drops_every_trigger_and_view_the_migration_creates(self):
        import re
        rb = (ROOT.parent / "database" / "ml_schema_rollback.sql").read_text(encoding="utf-8")
        code = self.code()
        for kind in ("TRIGGER", "VIEW"):
            created = set(re.findall(rf"CREATE (?:OR REPLACE )?{kind} (\w+)", code))
            dropped = set(re.findall(rf"DROP {kind} IF EXISTS (\w+)", rb))
            self.assertTrue(created, kind)
            self.assertEqual(created, dropped, kind)


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
