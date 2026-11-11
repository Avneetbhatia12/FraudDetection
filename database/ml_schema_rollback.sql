-- ============================================================
-- Rollback for ml_schema.sql — removes ONLY the AI/ML objects.
-- Existing tables, trigger, procedures, function and the
-- HIGH_RISK_CLAIMS view are not touched.
-- WARNING: deletes stored ML scores, explanations and investigation
-- outcomes. Back up first if those matter.
-- ============================================================
USE fraud_detection;

DROP VIEW  IF EXISTS CLAIM_LATEST_RISK_SCORE;
DROP TABLE IF EXISTS CLAIM_INVESTIGATION_OUTCOME;
DROP TABLE IF EXISTS CLAIM_SCORE_EXPLANATION;
DROP TABLE IF EXISTS CLAIM_RISK_SCORE;
DROP TABLE IF EXISTS ML_MODEL;
