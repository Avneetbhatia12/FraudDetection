const express = require('express');
const router  = express.Router();
const db      = require('../config/db');
const auth    = require('../middleware/auth');

// GET /api/claims
router.get('/', auth, async (req, res) => {
  try {
    const { status, search, provider_id, policy_id, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = `
      SELECT c.*,
             CONCAT(p.FIRST_NAME,' ',p.LAST_NAME) AS PATIENT_NAME,
             pol.POLICY_TYPE,
             mp.PROVIDER_NAME,
             mp.PROVIDER_TYPE,
             COUNT(DISTINCT ff.FLAG_ID)  AS flag_count,
             COUNT(DISTINCT cr.RULE_ID)  AS rule_count
      FROM CLAIM c
      JOIN POLICY pol          ON c.POLICY_ID   = pol.POLICY_ID
      JOIN PATIENT p           ON pol.PATIENT_ID = p.PATIENT_ID
      JOIN MEDICAL_PROVIDER mp ON c.PROVIDER_ID  = mp.PROVIDER_ID
      LEFT JOIN FRAUD_FLAG ff  ON c.CLAIM_ID     = ff.CLAIM_ID
      LEFT JOIN CLAIM_RULE cr  ON c.CLAIM_ID     = cr.CLAIM_ID
      WHERE 1=1
    `;
    const params = [];

    if (status)      { query += ' AND c.STATUS = ?';          params.push(status); }
    if (provider_id) { query += ' AND c.PROVIDER_ID = ?';     params.push(provider_id); }
    if (policy_id)   { query += ' AND c.POLICY_ID = ?';       params.push(policy_id); }
    if (search)      {
      query += ' AND (c.DIAGNOSIS LIKE ? OR CONCAT(p.FIRST_NAME," ",p.LAST_NAME) LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    query += ` GROUP BY c.CLAIM_ID ORDER BY c.CLAIM_DATE DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), offset);

    const [rows] = await db.query(query, params);

    // Total count
    let countQ = `SELECT COUNT(DISTINCT c.CLAIM_ID) AS total
                  FROM CLAIM c
                  JOIN POLICY pol ON c.POLICY_ID = pol.POLICY_ID
                  JOIN PATIENT p  ON pol.PATIENT_ID = p.PATIENT_ID
                  WHERE 1=1`;
    const countP = [];
    if (status)      { countQ += ' AND c.STATUS = ?';      countP.push(status); }
    if (provider_id) { countQ += ' AND c.PROVIDER_ID = ?'; countP.push(provider_id); }
    if (policy_id)   { countQ += ' AND c.POLICY_ID = ?';   countP.push(policy_id); }
    if (search)      {
      countQ += ' AND (c.DIAGNOSIS LIKE ? OR CONCAT(p.FIRST_NAME," ",p.LAST_NAME) LIKE ?)';
      countP.push(`%${search}%`, `%${search}%`);
    }
    const [[{ total }]] = await db.query(countQ, countP);

    res.json({ success: true, data: rows, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/claims/:id
router.get('/:id', auth, async (req, res) => {
  try {
    const [[claim]] = await db.query(
      `SELECT c.*,
              CONCAT(p.FIRST_NAME,' ',p.LAST_NAME) AS PATIENT_NAME,
              p.EMAIL AS PATIENT_EMAIL,
              pol.POLICY_TYPE, pol.COVERAGE_AMOUNT,
              mp.PROVIDER_NAME, mp.PROVIDER_TYPE, mp.CONTACT_NUMBER
       FROM CLAIM c
       JOIN POLICY pol          ON c.POLICY_ID   = pol.POLICY_ID
       JOIN PATIENT p           ON pol.PATIENT_ID = p.PATIENT_ID
       JOIN MEDICAL_PROVIDER mp ON c.PROVIDER_ID  = mp.PROVIDER_ID
       WHERE c.CLAIM_ID = ?`,
      [req.params.id]
    );
    if (!claim) return res.status(404).json({ success: false, message: 'Claim not found' });

    const [flags] = await db.query(
      'SELECT * FROM FRAUD_FLAG WHERE CLAIM_ID = ? ORDER BY FLAGGED_DATE DESC',
      [req.params.id]
    );

    const [rules] = await db.query(
      `SELECT cr.RULE_ID, fr.RULE_NAME, fr.DESCRIPTION, fr.THRESHOLD_VALUE
       FROM CLAIM_RULE cr
       JOIN FRAUD_RULE fr ON cr.RULE_ID = fr.RULE_ID
       WHERE cr.CLAIM_ID = ?`,
      [req.params.id]
    );

    res.json({ success: true, data: { ...claim, fraud_flags: flags, triggered_rules: rules } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/claims  — trigger fires automatically in MySQL
router.post('/', auth, async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const { CLAIM_DATE, CLAIM_AMOUNT, APPROVED_AMOUNT, DIAGNOSIS, STATUS, POLICY_ID, PROVIDER_ID } = req.body;

    if (!CLAIM_DATE || !CLAIM_AMOUNT || !DIAGNOSIS || !POLICY_ID || !PROVIDER_ID) {
      await conn.rollback();
      conn.release();
      return res.status(400).json({ success: false, message: 'Required fields missing' });
    }

    // Verify policy exists
    const [[policy]] = await conn.query('SELECT * FROM POLICY WHERE POLICY_ID = ?', [POLICY_ID]);
    if (!policy) {
      await conn.rollback();
      conn.release();
      return res.status(404).json({ success: false, message: 'Policy not found' });
    }

    const [result] = await conn.query(
      'INSERT INTO CLAIM (CLAIM_DATE, CLAIM_AMOUNT, APPROVED_AMOUNT, DIAGNOSIS, STATUS, POLICY_ID, PROVIDER_ID) VALUES (?,?,?,?,?,?,?)',
      [CLAIM_DATE, parseFloat(CLAIM_AMOUNT), parseFloat(APPROVED_AMOUNT || 0), DIAGNOSIS, STATUS || 'Pending', POLICY_ID, PROVIDER_ID]
    );

    const claimId = result.insertId;

    // Fetch fraud flags created by trigger
    const [flags] = await conn.query('SELECT * FROM FRAUD_FLAG WHERE CLAIM_ID = ?', [claimId]);
    const [rules] = await conn.query(
      `SELECT cr.RULE_ID, fr.RULE_NAME FROM CLAIM_RULE cr
       JOIN FRAUD_RULE fr ON cr.RULE_ID = fr.RULE_ID WHERE cr.CLAIM_ID = ?`,
      [claimId]
    );

    await conn.commit();
    conn.release();

    res.status(201).json({
      success: true,
      data: { CLAIM_ID: claimId, ...req.body },
      fraud_detected: flags.length > 0,
      fraud_flags: flags,
      triggered_rules: rules,
      message: flags.length > 0
        ? `⚠️ Fraud detected! ${flags.length} flag(s) raised by ${rules.length} rule(s).`
        : '✅ Claim submitted successfully. No fraud detected.',
    });
  } catch (err) {
    await conn.rollback();
    conn.release();
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/claims/:id/status
router.put('/:id/status', auth, async (req, res) => {
  try {
    const { STATUS, APPROVED_AMOUNT } = req.body;
    await db.query(
      'UPDATE CLAIM SET STATUS=?, APPROVED_AMOUNT=? WHERE CLAIM_ID=?',
      [STATUS, APPROVED_AMOUNT || 0, req.params.id]
    );
    res.json({ success: true, message: 'Claim status updated' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
