-- ============================================================
-- Triggers, Stored Procedures, Cursors, Views, Queries
-- ============================================================
USE fraud_detection;

-- ============================================================
-- TRIGGER: After INSERT on CLAIM → auto-flag fraud
-- ============================================================
DELIMITER $$

DROP TRIGGER IF EXISTS trg_after_claim_insert$$

CREATE TRIGGER trg_after_claim_insert
AFTER INSERT ON CLAIM
FOR EACH ROW
BEGIN
    DECLARE v_threshold     DECIMAL(12,2);
    DECLARE v_rule_id       INT;
    DECLARE v_rule_name     VARCHAR(100);
    DECLARE v_count         INT;
    DECLARE v_coverage      DECIMAL(12,2);

    -- ── Rule 1: High Claim Amount ──────────────────────────
    SELECT RULE_ID, THRESHOLD_VALUE INTO v_rule_id, v_threshold
    FROM FRAUD_RULE WHERE RULE_NAME = 'High Claim Amount' LIMIT 1;

    IF NEW.CLAIM_AMOUNT > v_threshold THEN
        INSERT IGNORE INTO CLAIM_RULE (CLAIM_ID, RULE_ID) VALUES (NEW.CLAIM_ID, v_rule_id);
        INSERT INTO FRAUD_FLAG (CLAIM_ID, FLAG_REASON, FLAGGED_DATE)
        VALUES (NEW.CLAIM_ID,
                CONCAT('High claim amount: $', NEW.CLAIM_AMOUNT, ' exceeds threshold $', v_threshold),
                CURDATE());
    END IF;

    -- ── Rule 2: Frequent Claims (same policy, last 30 days) ─
    SELECT RULE_ID, THRESHOLD_VALUE INTO v_rule_id, v_threshold
    FROM FRAUD_RULE WHERE RULE_NAME = 'Frequent Claims' LIMIT 1;

    SELECT COUNT(*) INTO v_count
    FROM CLAIM
    WHERE POLICY_ID = NEW.POLICY_ID
      AND CLAIM_DATE BETWEEN DATE_SUB(NEW.CLAIM_DATE, INTERVAL 30 DAY) AND NEW.CLAIM_DATE;

    IF v_count > v_threshold THEN
        INSERT IGNORE INTO CLAIM_RULE (CLAIM_ID, RULE_ID) VALUES (NEW.CLAIM_ID, v_rule_id);
        INSERT INTO FRAUD_FLAG (CLAIM_ID, FLAG_REASON, FLAGGED_DATE)
        VALUES (NEW.CLAIM_ID,
                CONCAT('Frequent claims: ', v_count, ' claims on policy ', NEW.POLICY_ID, ' within 30 days'),
                CURDATE());
    END IF;

    -- ── Rule 3: Provider Overuse (same provider, last 30 days)
    SELECT RULE_ID, THRESHOLD_VALUE INTO v_rule_id, v_threshold
    FROM FRAUD_RULE WHERE RULE_NAME = 'Provider Overuse' LIMIT 1;

    SELECT COUNT(*) INTO v_count
    FROM CLAIM
    WHERE PROVIDER_ID = NEW.PROVIDER_ID
      AND CLAIM_DATE BETWEEN DATE_SUB(NEW.CLAIM_DATE, INTERVAL 30 DAY) AND NEW.CLAIM_DATE;

    IF v_count > v_threshold THEN
        INSERT IGNORE INTO CLAIM_RULE (CLAIM_ID, RULE_ID) VALUES (NEW.CLAIM_ID, v_rule_id);
        INSERT INTO FRAUD_FLAG (CLAIM_ID, FLAG_REASON, FLAGGED_DATE)
        VALUES (NEW.CLAIM_ID,
                CONCAT('Provider overuse: provider ', NEW.PROVIDER_ID, ' has ', v_count, ' claims in 30 days'),
                CURDATE());
    END IF;

    -- ── Rule 4: Abnormal Diagnosis Repeat (same policy, 60 days)
    SELECT RULE_ID, THRESHOLD_VALUE INTO v_rule_id, v_threshold
    FROM FRAUD_RULE WHERE RULE_NAME = 'Abnormal Diagnosis Repeat' LIMIT 1;

    SELECT COUNT(*) INTO v_count
    FROM CLAIM
    WHERE POLICY_ID = NEW.POLICY_ID
      AND DIAGNOSIS  = NEW.DIAGNOSIS
      AND CLAIM_DATE BETWEEN DATE_SUB(NEW.CLAIM_DATE, INTERVAL 60 DAY) AND NEW.CLAIM_DATE;

    IF v_count > v_threshold THEN
        INSERT IGNORE INTO CLAIM_RULE (CLAIM_ID, RULE_ID) VALUES (NEW.CLAIM_ID, v_rule_id);
        INSERT INTO FRAUD_FLAG (CLAIM_ID, FLAG_REASON, FLAGGED_DATE)
        VALUES (NEW.CLAIM_ID,
                CONCAT('Diagnosis "', NEW.DIAGNOSIS, '" repeated ', v_count, ' times in 60 days on policy ', NEW.POLICY_ID),
                CURDATE());
    END IF;

    -- ── Rule 5: Claim Exceeds Coverage ────────────────────
    SELECT RULE_ID INTO v_rule_id
    FROM FRAUD_RULE WHERE RULE_NAME = 'Claim Exceeds Coverage' LIMIT 1;

    SELECT COVERAGE_AMOUNT INTO v_coverage
    FROM POLICY WHERE POLICY_ID = NEW.POLICY_ID LIMIT 1;

    IF NEW.CLAIM_AMOUNT > v_coverage THEN
        INSERT IGNORE INTO CLAIM_RULE (CLAIM_ID, RULE_ID) VALUES (NEW.CLAIM_ID, v_rule_id);
        INSERT INTO FRAUD_FLAG (CLAIM_ID, FLAG_REASON, FLAGGED_DATE)
        VALUES (NEW.CLAIM_ID,
                CONCAT('Claim $', NEW.CLAIM_AMOUNT, ' exceeds policy coverage $', v_coverage),
                CURDATE());
    END IF;

END$$

DELIMITER ;

-- ============================================================
-- STORED PROCEDURE: CHECK_HIGH_CLAIMS
-- ============================================================
DELIMITER $$

DROP PROCEDURE IF EXISTS CHECK_HIGH_CLAIMS$$

CREATE PROCEDURE CHECK_HIGH_CLAIMS(IN p_threshold DECIMAL(12,2))
BEGIN
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;

    SELECT
        c.CLAIM_ID,
        c.CLAIM_DATE,
        c.CLAIM_AMOUNT,
        c.DIAGNOSIS,
        c.STATUS,
        CONCAT(p.FIRST_NAME, ' ', p.LAST_NAME) AS PATIENT_NAME,
        mp.PROVIDER_NAME,
        GROUP_CONCAT(ff.FLAG_REASON SEPARATOR ' | ') AS FRAUD_REASONS
    FROM CLAIM c
    JOIN POLICY pol ON c.POLICY_ID = pol.POLICY_ID
    JOIN PATIENT p   ON pol.PATIENT_ID = p.PATIENT_ID
    JOIN MEDICAL_PROVIDER mp ON c.PROVIDER_ID = mp.PROVIDER_ID
    LEFT JOIN FRAUD_FLAG ff  ON c.CLAIM_ID = ff.CLAIM_ID
    WHERE c.CLAIM_AMOUNT > p_threshold
    GROUP BY c.CLAIM_ID, c.CLAIM_DATE, c.CLAIM_AMOUNT, c.DIAGNOSIS,
             c.STATUS, PATIENT_NAME, mp.PROVIDER_NAME
    ORDER BY c.CLAIM_AMOUNT DESC;

    COMMIT;
END$$

DELIMITER ;

-- ============================================================
-- STORED FUNCTION: GET_TOTAL_CLAIMS(patient_id)
-- ============================================================
DELIMITER $$

DROP FUNCTION IF EXISTS GET_TOTAL_CLAIMS$$

CREATE FUNCTION GET_TOTAL_CLAIMS(p_patient_id INT)
RETURNS INT
DETERMINISTIC
READS SQL DATA
BEGIN
    DECLARE v_total INT DEFAULT 0;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION RETURN -1;

    SELECT COUNT(*) INTO v_total
    FROM CLAIM c
    JOIN POLICY pol ON c.POLICY_ID = pol.POLICY_ID
    WHERE pol.PATIENT_ID = p_patient_id;

    RETURN v_total;
END$$

DELIMITER ;

-- ============================================================
-- CURSOR: Iterate claims and process fraud cases
-- ============================================================
DELIMITER $$

DROP PROCEDURE IF EXISTS PROCESS_FRAUD_CURSOR$$

CREATE PROCEDURE PROCESS_FRAUD_CURSOR()
BEGIN
    DECLARE v_done        INT DEFAULT FALSE;
    DECLARE v_claim_id    INT;
    DECLARE v_amount      DECIMAL(12,2);
    DECLARE v_diagnosis   VARCHAR(255);
    DECLARE v_policy_id   INT;
    DECLARE v_threshold   DECIMAL(12,2) DEFAULT 10000.00;

    DECLARE claim_cursor CURSOR FOR
        SELECT CLAIM_ID, CLAIM_AMOUNT, DIAGNOSIS, POLICY_ID
        FROM CLAIM
        ORDER BY CLAIM_ID;

    DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = TRUE;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;

    OPEN claim_cursor;

    read_loop: LOOP
        FETCH claim_cursor INTO v_claim_id, v_amount, v_diagnosis, v_policy_id;
        IF v_done THEN
            LEAVE read_loop;
        END IF;

        -- If high amount and not already flagged, insert fraud flag
        IF v_amount > v_threshold THEN
            IF NOT EXISTS (
                SELECT 1 FROM FRAUD_FLAG
                WHERE CLAIM_ID = v_claim_id
                  AND FLAG_REASON LIKE 'High claim amount%'
            ) THEN
                INSERT INTO FRAUD_FLAG (CLAIM_ID, FLAG_REASON, FLAGGED_DATE)
                VALUES (v_claim_id,
                        CONCAT('[CURSOR] High claim: $', v_amount, ' for diagnosis: ', v_diagnosis),
                        CURDATE());
            END IF;
        END IF;
    END LOOP;

    CLOSE claim_cursor;
    COMMIT;
END$$

DELIMITER ;

-- ============================================================
-- VIEW: HIGH_RISK_CLAIMS
-- ============================================================
CREATE OR REPLACE VIEW HIGH_RISK_CLAIMS AS
SELECT
    c.CLAIM_ID,
    c.CLAIM_DATE,
    c.CLAIM_AMOUNT,
    c.APPROVED_AMOUNT,
    c.DIAGNOSIS,
    c.STATUS,
    CONCAT(p.FIRST_NAME, ' ', p.LAST_NAME) AS PATIENT_NAME,
    pol.POLICY_TYPE,
    pol.COVERAGE_AMOUNT,
    mp.PROVIDER_NAME,
    mp.PROVIDER_TYPE,
    COUNT(DISTINCT ff.FLAG_ID)  AS FLAG_COUNT,
    COUNT(DISTINCT cr.RULE_ID)  AS RULE_COUNT,
    GROUP_CONCAT(DISTINCT ff.FLAG_REASON ORDER BY ff.FLAG_ID SEPARATOR ' || ') AS FLAG_REASONS
FROM CLAIM c
JOIN POLICY pol          ON c.POLICY_ID   = pol.POLICY_ID
JOIN PATIENT p           ON pol.PATIENT_ID = p.PATIENT_ID
JOIN MEDICAL_PROVIDER mp ON c.PROVIDER_ID  = mp.PROVIDER_ID
LEFT JOIN FRAUD_FLAG ff  ON c.CLAIM_ID     = ff.CLAIM_ID
LEFT JOIN CLAIM_RULE cr  ON c.CLAIM_ID     = cr.CLAIM_ID
GROUP BY c.CLAIM_ID, c.CLAIM_DATE, c.CLAIM_AMOUNT, c.APPROVED_AMOUNT,
         c.DIAGNOSIS, c.STATUS, PATIENT_NAME, pol.POLICY_TYPE,
         pol.COVERAGE_AMOUNT, mp.PROVIDER_NAME, mp.PROVIDER_TYPE
HAVING FLAG_COUNT > 0
ORDER BY FLAG_COUNT DESC, c.CLAIM_AMOUNT DESC;

-- ============================================================
-- ANALYTICAL QUERIES
-- ============================================================

-- Q1: JOIN — Patient + Claim data
SELECT
    CONCAT(p.FIRST_NAME, ' ', p.LAST_NAME) AS PATIENT_NAME,
    p.EMAIL,
    pol.POLICY_TYPE,
    c.CLAIM_ID,
    c.CLAIM_DATE,
    c.CLAIM_AMOUNT,
    c.STATUS,
    mp.PROVIDER_NAME
FROM PATIENT p
JOIN POLICY pol          ON p.PATIENT_ID   = pol.PATIENT_ID
JOIN CLAIM c             ON pol.POLICY_ID  = c.POLICY_ID
JOIN MEDICAL_PROVIDER mp ON c.PROVIDER_ID  = mp.PROVIDER_ID
ORDER BY c.CLAIM_DATE DESC;

-- Q2: Subquery — Claims above average amount
SELECT CLAIM_ID, CLAIM_AMOUNT, DIAGNOSIS, STATUS
FROM CLAIM
WHERE CLAIM_AMOUNT > (SELECT AVG(CLAIM_AMOUNT) FROM CLAIM)
ORDER BY CLAIM_AMOUNT DESC;

-- Q3: Aggregate — COUNT claims per provider
SELECT
    mp.PROVIDER_ID,
    mp.PROVIDER_NAME,
    mp.PROVIDER_TYPE,
    COUNT(c.CLAIM_ID)       AS TOTAL_CLAIMS,
    SUM(c.CLAIM_AMOUNT)     AS TOTAL_AMOUNT,
    AVG(c.CLAIM_AMOUNT)     AS AVG_AMOUNT
FROM MEDICAL_PROVIDER mp
LEFT JOIN CLAIM c ON mp.PROVIDER_ID = c.PROVIDER_ID
GROUP BY mp.PROVIDER_ID, mp.PROVIDER_NAME, mp.PROVIDER_TYPE
ORDER BY TOTAL_CLAIMS DESC;

-- Q4: GROUP BY + HAVING — Suspicious providers (>3 claims)
SELECT
    mp.PROVIDER_ID,
    mp.PROVIDER_NAME,
    COUNT(c.CLAIM_ID)   AS CLAIM_COUNT,
    SUM(c.CLAIM_AMOUNT) AS TOTAL_BILLED
FROM MEDICAL_PROVIDER mp
JOIN CLAIM c ON mp.PROVIDER_ID = c.PROVIDER_ID
GROUP BY mp.PROVIDER_ID, mp.PROVIDER_NAME
HAVING CLAIM_COUNT > 3
ORDER BY CLAIM_COUNT DESC;

-- Q5: Fraud summary per claim
SELECT
    c.CLAIM_ID,
    c.CLAIM_AMOUNT,
    c.STATUS,
    COUNT(ff.FLAG_ID)   AS FRAUD_FLAGS,
    COUNT(cr.RULE_ID)   AS RULES_TRIGGERED
FROM CLAIM c
LEFT JOIN FRAUD_FLAG ff ON c.CLAIM_ID = ff.CLAIM_ID
LEFT JOIN CLAIM_RULE cr ON c.CLAIM_ID = cr.CLAIM_ID
GROUP BY c.CLAIM_ID, c.CLAIM_AMOUNT, c.STATUS
ORDER BY FRAUD_FLAGS DESC;

-- ============================================================
-- TRANSACTION DEMO (ACID)
-- ============================================================
-- Atomicity: rollback on failure
START TRANSACTION;
SAVEPOINT sp1;
INSERT INTO PATIENT (FIRST_NAME, LAST_NAME, GENDER, DOB, ADDRESS, EMAIL)
VALUES ('Test', 'Rollback', 'Male', '1990-01-01', '999 Test St', 'test.rollback@email.com');
ROLLBACK TO sp1;
ROLLBACK;

-- Durability: committed insert persists
START TRANSACTION;
INSERT INTO PATIENT (FIRST_NAME, LAST_NAME, GENDER, DOB, ADDRESS, EMAIL)
VALUES ('Committed', 'Patient', 'Female', '1995-05-05', '888 Commit Ave', 'committed.patient@email.com');
COMMIT;
