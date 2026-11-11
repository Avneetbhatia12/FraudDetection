"""Paths and constants for the Kaggle provider-fraud pipeline."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATASET_DIR = ROOT / "datasets" / "public_kaggle_provider_fraud"
RAW_DIR = DATASET_DIR / "raw"
SPLITS_FILE = DATASET_DIR / "splits.csv"          # git-ignored; regenerated deterministically
ARTIFACTS_DIR = ROOT / "artifacts"
REPORTS_DIR = ROOT / "reports"

SEED = 42
TEST_SIZE = 0.15
N_FOLDS = 5

RAW_FILES = {
    "labels": "Train-1542865627584.csv",
    "beneficiary": "Train_Beneficiarydata-1542865627584.csv",
    "inpatient": "Train_Inpatientdata-1542865627584.csv",
    "outpatient": "Train_Outpatientdata-1542865627584.csv",
}

DIAG_COLS = [f"ClmDiagnosisCode_{i}" for i in range(1, 11)]
PROC_COLS = [f"ClmProcedureCode_{i}" for i in range(1, 7)]
CHRONIC_COLS = [
    "ChronicCond_Alzheimer", "ChronicCond_Heartfailure", "ChronicCond_KidneyDisease", "ChronicCond_Cancer",
    "ChronicCond_ObstrPulmonary", "ChronicCond_Depression", "ChronicCond_Diabetes", "ChronicCond_IschemicHeart",
    "ChronicCond_Osteoporasis", "ChronicCond_rheumatoidarthritis", "ChronicCond_stroke",
]

# Never used as model inputs (see docs/FEATURES.md, "Excluded"):
#   PotentialFraud (the label), Race, Gender, DOB-derived age, State/County as categories,
#   and any feature derived from labels.
EXCLUDED_INPUTS = ["PotentialFraud", "Race", "Gender", "DOB", "State", "County"]

# Fitted-reference settings (fitted on training providers' claims only)
RARE_CODE_MIN_COUNT = 5     # a primary diagnosis seen < 5 times in the reference claims counts as "rare"
MIN_GROUP_FOR_MEDIAN = 5    # need >= 5 reference claims to trust a per-code median amount
