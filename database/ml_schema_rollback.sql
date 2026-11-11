-- ============================================================
-- Rollback for ml_schema.sql: removes ONLY the AI risk-assessment objects.
-- Existing tables, trg_after_claim_insert, procedures, function and the
-- HIGH_RISK_CLAIMS view are not touched.
-- WARNING: permanently deletes stored assessments, provider profiles and
-- investigation outcomes (the append-only history). Back up first:
--   mysqldump -u root -p fraud_detection MODEL_REGISTRY CLAIM_RISK_ASSESSMENT \
--     PROVIDER_RISK_PROFILE CLAIM_INVESTIGATION_OUTCOME > ai_tables_backup.sql
-- ============================================================
USE fraud_detection;

DROP VIEW IF EXISTS CLAIM_LATEST_OUTCOME;
DROP VIEW IF EXISTS OUTCOME_TRAINING_SNAPSHOT;
DROP VIEW IF EXISTS PROVIDER_LATEST_PROFILE;
DROP VIEW IF EXISTS CLAIM_LATEST_VALID_ASSESSMENT;
DROP VIEW IF EXISTS CLAIM_LATEST_ASSESSMENT;

DROP TRIGGER IF EXISTS trg_cio_valid_snapshot;
DROP TRIGGER IF EXISTS trg_cio_no_delete;
DROP TRIGGER IF EXISTS trg_cio_no_update;
DROP TRIGGER IF EXISTS trg_prp_no_delete;
DROP TRIGGER IF EXISTS trg_prp_no_update;
DROP TRIGGER IF EXISTS trg_cra_no_delete;
DROP TRIGGER IF EXISTS trg_cra_no_update;

DROP TABLE IF EXISTS CLAIM_INVESTIGATION_OUTCOME;   -- references CLAIM_RISK_ASSESSMENT
DROP TABLE IF EXISTS CLAIM_RISK_ASSESSMENT;
DROP TABLE IF EXISTS PROVIDER_RISK_PROFILE;
DROP TABLE IF EXISTS MODEL_REGISTRY;
