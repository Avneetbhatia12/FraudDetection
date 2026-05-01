import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PageLayout from '../../components/layout/PageLayout';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Toast from '../../components/ui/Toast';
import { createUser, updateUser, getUser } from '../../services/userService';

const ROLES       = ['Admin', 'Investigator', 'Analyst', 'Reviewer'];
const DEPARTMENTS = ['IT', 'Fraud Detection', 'Analytics', 'Claims', 'Compliance', 'Operations', 'Management'];
const STATUSES    = ['Active', 'Inactive'];

const inputStyle = {
  width: '100%', padding: '0.625rem 0.875rem',
  border: '1px solid #d1d5db', borderRadius: '0.5rem',
  fontSize: '0.875rem', boxSizing: 'border-box', outline: 'none',
  background: '#fff',
};

const Field = ({ label, required, error, children }) => (
  <div>
    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#374151', marginBottom: '0.375rem' }}>
      {label} {required && <span style={{ color: '#ef4444' }}>*</span>}
    </label>
    {children}
    {error && <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: '#dc2626' }}>{error}</p>}
  </div>
);

const UserForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [form, setForm] = useState({
    username: '', fullName: '', email: '', password: '', confirmPassword: '',
    role: 'Investigator', status: 'Active', phone: '', department: 'Fraud Detection',
  });
  const [errors,   setErrors]   = useState({});
  const [loading,  setLoading]  = useState(false);
  const [fetching, setFetching] = useState(isEdit);
  const [showPass, setShowPass] = useState(false);
  const [toast,    setToast]    = useState(null);

  useEffect(() => {
    if (!isEdit) return;
    getUser(id).then(r => {
      const u = r.data.data;
      setForm(f => ({ ...f, username: u.username, fullName: u.fullName, email: u.email, role: u.role, status: u.status, phone: u.phone || '', department: u.department || '' }));
    }).catch(() => setToast({ message: 'Failed to load user', type: 'error' }))
      .finally(() => setFetching(false));
  }, [id, isEdit]);

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setErrors(e => ({ ...e, [k]: '' })); };

  const validate = () => {
    const e = {};
    if (!form.fullName.trim())  e.fullName  = 'Full name is required';
    if (!form.username.trim())  e.username  = 'Username is required';
    if (!/^[a-z0-9_]+$/i.test(form.username)) e.username = 'Username: letters, numbers, underscores only';
    if (!form.email.trim())     e.email     = 'Email is required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Invalid email format';
    if (!isEdit) {
      if (!form.password)       e.password  = 'Password is required';
      else if (form.password.length < 6) e.password = 'Minimum 6 characters';
      if (form.password !== form.confirmPassword) e.confirmPassword = 'Passwords do not match';
    } else if (form.password) {
      if (form.password.length < 6) e.password = 'Minimum 6 characters';
      if (form.password !== form.confirmPassword) e.confirmPassword = 'Passwords do not match';
    }
    if (!form.role)             e.role      = 'Role is required';
    return e;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setLoading(true);
    try {
      const payload = { username: form.username, fullName: form.fullName, email: form.email, role: form.role, status: form.status, phone: form.phone, department: form.department };
      if (form.password) payload.password = form.password;

      if (isEdit) await updateUser(id, payload);
      else        await createUser(payload);

      navigate('/users');
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to save user';
      setToast({ message: msg, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  if (fetching) return <PageLayout title="User"><LoadingSpinner /></PageLayout>;

  const passwordStrength = (p) => {
    if (!p) return null;
    if (p.length < 6)  return { label: 'Too short', color: '#ef4444', width: '20%' };
    if (p.length < 8)  return { label: 'Weak',      color: '#f59e0b', width: '40%' };
    if (!/[A-Z]/.test(p) || !/[0-9]/.test(p)) return { label: 'Fair', color: '#f59e0b', width: '60%' };
    if (!/[^A-Za-z0-9]/.test(p)) return { label: 'Good',   color: '#22c55e', width: '80%' };
    return { label: 'Strong', color: '#16a34a', width: '100%' };
  };
  const strength = passwordStrength(form.password);

  return (
    <PageLayout title={isEdit ? 'Edit User' : 'Add User'}>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div style={{ maxWidth: '720px' }}>
        {/* Header */}
        <div style={{ background: 'linear-gradient(135deg,#1e1b4b,#4f46e5)', borderRadius: '0.75rem', padding: '1.5rem', marginBottom: '1.5rem', color: '#fff' }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>
            {isEdit ? '✏️ Edit User Account' : '👤 Create New User'}
          </h2>
          <p style={{ margin: '0.25rem 0 0', opacity: 0.8, fontSize: '0.875rem' }}>
            {isEdit ? 'Update user information and permissions' : 'Fill in the details to create a new system user'}
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Personal Info */}
          <div style={{ background: '#fff', borderRadius: '0.75rem', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', marginBottom: '1rem' }}>
            <h3 style={{ margin: '0 0 1.25rem', fontSize: '0.9rem', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              👤 Personal Information
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <Field label="Full Name" required error={errors.fullName}>
                <input style={inputStyle} value={form.fullName} onChange={e => set('fullName', e.target.value)} placeholder="e.g. John Smith" />
              </Field>
              <Field label="Username" required error={errors.username}>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', fontSize: '0.875rem' }}>@</span>
                  <input style={{ ...inputStyle, paddingLeft: '1.75rem' }} value={form.username} onChange={e => set('username', e.target.value.toLowerCase())} placeholder="john_smith" />
                </div>
              </Field>
              <Field label="Email Address" required error={errors.email}>
                <input type="email" style={inputStyle} value={form.email} onChange={e => set('email', e.target.value)} placeholder="john@example.com" />
              </Field>
              <Field label="Phone Number" error={errors.phone}>
                <input style={inputStyle} value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+1-555-0000" />
              </Field>
            </div>
          </div>

          {/* Role & Department */}
          <div style={{ background: '#fff', borderRadius: '0.75rem', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', marginBottom: '1rem' }}>
            <h3 style={{ margin: '0 0 1.25rem', fontSize: '0.9rem', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              🛡️ Role & Access
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
              <Field label="Role" required error={errors.role}>
                <select style={inputStyle} value={form.role} onChange={e => set('role', e.target.value)}>
                  {ROLES.map(r => <option key={r}>{r}</option>)}
                </select>
              </Field>
              <Field label="Department" error={errors.department}>
                <select style={inputStyle} value={form.department} onChange={e => set('department', e.target.value)}>
                  <option value="">Select...</option>
                  {DEPARTMENTS.map(d => <option key={d}>{d}</option>)}
                </select>
              </Field>
              <Field label="Status" error={errors.status}>
                <select style={inputStyle} value={form.status} onChange={e => set('status', e.target.value)}>
                  {STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
              </Field>
            </div>

            {/* Role description */}
            <div style={{ marginTop: '1rem', padding: '0.875rem', background: '#f9fafb', borderRadius: '0.5rem', border: '1px solid #e5e7eb', fontSize: '0.8rem', color: '#6b7280' }}>
              <strong style={{ color: '#374151' }}>{form.role}:</strong> {ROLE_DESCRIPTIONS[form.role]}
            </div>
          </div>

          {/* Password */}
          <div style={{ background: '#fff', borderRadius: '0.75rem', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', marginBottom: '1.5rem' }}>
            <h3 style={{ margin: '0 0 0.25rem', fontSize: '0.9rem', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              🔒 Password
            </h3>
            {isEdit && <p style={{ margin: '0 0 1rem', fontSize: '0.8rem', color: '#6b7280' }}>Leave blank to keep current password</p>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <Field label={isEdit ? 'New Password' : 'Password'} required={!isEdit} error={errors.password}>
                <div style={{ position: 'relative' }}>
                  <input type={showPass ? 'text' : 'password'} style={{ ...inputStyle, paddingRight: '2.5rem' }}
                    value={form.password} onChange={e => set('password', e.target.value)}
                    placeholder={isEdit ? 'Leave blank to keep current' : 'Min. 6 characters'} />
                  <button type="button" onClick={() => setShowPass(s => !s)}
                    style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '1rem' }}>
                    {showPass ? '🙈' : '👁️'}
                  </button>
                </div>
                {strength && (
                  <div style={{ marginTop: '0.375rem' }}>
                    <div style={{ height: '4px', background: '#e5e7eb', borderRadius: '9999px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: strength.width, background: strength.color, transition: 'width 0.3s' }} />
                    </div>
                    <span style={{ fontSize: '0.7rem', color: strength.color, fontWeight: 600 }}>{strength.label}</span>
                  </div>
                )}
              </Field>
              <Field label="Confirm Password" required={!isEdit && !!form.password} error={errors.confirmPassword}>
                <input type={showPass ? 'text' : 'password'} style={inputStyle}
                  value={form.confirmPassword} onChange={e => set('confirmPassword', e.target.value)}
                  placeholder="Re-enter password" />
                {form.confirmPassword && form.password === form.confirmPassword && (
                  <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: '#16a34a' }}>✅ Passwords match</p>
                )}
              </Field>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => navigate('/users')}
              style={{ padding: '0.625rem 1.5rem', border: '1px solid #d1d5db', borderRadius: '0.5rem', background: '#fff', cursor: 'pointer', color: '#374151', fontWeight: 500 }}>
              Cancel
            </button>
            <button type="submit" disabled={loading}
              style={{ padding: '0.625rem 1.5rem', background: loading ? '#a5b4fc' : '#6366f1', color: '#fff', border: 'none', borderRadius: '0.5rem', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '0.875rem' }}>
              {loading ? 'Saving...' : isEdit ? '✅ Update User' : '✅ Create User'}
            </button>
          </div>
        </form>
      </div>
    </PageLayout>
  );
};

const ROLE_DESCRIPTIONS = {
  Admin:        'Full system access — can manage users, rules, providers, and all data.',
  Investigator: 'Can investigate fraud flags, manage patients, policies, and submit claims.',
  Analyst:      'Can view all data, submit claims, and generate reports. Cannot manage users.',
  Reviewer:     'Read-only access to claims, fraud flags, and reports.',
};

export default UserForm;
