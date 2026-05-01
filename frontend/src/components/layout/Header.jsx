import React from 'react';
import { useAuth } from '../../context/AuthContext';

const Header = ({ onToggleSidebar, title }) => {
  const { user } = useAuth();
  return (
    <header style={{
      height: '60px', background: '#fff',
      borderBottom: '1px solid #e5e7eb',
      display: 'flex', alignItems: 'center',
      padding: '0 1.5rem', gap: '1rem',
      position: 'sticky', top: 0, zIndex: 50,
    }}>
      <button onClick={onToggleSidebar} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem', color: '#6b7280', padding: '0.25rem' }}>
        ☰
      </button>
      <h1 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600, color: '#111827', flex: 1 }}>{title}</h1>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '0.875rem' }}>
          {user?.username?.[0]?.toUpperCase() || 'A'}
        </div>
        <div style={{ fontSize: '0.875rem' }}>
          <div style={{ fontWeight: 600, color: '#111827' }}>{user?.username}</div>
          <div style={{ color: '#6b7280', fontSize: '0.75rem' }}>{user?.role}</div>
        </div>
      </div>
    </header>
  );
};

export default Header;
