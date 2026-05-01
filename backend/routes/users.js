const express = require('express');
const bcrypt  = require('bcryptjs');
const router  = express.Router();
const auth    = require('../middleware/auth');

// Shared in-memory user store (same array used by auth.js via module cache)
// We export it so auth.js can import it too
const USERS = [
  {
    id: 1,
    username: 'admin',
    fullName: 'System Administrator',
    email: 'admin@frauddetect.com',
    password: '$2a$10$CbrCwnf7Eer4cBnAL2ZGfeaqFvsbVaLBCd2gIIRSjMQ9zMFOgu3YS', // admin123
    role: 'Admin',
    status: 'Active',
    phone: '+1-555-0001',
    department: 'IT',
    createdAt: '2024-01-01',
    lastLogin: new Date().toISOString().split('T')[0],
  },
  {
    id: 2,
    username: 'investigator',
    fullName: 'John Investigator',
    email: 'investigator@frauddetect.com',
    password: '$2a$10$TKvIGbM8zqu.BbEQ0h5DM.pRNtH6y06N8vOR002U5FEm/ETGEkcQO', // invest123
    role: 'Investigator',
    status: 'Active',
    phone: '+1-555-0002',
    department: 'Fraud Detection',
    createdAt: '2024-01-15',
    lastLogin: '2024-12-10',
  },
  {
    id: 3,
    username: 'analyst',
    fullName: 'Sarah Analyst',
    email: 'analyst@frauddetect.com',
    password: '$2a$10$CbrCwnf7Eer4cBnAL2ZGfeaqFvsbVaLBCd2gIIRSjMQ9zMFOgu3YS', // admin123
    role: 'Analyst',
    status: 'Active',
    phone: '+1-555-0003',
    department: 'Analytics',
    createdAt: '2024-02-01',
    lastLogin: '2024-12-08',
  },
  {
    id: 4,
    username: 'reviewer',
    fullName: 'Mike Reviewer',
    email: 'reviewer@frauddetect.com',
    password: '$2a$10$TKvIGbM8zqu.BbEQ0h5DM.pRNtH6y06N8vOR002U5FEm/ETGEkcQO', // invest123
    role: 'Reviewer',
    status: 'Inactive',
    phone: '+1-555-0004',
    department: 'Claims',
    createdAt: '2024-03-10',
    lastLogin: '2024-11-20',
  },
];

let nextId = 5;

const safeUser = (u) => ({
  id: u.id,
  username: u.username,
  fullName: u.fullName,
  email: u.email,
  role: u.role,
  status: u.status,
  phone: u.phone,
  department: u.department,
  createdAt: u.createdAt,
  lastLogin: u.lastLogin,
});

// GET /api/users
router.get('/', auth, (req, res) => {
  const { search, role, status } = req.query;
  let list = USERS;
  if (search) {
    const s = search.toLowerCase();
    list = list.filter(u =>
      u.username.toLowerCase().includes(s) ||
      u.fullName.toLowerCase().includes(s) ||
      u.email.toLowerCase().includes(s) ||
      u.department.toLowerCase().includes(s)
    );
  }
  if (role)   list = list.filter(u => u.role === role);
  if (status) list = list.filter(u => u.status === status);
  res.json({ success: true, data: list.map(safeUser), total: list.length });
});

// GET /api/users/:id
router.get('/:id', auth, (req, res) => {
  const user = USERS.find(u => u.id === parseInt(req.params.id));
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  res.json({ success: true, data: safeUser(user) });
});

// POST /api/users
router.post('/', auth, async (req, res) => {
  try {
    const { username, fullName, email, password, role, status, phone, department } = req.body;

    if (!username || !fullName || !email || !password || !role) {
      return res.status(400).json({ success: false, message: 'Username, full name, email, password and role are required' });
    }
    if (USERS.find(u => u.email === email)) {
      return res.status(409).json({ success: false, message: 'Email already exists' });
    }
    if (USERS.find(u => u.username === username)) {
      return res.status(409).json({ success: false, message: 'Username already exists' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const newUser = {
      id: nextId++,
      username,
      fullName,
      email,
      password: hashed,
      role,
      status: status || 'Active',
      phone: phone || '',
      department: department || '',
      createdAt: new Date().toISOString().split('T')[0],
      lastLogin: '—',
    };
    USERS.push(newUser);
    res.status(201).json({ success: true, data: safeUser(newUser), message: 'User created successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/users/:id
router.put('/:id', auth, async (req, res) => {
  try {
    const idx = USERS.findIndex(u => u.id === parseInt(req.params.id));
    if (idx === -1) return res.status(404).json({ success: false, message: 'User not found' });

    const { username, fullName, email, password, role, status, phone, department } = req.body;

    // Check duplicates (excluding self)
    if (email && USERS.find(u => u.email === email && u.id !== parseInt(req.params.id))) {
      return res.status(409).json({ success: false, message: 'Email already in use' });
    }
    if (username && USERS.find(u => u.username === username && u.id !== parseInt(req.params.id))) {
      return res.status(409).json({ success: false, message: 'Username already in use' });
    }

    const user = USERS[idx];
    if (username)   user.username   = username;
    if (fullName)   user.fullName   = fullName;
    if (email)      user.email      = email;
    if (role)       user.role       = role;
    if (status)     user.status     = status;
    if (phone !== undefined)      user.phone      = phone;
    if (department !== undefined) user.department = department;
    if (password) {
      if (password.length < 6) return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
      user.password = await bcrypt.hash(password, 10);
    }

    res.json({ success: true, data: safeUser(user), message: 'User updated successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/users/:id
router.delete('/:id', auth, (req, res) => {
  const idx = USERS.findIndex(u => u.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ success: false, message: 'User not found' });
  if (parseInt(req.params.id) === 1) {
    return res.status(403).json({ success: false, message: 'Cannot delete the default admin user' });
  }
  USERS.splice(idx, 1);
  res.json({ success: true, message: 'User deleted successfully' });
});

// PATCH /api/users/:id/toggle-status
router.patch('/:id/toggle-status', auth, (req, res) => {
  const user = USERS.find(u => u.id === parseInt(req.params.id));
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  if (user.id === 1) return res.status(403).json({ success: false, message: 'Cannot deactivate default admin' });
  user.status = user.status === 'Active' ? 'Inactive' : 'Active';
  res.json({ success: true, data: safeUser(user), message: `User ${user.status === 'Active' ? 'activated' : 'deactivated'}` });
});

// Export USERS so auth.js can use the same array
module.exports = router;
module.exports.USERS = USERS;
