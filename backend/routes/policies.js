const express = require('express');
const router  = express.Router();
const db      = require('../config/db');
const auth    = require('../middleware/auth');

// GET /api/policies
router.get('/', auth, async (req, res) => {
  try {
    const { search, patient_id, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = `
      SELECT pol.*,
             CONCAT(p.FIRST_NAME,' ',p.LAST_NAME) AS PATIENT_NAME,
             p.EMAIL AS PATIENT_EMAIL,
             COUNT(DISTINCT c.CLAIM_ID) AS claim_count
      FROM POLICY pol
      JOIN PATIENT p ON pol.PATIENT_ID = p.PATIENT_ID
      LEFT JOIN CLAIM c ON pol.POLICY_ID = c.POLICY_ID
      WHERE 1=1
    `;
    const params = [];

    if (patient_id) { query += ' AND pol.PATIENT_ID = ?'; params.push(patient_id); }
    if (search)     { query += ' AND (pol.POLICY_TYPE LIKE ? OR p.FIRST_NAME LIKE ? OR p.LAST_NAME LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }

    query += ` GROUP BY pol.POLICY_ID ORDER BY pol.POLICY_ID DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), offset);

    const [rows] = await db.query(query, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/policies/:id
router.get('/:id', auth, async (req, res) => {
  try {
    const [[policy]] = await db.query(
      `SELECT pol.*, CONCAT(p.FIRST_NAME,' ',p.LAST_NAME) AS PATIENT_NAME
       FROM POLICY pol JOIN PATIENT p ON pol.PATIENT_ID = p.PATIENT_ID
       WHERE pol.POLICY_ID = ?`,
      [req.params.id]
    );
    if (!policy) return res.status(404).json({ success: false, message: 'Policy not found' });

    const [claims] = await db.query(
      `SELECT c.*, mp.PROVIDER_NAME, COUNT(ff.FLAG_ID) AS flag_count
       FROM CLAIM c
       JOIN MEDICAL_PROVIDER mp ON c.PROVIDER_ID = mp.PROVIDER_ID
       LEFT JOIN FRAUD_FLAG ff  ON c.CLAIM_ID = ff.CLAIM_ID
       WHERE c.POLICY_ID = ?
       GROUP BY c.CLAIM_ID ORDER BY c.CLAIM_DATE DESC`,
      [req.params.id]
    );

    res.json({ success: true, data: { ...policy, claims } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/policies
router.post('/', auth, async (req, res) => {
  try {
    const { POLICY_TYPE, START_DATE, END_DATE, COVERAGE_AMOUNT, PATIENT_ID } = req.body;
    if (!POLICY_TYPE || !START_DATE || !END_DATE || !COVERAGE_AMOUNT || !PATIENT_ID) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }
    const [result] = await db.query(
      'INSERT INTO POLICY (POLICY_TYPE, START_DATE, END_DATE, COVERAGE_AMOUNT, PATIENT_ID) VALUES (?,?,?,?,?)',
      [POLICY_TYPE, START_DATE, END_DATE, COVERAGE_AMOUNT, PATIENT_ID]
    );
    res.status(201).json({ success: true, data: { POLICY_ID: result.insertId, ...req.body } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/policies/:id
router.put('/:id', auth, async (req, res) => {
  try {
    const { POLICY_TYPE, START_DATE, END_DATE, COVERAGE_AMOUNT, PATIENT_ID } = req.body;
    await db.query(
      'UPDATE POLICY SET POLICY_TYPE=?, START_DATE=?, END_DATE=?, COVERAGE_AMOUNT=?, PATIENT_ID=? WHERE POLICY_ID=?',
      [POLICY_TYPE, START_DATE, END_DATE, COVERAGE_AMOUNT, PATIENT_ID, req.params.id]
    );
    res.json({ success: true, message: 'Policy updated' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
