require('dotenv').config();
const express = require('express');
const cors    = require('cors');

const authRoutes     = require('./routes/auth');
const userRoutes     = require('./routes/users');
const patientRoutes  = require('./routes/patients');
const policyRoutes   = require('./routes/policies');
const providerRoutes = require('./routes/providers');
const claimRoutes    = require('./routes/claims');
const fraudRoutes    = require('./routes/fraud');

const app  = express();
const PORT = process.env.PORT || 5000;

// ── Middleware ──────────────────────────────────────────────
app.use(cors({
  origin: [
    'http://localhost:3000',
    process.env.FRONTEND_URL,        // set this in Railway env vars
  ].filter(Boolean),
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Routes ──────────────────────────────────────────────────
app.use('/api/auth',      authRoutes);
app.use('/api/users',     userRoutes);
app.use('/api/patients',  patientRoutes);
app.use('/api/policies',  policyRoutes);
app.use('/api/providers', providerRoutes);
app.use('/api/claims',    claimRoutes);
app.use('/api',           fraudRoutes);   // fraud-flags, fraud-rules, high-risk-claims, dashboard, reports

// ── Health check ────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));

// ── Global error handler ────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
