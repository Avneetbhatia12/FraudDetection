const express = require('express');
const router  = express.Router();
const db      = require('../config/db');
const auth    = require('../middleware/auth');

// GET /api/fraud-flags
router.get('/fraud-flags', auth, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const [rows] = await db.query(
      `SELECT ff.*,
              c.CLAIM_DATE, c.CLAIM_AMOUNT, c.DIAGNOSIS, c.STATUS,
              CONCAT(p.FIRST_NAME,' ',p.LAST_NAME) AS PATIENT_NAME,
              mp.PROVIDER_NAME,
              pol.POLICY_TYPE
       FROM FRAUD_FLAG ff
       JOIN CLAIM c             ON ff.CLAIM_ID    = c.CLAIM_ID
       JOIN POLICY pol          ON c.POLICY_ID    = pol.POLICY_ID
       JOIN PATIENT p           ON pol.PATIENT_ID = p.PATIENT_ID
       JOIN MEDICAL_PROVIDER mp ON c.PROVIDER_ID  = mp.PROVIDER_ID
       ORDER BY ff.FLAGGED_DATE DESC
       LIMIT ? OFFSET ?`,
      [parseInt(limit), offset]
    );

    const [[{ total }]] = await db.query('SELECT COUNT(*) AS total FROM FRAUD_FLAG');
    res.json({ success: true, data: rows, total });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/fraud-flags/:id  (investigation view)
router.get('/fraud-flags/:id', auth, async (req, res) => {
  try {
    const [[flag]] = await db.query(
      `SELECT ff.*,
              c.CLAIM_DATE, c.CLAIM_AMOUNT, c.APPROVED_AMOUNT, c.DIAGNOSIS, c.STATUS,
              CONCAT(p.FIRST_NAME,' ',p.LAST_NAME) AS PATIENT_NAME,
              p.EMAIL, p.DOB, p.GENDER,
              mp.PROVIDER_NAME, mp.PROVIDER_TYPE, mp.CONTACT_NUMBER,
              pol.POLICY_TYPE, pol.COVERAGE_AMOUNT, pol.START_DATE, pol.END_DATE
       FROM FRAUD_FLAG ff
       JOIN CLAIM c             ON ff.CLAIM_ID    = c.CLAIM_ID
       JOIN POLICY pol          ON c.POLICY_ID    = pol.POLICY_ID
       JOIN PATIENT p           ON pol.PATIENT_ID = p.PATIENT_ID
       JOIN MEDICAL_PROVIDER mp ON c.PROVIDER_ID  = mp.PROVIDER_ID
       WHERE ff.FLAG_ID = ?`,
      [req.params.id]
    );
    if (!flag) return res.status(404).json({ success: false, message: 'Flag not found' });

    const [rules] = await db.query(
      `SELECT fr.* FROM CLAIM_RULE cr
       JOIN FRAUD_RULE fr ON cr.RULE_ID = fr.RULE_ID
       WHERE cr.CLAIM_ID = ?`,
      [flag.CLAIM_ID]
    );

    const [allFlags] = await db.query(
      'SELECT * FROM FRAUD_FLAG WHERE CLAIM_ID = ? ORDER BY FLAGGED_DATE',
      [flag.CLAIM_ID]
    );

    res.json({ success: true, data: { ...flag, triggered_rules: rules, all_flags: allFlags } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/fraud-rules
router.get('/fraud-rules', auth, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT fr.*,
              COUNT(cr.CLAIM_ID) AS times_triggered
       FROM FRAUD_RULE fr
       LEFT JOIN CLAIM_RULE cr ON fr.RULE_ID = cr.RULE_ID
       GROUP BY fr.RULE_ID ORDER BY times_triggered DESC`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/fraud-rules
router.post('/fraud-rules', auth, async (req, res) => {
  try {
    const { RULE_NAME, DESCRIPTION, THRESHOLD_VALUE } = req.body;
    if (!RULE_NAME || !DESCRIPTION || THRESHOLD_VALUE === undefined) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }
    const [result] = await db.query(
      'INSERT INTO FRAUD_RULE (RULE_NAME, DESCRIPTION, THRESHOLD_VALUE) VALUES (?,?,?)',
      [RULE_NAME, DESCRIPTION, THRESHOLD_VALUE]
    );
    res.status(201).json({ success: true, data: { RULE_ID: result.insertId, ...req.body } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/fraud-rules/:id
router.put('/fraud-rules/:id', auth, async (req, res) => {
  try {
    const { RULE_NAME, DESCRIPTION, THRESHOLD_VALUE } = req.body;
    await db.query(
      'UPDATE FRAUD_RULE SET RULE_NAME=?, DESCRIPTION=?, THRESHOLD_VALUE=? WHERE RULE_ID=?',
      [RULE_NAME, DESCRIPTION, THRESHOLD_VALUE, req.params.id]
    );
    res.json({ success: true, message: 'Rule updated' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/high-risk-claims  (uses VIEW)
router.get('/high-risk-claims', auth, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM HIGH_RISK_CLAIMS');
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/dashboard/stats
router.get('/dashboard/stats', auth, async (req, res) => {
  try {
    const [[claimStats]] = await db.query(
      `SELECT COUNT(*) AS total_claims,
              SUM(CLAIM_AMOUNT) AS total_amount,
              SUM(CASE WHEN STATUS='Approved' THEN 1 ELSE 0 END) AS approved,
              SUM(CASE WHEN STATUS='Rejected' THEN 1 ELSE 0 END) AS rejected,
              SUM(CASE WHEN STATUS='Pending' THEN 1 ELSE 0 END) AS pending,
              SUM(CASE WHEN STATUS='Under Review' THEN 1 ELSE 0 END) AS under_review
       FROM CLAIM`
    );

    const [[{ total_flags }]] = await db.query('SELECT COUNT(*) AS total_flags FROM FRAUD_FLAG');
    const [[{ total_patients }]] = await db.query('SELECT COUNT(*) AS total_patients FROM PATIENT');
    const [[{ total_providers }]] = await db.query('SELECT COUNT(*) AS total_providers FROM MEDICAL_PROVIDER');

    // Claims trend (last 6 months)
    const [trend] = await db.query(
      `SELECT DATE_FORMAT(CLAIM_DATE,'%Y-%m') AS month,
              COUNT(*) AS count,
              SUM(CLAIM_AMOUNT) AS amount
       FROM CLAIM
       WHERE CLAIM_DATE >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
       GROUP BY month ORDER BY month`
    );

    // Risk distribution
    const [riskDist] = await db.query(
      `SELECT
         SUM(CASE WHEN flag_count = 0 THEN 1 ELSE 0 END) AS low,
         SUM(CASE WHEN flag_count = 1 THEN 1 ELSE 0 END) AS medium,
         SUM(CASE WHEN flag_count >= 2 THEN 1 ELSE 0 END) AS high
       FROM (
         SELECT c.CLAIM_ID, COUNT(ff.FLAG_ID) AS flag_count
         FROM CLAIM c LEFT JOIN FRAUD_FLAG ff ON c.CLAIM_ID = ff.CLAIM_ID
         GROUP BY c.CLAIM_ID
       ) sub`
    );

    // Top flagged providers
    const [topProviders] = await db.query(
      `SELECT mp.PROVIDER_NAME, mp.PROVIDER_TYPE,
              COUNT(DISTINCT c.CLAIM_ID) AS claim_count,
              COUNT(ff.FLAG_ID) AS flag_count
       FROM MEDICAL_PROVIDER mp
       JOIN CLAIM c ON mp.PROVIDER_ID = c.PROVIDER_ID
       LEFT JOIN FRAUD_FLAG ff ON c.CLAIM_ID = ff.CLAIM_ID
       GROUP BY mp.PROVIDER_ID
       HAVING flag_count > 0
       ORDER BY flag_count DESC LIMIT 5`
    );

    // Recent claims
    const [recentClaims] = await db.query(
      `SELECT c.CLAIM_ID, c.CLAIM_DATE, c.CLAIM_AMOUNT, c.STATUS, c.DIAGNOSIS,
              CONCAT(p.FIRST_NAME,' ',p.LAST_NAME) AS PATIENT_NAME,
              mp.PROVIDER_NAME,
              COUNT(ff.FLAG_ID) AS flag_count
       FROM CLAIM c
       JOIN POLICY pol ON c.POLICY_ID = pol.POLICY_ID
       JOIN PATIENT p  ON pol.PATIENT_ID = p.PATIENT_ID
       JOIN MEDICAL_PROVIDER mp ON c.PROVIDER_ID = mp.PROVIDER_ID
       LEFT JOIN FRAUD_FLAG ff ON c.CLAIM_ID = ff.CLAIM_ID
       GROUP BY c.CLAIM_ID ORDER BY c.CLAIM_DATE DESC LIMIT 10`
    );

    res.json({
      success: true,
      data: {
        ...claimStats,
        total_flags,
        total_patients,
        total_providers,
        trend,
        risk_distribution: riskDist[0],
        top_flagged_providers: topProviders,
        recent_claims: recentClaims,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/reports
router.get('/reports', auth, async (req, res) => {
  try {
    // Claims above average
    const [aboveAvg] = await db.query(
      `SELECT c.CLAIM_ID, c.CLAIM_AMOUNT, c.DIAGNOSIS, c.STATUS,
              CONCAT(p.FIRST_NAME,' ',p.LAST_NAME) AS PATIENT_NAME
       FROM CLAIM c
       JOIN POLICY pol ON c.POLICY_ID = pol.POLICY_ID
       JOIN PATIENT p  ON pol.PATIENT_ID = p.PATIENT_ID
       WHERE c.CLAIM_AMOUNT > (SELECT AVG(CLAIM_AMOUNT) FROM CLAIM)
       ORDER BY c.CLAIM_AMOUNT DESC`
    );

    // Claims per provider
    const [perProvider] = await db.query(
      `SELECT mp.PROVIDER_NAME, mp.PROVIDER_TYPE,
              COUNT(c.CLAIM_ID) AS total_claims,
              SUM(c.CLAIM_AMOUNT) AS total_amount,
              AVG(c.CLAIM_AMOUNT) AS avg_amount
       FROM MEDICAL_PROVIDER mp
       LEFT JOIN CLAIM c ON mp.PROVIDER_ID = c.PROVIDER_ID
       GROUP BY mp.PROVIDER_ID ORDER BY total_claims DESC`
    );

    // Suspicious providers (>3 claims)
    const [suspicious] = await db.query(
      `SELECT mp.PROVIDER_ID, mp.PROVIDER_NAME, mp.PROVIDER_TYPE,
              COUNT(c.CLAIM_ID) AS claim_count,
              SUM(c.CLAIM_AMOUNT) AS total_billed,
              COUNT(ff.FLAG_ID) AS fraud_flags
       FROM MEDICAL_PROVIDER mp
       JOIN CLAIM c ON mp.PROVIDER_ID = c.PROVIDER_ID
       LEFT JOIN FRAUD_FLAG ff ON c.CLAIM_ID = ff.CLAIM_ID
       GROUP BY mp.PROVIDER_ID
       HAVING claim_count > 3
       ORDER BY claim_count DESC`
    );

    // Fraud summary
    const [fraudSummary] = await db.query(
      `SELECT c.CLAIM_ID, c.CLAIM_AMOUNT, c.STATUS,
              COUNT(ff.FLAG_ID) AS fraud_flags,
              COUNT(cr.RULE_ID) AS rules_triggered
       FROM CLAIM c
       LEFT JOIN FRAUD_FLAG ff ON c.CLAIM_ID = ff.CLAIM_ID
       LEFT JOIN CLAIM_RULE cr ON c.CLAIM_ID = cr.CLAIM_ID
       GROUP BY c.CLAIM_ID
       HAVING fraud_flags > 0
       ORDER BY fraud_flags DESC`
    );

    res.json({
      success: true,
      data: { above_average_claims: aboveAvg, per_provider: perProvider, suspicious_providers: suspicious, fraud_summary: fraudSummary },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
