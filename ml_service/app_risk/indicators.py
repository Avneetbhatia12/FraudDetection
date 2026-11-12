"""
Application-native risk indicators (Track 2). Transparent statistics, NOT ML predictions.

Two timelines (indicator set v2)
--------------------------------
1. Knowledge (what is known): the claims visible in ONE consistent, read-only database snapshot taken at
   assessment time. Nothing outside the snapshot is ever used.
2. Service date (what happened earlier): within the snapshot, comparisons use CLAIM_DATE only:
     * prior-history indicators use snapshot claims with CLAIM_DATE <= the assessed claim's date,
       excluding the assessed claim itself;
     * duplicate detection uses snapshot claims within +/- DUPLICATE_WINDOW_DAYS calendar days.
   CLAIM_ID never determines order or history. It is only used to identify claims (and to exclude the
   assessed claim). The result therefore does not depend on the order in which claims were entered.

Consequences
  * Claims dated more than DUPLICATE_WINDOW_DAYS after the assessed claim never change its result.
  * A back-dated claim entered later DOES change the assessments of the later-dated claims it precedes
    (new knowledge). Previous snapshots are kept; see snapshots.py (append-only, digest).
  * Same snapshot, same result (deterministic).
  * Future supervised training must use the snapshot that existed when an outcome was recorded
    (snapshots.select_training_snapshot), never a recomputation with later information.

Every indicator returns: code, level, name, value, reference, threshold, status
('ok' | 'insufficient_history' | 'not_applicable'), triggered (True/False, or None when it cannot be
judged), a plain-language reason, and comparison_claim_ids (the snapshot claims it compared against).
Inputs never include STATUS or APPROVED_AMOUNT.
"""
from __future__ import annotations

from datetime import date

import numpy as np
import pandas as pd

from . import config as C
from .data import AppData
from .dates import app_date
from .snapshots import DIGEST_FIELDS, assessment_digest

DISCLAIMER = ("Indicators are transparent statistics computed from this application's data with documented, "
              "configured thresholds. They are not machine-learning predictions, not probabilities and not evidence of fraud. "
              "Review priority only orders the review queue; it never approves or rejects a claim.")

# code -> (name, inputs, calculation, why, threshold description)
CLAIM_SPEC = {
    "coverage_share": ("Share of policy coverage", "CLAIM.CLAIM_AMOUNT, POLICY.COVERAGE_AMOUNT",
                       "claim amount / policy coverage amount", "A single claim using a large part of total coverage",
                       f">= {C.COVERAGE_SHARE_THRESHOLD:.0%}"),
    "outside_policy_period": ("Claim date outside policy period", "CLAIM.CLAIM_DATE, POLICY.START_DATE, END_DATE",
                              "days before policy start or after policy end (0 if inside)",
                              "Service dated when the policy was not in force (not covered by the SQL rules)", "> 0 days"),
    "amount_vs_diagnosis_median": ("Amount vs earlier-dated claims with the same diagnosis", "CLAIM_AMOUNT, DIAGNOSIS (normalized), CLAIM_DATE",
                                   "claim amount / median amount of snapshot claims with the same diagnosis dated on or before this claim",
                                   "Billing far above what this diagnosis usually costs here",
                                   f">= {C.DIAGNOSIS_RATIO_THRESHOLD:g}x (needs >= {C.MIN_DIAGNOSIS_HISTORY} earlier-dated claims)"),
    "diagnosis_new_for_provider_type": ("Diagnosis not seen before for this provider type", "DIAGNOSIS, MEDICAL_PROVIDER.PROVIDER_TYPE, CLAIM_DATE",
                                        "number of earlier-dated snapshot claims with this diagnosis from providers of the same type",
                                        "Possible mismatch between provider type and diagnosis",
                                        f"= 0 (needs >= {C.MIN_PROVIDER_TYPE_HISTORY} earlier-dated claims for the type)"),
    "patient_claims_prior_30d": ("Patient's other claims in the 30 days up to this claim", "PATIENT (via POLICY), CLAIM_DATE",
                                 "other snapshot claims of the same patient (any policy, any provider) dated within the 30 days up to and including this claim's date",
                                 "Claim bursts for one patient", f">= {C.PATIENT_30D_THRESHOLD}"),
    "days_since_patient_previous_claim": ("Days since the patient's previous claim", "PATIENT (via POLICY), CLAIM_DATE",
                                          "days between this claim and the patient's most recent other claim dated on or before it",
                                          "Rapid repeat visits", f"<= {C.REPEAT_VISIT_DAYS_THRESHOLD} days"),
    "near_duplicate_claims": ("Possible duplicate submissions", "PATIENT, PROVIDER_ID, DIAGNOSIS, CLAIM_AMOUNT, CLAIM_DATE",
                              f"other snapshot claims with the same patient, provider and diagnosis, amount within "
                              f"{C.DUPLICATE_AMOUNT_TOLERANCE:.0%}, dated within {C.DUPLICATE_WINDOW_DAYS} calendar days before or after",
                              "Duplicate or re-submitted bills (in either order)", ">= 1"),
    "provider_volume_surge": ("Provider's recent claim volume vs its own baseline", "PROVIDER_ID, CLAIM_DATE",
                              "provider's other claims dated in the 30 days up to this claim / its average 30-day count over days 31-365 before",
                              "Sudden increase in a provider's billing",
                              f">= {C.PROVIDER_SURGE_MULTIPLIER:g}x and >= {C.PROVIDER_SURGE_MIN_COUNT} claims "
                              f"(needs >= {C.MIN_PROVIDER_BASELINE_CLAIMS} baseline claims)"),
}

PROVIDER_SPEC = {
    # code -> (name, calculation, peer comparison: 'high' | 'low' | None (informational), needs >= MIN_PROVIDER_CLAIMS)
    "claim_count": ("Claims", "claims dated on or before the as-of date", None, False),
    "distinct_patients": ("Distinct patients", "patients (via policy) with at least one claim", None, False),
    "active_months": ("Active months", "calendar months with at least one claim", None, False),
    "claims_per_patient": ("Claims per patient", "claims / distinct patients", "high", True),
    "claims_per_active_month": ("Claims per active month", "claims / active months", "high", True),
    "share_same_day_repeat": ("Same-day repeat claims", "claims where the same patient has another claim at this provider on the same date / claims", "high", True),
    "median_days_between_patient_claims": ("Median days between a patient's claims", "median gap between consecutive claims of the same patient at this provider", "low", True),
    "share_patients_3plus_claims": ("Patients with 3+ claims", "patients with >= 3 claims at this provider / patients", "high", True),
    "patient_mean_other_providers": ("Patients shared with other providers", "mean number of OTHER providers each of this provider's patients also claimed through", "high", True),
    "rule_flag_rate": ("Claims flagged by SQL rules", "claims with >= 1 CLAIM_RULE hit / claims (existing rule engine output)", "high", True),
}


def _ids(df: pd.DataFrame) -> list[int]:
    return sorted(int(i) for i in df["CLAIM_ID"])


def _ind(code, level, name, value, reference, threshold, status, triggered, reason, comparison_ids=()) -> dict:
    v = None if value is None or (isinstance(value, float) and np.isnan(value)) else (round(float(value), 4) if not isinstance(value, (int, np.integer)) else int(value))
    return {"code": code, "level": level, "name": name, "value": v, "reference": reference, "threshold": threshold,
            "status": status, "triggered": triggered, "reason": reason, "comparison_claim_ids": list(comparison_ids)}


def _days(a: pd.Timestamp, b: pd.Timestamp) -> int:
    return int((a - b).days)


# ── Claim level ───────────────────────────────────────────────────
def assess_claim(data: AppData, claim_id: int) -> dict:
    claims = data.claims
    row = claims.loc[claims["CLAIM_ID"] == int(claim_id)]
    if row.empty:
        raise KeyError(f"Unknown claim {claim_id}")
    c = row.iloc[0]
    d, amt, dx = c["CLAIM_DATE"], float(c["CLAIM_AMOUNT"]), c["DX"]
    others = claims.loc[claims["CLAIM_ID"] != c["CLAIM_ID"]]                 # knowledge: snapshot minus the claim itself
    prior = others.loc[others["CLAIM_DATE"] <= d]                            # service-date history (order-independent)
    pol = data.policies.loc[c["POLICY_ID"]]
    S = CLAIM_SPEC
    out = []

    # 1. coverage share (no comparison claims)
    cov = float(pol["COVERAGE_AMOUNT"])
    share = amt / cov if cov > 0 else np.nan
    out.append(_ind("coverage_share", "claim", S["coverage_share"][0], share, f"policy coverage {cov:,.2f}", S["coverage_share"][4],
                    "ok" if cov > 0 else "not_applicable", bool(share >= C.COVERAGE_SHARE_THRESHOLD) if cov > 0 else None,
                    f"claim amount is {share:.1%} of the policy's coverage" if cov > 0 else "policy has no coverage amount"))

    # 2. outside policy period (no comparison claims)
    before, after = _days(pol["START_DATE"], d), _days(d, pol["END_DATE"])
    outside = max(before, after, 0)
    why = (f"claim date is {before} day(s) before the policy start ({pol['START_DATE'].date()})" if before > 0 else
           f"claim date is {after} day(s) after the policy end ({pol['END_DATE'].date()})" if after > 0 else
           f"claim date is within the policy period ({pol['START_DATE'].date()} to {pol['END_DATE'].date()})")
    out.append(_ind("outside_policy_period", "claim", S["outside_policy_period"][0], outside,
                    f"policy {pol['START_DATE'].date()} to {pol['END_DATE'].date()}", S["outside_policy_period"][4], "ok", outside > 0, why))

    # 3. amount vs diagnosis median (earlier-dated snapshot claims)
    same_dx = prior.loc[prior["DX"] == dx]
    if len(same_dx) >= C.MIN_DIAGNOSIS_HISTORY:
        med = float(same_dx["CLAIM_AMOUNT"].median())
        ratio = amt / med if med > 0 else np.nan
        out.append(_ind("amount_vs_diagnosis_median", "claim", S["amount_vs_diagnosis_median"][0], ratio,
                        f"median {med:,.2f} over {len(same_dx)} earlier-dated claims with this diagnosis", S["amount_vs_diagnosis_median"][4],
                        "ok", bool(ratio >= C.DIAGNOSIS_RATIO_THRESHOLD), f"amount is {ratio:.2f}x the median of earlier-dated claims for this diagnosis",
                        _ids(same_dx)))
    else:
        out.append(_ind("amount_vs_diagnosis_median", "claim", S["amount_vs_diagnosis_median"][0], None,
                        f"{len(same_dx)} earlier-dated claim(s) with this diagnosis", S["amount_vs_diagnosis_median"][4], "insufficient_history", None,
                        f"only {len(same_dx)} earlier-dated claim(s) with this diagnosis; at least {C.MIN_DIAGNOSIS_HISTORY} are needed",
                        _ids(same_dx)))

    # 4. diagnosis new for provider type (earlier-dated snapshot claims)
    ptype = c["PROVIDER_TYPE"]
    same_type = prior.loc[prior["PROVIDER_TYPE"] == ptype]
    if len(same_type) >= C.MIN_PROVIDER_TYPE_HISTORY:
        matches = same_type.loc[same_type["DX"] == dx]
        n = len(matches)
        out.append(_ind("diagnosis_new_for_provider_type", "claim", S["diagnosis_new_for_provider_type"][0], n,
                        f"{len(same_type)} earlier-dated claims from '{ptype}' providers", S["diagnosis_new_for_provider_type"][4], "ok", n == 0,
                        f"this diagnosis appears in {n} earlier-dated claim(s) from '{ptype}' providers", _ids(same_type)))
    else:
        out.append(_ind("diagnosis_new_for_provider_type", "claim", S["diagnosis_new_for_provider_type"][0], None,
                        f"{len(same_type)} earlier-dated claim(s) from '{ptype}' providers", S["diagnosis_new_for_provider_type"][4],
                        "insufficient_history", None,
                        f"only {len(same_type)} earlier-dated claim(s) from '{ptype}' providers; at least {C.MIN_PROVIDER_TYPE_HISTORY} are needed",
                        _ids(same_type)))

    # 5./6. patient history (any policy of the same patient), earlier-dated
    pat_prior = prior.loc[prior["PATIENT_ID"] == c["PATIENT_ID"]]
    w30 = pat_prior.loc[pat_prior["CLAIM_DATE"] >= d - pd.Timedelta(days=30)]
    out.append(_ind("patient_claims_prior_30d", "claim", S["patient_claims_prior_30d"][0], len(w30),
                    "other claims of this patient dated in the 30 days up to this claim", S["patient_claims_prior_30d"][4], "ok",
                    len(w30) >= C.PATIENT_30D_THRESHOLD, f"{len(w30)} other claim(s) for this patient dated in the 30 days up to this claim",
                    _ids(w30)))
    if len(pat_prior):
        last = pat_prior["CLAIM_DATE"].max()
        gap = _days(d, last)
        out.append(_ind("days_since_patient_previous_claim", "claim", S["days_since_patient_previous_claim"][0], gap,
                        f"previous claim dated {last.date()}", S["days_since_patient_previous_claim"][4], "ok",
                        gap <= C.REPEAT_VISIT_DAYS_THRESHOLD, f"{gap} day(s) since this patient's previous claim",
                        _ids(pat_prior.loc[pat_prior["CLAIM_DATE"] == last])))
    else:
        out.append(_ind("days_since_patient_previous_claim", "claim", S["days_since_patient_previous_claim"][0], None,
                        "no other claim dated on or before this claim", S["days_since_patient_previous_claim"][4], "not_applicable", None,
                        "this patient has no other claim dated on or before this one"))

    # 7. near duplicates: snapshot claims within +/- window (either side of the claim date)
    pat_all = others.loc[others["PATIENT_ID"] == c["PATIENT_ID"]]
    dup = pat_all.loc[(pat_all["PROVIDER_ID"] == c["PROVIDER_ID"]) & (pat_all["DX"] == dx)
                      & ((pat_all["CLAIM_DATE"] - d).abs() <= pd.Timedelta(days=C.DUPLICATE_WINDOW_DAYS))
                      & ((pat_all["CLAIM_AMOUNT"] - amt).abs() <= C.DUPLICATE_AMOUNT_TOLERANCE * amt)]
    out.append(_ind("near_duplicate_claims", "claim", S["near_duplicate_claims"][0], len(dup),
                    ("matching claim IDs " + ", ".join(str(i) for i in _ids(dup))) if len(dup) else "no matching claims",
                    S["near_duplicate_claims"][4], "ok", len(dup) >= 1,
                    f"{len(dup)} other claim(s) look like the same bill (same patient, provider, diagnosis, similar amount, "
                    f"within {C.DUPLICATE_WINDOW_DAYS} days either side)", _ids(dup)))

    # 8. provider volume surge vs its own baseline (earlier-dated)
    ph = prior.loc[prior["PROVIDER_ID"] == c["PROVIDER_ID"]]
    recent = ph.loc[ph["CLAIM_DATE"] >= d - pd.Timedelta(days=30)]
    base = ph.loc[(ph["CLAIM_DATE"] < d - pd.Timedelta(days=30)) & (ph["CLAIM_DATE"] >= d - pd.Timedelta(days=365))]
    used = pd.concat([recent, base])
    if len(base) >= C.MIN_PROVIDER_BASELINE_CLAIMS:
        base_rate = len(base) / (335 / 30)
        ratio = len(recent) / base_rate
        out.append(_ind("provider_volume_surge", "claim", S["provider_volume_surge"][0], ratio,
                        f"{len(recent)} other claim(s) dated in the last 30 days vs a baseline of {base_rate:.2f} per 30 days", S["provider_volume_surge"][4],
                        "ok", bool(ratio >= C.PROVIDER_SURGE_MULTIPLIER and len(recent) >= C.PROVIDER_SURGE_MIN_COUNT),
                        f"provider's recent volume is {ratio:.2f}x its own earlier rate", _ids(used)))
    else:
        out.append(_ind("provider_volume_surge", "claim", S["provider_volume_surge"][0], None,
                        f"{len(base)} baseline claim(s)", S["provider_volume_surge"][4], "insufficient_history", None,
                        f"provider has {len(base)} claim(s) dated in its baseline window; at least {C.MIN_PROVIDER_BASELINE_CLAIMS} are needed",
                        _ids(used)))

    # Rule hits (existing SQL engine output for this claim) and review priority
    rh = data.rule_hits.loc[data.rule_hits["CLAIM_ID"] == c["CLAIM_ID"]].sort_values("RULE_ID")
    rule_hits = [{"rule_id": int(r.RULE_ID), "rule_name": str(r.RULE_NAME)} for r in rh.itertuples()]
    triggered = [i for i in out if i["triggered"] is True]
    insufficient = [i for i in out if i["status"] == "insufficient_history"]
    priority, reasons = review_priority(rule_hits, triggered)
    if insufficient:
        reasons.append(f"{len(insufficient)} of {len(out)} indicators could not be evaluated (insufficient history)")
    computable = [i for i in out if i["status"] == "ok"]
    result = {
        "claim_id": int(c["CLAIM_ID"]), "indicator_set": C.INDICATOR_SET_KEY, "indicator_set_version": C.INDICATOR_SET_VERSION,
        "assessment_status": "completed" if computable else "insufficient_data",
        "snapshot_claim_count": int(len(claims)),               # claims visible in the snapshot (incl. this one)
        "prior_history_claim_count": int(len(prior)),           # other snapshot claims dated on or before this one
        "rule_hits": rule_hits, "indicators": out, "triggered_count": len(triggered),
        "review_priority": priority, "priority_reasons": reasons, "disclaimer": DISCLAIMER,
        "digest_scope": list(DIGEST_FIELDS),
    }
    result["indicators_digest"] = assessment_digest(result)
    return result


def review_priority(rule_hits: list, triggered: list) -> tuple[str, list]:
    """Documented ordering rule (not a score): High = any SQL rule hit or >= 2 triggered indicators;
    Elevated = exactly 1 triggered indicator; Routine otherwise."""
    reasons = [f"SQL rule: {r['rule_name']}" for r in rule_hits] + [f"Indicator: {i['reason']}" for i in triggered]
    if rule_hits or len(triggered) >= 2:
        return "High", reasons
    if len(triggered) == 1:
        return "Elevated", reasons
    return "Routine", reasons or ["no SQL rule hits and no indicator above its threshold"]


# ── Provider level (date-based cutoff; unchanged logic) ───────────
def _provider_values(cl: pd.DataFrame, flagged_ids: set, all_cl: pd.DataFrame) -> dict:
    n = len(cl)
    pats = cl["PATIENT_ID"].nunique()
    months = cl["CLAIM_DATE"].dt.to_period("M").nunique()
    same_day = cl.groupby(["PATIENT_ID", "CLAIM_DATE"])["CLAIM_ID"].transform("size") > 1
    gaps = (cl.sort_values(["PATIENT_ID", "CLAIM_DATE"]).groupby("PATIENT_ID")["CLAIM_DATE"].diff().dt.days.dropna())
    per_pat = cl.groupby("PATIENT_ID").size()
    other = all_cl.groupby("PATIENT_ID")["PROVIDER_ID"].nunique().reindex(cl["PATIENT_ID"].unique()) - 1
    return {
        "claim_count": n, "distinct_patients": pats, "active_months": months,
        "claims_per_patient": n / pats if pats else np.nan,
        "claims_per_active_month": n / months if months else np.nan,
        "share_same_day_repeat": float(same_day.mean()) if n else np.nan,
        "median_days_between_patient_claims": float(gaps.median()) if len(gaps) else np.nan,
        "share_patients_3plus_claims": float((per_pat >= 3).mean()) if pats else np.nan,
        "patient_mean_other_providers": float(other.mean()) if len(other) else np.nan,
        "rule_flag_rate": float(cl["CLAIM_ID"].isin(flagged_ids).mean()) if n else np.nan,
    }


def provider_profile(data: AppData, provider_id: int, as_of: date | str | None = None) -> dict:
    if int(provider_id) not in data.providers.index:
        raise KeyError(f"Unknown provider {provider_id}")
    # Default: today's IST date on the MySQL clock (app_risk.dates), never the host's local date.
    as_of_ts = pd.Timestamp(as_of).normalize() if as_of is not None else pd.Timestamp(app_date(data.snapshot_taken_at))
    upto = data.claims.loc[data.claims["CLAIM_DATE"] <= as_of_ts]
    flagged = set(data.rule_hits["CLAIM_ID"].astype(int))
    mine = upto.loc[upto["PROVIDER_ID"] == int(provider_id)]
    vals = _provider_values(mine, flagged, upto) if len(mine) else {k: np.nan for k in PROVIDER_SPEC}
    peer_ids = [p for p, g in upto.groupby("PROVIDER_ID") if p != int(provider_id) and len(g) >= C.MIN_PROVIDER_CLAIMS]
    peers = pd.DataFrame([_provider_values(upto.loc[upto["PROVIDER_ID"] == p], flagged, upto) for p in peer_ids]) if peer_ids else pd.DataFrame()
    out = []
    for code, (name, calc, direction, needs_volume) in PROVIDER_SPEC.items():
        v = vals[code]
        if len(mine) == 0:
            out.append(_ind(code, "provider", name, None, "no claims up to the as-of date", None, "insufficient_history", None,
                            "provider has no claims on or before the as-of date"))
            continue
        if needs_volume and len(mine) < C.MIN_PROVIDER_CLAIMS:
            out.append(_ind(code, "provider", name, v, f"provider has {len(mine)} claim(s)", None, "insufficient_history", None,
                            f"value shown for information only; ratios need at least {C.MIN_PROVIDER_CLAIMS} claims"))
            continue
        if isinstance(v, float) and np.isnan(v):
            out.append(_ind(code, "provider", name, None, "not defined for this provider", None, "not_applicable", None,
                            "no repeat claims by the same patient at this provider" if code == "median_days_between_patient_claims" else "not defined"))
            continue
        if direction is None:
            out.append(_ind(code, "provider", name, v, "informational (no peer comparison)", None, "ok", None, f"{name}: {v:g}"))
            continue
        pv = peers[code].dropna() if len(peers) else pd.Series(dtype=float)
        if len(pv) < C.MIN_PEERS:
            out.append(_ind(code, "provider", name, v, f"{len(pv)} comparable provider(s) with >= {C.MIN_PROVIDER_CLAIMS} claims",
                            f"{'above' if direction == 'high' else 'below'} peers' {C.PEER_HIGH_PERCENTILE if direction == 'high' else C.PEER_LOW_PERCENTILE}th percentile",
                            "insufficient_history", None,
                            f"value {v:.4g}; peer comparison needs at least {C.MIN_PEERS} comparable providers"))
            continue
        q = float(np.percentile(pv, C.PEER_HIGH_PERCENTILE if direction == "high" else C.PEER_LOW_PERCENTILE))
        trig = bool(v > q) if direction == "high" else bool(v < q)
        out.append(_ind(code, "provider", name, v, f"peers' {'90th' if direction == 'high' else '10th'} percentile {q:.4g} ({len(pv)} providers)",
                        f"{'above' if direction == 'high' else 'below'} that percentile", "ok", trig,
                        f"{v:.4g} is {'above' if v > q else 'below' if v < q else 'equal to'} the peer {'90th' if direction == 'high' else '10th'} percentile ({q:.4g})"))
    ok = [i for i in out if i["status"] == "ok"]
    return {"provider_id": int(provider_id), "as_of_date": str(as_of_ts.date()), "indicator_set": C.INDICATOR_SET_KEY,
            "indicator_set_version": C.INDICATOR_SET_VERSION,
            "profile_status": "completed" if ok else "insufficient_data", "claim_count": int(len(mine)),
            "comparable_peers": len(peer_ids), "indicators": out,
            "triggered_count": sum(1 for i in out if i["triggered"] is True), "disclaimer": DISCLAIMER}
