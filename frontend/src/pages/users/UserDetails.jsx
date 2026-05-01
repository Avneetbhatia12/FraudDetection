import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import PageLayout from '../../components/layout/PageLayout';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import Toast from '../../components/ui/Toast';
import { getUser, deleteUser, toggleUserStatus } from '../../services/userService';
import useFetch from '../../hooks/useFetch';

const ROLE_COLORS = {
  Admin:        { bg: '#ede9fe', color: '#7c3aed' },
  Investigator: { bg: '#dbeafe', color: '#1d4ed8' },
  Analyst:      { bg: '#dcfce7', color: '#16a34a' },
  Reviewer:     { bg: '#fef3c7', color: '#d97706' },
};

const Avatar = ({ name, size = 72 }) => {
  const initials = name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?';
  const colors   = ['#6366f1','#8b5cf6','#ec4899','#f59e0b','#10b981','#3b82f6'];
  const bg       = colors[name?.charCodeAt(0) % colors.length] || '#6366f1';
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: size * 0.33, flexShrink: 0 }}>
      {initials}
    </div>
  );
};

const Field = ({ label, value, highlight }) => (
  <div style={{ padding: '0.875rem', background: '#f9fafb', borderRadius: '0.5rem', border: '1px solid #e5e7eb' }}>
    <div style={{ fontSize: '0.7rem', color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>{label}</div>
    <div style={{ fontSize: '0.9rem', fontWeight: 600, color: highlight || '#111827' }}>{value || '—'}</div>
  </div>
);

const UserDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, loading, refetch } = useFetch(() => getUser(id), [id]);
  const [showDelete, setShowDelete] = useState(false);
  const [toast, setToast] = useState(null);
  const user = data?.data;

  const handleToggle = async () => {
    try {
      await toggleUserStatus(id);
      setToast({ message: `User ${user.status === 'Active' ? 'deactivated' : 'activated'}`, type: 'success' });
      refetch();
    } catch (e) {
      setToast({ message: e.response?.data?.message || 'Failed', type: 'error' });
    }
  };

  const handleDelete = async () => {
    try {
      await deleteUser(id);
      navigate('/users');
    } catch (e) {
      setToast({ message: e.response?.data?.message || 'Failed to delete', type: 'error' });
    }
  };

  if (loading) return <PageLayout title="User Details"><LoadingSpinner /></PageLayout>;
  if (!user)   return <PageLayout title="User Details"><p style={{ color: '#6b7280', padding: '2rem' }}>User not found.</p></PageLayout>;

  const rc = ROLE_COLORS[user.role] || { bg: '#f3f4f6', color: '#374151' };

  return (
    <PageLayout title="User Details">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <ConfirmDialog isOpen={showDelete} onClose={() => setShowDelete(false)} onConfirm={handleDelete}
        title="Delete User" message={`Delete "${user.fullName}"? This cannot be undone.`} confirmLabel="Delete" danger />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '860px' }}>

        {/* Profile card */}
        <div style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #4f46e5 100%)', borderRadius: '1rem', padding: '2rem', color: '#fff' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
            <Avatar name={user.fullName} size={80} />
            <div style={{ flex: 1 }}>
              <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>{user.fullName}</h2>
              <p style={{ margin: '0.25rem 0 0', opacity: 0.8, fontSize: '0.9rem' }}>@{user.username} · {user.email}</p>
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                <span style={{ background: rc.bg, color: rc.color, padding: '0.25rem 0.875rem', borderRadius: '9999px', fontSize: '0.8rem', fontWeight: 700 }}>{user.role}</span>
                <span style={{ background: user.status === 'Active' ? '#dcfce7' : '#fee2e2', color: user.status === 'Active' ? '#16a34a' : '#dc2626', padding: '0.25rem 0.875rem', borderRadius: '9999px', fontSize: '0.8rem', fontWeight: 700 }}>
                  {user.status}
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button onClick={() => navigate(`/users/${id}/edit`)}
                style={{ padding: '0.5rem 1.25rem', background: 'rgba(255,255,255,0.2)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem' }}>
                ✏️ Edit
              </button>
              <button onClick={handleToggle}
                style={{ padding: '0.5rem 1.25rem', background: user.status === 'Active' ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem' }}>
                {user.status === 'Active' ? '⏸ Deactivate' : '▶ Activate'}
              </button>
            </div>
          </div>
        </div>

        {/* Info grid */}
        <div style={{ background: '#fff', borderRadius: '0.75rem', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <h3 style={{ margin: '0 0 1.25rem', fontSize: '1rem', fontWeight: 600, color: '#111827' }}>Account Information</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.875rem' }}>
            <Field label="User ID"      value={`#${user.id}`} />
            <Field label="Username"     value={`@${user.username}`} />
            <Field label="Full Name"    value={user.fullName} />
            <Field label="Email"        value={user.email} />
            <Field label="Phone"        value={user.phone} />
            <Field label="Department"   value={user.department} />
            <Field label="Role"         value={user.role} highlight={rc.color} />
            <Field label="Status"       value={user.status} highlight={user.status === 'Active' ? '#16a34a' : '#dc2626'} />
            <Field label="Created"      value={user.createdAt} />
            <Field label="Last Login"   value={user.lastLogin} />
          </div>
        </div>

        {/* Permissions card */}
        <div style={{ background: '#fff', borderRadius: '0.75rem', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <h3 style={{ margin: '0 0 1.25rem', fontSize: '1rem', fontWeight: 600, color: '#111827' }}>Role Permissions</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem' }}>
            {getPermissions(user.role).map(p => (
              <div key={p.label} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.625rem 0.875rem', background: p.allowed ? '#f0fdf4' : '#fef2f2', borderRadius: '0.5rem', border: `1px solid ${p.allowed ? '#bbf7d0' : '#fecaca'}` }}>
                <span style={{ fontSize: '1rem' }}>{p.allowed ? '✅' : '❌'}</span>
                <span style={{ fontSize: '0.8rem', fontWeight: 500, color: p.allowed ? '#16a34a' : '#dc2626' }}>{p.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Danger zone */}
        {user.id !== 1 && (
          <div style={{ background: '#fff', borderRadius: '0.75rem', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1px solid #fecaca' }}>
            <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 600, color: '#dc2626' }}>⚠️ Danger Zone</h3>
            <p style={{ margin: '0 0 1rem', color: '#6b7280', fontSize: '0.875rem' }}>Permanently delete this user account. This action cannot be undone.</p>
            <button onClick={() => setShowDelete(true)}
              style={{ padding: '0.5rem 1.25rem', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem' }}>
              🗑️ Delete User
            </button>
          </div>
        )}
      </div>
    </PageLayout>
  );
};

const getPermissions = (role) => {
  const all = [
    { label: 'View Dashboard',    allowed: true },
    { label: 'Manage Patients',   allowed: ['Admin', 'Investigator'].includes(role) },
    { label: 'Manage Policies',   allowed: ['Admin', 'Investigator'].includes(role) },
    { label: 'Manage Providers',  allowed: ['Admin'].includes(role) },
    { label: 'Submit Claims',     allowed: ['Admin', 'Investigator', 'Analyst'].includes(role) },
    { label: 'View Fraud Flags',  allowed: true },
    { label: 'Investigate Fraud', allowed: ['Admin', 'Investigator'].includes(role) },
    { label: 'Manage Fraud Rules',allowed: ['Admin'].includes(role) },
    { label: 'View Reports',      allowed: true },
    { label: 'Manage Users',      allowed: ['Admin'].includes(role) },
  ];
  return all;
};

export default UserDetails;
