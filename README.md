# 🛡️ Health Insurance Claim Fraud Pattern Detection System

A full-stack DBMS project built with **React.js**, **Node.js (Express)**, and **MySQL**.

---

## 🗂️ Project Structure

```
├── database/
│   ├── schema.sql              ← DDL: All 7 tables with PK/FK/constraints
│   ├── seed.sql                ← DML: 30+ rows per table (normal + fraudulent)
│   └── procedures_triggers.sql ← Trigger, Stored Procedures, Cursor, Views, Queries
├── backend/
│   ├── config/db.js            ← MySQL connection pool
│   ├── middleware/auth.js      ← JWT authentication
│   ├── routes/
│   │   ├── auth.js             ← POST /api/auth/login
│   │   ├── patients.js         ← CRUD /api/patients
│   │   ├── policies.js         ← CRUD /api/policies
│   │   ├── providers.js        ← CRUD /api/providers
│   │   ├── claims.js           ← CRUD /api/claims (trigger fires on POST)
│   │   └── fraud.js            ← /api/fraud-flags, /api/fraud-rules, /api/high-risk-claims
│   └── server.js
└── frontend/src/
    ├── pages/                  ← All 20+ pages
    ├── components/             ← Reusable UI components
    ├── services/               ← API service layer
    ├── hooks/                  ← Custom React hooks
    ├── context/AuthContext.js  ← JWT auth context
    └── utils/                  ← Formatters, validators, constants
```

---

## ⚙️ Setup Instructions

### 1. Database Setup

```bash
# Connect to MySQL and run all SQL files
mysql -u root -p

# Inside MySQL:
source database/schema.sql
source database/seed.sql
source database/procedures_triggers.sql
```

Or run all at once:
```bash
mysql -u root -p < database/schema.sql
mysql -u root -p fraud_detection < database/seed.sql
mysql -u root -p fraud_detection < database/procedures_triggers.sql
```

### 2. Backend Setup

```bash
cd backend
# Edit .env if your MySQL password is not empty
npm install
npm start        # runs on http://localhost:5000
# or
npm run dev      # with nodemon hot-reload
```

**Edit `backend/.env`** if your MySQL root password is set:
```
DB_PASSWORD=your_password_here
```

### 3. Frontend Setup

```bash
cd frontend
npm install
npm start        # runs on http://localhost:3000
```

---

## 🔐 Login Credentials

| Role         | Email                           | Password   |
|-------------|----------------------------------|------------|
| Admin        | admin@frauddetect.com           | admin123   |
| Investigator | investigator@frauddetect.com    | invest123  |

---

## 🧠 Fraud Detection Flow

```
Claim Submitted (POST /api/claims)
        ↓
MySQL TRIGGER fires (trg_after_claim_insert)
        ↓
Checks 5 Fraud Rules:
  1. High Claim Amount    → CLAIM_AMOUNT > 10,000
  2. Frequent Claims      → >3 claims on same policy in 30 days
  3. Provider Overuse     → >5 claims from same provider in 30 days
  4. Diagnosis Repeat     → Same diagnosis >2 times in 60 days
  5. Exceeds Coverage     → CLAIM_AMOUNT > COVERAGE_AMOUNT
        ↓
If matched:
  → INSERT into CLAIM_RULE (which rule triggered)
  → INSERT into FRAUD_FLAG (reason + date)
        ↓
API returns fraud_detected: true + flags + rules
        ↓
Frontend shows 🚨 Fraud Detected alert with details
```

---

## 📊 Database Schema (BCNF)

| Table          | Purpose                              |
|----------------|--------------------------------------|
| PATIENT        | Patient demographics                 |
| POLICY         | Insurance policies (FK → PATIENT)    |
| MEDICAL_PROVIDER | Healthcare providers               |
| CLAIM          | Insurance claims (FK → POLICY, PROVIDER) |
| FRAUD_RULE     | Detection rule definitions           |
| CLAIM_RULE     | Junction: which rules triggered (composite PK) |
| FRAUD_FLAG     | Fraud flag records (FK → CLAIM)      |

**Normalization:**
- **1NF**: All attributes atomic, no repeating groups
- **2NF**: CLAIM_RULE composite PK — no partial dependencies (FLAG_REASON is in FRAUD_FLAG, not here)
- **3NF/BCNF**: No transitive dependencies — PATIENT→POLICY→CLAIM chain is separated; PROVIDER is independent

---

## 🔁 DBMS Features Implemented

| Feature              | Location                          |
|---------------------|-----------------------------------|
| DDL (CREATE TABLE)  | `database/schema.sql`             |
| DML (INSERT)        | `database/seed.sql`               |
| TRIGGER             | `procedures_triggers.sql` — `trg_after_claim_insert` |
| STORED PROCEDURE    | `CHECK_HIGH_CLAIMS(threshold)`    |
| STORED FUNCTION     | `GET_TOTAL_CLAIMS(patient_id)`    |
| CURSOR              | `PROCESS_FRAUD_CURSOR()`          |
| VIEW                | `HIGH_RISK_CLAIMS`                |
| TRANSACTION + ACID  | `procedures_triggers.sql` (START/COMMIT/ROLLBACK/SAVEPOINT) |
| EXCEPTION HANDLING  | `DECLARE EXIT HANDLER FOR SQLEXCEPTION` |
| JOIN Query          | Patient + Claim data              |
| Subquery            | Claims > average amount           |
| Aggregate + GROUP BY + HAVING | Suspicious providers   |

---

## 🖥️ API Endpoints

| Method | Endpoint                    | Description                    |
|--------|-----------------------------|--------------------------------|
| POST   | /api/auth/login             | Login                          |
| GET    | /api/patients               | List patients                  |
| POST   | /api/patients               | Add patient                    |
| GET    | /api/patients/:id           | Patient details + claims       |
| GET    | /api/policies               | List policies                  |
| POST   | /api/policies               | Add policy                     |
| GET    | /api/providers              | List providers with risk data  |
| POST   | /api/providers              | Add provider                   |
| GET    | /api/claims                 | List claims with fraud info    |
| POST   | /api/claims                 | Submit claim (triggers fraud detection) |
| GET    | /api/claims/:id             | Claim + fraud flags + rules    |
| GET    | /api/fraud-flags            | All fraud flags                |
| GET    | /api/fraud-flags/:id        | Investigation view             |
| GET    | /api/fraud-rules            | All fraud rules                |
| POST   | /api/fraud-rules            | Add fraud rule                 |
| GET    | /api/high-risk-claims       | HIGH_RISK_CLAIMS view          |
| GET    | /api/dashboard/stats        | KPIs, charts, recent activity  |
| GET    | /api/reports                | Analytics reports              |
