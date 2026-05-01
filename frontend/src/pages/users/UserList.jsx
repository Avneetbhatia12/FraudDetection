import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import PageLayout from '../../components/layout/PageLayout';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import SearchInput from '../../components/ui/SearchInput';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import Toast from '../../components/ui/Toast';
import { getUsers, deleteUser, toggleUserStatus } from '../../services/userService';
import useDebounce from '../../hooks/useDebounce';

const ROLES    = ['Admin', 'Investigator', 'Analyst', 'Reviewer'];
const STATUSES = ['Active', 'Inactive'];

const ROLE_COLORS = {
  Admin:        { bg: '#ede9fe', color: '#7c3aed' },
  Investigator: { bg: '#dbeafe', color: '#1d4ed8' },
  Analyst:      { bg: '#dcfce7', color: '#16a34a' },
  Reviewer:     { bg: '#fef3c7', color: '#d97706' },
};

const Avatar = ({ name, size = 40 }) => {
  const initials = name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?';
  const colors   = ['#6366f1','#8b5cf6','#ec4899','#f59e0b','#10b981','#3b82f6'];
  const bg       = colors[name?.charCodeAt(0) % colors.length] || '#6366f1';
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: size * 0.35, flexShrink: 0 }}>
      {initials}
    </div>
  );
};

const UserList = () => {
  const navigate = useNavigate();
  const [users,   setUsers]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');
  const [roleFilter,   setRoleFilter]   = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [toast, setToast] = useState(null);
  const debouncedSearch = useDebounce(search);

  const load = useCallback(() => {
    setLoading(true);
    getUsers({ search: debouncedSearch, role: roleFilter, status: statusFilter })
      .then(r => setUsers(r.data.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [debouncedSearch, roleFilter, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const handleToggle = async (user) => {
    try {
      await toggleUserStatus(user.id);
      setToast({ message: `${user.fullName} ${user.status === 'Active' ? 'deactivated' : 'activated'}`, type: 'success' });
      load();
    } catch (e) {
      setToast({ message: e.response?.data?.message || 'Failed', type: 'error' });
    }
  };

  const handleDelete = async () => {
    try {
      await deleteUser(deleteTarget.id);
      setToast({ message: `${deleteTarget.fullName} deleted`, type: 'success' });
      load();
    } catch (e) {
      setToast({ message: e.response?.data?.message || 'Failed to delete', type: 'error' });
    }
  };

  const stats = {
    total:    users.length,
    active:   users.filter(u => u.status === 'Active').length,
    inactive: users.filter(u => u.status === 'Inactive').length,
    admins:   users.filter(u => u.role === 'Admin').length,
  };

  return (
    <PageLayout title="User Management">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete User"
        message={`Are you sure you want to delete "${deleteTarget?.fullName}"? This cannot be undone.`}
        confirmLabel="Delete"
        danger
      />

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
        {[
          { label: 'Total Users',    value: stats.total,    icon: '👥', bg: '#eef2ff', color: '#6366f1' },
          { label: 'Active',         value: stats.active,   icon: '✅', bg: '#dcfce7', color: '#16a34a' },
          { label: 'Inactive',       value: stats.inactive, icon: '⏸️', bg: '#fef3c7', color: '#d97706' },
          { label: 'Admins',         value: stats.admins,   icon: '🛡️', bg: '#ede9fe', color: '#7c3aed' },
        ].map(s => (
          <div key={s.label} style={{ background: '#fff', borderRadius: '0.75rem', padding: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ width: 48, height: 48, borderRadius: '0.75rem', background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>{s.icon}</div>
            <div>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 500 }}>{s.label}</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Main card */}
      <div style={{ background: '#fff', borderRadius: '0.75rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
        {/* Header */}
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600, color: '#111827' }}>All Users</h2>
            <p style={{ margin: '0.25rem 0 0', color: '#6b7280', fontSize: '0.875rem' }}>{users.length} user(s) found</p>
          </div>
          <button onClick={() => navigate('/users/new')}
            style={{ padding: '0.5rem 1.25rem', background: '#6366f1', color: '#fff', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            + Add User
          </button>
        </div>

        {/* Filters */}
        <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #f3f4f6', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <SearchInput value={search} onChange={setSearch} placeholder="Search by name, email, username..." style={{ flex: 1, minWidth: '220px' }} />
          <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
            style={{ padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '0.5rem', fontSize: '0.875rem', background: '#fff', color: '#374151' }}>
            <option value="">All Roles</option>
            {ROLES.map(r => <option key={r}>{r}</option>)}
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            style={{ padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '0.5rem', fontSize: '0.875rem', background: '#fff', color: '#374151' }}>
            <option value="">All Statuses</option>
            {STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>

        {/* Table */}
        {loading ? <LoadingSpinner /> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                  {['User', 'Role', 'Department', 'Phone', 'Status', 'Last Login', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '0.875rem 1rem', textAlign: 'left', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr><td colSpan={7} style={{ padding: '3rem', textAlign: 'center', color: '#6b7280' }}>No users found</td></tr>
                ) : users.map(user => {
                  const rc = ROLE_COLORS[user.role] || { bg: '#f3f4f6', color: '#374151' };
                  return (
                    <tr key={user.id}
                      style={{ borderBottom: '1px solid #f3f4f6', transition: 'background 0.15s' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                      onMouseLeave={e => e.currentTarget.style.background = ''}>

                      {/* User cell */}
                      <td style={{ padding: '0.875rem 1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <Avatar name={user.fullName} size={38} />
                          <div>
                            <div style={{ fontWeight: 600, color: '#111827' }}>{user.fullName}</div>
                            <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>@{user.username}</div>
                            <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{user.email}</div>
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td style={{ padding: '0.875rem 1rem' }}>
                        <span style={{ background: rc.bg, color: rc.color, padding: '0.25rem 0.75rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 600 }}>
                          {user.role}
                        </span>
                      </td>

                      {/* Department */}
                      <td style={{ padding: '0.875rem 1rem', color: '#374151' }}>{user.department || '—'}</td>

                      {/* Phone */}
                      <td style={{ padding: '0.875rem 1rem', color: '#6b7280', whiteSpace: 'nowrap' }}>{user.phone || '—'}</td>

                      {/* Status */}
                      <td style={{ padding: '0.875rem 1rem' }}>
                        <span style={{
                          background: user.status === 'Active' ? '#dcfce7' : '#fee2e2',
                          color:      user.status === 'Active' ? '#16a34a' : '#dc2626',
                          padding: '0.25rem 0.75rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 600,
                        }}>
                          {user.status === 'Active' ? '● Active' : '● Inactive'}
                        </span>
                      </td>

                      {/* Last Login */}
                      <td style={{ padding: '0.875rem 1rem', color: '#6b7280', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{user.lastLogin}</td>

                      {/* Actions */}
                      <td style={{ padding: '0.875rem 1rem' }}>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button onClick={() => navigate(`/users/${user.id}`)}
                            title="View" style={btnStyle('#eef2ff', '#6366f1')}>👁️</button>
                          <button onClick={() => navigate(`/users/${user.id}/edit`)}
                            title="Edit" style={btnStyle('#fef3c7', '#d97706')}>✏️</button>
                          <button onClick={() => handleToggle(user)}
                            title={user.status === 'Active' ? 'Deactivate' : 'Activate'}
                            style={btnStyle(user.status === 'Active' ? '#fee2e2' : '#dcfce7', user.status === 'Active' ? '#dc2626' : '#16a34a')}>
                            {user.status === 'Active' ? '⏸' : '▶'}
                          </button>
                          <button onClick={() => setDeleteTarget(user)}
                            title="Delete" disabled={user.id === 1}
                            style={btnStyle('#fee2e2', '#dc2626', user.id === 1)}>🗑️</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </PageLayout>
  );
};

const btnStyle = (bg, color, disabled = false) => ({
  width: '32px', height: '32px', borderRadius: '0.375rem',
  background: disabled ? '#f3f4f6' : bg,
  color: disabled ? '#9ca3af' : color,
  border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: '0.875rem', opacity: disabled ? 0.5 : 1,
});

export default UserList;
