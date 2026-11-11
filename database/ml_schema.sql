-- ============================================================
-- AI risk-assessment extension: ADDITIVE ONLY (revised in Phase 4.0)
-- ============================================================
-- STATUS: NOT APPLIED. Apply only after explicit approval and a fresh backup:
--     mysql -u root -p < database/ml_schema.sql
-- Undo:  mysql -u root -p < database/ml_schema_rollback.sql
--
-- Guarantees
--   * Creates NEW tables, views and triggers only. It does NOT alter, drop or write to any existing
--     table (PATIENT, POLICY, MEDICAL_PROVIDER, CLAIM, FRAUD_RULE, CLAIM_RULE, FRAUD_FLAG), the
--     existing trigger trg_after_claim_insert, the procedures/function, or the HIGH_RISK_CLAIMS view.
--   * Never changes CLAIM.STATUS or CLAIM.APPROVED_AMOUNT. No column stores a combined fraud score
--     or a fraud probability. AI output never rejects or approves a claim.
--   * Assessments, provider profiles and investigation outcomes are APPEND-ONLY (enforced by
--     BEFORE UPDATE/DELETE triggers on these new tables). A re-run adds a row; the newest row is current.
--   * Research models trained on public data cannot be marked as applicable to live application data
--     (CHECK constraint on MODEL_REGISTRY).
--   * No synthetic or public dataset records are ever stored here.
--
-- Supersedes the Phase 1 draft (ML_MODEL, CLAIM_RISK_SCORE with ML_PROBABILITY / HYBRID_SCORE,
-- CLAIM_SCORE_EXPLANATION), which was never applied. See git history.
-- Requires MySQL 8.0.16+ (enforced CHECK constraints, JSON, window functions).
-- ============================================================
USE fraud_detection;

-- ------------------------------------------------------------
-- 1. MODEL_REGISTRY: every model or rule-set version whose output the application can show.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS MODEL_REGISTRY (
    MODEL_ID             INT AUTO_INCREMENT PRIMARY KEY,
    MODEL_KEY            VARCHAR(64)  NOT NULL UNIQUE,   -- stable identifier, e.g. 'app-indicators-v2', 'kaggle-xgb-run-20261111-102008'
    MODEL_KIND           ENUM('research_benchmark',      -- trained on public data; insights only
                              'app_indicator_set',       -- transparent statistical indicators (not ML)
                              'app_anomaly_model',       -- future: unsupervised model on application data
                              'app_supervised_model')    -- future: trained on application investigator outcomes
                         NOT NULL,
    VERSION              VARCHAR(32)  NOT NULL,
    TRAINING_DATA        ENUM('none', 'kaggle_public_medicare', 'application_data') NOT NULL,
    APPLIES_TO_LIVE_DATA TINYINT(1)   NOT NULL DEFAULT 0, -- 1 = may produce outputs for application claims/providers
    DESCRIPTION          TEXT         NOT NULL,
    DEFINITION           JSON         NOT NULL,           -- indicator specs + thresholds, or feature list + hyper-parameters
    METRICS              JSON         NULL,               -- evaluation results (research/supervised models)
    ARTIFACT_SHA256      CHAR(64)     NULL,               -- checksum of the model file, if any
    IS_ACTIVE            TINYINT(1)   NOT NULL DEFAULT 0, -- the version currently used for its kind
    CREATED_AT           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_registry_research_not_live
        CHECK (NOT (MODEL_KIND = 'research_benchmark' AND APPLIES_TO_LIVE_DATA = 1)),
    CONSTRAINT chk_registry_research_data
        CHECK (MODEL_KIND <> 'research_benchmark' OR TRAINING_DATA = 'kaggle_public_medicare'),
    CONSTRAINT chk_registry_app_supervised_data
        CHECK (MODEL_KIND <> 'app_supervised_model' OR TRAINING_DATA = 'application_data'),
    INDEX idx_registry_kind_active (MODEL_KIND, IS_ACTIVE)
);

-- ------------------------------------------------------------
-- 2. CLAIM_RISK_ASSESSMENT: claim-level indicator results (append-only history).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS CLAIM_RISK_ASSESSMENT (
    ASSESSMENT_ID          INT AUTO_INCREMENT PRIMARY KEY,
    CLAIM_ID               INT          NOT NULL,
    MODEL_ID               INT          NOT NULL,          -- indicator-set (or later model) version used
    ASSESSMENT_STATUS      ENUM('completed',               -- indicators computed (some may individually report insufficient history)
                                'insufficient_data',       -- no indicator could be computed
                                'failed')                  -- ML service error / timeout; ERROR_MESSAGE set
                           NOT NULL,
    INDICATOR_SET_VERSION  VARCHAR(32)  NULL,              -- e.g. '2.0.0' (also via MODEL_ID); part of the digest
    SNAPSHOT_CLAIM_COUNT   INT          NULL,              -- claims visible in the read-only snapshot used (provenance; NOT in the digest)
    INDICATORS_DIGEST      CHAR(64)     NULL,              -- SHA-256 of the deterministic assessment content (see ml_service/app_risk/snapshots.py).
                                                           -- A new row is appended only when this differs from the claim's latest digest.
    RULE_HITS              JSON         NULL,              -- snapshot of CLAIM_RULE at assessment time: [{rule_id, rule_name}]
    INDICATORS             JSON         NULL,              -- [{code, level, value, reference, threshold, status, triggered, reason,
                                                           --   comparison_claim_ids}]: the IDs are the audit trail of what was compared
    TRIGGERED_COUNT        TINYINT      NULL,              -- number of indicators with triggered = true
    REVIEW_PRIORITY        ENUM('Routine','Elevated','High') NULL,  -- documented ordering aid; NOT a score, NOT a decision
    PRIORITY_REASONS       JSON         NULL,              -- human-readable reasons behind REVIEW_PRIORITY
    ERROR_MESSAGE          VARCHAR(500) NULL,
    TRIGGER_SOURCE         ENUM('on_view','manual_recompute','batch') NOT NULL DEFAULT 'on_view',
    REQUESTED_BY_USER_ID   INT          NULL,              -- application user id from the JWT (users are not a DB table)
    ASSESSED_AT            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_cra_claim FOREIGN KEY (CLAIM_ID) REFERENCES CLAIM(CLAIM_ID),
    CONSTRAINT fk_cra_model FOREIGN KEY (MODEL_ID) REFERENCES MODEL_REGISTRY(MODEL_ID),
    CONSTRAINT chk_cra_failed_has_error CHECK (ASSESSMENT_STATUS <> 'failed' OR ERROR_MESSAGE IS NOT NULL),
    CONSTRAINT chk_cra_snapshot_complete CHECK (ASSESSMENT_STATUS = 'failed' OR
        (INDICATORS_DIGEST IS NOT NULL AND SNAPSHOT_CLAIM_COUNT IS NOT NULL AND INDICATOR_SET_VERSION IS NOT NULL)),
    CONSTRAINT chk_cra_digest_format CHECK (INDICATORS_DIGEST IS NULL OR INDICATORS_DIGEST REGEXP '^[0-9a-f]{64}$'),
    INDEX idx_cra_claim_time (CLAIM_ID, ASSESSED_AT),
    INDEX idx_cra_priority (REVIEW_PRIORITY, ASSESSED_AT)
);

-- ------------------------------------------------------------
-- 3. PROVIDER_RISK_PROFILE: provider-level indicator snapshots (append-only).
--    Kept separate from claim-level assessments: provider and claim risk are never merged.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS PROVIDER_RISK_PROFILE (
    PROFILE_ID     INT AUTO_INCREMENT PRIMARY KEY,
    PROVIDER_ID    INT          NOT NULL,
    MODEL_ID       INT          NOT NULL,
    PROFILE_STATUS ENUM('completed','insufficient_data','failed') NOT NULL,
    AS_OF_DATE     DATE         NOT NULL,                  -- only claims with CLAIM_DATE <= AS_OF_DATE were used
    CLAIM_COUNT    INT          NULL,                      -- claims used (convenience snapshot)
    INDICATORS     JSON         NULL,                      -- [{code, value, peer_reference, status, triggered, reason}]
    ERROR_MESSAGE  VARCHAR(500) NULL,
    COMPUTED_AT    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_prp_provider FOREIGN KEY (PROVIDER_ID) REFERENCES MEDICAL_PROVIDER(PROVIDER_ID),
    CONSTRAINT fk_prp_model    FOREIGN KEY (MODEL_ID)    REFERENCES MODEL_REGISTRY(MODEL_ID),
    CONSTRAINT chk_prp_failed_has_error CHECK (PROFILE_STATUS <> 'failed' OR ERROR_MESSAGE IS NOT NULL),
    INDEX idx_prp_provider_time (PROVIDER_ID, COMPUTED_AT)
);

-- ------------------------------------------------------------
-- 4. CLAIM_INVESTIGATION_OUTCOME: investigator decisions (append-only history).
--    Separate from CLAIM.STATUS. The latest 'Confirmed Fraud' / 'Legitimate' outcome per claim is the
--    candidate label for a FUTURE application-specific supervised model (Track 3). Writes are restricted
--    to Admin/Investigator by the backend (middleware/requireRole.js).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS CLAIM_INVESTIGATION_OUTCOME (
    OUTCOME_ID         INT AUTO_INCREMENT PRIMARY KEY,
    CLAIM_ID           INT          NOT NULL,
    OUTCOME            ENUM('Confirmed Fraud','Legitimate','Requires Further Investigation') NOT NULL,
    OUTCOME_BASIS      ENUM('documentary_evidence','investigator_judgement','external_finding','other') NULL,
                                                           -- supports later label-quality analysis
    NOTES              TEXT         NULL,
    DECIDED_BY_USER_ID INT          NOT NULL,              -- from the JWT (no FK: users live in the backend)
    DECIDED_BY_EMAIL   VARCHAR(100) NOT NULL,
    DECIDED_BY_ROLE    VARCHAR(30)  NOT NULL,
    ASSESSMENT_ID      INT          NULL,                  -- the assessment the investigator was looking at, if any
    DECIDED_AT         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_cio_claim      FOREIGN KEY (CLAIM_ID)      REFERENCES CLAIM(CLAIM_ID),
    CONSTRAINT fk_cio_assessment FOREIGN KEY (ASSESSMENT_ID) REFERENCES CLAIM_RISK_ASSESSMENT(ASSESSMENT_ID),
    CONSTRAINT chk_cio_role CHECK (DECIDED_BY_ROLE IN ('Admin','Investigator')),
    INDEX idx_cio_claim_time (CLAIM_ID, DECIDED_AT),
    INDEX idx_cio_outcome (OUTCOME)
);

-- ------------------------------------------------------------
-- 5. Append-only enforcement (triggers on the NEW tables only)
-- ------------------------------------------------------------
DELIMITER $$
DROP TRIGGER IF EXISTS trg_cra_no_update$$
CREATE TRIGGER trg_cra_no_update BEFORE UPDATE ON CLAIM_RISK_ASSESSMENT FOR EACH ROW
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'CLAIM_RISK_ASSESSMENT is append-only'$$
DROP TRIGGER IF EXISTS trg_cra_no_delete$$
CREATE TRIGGER trg_cra_no_delete BEFORE DELETE ON CLAIM_RISK_ASSESSMENT FOR EACH ROW
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'CLAIM_RISK_ASSESSMENT is append-only'$$
DROP TRIGGER IF EXISTS trg_prp_no_update$$
CREATE TRIGGER trg_prp_no_update BEFORE UPDATE ON PROVIDER_RISK_PROFILE FOR EACH ROW
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'PROVIDER_RISK_PROFILE is append-only'$$
DROP TRIGGER IF EXISTS trg_prp_no_delete$$
CREATE TRIGGER trg_prp_no_delete BEFORE DELETE ON PROVIDER_RISK_PROFILE FOR EACH ROW
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'PROVIDER_RISK_PROFILE is append-only'$$
DROP TRIGGER IF EXISTS trg_cio_no_update$$
CREATE TRIGGER trg_cio_no_update BEFORE UPDATE ON CLAIM_INVESTIGATION_OUTCOME FOR EACH ROW
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'CLAIM_INVESTIGATION_OUTCOME is append-only'$$
DROP TRIGGER IF EXISTS trg_cio_no_delete$$
CREATE TRIGGER trg_cio_no_delete BEFORE DELETE ON CLAIM_INVESTIGATION_OUTCOME FOR EACH ROW
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'CLAIM_INVESTIGATION_OUTCOME is append-only'$$
DELIMITER ;

-- ------------------------------------------------------------
-- 6. "Current" views (newest row per claim / provider)
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW CLAIM_LATEST_ASSESSMENT AS
SELECT * FROM (
    SELECT a.*, ROW_NUMBER() OVER (PARTITION BY a.CLAIM_ID ORDER BY a.ASSESSED_AT DESC, a.ASSESSMENT_ID DESC) AS RN
    FROM CLAIM_RISK_ASSESSMENT a) x
WHERE RN = 1;

-- Latest NON-FAILED snapshot per claim. This (not CLAIM_LATEST_ASSESSMENT, which may be a failed attempt) is the
-- baseline for the append-only rule: a new snapshot is appended only if its INDICATORS_DIGEST differs from this row's.
CREATE OR REPLACE VIEW CLAIM_LATEST_VALID_ASSESSMENT AS
SELECT * FROM (
    SELECT a.*, ROW_NUMBER() OVER (PARTITION BY a.CLAIM_ID ORDER BY a.ASSESSED_AT DESC, a.ASSESSMENT_ID DESC) AS RN
    FROM CLAIM_RISK_ASSESSMENT a
    WHERE a.ASSESSMENT_STATUS <> 'failed') x
WHERE RN = 1;

CREATE OR REPLACE VIEW PROVIDER_LATEST_PROFILE AS
SELECT * FROM (
    SELECT p.*, ROW_NUMBER() OVER (PARTITION BY p.PROVIDER_ID ORDER BY p.COMPUTED_AT DESC, p.PROFILE_ID DESC) AS RN
    FROM PROVIDER_RISK_PROFILE p) x
WHERE RN = 1;

-- Training-data safeguard (Track 3): for every outcome, the assessment snapshot that EXISTED when the outcome was
-- recorded: the linked ASSESSMENT_ID if it was assessed at or before DECIDED_AT, otherwise the latest non-failed
-- snapshot with ASSESSED_AT <= DECIDED_AT. Future supervised training must take its features from this snapshot and
-- must never recompute them with information entered later. NULL = no valid snapshot (exclude from training).
CREATE OR REPLACE VIEW OUTCOME_TRAINING_SNAPSHOT AS
SELECT o.OUTCOME_ID, o.CLAIM_ID, o.OUTCOME, o.OUTCOME_BASIS, o.DECIDED_AT,
       COALESCE(
         (SELECT a.ASSESSMENT_ID FROM CLAIM_RISK_ASSESSMENT a
           WHERE a.ASSESSMENT_ID = o.ASSESSMENT_ID AND a.CLAIM_ID = o.CLAIM_ID
             AND a.ASSESSED_AT <= o.DECIDED_AT AND a.ASSESSMENT_STATUS <> 'failed'),
         (SELECT a.ASSESSMENT_ID FROM CLAIM_RISK_ASSESSMENT a
           WHERE a.CLAIM_ID = o.CLAIM_ID AND a.ASSESSED_AT <= o.DECIDED_AT AND a.ASSESSMENT_STATUS <> 'failed'
           ORDER BY a.ASSESSED_AT DESC, a.ASSESSMENT_ID DESC LIMIT 1)
       ) AS TRAINING_ASSESSMENT_ID
FROM CLAIM_INVESTIGATION_OUTCOME o;

-- Latest outcome per claim; IS_LABEL_CANDIDATE = 1 only for final outcomes (future supervised training, Track 3)
CREATE OR REPLACE VIEW CLAIM_LATEST_OUTCOME AS
SELECT x.*, (x.OUTCOME IN ('Confirmed Fraud','Legitimate')) AS IS_LABEL_CANDIDATE FROM (
    SELECT o.*, ROW_NUMBER() OVER (PARTITION BY o.CLAIM_ID ORDER BY o.DECIDED_AT DESC, o.OUTCOME_ID DESC) AS RN
    FROM CLAIM_INVESTIGATION_OUTCOME o) x
WHERE RN = 1;
