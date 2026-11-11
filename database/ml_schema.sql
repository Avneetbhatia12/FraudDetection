-- ============================================================
-- AI / ML extension schema — ADDITIVE ONLY
-- ============================================================
-- Creates NEW tables for the hybrid fraud-scoring layer.
--   * Does NOT alter, drop, or write to any existing table, trigger,
--     procedure, function or view.
--   * Does NOT touch CLAIM.STATUS, CLAIM.APPROVED_AMOUNT, FRAUD_FLAG or
--     CLAIM_RULE — the existing rule engine and decisions are preserved.
--   * Every table is append-only by design: rescoring or a new
--     investigation decision adds a row, never overwrites one.
--   * No synthetic training data is ever stored here (see ml_service/datasets).
--
-- Apply (after schema.sql / seed.sql / procedures_triggers.sql):
--   mysql -u root -p < database/ml_schema.sql
-- Undo:
--   mysql -u root -p < database/ml_schema_rollback.sql
-- Requires MySQL 8.0+ (JSON columns, window functions in the view).
-- ============================================================
USE fraud_detection;

-- 1. Registry of trained models (one row per trained artifact)
CREATE TABLE IF NOT EXISTS ML_MODEL (
    MODEL_ID         INT AUTO_INCREMENT PRIMARY KEY,
    MODEL_VERSION    VARCHAR(64)  NOT NULL UNIQUE,          -- e.g. xgb-20261111-01
    ALGORITHM        VARCHAR(50)  NOT NULL,                 -- LogisticRegression | RandomForest | XGBoost | IsolationForest
    MODEL_ROLE       ENUM('classifier','anomaly') NOT NULL,
    TRAINING_DATASET VARCHAR(255) NOT NULL,                 -- file name / dataset id
    DATASET_KIND     ENUM('synthetic','public','real') NOT NULL,
    FEATURES         JSON         NOT NULL,                 -- ordered feature list
    METRICS          JSON         NULL,                     -- PR-AUC, recall@k, F1, ...
    IS_ACTIVE        TINYINT(1)   NOT NULL DEFAULT 0,
    TRAINED_AT       DATETIME     NOT NULL,
    REGISTERED_AT    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Hybrid risk score per claim (append-only; latest row per claim is current)
CREATE TABLE IF NOT EXISTS CLAIM_RISK_SCORE (
    SCORE_ID           INT AUTO_INCREMENT PRIMARY KEY,
    CLAIM_ID           INT          NOT NULL,
    CLASSIFIER_VERSION VARCHAR(64)  NULL,
    ANOMALY_VERSION    VARCHAR(64)  NULL,
    ML_PROBABILITY     DECIMAL(6,5) NULL,                   -- 0..1 from classifier
    ANOMALY_SCORE      DECIMAL(6,5) NULL,                   -- 0..1 normalised Isolation Forest
    RULE_SCORE         DECIMAL(6,5) NULL,                   -- 0..1 from existing CLAIM_RULE hits
    HYBRID_SCORE       DECIMAL(5,2) NULL,                   -- 0..100
    RISK_LEVEL         ENUM('Low','Medium','High','Critical') NULL,
    SCORING_STATUS     ENUM('scored','failed') NOT NULL,
    ERROR_MESSAGE      VARCHAR(500) NULL,                   -- set when ML service unavailable
    SCORE_SOURCE       ENUM('realtime','backfill','manual') NOT NULL DEFAULT 'realtime',
    SCORED_AT          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_crs_claim FOREIGN KEY (CLAIM_ID) REFERENCES CLAIM(CLAIM_ID),
    INDEX idx_crs_claim_time (CLAIM_ID, SCORED_AT),
    INDEX idx_crs_level (RISK_LEVEL)
);

-- 3. SHAP explanation rows for a score (top-k features)
CREATE TABLE IF NOT EXISTS CLAIM_SCORE_EXPLANATION (
    EXPLANATION_ID INT AUTO_INCREMENT PRIMARY KEY,
    SCORE_ID       INT           NOT NULL,
    FEATURE_NAME   VARCHAR(100)  NOT NULL,
    FEATURE_VALUE  VARCHAR(100)  NULL,
    SHAP_VALUE     DECIMAL(12,6) NOT NULL,                  -- + pushes toward fraud, - toward legit
    FEATURE_RANK   TINYINT       NOT NULL,                  -- 1 = most influential
    CONSTRAINT fk_cse_score FOREIGN KEY (SCORE_ID) REFERENCES CLAIM_RISK_SCORE(SCORE_ID),
    INDEX idx_cse_score (SCORE_ID)
);

-- 4. Investigator outcomes = ground-truth labels for future retraining.
--    Separate from CLAIM.STATUS so existing workflow/decisions are untouched.
--    Users live in the backend's in-memory store, so there is no FK to a users
--    table; the deciding user's id/email/role are captured from the JWT.
--    Writes are restricted to Admin/Investigator by backend/middleware/requireRole.js.
CREATE TABLE IF NOT EXISTS CLAIM_INVESTIGATION_OUTCOME (
    OUTCOME_ID         INT AUTO_INCREMENT PRIMARY KEY,
    CLAIM_ID           INT          NOT NULL,
    OUTCOME            ENUM('Confirmed Fraud','Legitimate','Requires Further Investigation') NOT NULL,
    NOTES              TEXT         NULL,
    DECIDED_BY_USER_ID INT          NOT NULL,
    DECIDED_BY_EMAIL   VARCHAR(100) NOT NULL,
    DECIDED_BY_ROLE    VARCHAR(30)  NOT NULL,
    RISK_SCORE_ID      INT          NULL,                   -- score the investigator was looking at
    DECIDED_AT         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_cio_claim FOREIGN KEY (CLAIM_ID)      REFERENCES CLAIM(CLAIM_ID),
    CONSTRAINT fk_cio_score FOREIGN KEY (RISK_SCORE_ID) REFERENCES CLAIM_RISK_SCORE(SCORE_ID),
    INDEX idx_cio_claim_time (CLAIM_ID, DECIDED_AT)
);

-- 5. Convenience view: current (latest) score per claim
CREATE OR REPLACE VIEW CLAIM_LATEST_RISK_SCORE AS
SELECT *
FROM (
    SELECT crs.*,
           ROW_NUMBER() OVER (PARTITION BY crs.CLAIM_ID ORDER BY crs.SCORED_AT DESC, crs.SCORE_ID DESC) AS RN
    FROM CLAIM_RISK_SCORE crs
) ranked
WHERE RN = 1;
