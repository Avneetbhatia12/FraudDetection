const express = require('express');
const router  = express.Router();
const db      = require('../config/db');
const auth    = require('../middleware/auth');

// GET /api/providers
router.get('/', auth, async (req, res) => {
  try {
    const { search, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = `
      SELECT mp.*,
             COUNT(DISTINCT c.CLAIM_ID)   AS total_claims,
             COALESCE(SUM(c.CLAIM_AMOUNT),0) AS total_billed,
             COUNT(DISTINCT ff.FLAG_ID)   AS fraud_flags
      FROM MEDICAL_PROVIDER mp
      LEFT JOIN CLAIM c      ON mp.PROVIDER_ID = c.PROVIDER_ID
      LEFT JOIN FRAUD_FLAG ff ON c.CLAIM_ID    = ff.CLAIM_ID
      WHERE 1=1
    `;
    const params = [];

    if (search) {
      query += ' AND (mp.PROVIDER_NAME LIKE ? OR mp.PROVIDER_TYPE LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    query += ` GROUP BY mp.PROVIDER_ID ORDER BY fraud_flags DESC, total_claims DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), offset);

    const [rows] = await db.query(query, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/providers/:id
router.get('/:id', auth, async (req, res) => {
  try {
    const [[provider]] = await db.query('SELECT * FROM MEDICAL_PROVIDER WHERE PROVIDER_ID = ?', [req.params.id]);
    if (!provider) return res.status(404).json({ success: false, message: 'Provider not found' });

    const [claims] = await db.query(
      `SELECT c.*,
              CONCAT(p.FIRST_NAME,' ',p.LAST_NAME) AS PATIENT_NAME,
              pol.POLICY_TYPE,
              COUNT(ff.FLAG_ID) AS flag_count
       FROM CLAIM c
       JOIN POLICY pol          ON c.POLICY_ID   = pol.POLICY_ID
       JOIN PATIENT p           ON pol.PATIENT_ID = p.PATIENT_ID
       LEFT JOIN FRAUD_FLAG ff  ON c.CLAIM_ID     = ff.CLAIM_ID
       WHERE c.PROVIDER_ID = ?
       GROUP BY c.CLAIM_ID ORDER BY c.CLAIM_DATE DESC`,
      [req.params.id]
    );

    const [[stats]] = await db.query(
      `SELECT COUNT(c.CLAIM_ID) AS total_claims,
              COALESCE(SUM(c.CLAIM_AMOUNT),0) AS total_billed,
              COUNT(ff.FLAG_ID) AS fraud_flags
       FROM CLAIM c
       LEFT JOIN FRAUD_FLAG ff ON c.CLAIM_ID = ff.CLAIM_ID
       WHERE c.PROVIDER_ID = ?`,
      [req.params.id]
    );

    res.json({ success: true, data: { ...provider, ...stats, claims } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/providers
router.post('/', auth, async (req, res) => {
  try {
    const { PROVIDER_NAME, PROVIDER_TYPE, ADDRESS, CONTACT_NUMBER } = req.body;
    if (!PROVIDER_NAME || !PROVIDER_TYPE || !ADDRESS || !CONTACT_NUMBER) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }
    const [result] = await db.query(
      'INSERT INTO MEDICAL_PROVIDER (PROVIDER_NAME, PROVIDER_TYPE, ADDRESS, CONTACT_NUMBER) VALUES (?,?,?,?)',
      [PROVIDER_NAME, PROVIDER_TYPE, ADDRESS, CONTACT_NUMBER]
    );
    res.status(201).json({ success: true, data: { PROVIDER_ID: result.insertId, ...req.body } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/providers/:id
router.put('/:id', auth, async (req, res) => {
  try {
    const { PROVIDER_NAME, PROVIDER_TYPE, ADDRESS, CONTACT_NUMBER } = req.body;
    await db.query(
      'UPDATE MEDICAL_PROVIDER SET PROVIDER_NAME=?, PROVIDER_TYPE=?, ADDRESS=?, CONTACT_NUMBER=? WHERE PROVIDER_ID=?',
      [PROVIDER_NAME, PROVIDER_TYPE, ADDRESS, CONTACT_NUMBER, req.params.id]
    );
    res.json({ success: true, message: 'Provider updated' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
