"""Phase 4.2 tests: FastAPI contract, API-key protection, error handling and the separation between live
application indicators (Track 2) and research results (Track 1).

Run from ml_service/:  .venv/Scripts/python.exe -m unittest tests.test_service -v
"""
import sys
import unittest
from datetime import date
from pathlib import Path

import pandas as pd
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from app_risk.data import AppData  # noqa: E402
from app_risk.settings import Settings  # noqa: E402
from service.main import create_app  # noqa: E402
from service.research import ResearchStore  # noqa: E402

KEY = "test-key-not-a-secret"
H = {"X-ML-API-Key": KEY}
SETTINGS = Settings(api_key=KEY, db_host="unused", db_port=0, db_user="", db_password="", db_name="")


def fixture_data() -> AppData:
    pol = pd.DataFrame([{"POLICY_ID": 1, "POLICY_TYPE": "Individual", "START_DATE": date(2024, 1, 1), "END_DATE": date(2024, 12, 31),
                         "COVERAGE_AMOUNT": 10000, "PATIENT_ID": 7}])
    prov = pd.DataFrame([{"PROVIDER_ID": 1, "PROVIDER_TYPE": "Clinic"}, {"PROVIDER_ID": 2, "PROVIDER_TYPE": "Dental"}])
    claims = pd.DataFrame([(1, "2024-02-01", 100.0, "Flu", 1, 1), (2, "2024-02-03", 6000.0, "Flu", 1, 1)],
                          columns=["CLAIM_ID", "CLAIM_DATE", "CLAIM_AMOUNT", "DIAGNOSIS", "POLICY_ID", "PROVIDER_ID"])
    rules = pd.DataFrame([{"CLAIM_ID": 2, "RULE_ID": 1, "RULE_NAME": "High Claim Amount"}])
    return AppData.from_frames(claims, pol, prov, rules)


def failing_loader():
    raise ConnectionError("password=hunter2 host=db.internal")   # must not leak to the caller


class ServiceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.store = ResearchStore()
        cls.client = TestClient(create_app(SETTINGS, loader=fixture_data, research=cls.store))
        cls.down = TestClient(create_app(SETTINGS, loader=failing_loader, research=cls.store))

    def test_refuses_to_start_without_api_key(self):
        with self.assertRaises(RuntimeError):
            create_app(Settings(api_key="", db_host="", db_port=0, db_user="", db_password="", db_name=""))

    def test_health_is_open_and_minimal(self):
        r = self.client.get("/health")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(set(r.json()), {"status", "service", "version"})

    def test_every_v1_endpoint_requires_the_key(self):
        paths = ["/v1/status", "/v1/claims/1/indicators", "/v1/providers/1/indicators", "/v1/research/models",
                 "/v1/research/shap/global", "/v1/research/providers/PRV51001/explanation", "/v1/research/figures/importance_bar"]
        for p in paths:
            self.assertEqual(self.client.get(p).status_code, 401, p)
            self.assertEqual(self.client.get(p, headers={"X-ML-API-Key": "wrong"}).status_code, 401, p)

    # ── Track 2 ─────────────────────────────────────────────────
    def test_claim_indicators_contract(self):
        r = self.client.get("/v1/claims/2/indicators", headers=H)
        self.assertEqual(r.status_code, 200)
        b = r.json()
        self.assertEqual(b["kind"], "claim_level_indicators")
        self.assertEqual(b["review_priority"], "High")
        self.assertEqual(b["rule_hits"], [{"rule_id": 1, "rule_name": "High Claim Amount"}])
        self.assertEqual(b["history_claims_used"], 1)
        self.assertEqual(len(b["indicators"]), 8)
        self.assertNotIn("scope", b)
        self.assertFalse(any(k in r.text.lower() for k in ("probability", "risk_score", "hybrid")))

    def test_claim_errors(self):
        self.assertEqual(self.client.get("/v1/claims/99/indicators", headers=H).status_code, 404)
        self.assertEqual(self.client.get("/v1/claims/0/indicators", headers=H).status_code, 422)
        self.assertEqual(self.client.get("/v1/claims/abc/indicators", headers=H).status_code, 422)

    def test_provider_indicators_contract(self):
        r = self.client.get("/v1/providers/1/indicators", params={"as_of": "2024-02-02"}, headers=H)
        self.assertEqual(r.status_code, 200)
        b = r.json()
        self.assertEqual((b["kind"], b["as_of_date"], b["claim_count"]), ("provider_level_indicators", "2024-02-02", 1))
        self.assertEqual(self.client.get("/v1/providers/1/indicators", params={"as_of": "02/02/2024"}, headers=H).status_code, 422)
        self.assertEqual(self.client.get("/v1/providers/42/indicators", headers=H).status_code, 404)

    def test_database_failure_is_503_without_details(self):
        r = self.down.get("/v1/claims/1/indicators", headers=H)
        self.assertEqual(r.status_code, 503)
        self.assertNotIn("hunter2", r.text)
        self.assertNotIn("db.internal", r.text)
        self.assertEqual(self.down.get("/v1/status", headers=H).json()["application_database"], "unreachable")
        self.assertEqual(self.client.get("/v1/status", headers=H).json()["application_database"], "reachable")

    # ── Track 1 ─────────────────────────────────────────────────
    @unittest.skipUnless(ResearchStore().available(), "research reports not generated")
    def test_research_is_tagged_and_separate(self):
        for p in ("/v1/research/models", "/v1/research/shap/global"):
            b = self.client.get(p, headers=H).json()
            self.assertEqual(b["kind"], "research_benchmark")
            self.assertIs(b["scope"]["applies_to_live_application_data"], False)
            self.assertIn("Medicare", b["scope"]["dataset"])
            self.assertIn("not probabilities", b["scope"]["score_note"])
        m = self.client.get("/v1/research/models", headers=H).json()["data"]
        self.assertEqual(m["selected_model"], "XGBoost")
        self.assertIn("app_compatible_feature_experiment", m)

    @unittest.skipUnless(ResearchStore().available(), "research reports not generated")
    def test_research_provider_ids_cannot_be_application_ids(self):
        self.assertEqual(self.client.get("/v1/research/providers/1/explanation", headers=H).status_code, 422)
        self.assertEqual(self.client.get("/v1/research/providers/PRV99999/explanation", headers=H).status_code in (404, 503), True)
        self.assertEqual(self.client.get("/v1/providers/PRV51001/indicators", headers=H).status_code, 422)   # live path takes ints only

    def test_research_provider_explanation(self):
        try:
            self.store.provider_explanation("PRV51001")
        except FileNotFoundError:
            self.skipTest("research explanations not precomputed")
        b = self.client.get("/v1/research/providers/PRV51001/explanation", headers=H).json()
        self.assertEqual(b["kind"], "research_benchmark")
        self.assertEqual(b["data"]["provider"], "PRV51001")
        self.assertEqual(len(b["data"]["top_contributions"]), 10)
        self.assertIn("not evidence of fraud", b["data"]["summary"])

    @unittest.skipUnless(ResearchStore().available(), "research reports not generated")
    def test_figures_whitelisted(self):
        r = self.client.get("/v1/research/figures/importance_bar", headers=H)
        self.assertEqual((r.status_code, r.headers["content-type"]), (200, "image/png"))
        for bad in ("..%2F..%2Fbackend%2F.env", "summary", "PRV51001_waterfall"):
            self.assertEqual(self.client.get(f"/v1/research/figures/{bad}", headers=H).status_code, 404, bad)


if __name__ == "__main__":
    unittest.main()
