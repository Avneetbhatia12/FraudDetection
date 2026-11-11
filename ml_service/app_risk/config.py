"""
Configuration for the application-native risk indicators (Track 2).

These indicators are transparent statistics computed from the application's own MySQL data. They are
NOT machine-learning predictions. Every threshold below is a configured design choice (documented, versioned,
not learned from labels; the application has none). Changing any value requires a new INDICATOR_SET_VERSION.
"""

INDICATOR_SET_KEY = "app-indicators-v1"
INDICATOR_SET_VERSION = "1.0.0"

# Columns that must NEVER be loaded or used: post-review decisions (label leakage) and sensitive attributes.
FORBIDDEN_COLUMNS = {"STATUS", "APPROVED_AMOUNT", "GENDER", "DOB", "FIRST_NAME", "LAST_NAME", "EMAIL", "ADDRESS"}

# Claim-level thresholds
COVERAGE_SHARE_THRESHOLD = 0.50          # claim amount >= 50% of the policy's total coverage
DIAGNOSIS_RATIO_THRESHOLD = 3.0          # amount >= 3x the median of earlier claims with the same diagnosis
MIN_DIAGNOSIS_HISTORY = 5                # earlier claims with the same diagnosis needed for a median
MIN_PROVIDER_TYPE_HISTORY = 10           # earlier claims for the provider type needed to call a diagnosis "new"
PATIENT_30D_THRESHOLD = 3                # patient's earlier claims within the 30 days up to the claim date
REPEAT_VISIT_DAYS_THRESHOLD = 7          # patient's previous claim within 7 days
DUPLICATE_WINDOW_DAYS = 7                # near-duplicate search window (either side of the claim date)
DUPLICATE_AMOUNT_TOLERANCE = 0.01        # amounts within 1%
PROVIDER_SURGE_MULTIPLIER = 3.0          # provider's last-30-day count >= 3x its own earlier 30-day rate
PROVIDER_SURGE_MIN_COUNT = 3             # ...and at least 3 claims in the last 30 days
MIN_PROVIDER_BASELINE_CLAIMS = 5         # claims needed in the provider's baseline window (days 31-365 before)

# Provider-level settings
MIN_PROVIDER_CLAIMS = 5                  # ratio indicators need >= 5 claims
MIN_PEERS = 10                           # peer comparison needs >= 10 comparable providers
PEER_HIGH_PERCENTILE = 90                # "unusually high" = above the peers' 90th percentile
PEER_LOW_PERCENTILE = 10                 # "unusually low" = below the peers' 10th percentile
