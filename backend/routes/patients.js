const express = require('express');
const router  = express.Router();
const db      = require('../config/db');
const auth    = require('../middleware/auth');

// GET /api/patients
router.get('/', auth, async (req, res) => {
  try {
    const { search, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = `
      SELECT p.*,
             COUNT(DISTINCT pol.POLICY_ID) AS policy_count,
             COUNT(DISTINCT c.CLAIM_ID)    AS claim_count
      FROM PATIENT p
      LEFT JOIN POLICY pol ON p.PATIENT_ID = pol.PATIENT_ID
      LEFT JOIN CLAIM  c   ON pol.POLICY_ID = c.POLICY_ID
    `;
    const params = [];

    if (search) {
      query += ` WHERE p.FIRST_NAME LIKE ? OR p.LAST_NAME LIKE ? OR p.EMAIL LIKE ?`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ` GROUP BY p.PATIENT_ID ORDER BY p.PATIENT_ID DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), offset);

    const [rows] = await db.query(query, params);

    // Count total
    let countQuery = 'SELECT COUNT(*) AS total FROM PATIENT';
    const countParams = [];
    if (search) {
      countQuery += ' WHERE FIRST_NAME LIKE ? OR LAST_NAME LIKE ? OR EMAIL LIKE ?';
      countParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    const [[{ total }]] = await db.query(countQuery, countParams);

    res.json({ success: true, data: rows, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/patients/:id
router.get('/:id', auth, async (req, res) => {
  try {
    const [[patient]] = await db.query('SELECT * FROM PATIENT WHERE PATIENT_ID = ?', [req.params.id]);
    if (!patient) return res.status(404).json({ success: false, message: 'Patient not found' });

    const [policies] = await db.query('SELECT * FROM POLICY WHERE PATIENT_ID = ?', [req.params.id]);
    const policyIds  = policies.map(p => p.POLICY_ID);

    let claims = [];
    if (policyIds.length > 0) {
      [claims] = await db.query(
        `SELECT c.*, mp.PROVIDER_NAME,
                COUNT(ff.FLAG_ID) AS flag_count
         FROM CLAIM c
         JOIN MEDICAL_PROVIDER mp ON c.PROVIDER_ID = mp.PROVIDER_ID
         LEFT JOIN FRAUD_FLAG ff  ON c.CLAIM_ID = ff.CLAIM_ID
         WHERE c.POLICY_ID IN (?)
         GROUP BY c.CLAIM_ID
         ORDER BY c.CLAIM_DATE DESC`,
        [policyIds]
      );
    }

    const [[{ total_claims }]] = await db.query(
      'SELECT GET_TOTAL_CLAIMS(?) AS total_claims', [req.params.id]
    );

    res.json({ success: true, data: { ...patient, policies, claims, total_claims } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/patients
router.post('/', auth, async (req, res) => {
  try {
    const { FIRST_NAME, LAST_NAME, GENDER, DOB, ADDRESS, EMAIL } = req.body;

    if (!FIRST_NAME || !LAST_NAME || !GENDER || !DOB || !ADDRESS || !EMAIL) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    const [result] = await db.query(
      'INSERT INTO PATIENT (FIRST_NAME, LAST_NAME, GENDER, DOB, ADDRESS, EMAIL) VALUES (?,?,?,?,?,?)',
      [FIRST_NAME, LAST_NAME, GENDER, DOB, ADDRESS, EMAIL]
    );

    res.status(201).json({ success: true, data: { PATIENT_ID: result.insertId, ...req.body } });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'Email already exists' });
    }
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/patients/:id
router.put('/:id', auth, async (req, res) => {
  try {
    const { FIRST_NAME, LAST_NAME, GENDER, DOB, ADDRESS, EMAIL } = req.body;
    await db.query(
      'UPDATE PATIENT SET FIRST_NAME=?, LAST_NAME=?, GENDER=?, DOB=?, ADDRESS=?, EMAIL=? WHERE PATIENT_ID=?',
      [FIRST_NAME, LAST_NAME, GENDER, DOB, ADDRESS, EMAIL, req.params.id]
    );
    res.json({ success: true, message: 'Patient updated' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'Email already exists' });
    }
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
