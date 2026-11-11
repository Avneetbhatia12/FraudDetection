# Datasets

All ML training data lives here, **separate from the application database**.
Synthetic or public records are never written into `fraud_detection`. If relational
integration tests need them in MySQL, they go into a separate schema, never the app schema.

## Dataset registry

| Dataset | Kind | Real data? | Source | Rows (claims) | Label |
|---|---|---|---|---|---|
| `synthetic_v1/` | **Synthetic** | No | `training/generate_synthetic.py`, seed 42, v1.0.0 | 13,600 (7.95% fraud) | `IS_FRAUD`, `FRAUD_PATTERN` |

**Public datasets:** none adopted yet. If one is added, record it here with its source URL,
licence (check it before use), download date, any transformation applied, and how its columns
map to ours. Keep it in its own folder (e.g. `public_<name>/`) with a `manifest.json` whose
`kind` is `"public"`.

**Real application data:** never copied here. Models are scored on live claims through
the ML service. Investigator outcomes (`CLAIM_INVESTIGATION_OUTCOME`) become real labels
for future retraining.

## `synthetic_v1`

Files: `patients.csv`, `policies.csv`, `providers.csv`, `claims.csv`, `manifest.json`.
The columns use the same names as the MySQL tables, so one feature pipeline works for both.
You can regenerate the data exactly:

```bash
py -3.12 ml_service/training/generate_synthetic.py --seed 42
```

**Contains no personal data.** There are no names, emails or addresses. `DOB` and `GENDER` are random.

### Columns that must NOT be model features
| Column | Why |
|---|---|
| `IS_FRAUD` | The label |
| `FRAUD_PATTERN` | Describes the label (for evaluation and analysis only) |
| `CLAIM_ID` | Row identifier, ordered by date |

`STATUS` and `APPROVED_AMOUNT` are left out of the data entirely. In the real system they're
set *after* review, so using them would leak the outcome into the model.

### Fraud patterns (the ground truth is defined independently of the SQL rules)
| Pattern | Description | Caught by existing SQL rules? |
|---|---|---|
| `upcoding` | Billed 1.8–6× the typical cost for the diagnosis | Only if the amount is over $10k |
| `near_threshold` | Inflated, but kept at $8.5k–$9,999 | **No.** Designed to evade the $10k rule |
| `provider_mismatch` | The provider type doesn't treat that diagnosis (e.g. Dental billing for Pneumonia) | **No** |
| `out_of_policy_period` | Service date falls outside the policy dates | **No** |
| `duplicate_claim` | The same bill resubmitted 0–5 days later | Rarely |
| `claim_burst` | 4–6 moderate claims on one policy within 14 days | Partly ("Frequent Claims") |
| `provider_ring` | 5 colluding providers billing inflated claims across many patients | Partly ("Provider Overuse") |

### Deliberate legitimate cases that the rules flag (rule false positives)
- Genuinely expensive care (chemotherapy, knee replacement, spinal or heart surgery) goes over $10k.
- Chronic patients (dialysis, chemotherapy, rehab) file frequent, repeated-diagnosis claims.
- Fraud-ring providers also file some genuine claims.

### Known limitations
- The cost distributions and pattern rates are assumptions, not calibrated to real claims data.
  Model metrics on this data show that the pipeline works; they **don't** predict real-world accuracy.
- `out_of_policy_period` has fewer rows (42) because generated dates outside the 2024–2025 window are discarded.
- The data is clean and well separated by construction, so expect optimistic scores.
  Treat real investigator labels as the true test.
