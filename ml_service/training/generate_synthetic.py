"""
Synthetic health-insurance claims generator (stdlib only, deterministic).

Produces a SYNTHETIC, LABELLED relational dataset whose columns mirror the
application's MySQL tables (PATIENT, POLICY, MEDICAL_PROVIDER, CLAIM), so the
same feature-engineering code can later run on real DB rows unchanged.

Design principles
-----------------
* Never touches the application database. Output is CSV only.
* No personal data: no names, emails or addresses are generated.
* Excludes CLAIM.STATUS and CLAIM.APPROVED_AMOUNT: those are set *after*
  review and would leak the label into the model.
* Ground truth (IS_FRAUD, FRAUD_PATTERN) is defined independently of the SQL
  rules, so the ML layer is not trained to imitate the trigger:
    - some fraud deliberately evades the rules (near_threshold, provider_mismatch,
      out_of_policy_period, duplicate_claim)
    - some legitimate claims deliberately trip the rules (expensive surgeries,
      chemotherapy, chronic dialysis patients with frequent claims).

Usage
-----
    py -3.12 ml_service/training/generate_synthetic.py            # defaults
    py -3.12 ml_service/training/generate_synthetic.py --seed 7 --patients 3000
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import random
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

GENERATOR_VERSION = "1.0.0"
WINDOW_START = date(2024, 1, 1)
WINDOW_END = date(2025, 12, 31)

# Same vocabulary as frontend/src/utils/constants.js
POLICY_TYPES = ["Individual", "Family", "Senior", "Group"]
PROVIDER_TYPES = [
    "Hospital", "Clinic", "Laboratory", "Specialist", "Pharmacy", "Dental", "Optometry",
    "Mental Health", "Surgery", "Radiology", "Therapy", "Urgent Care", "Pediatrics",
]
COVERAGE_RANGE = {
    "Individual": (40_000, 80_000),
    "Family": (120_000, 200_000),
    "Senior": (90_000, 130_000),
    "Group": (60_000, 150_000),
}

# diagnosis -> (typical cost, provider types that legitimately treat it, relative frequency)
DIAGNOSES: dict[str, tuple[float, list[str], float]] = {
    "Common Cold":             (400,    ["Clinic", "Urgent Care"], 10),
    "Flu":                     (600,    ["Clinic", "Urgent Care", "Hospital"], 9),
    "Hypertension":            (1_500,  ["Clinic", "Hospital", "Specialist"], 8),
    "Diabetes Type 2":         (1_800,  ["Clinic", "Hospital", "Specialist", "Laboratory"], 7),
    "Asthma":                  (1_200,  ["Clinic", "Specialist"], 5),
    "Migraine":                (900,    ["Clinic", "Specialist"], 5),
    "Back Pain":               (1_100,  ["Clinic", "Therapy", "Specialist"], 7),
    "Skin Rash":               (250,    ["Clinic"], 5),
    "Blood Panel":             (200,    ["Laboratory"], 8),
    "Prescription Refill":     (150,    ["Pharmacy"], 9),
    "Pediatric Checkup":       (300,    ["Pediatrics", "Clinic"], 5),
    "Dental Cavity":           (300,    ["Dental"], 5),
    "Root Canal":              (1_200,  ["Dental"], 2),
    "Depression Therapy":      (800,    ["Mental Health"], 4),
    "MRI Scan":                (1_500,  ["Radiology"], 3),
    "Physical Rehabilitation": (900,    ["Therapy"], 4),
    "Chest Pain":              (2_000,  ["Hospital", "Urgent Care"], 3),
    "Pneumonia":               (3_000,  ["Hospital", "Clinic"], 3),
    "Kidney Stone":            (2_700,  ["Hospital", "Urgent Care"], 2),
    "Cardiac Arrhythmia":      (3_500,  ["Specialist", "Hospital"], 2),
    "Cataract Surgery":        (3_800,  ["Optometry", "Surgery"], 1.5),
    "Fracture Treatment":      (4_500,  ["Hospital", "Urgent Care", "Specialist"], 2),
    "Hernia Repair":           (6_000,  ["Hospital", "Surgery"], 1),
    "Appendicitis":            (7_000,  ["Hospital", "Surgery"], 1),
    "Gallbladder Removal":     (9_000,  ["Hospital", "Surgery"], 0.8),
    # Legitimately expensive — these trip the SQL "High Claim Amount" rule while being genuine
    "Chemotherapy Session":    (12_000, ["Hospital", "Specialist"], 0.8),
    "Knee Replacement":        (22_000, ["Hospital", "Surgery", "Specialist"], 0.5),
    "Spinal Surgery":          (38_000, ["Hospital", "Surgery"], 0.3),
    "Heart Bypass Surgery":    (45_000, ["Hospital", "Surgery"], 0.2),
    # Chronic: frequent legitimate claims (trip "Frequent Claims" / "Diagnosis Repeat")
    "Dialysis":                (2_500,  ["Hospital", "Clinic"], 0),
}
CHRONIC = {"Dialysis": 7, "Chemotherapy Session": 21, "Physical Rehabilitation": 10}  # days between visits


def lognormal_amount(rng: random.Random, mean: float, sigma: float = 0.35) -> float:
    mu = math.log(mean) - sigma**2 / 2
    return round(max(25.0, rng.lognormvariate(mu, sigma)), 2)


def rand_date(rng: random.Random, start: date, end: date) -> date:
    return start + timedelta(days=rng.randint(0, max(0, (end - start).days)))


def generate(seed: int, n_patients: int, n_providers: int) -> dict:
    rng = random.Random(seed)

    # ── Patients (no PII) ────────────────────────────────────
    patients = []
    for pid in range(1, n_patients + 1):
        age = rng.choices([rng.randint(0, 17), rng.randint(18, 64), rng.randint(65, 90)], weights=[18, 62, 20])[0]
        dob = date(2025 - age, rng.randint(1, 12), rng.randint(1, 28))
        patients.append({"PATIENT_ID": pid, "GENDER": rng.choices(["Male", "Female", "Other"], [48, 50, 2])[0], "DOB": dob})

    # ── Policies (1, sometimes 2 per patient) ────────────────
    policies = []
    for p in patients:
        for _ in range(1 if rng.random() > 0.08 else 2):
            age = 2025 - p["DOB"].year
            ptype = "Senior" if age >= 65 and rng.random() < 0.8 else rng.choice(["Individual", "Family", "Group"])
            start = rand_date(rng, date(2022, 6, 1), date(2025, 6, 1))
            end = start + timedelta(days=365 * rng.choice([1, 2, 3]) - 1)
            lo, hi = COVERAGE_RANGE[ptype]
            policies.append({
                "POLICY_ID": len(policies) + 1, "POLICY_TYPE": ptype, "START_DATE": start, "END_DATE": end,
                "COVERAGE_AMOUNT": float(rng.randrange(lo, hi + 1, 5_000)), "PATIENT_ID": p["PATIENT_ID"],
            })

    # ── Providers; a small ring is fraudulent ────────────────
    providers = [{"PROVIDER_ID": i, "PROVIDER_TYPE": PROVIDER_TYPES[(i - 1) % len(PROVIDER_TYPES)] if i <= len(PROVIDER_TYPES)
                  else rng.choices(PROVIDER_TYPES, weights=[14, 20, 8, 12, 10, 8, 4, 5, 6, 5, 6, 8, 4])[0]}
                 for i in range(1, n_providers + 1)]
    fraud_ring = set(rng.sample([p["PROVIDER_ID"] for p in providers if p["PROVIDER_TYPE"] in ("Clinic", "Hospital", "Specialist")], 5))
    by_type: dict[str, list[int]] = {}
    for p in providers:
        if p["PROVIDER_ID"] not in fraud_ring:
            by_type.setdefault(p["PROVIDER_TYPE"], []).append(p["PROVIDER_ID"])

    def legit_provider(diag: str) -> int:
        types = [t for t in DIAGNOSES[diag][1] if t in by_type]
        return rng.choice(by_type[rng.choice(types)])

    def active_window(pol) -> tuple[date, date] | None:
        s, e = max(pol["START_DATE"], WINDOW_START), min(pol["END_DATE"], WINDOW_END)
        return (s, e) if s <= e else None

    claims: list[dict] = []

    def add(pol, provider_id, diag, amount, d, fraud, pattern):
        claims.append({"CLAIM_DATE": d, "CLAIM_AMOUNT": round(amount, 2), "DIAGNOSIS": diag,
                       "POLICY_ID": pol["POLICY_ID"], "PROVIDER_ID": provider_id,
                       "IS_FRAUD": int(fraud), "FRAUD_PATTERN": pattern})

    common = [d for d, v in DIAGNOSES.items() if v[2] > 0]
    weights = [DIAGNOSES[d][2] for d in common]
    active_policies = [p for p in policies if active_window(p)]

    # ── Legitimate claims ────────────────────────────────────
    for pol in active_policies:
        s, e = active_window(pol)
        for _ in range(rng.choices([0, 1, 2, 3, 4, 6, 9], weights=[10, 22, 24, 18, 12, 9, 5])[0]):
            diag = rng.choices(common, weights)[0]
            add(pol, legit_provider(diag), diag, lognormal_amount(rng, DIAGNOSES[diag][0]), rand_date(rng, s, e), False, "")

    # Chronic patients: regular, frequent, legitimate visits (rule false-positives)
    for pol in rng.sample(active_policies, k=max(1, len(active_policies) // 25)):
        s, e = active_window(pol)
        diag = rng.choice(list(CHRONIC))
        prov = legit_provider(diag)
        d = rand_date(rng, s, min(e, s + timedelta(days=120)))
        for _ in range(rng.randint(6, 16)):
            if d > e:
                break
            add(pol, prov, diag, lognormal_amount(rng, DIAGNOSES[diag][0], 0.15), d, False, "")
            d += timedelta(days=CHRONIC[diag] + rng.randint(-1, 2))

    n_legit = len(claims)
    legit_snapshot = list(claims)

    # ── Fraud patterns (ground truth independent of SQL rules) ─
    def pick():
        pol = rng.choice(active_policies)
        return pol, active_window(pol)

    def scaled(k):  # keep fraud prevalence roughly constant as dataset size changes
        return max(1, round(k * n_legit / 12_000))

    for _ in range(scaled(240)):   # upcoding: billed far above typical cost for the diagnosis
        pol, (s, e) = pick(); diag = rng.choices(common, weights)[0]
        add(pol, legit_provider(diag), diag, DIAGNOSES[diag][0] * rng.uniform(1.8, 6.0), rand_date(rng, s, e), True, "upcoding")

    for _ in range(scaled(110)):   # near_threshold: inflated but kept just under the $10,000 rule
        pol, (s, e) = pick(); diag = rng.choice([d for d in common if DIAGNOSES[d][0] < 3_000])
        add(pol, legit_provider(diag), diag, rng.uniform(8_500, 9_999.99), rand_date(rng, s, e), True, "near_threshold")

    for _ in range(scaled(110)):   # provider_mismatch: provider type does not treat this diagnosis
        pol, (s, e) = pick(); diag = rng.choices(common, weights)[0]
        wrong = [t for t in by_type if t not in DIAGNOSES[diag][1]]
        add(pol, rng.choice(by_type[rng.choice(wrong)]), diag, DIAGNOSES[diag][0] * rng.uniform(1.0, 2.2),
            rand_date(rng, s, e), True, "provider_mismatch")

    for _ in range(scaled(90)):    # out_of_policy_period: service date outside coverage dates
        pol = rng.choice(policies); diag = rng.choices(common, weights)[0]
        d = pol["START_DATE"] - timedelta(days=rng.randint(1, 120)) if rng.random() < 0.5 else pol["END_DATE"] + timedelta(days=rng.randint(1, 120))
        if WINDOW_START <= d <= WINDOW_END:
            add(pol, legit_provider(diag), diag, lognormal_amount(rng, DIAGNOSES[diag][0]), d, True, "out_of_policy_period")

    for src in rng.sample(legit_snapshot, scaled(140)):  # duplicate_claim: same bill resubmitted days later
        pol = next(p for p in policies if p["POLICY_ID"] == src["POLICY_ID"])
        add(pol, src["PROVIDER_ID"], src["DIAGNOSIS"], src["CLAIM_AMOUNT"], src["CLAIM_DATE"] + timedelta(days=rng.randint(0, 5)),
            True, "duplicate_claim")

    for _ in range(scaled(40)):    # claim_burst: many moderate claims on one policy within two weeks
        pol, (s, e) = pick(); start = rand_date(rng, s, e)
        for _ in range(rng.randint(4, 6)):
            diag = rng.choices(common, weights)[0]
            d = start + timedelta(days=rng.randint(0, 14))
            if d <= e:
                add(pol, legit_provider(diag), diag, DIAGNOSES[diag][0] * rng.uniform(1.2, 2.5), d, True, "claim_burst")

    for prov in fraud_ring:        # provider_ring: colluding providers bill inflated claims across many patients
        ptype = next(p["PROVIDER_TYPE"] for p in providers if p["PROVIDER_ID"] == prov)
        diags = [d for d in common if ptype in DIAGNOSES[d][1]]
        for _ in range(scaled(rng.randint(30, 50))):
            pol, (s, e) = pick(); diag = rng.choice(diags)
            add(pol, prov, diag, DIAGNOSES[diag][0] * rng.uniform(1.5, 3.2), rand_date(rng, s, e), True, "provider_ring")
        for _ in range(scaled(rng.randint(5, 10))):  # ring providers also file some genuine claims
            pol, (s, e) = pick(); diag = rng.choice(diags)
            add(pol, prov, diag, lognormal_amount(rng, DIAGNOSES[diag][0]), rand_date(rng, s, e), False, "")

    claims.sort(key=lambda c: (c["CLAIM_DATE"], c["POLICY_ID"]))
    for i, c in enumerate(claims, 1):
        c["CLAIM_ID"] = i

    return {"patients": patients, "policies": policies, "providers": providers, "claims": claims, "fraud_ring": sorted(fraud_ring)}


def write_csv(path: Path, rows: list[dict], cols: list[str]) -> None:
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for r in rows:
            w.writerow({k: (v.isoformat() if isinstance(v, date) else v) for k, v in ((k, r[k]) for k in cols)})


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--patients", type=int, default=4_000)
    ap.add_argument("--providers", type=int, default=150)
    ap.add_argument("--out", type=Path, default=Path(__file__).resolve().parents[1] / "datasets" / "synthetic_v1")
    args = ap.parse_args()

    data = generate(args.seed, args.patients, args.providers)
    args.out.mkdir(parents=True, exist_ok=True)
    write_csv(args.out / "patients.csv", data["patients"], ["PATIENT_ID", "GENDER", "DOB"])
    write_csv(args.out / "policies.csv", data["policies"], ["POLICY_ID", "POLICY_TYPE", "START_DATE", "END_DATE", "COVERAGE_AMOUNT", "PATIENT_ID"])
    write_csv(args.out / "providers.csv", data["providers"], ["PROVIDER_ID", "PROVIDER_TYPE"])
    write_csv(args.out / "claims.csv", data["claims"],
              ["CLAIM_ID", "CLAIM_DATE", "CLAIM_AMOUNT", "DIAGNOSIS", "POLICY_ID", "PROVIDER_ID", "IS_FRAUD", "FRAUD_PATTERN"])

    claims = data["claims"]
    n_fraud = sum(c["IS_FRAUD"] for c in claims)
    # How the existing SQL "High Claim Amount" rule alone would do — shows why ML is needed
    rule_hit = [c for c in claims if c["CLAIM_AMOUNT"] > 10_000]
    manifest = {
        "dataset": args.out.name,
        "kind": "synthetic",
        "contains_real_data": False,
        "generator": "ml_service/training/generate_synthetic.py",
        "generator_version": GENERATOR_VERSION,
        "seed": args.seed,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "date_range": [WINDOW_START.isoformat(), WINDOW_END.isoformat()],
        "rows": {k: len(data[k]) for k in ("patients", "policies", "providers", "claims")},
        "fraud_rate": round(n_fraud / len(claims), 4),
        "fraud_patterns": dict(Counter(c["FRAUD_PATTERN"] for c in claims if c["IS_FRAUD"])),
        "fraud_ring_provider_ids": data["fraud_ring"],
        "excluded_columns": {"CLAIM.STATUS": "post-review decision (label leakage)",
                             "CLAIM.APPROVED_AMOUNT": "post-review decision (label leakage)",
                             "PATIENT names/emails/addresses": "not needed; avoids fake PII"},
        "baseline_high_amount_rule": {
            "flagged": len(rule_hit),
            "precision": round(sum(c["IS_FRAUD"] for c in rule_hit) / max(1, len(rule_hit)), 4),
            "recall": round(sum(c["IS_FRAUD"] for c in rule_hit) / max(1, n_fraud), 4),
        },
    }
    (args.out / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps({k: manifest[k] for k in ("rows", "fraud_rate", "fraud_patterns", "baseline_high_amount_rule")}, indent=2))
    print(f"Written to {args.out}")


if __name__ == "__main__":
    main()
