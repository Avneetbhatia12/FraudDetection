"""
Application data access: READ-ONLY, column-whitelisted, IST-safe.

* Only the columns needed by the indicators are selected. STATUS, APPROVED_AMOUNT and patient
  personal/sensitive fields are never queried (FORBIDDEN_COLUMNS), and AppData refuses frames
  that contain them.
* The MySQL session is put in READ ONLY transaction mode, so any write would fail.
* DATE columns arrive from PyMySQL as datetime.date (no timezone) and are kept as calendar dates,
  so the server or host timezone (e.g. IST, UTC+05:30) cannot shift them by a day.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

import pandas as pd

from .config import FORBIDDEN_COLUMNS

CLAIM_COLS = ["CLAIM_ID", "CLAIM_DATE", "CLAIM_AMOUNT", "DIAGNOSIS", "POLICY_ID", "PROVIDER_ID"]
POLICY_COLS = ["POLICY_ID", "POLICY_TYPE", "START_DATE", "END_DATE", "COVERAGE_AMOUNT", "PATIENT_ID"]
PROVIDER_COLS = ["PROVIDER_ID", "PROVIDER_TYPE"]
RULE_HIT_COLS = ["CLAIM_ID", "RULE_ID", "RULE_NAME"]

SQL = {
    "claims": "SELECT CLAIM_ID, CLAIM_DATE, CLAIM_AMOUNT, DIAGNOSIS, POLICY_ID, PROVIDER_ID FROM CLAIM",
    "policies": "SELECT POLICY_ID, POLICY_TYPE, START_DATE, END_DATE, COVERAGE_AMOUNT, PATIENT_ID FROM POLICY",
    "providers": "SELECT PROVIDER_ID, PROVIDER_TYPE FROM MEDICAL_PROVIDER",
    "rule_hits": "SELECT cr.CLAIM_ID, cr.RULE_ID, fr.RULE_NAME FROM CLAIM_RULE cr JOIN FRAUD_RULE fr ON cr.RULE_ID = fr.RULE_ID",
}


def normalize_diagnosis(text) -> str:
    """Free-text diagnosis -> comparison key (case, surrounding and repeated whitespace ignored)."""
    return re.sub(r"\s+", " ", str(text or "")).strip().lower()


def _dates(s: pd.Series) -> pd.Series:
    # Calendar dates only: datetime.date / 'YYYY-MM-DD' -> midnight timestamps without timezone.
    return pd.to_datetime(s.map(lambda v: v.isoformat() if hasattr(v, "isoformat") else v)).dt.normalize()


@dataclass
class AppData:
    claims: pd.DataFrame      # + PATIENT_ID, DX (normalized), PROVIDER_TYPE joined in
    policies: pd.DataFrame
    providers: pd.DataFrame
    rule_hits: pd.DataFrame

    @classmethod
    def from_frames(cls, claims, policies, providers, rule_hits) -> "AppData":
        for name, df in (("claims", claims), ("policies", policies), ("providers", providers), ("rule_hits", rule_hits)):
            bad = FORBIDDEN_COLUMNS & set(map(str.upper, df.columns))
            if bad:
                raise ValueError(f"{name} contains forbidden columns {sorted(bad)} (leakage or personal data)")
        c = claims[CLAIM_COLS].copy()
        p = policies[POLICY_COLS].copy()
        v = providers[PROVIDER_COLS].copy()
        r = rule_hits[RULE_HIT_COLS].copy() if len(rule_hits) else pd.DataFrame(columns=RULE_HIT_COLS)
        c["CLAIM_DATE"] = _dates(c["CLAIM_DATE"])
        p["START_DATE"], p["END_DATE"] = _dates(p["START_DATE"]), _dates(p["END_DATE"])
        c["CLAIM_AMOUNT"] = c["CLAIM_AMOUNT"].astype(float)        # MySQL DECIMAL -> Decimal
        p["COVERAGE_AMOUNT"] = p["COVERAGE_AMOUNT"].astype(float)
        for df, cols in ((c, ["CLAIM_ID", "POLICY_ID", "PROVIDER_ID"]), (p, ["POLICY_ID", "PATIENT_ID"]), (v, ["PROVIDER_ID"])):
            for col in cols:
                df[col] = df[col].astype("int64")
        c = c.merge(p[["POLICY_ID", "PATIENT_ID"]], on="POLICY_ID", how="left", validate="many_to_one")
        c = c.merge(v, on="PROVIDER_ID", how="left", validate="many_to_one")
        c["DX"] = c["DIAGNOSIS"].map(normalize_diagnosis)
        c = c.sort_values("CLAIM_ID").reset_index(drop=True)
        return cls(claims=c, policies=p.set_index("POLICY_ID", drop=False), providers=v.set_index("PROVIDER_ID", drop=False),
                   rule_hits=r)


def load_from_mysql(host: str, port: int, user: str, password: str, database: str, connect_timeout: int = 5) -> AppData:
    import pymysql  # imported lazily so pure-function tests do not need a database driver
    conn = pymysql.connect(host=host, port=port, user=user, password=password, database=database,
                           connect_timeout=connect_timeout, read_timeout=10, autocommit=False,
                           cursorclass=pymysql.cursors.DictCursor)
    try:
        with conn.cursor() as cur:
            cur.execute("SET SESSION TRANSACTION READ ONLY")
            # One consistent InnoDB snapshot for all four queries = the assessment's "knowledge" timeline.
            cur.execute("START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY")
            frames = {}
            for name, sql in SQL.items():
                cur.execute(sql)
                frames[name] = pd.DataFrame(cur.fetchall())
            cur.execute("COMMIT")
        empty = {"claims": CLAIM_COLS, "policies": POLICY_COLS, "providers": PROVIDER_COLS, "rule_hits": RULE_HIT_COLS}
        for k, cols in empty.items():
            if frames[k].empty:
                frames[k] = pd.DataFrame(columns=cols)
        return AppData.from_frames(frames["claims"], frames["policies"], frames["providers"], frames["rule_hits"])
    finally:
        conn.close()
