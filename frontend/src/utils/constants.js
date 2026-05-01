export const API_BASE = '/api';

export const CLAIM_STATUSES = ['Pending', 'Approved', 'Rejected', 'Under Review'];

export const POLICY_TYPES = ['Individual', 'Family', 'Senior', 'Group'];

export const PROVIDER_TYPES = [
  'Hospital', 'Clinic', 'Laboratory', 'Specialist', 'Pharmacy',
  'Dental', 'Optometry', 'Mental Health', 'Surgery', 'Radiology',
  'Therapy', 'Urgent Care', 'Pediatrics',
];

export const GENDERS = ['Male', 'Female', 'Other'];

export const RISK_LEVELS = {
  LOW:    { label: 'Low',    color: '#22c55e', bg: '#dcfce7' },
  MEDIUM: { label: 'Medium', color: '#f59e0b', bg: '#fef3c7' },
  HIGH:   { label: 'High',   color: '#ef4444', bg: '#fee2e2' },
};

export const STATUS_COLORS = {
  Approved:      { color: '#16a34a', bg: '#dcfce7' },
  Rejected:      { color: '#dc2626', bg: '#fee2e2' },
  Pending:       { color: '#d97706', bg: '#fef3c7' },
  'Under Review':{ color: '#7c3aed', bg: '#ede9fe' },
};
