import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const NAV = [
  { label: 'Dashboard',        path: '/dashboard',       icon: '📊' },
  { label: 'Patients',         path: '/patients',        icon: '👤' },
  { label: 'Policies',         path: '/policies',        icon: '📋' },
  { label: 'Providers',        path: '/providers',       icon: '🏥' },
  { label: 'Claims',           path: '/claims',          icon: '📄' },
  { label: 'Fraud Flags',      path: '/fraud-flags',     icon: '🚨' },
  { label: 'Fraud Rules',      path: '/fraud-rules',     icon: '⚙️' },
  { label: 'Reports',          path: '/reports',         icon: '📈' },
  { label: 'Users',            path: '/users',           icon: '👥' },
];

const Sidebar = ({ collapsed, onToggle }) => {
  const { logout, user } = useAuth();
  const location = useLocation();

  return (
    <aside style={{
      width: collapsed ? '64px' : '240px',
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #1e1b4b 0%, #312e81 100%)',
      display: 'flex', flexDirection: 'column',
      transition: 'width 0.25s ease',
      flexShrink: 0,
      position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 100,
    }}>
      {/* Logo */}
      <div style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <span style={{ fontSize: '1.5rem', flexShrink: 0 }}>🛡️</span>
        {!collapsed && <span style={{ color: '#fff', fontWeight: 700, fontSize: '0.9rem', lineHeight: 1.2 }}>Fraud<br/>Detector</span>}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '0.75rem 0', overflowY: 'auto' }}>
        {NAV.map(item => {
          const active = location.pathname.startsWith(item.path);
          return (
            <NavLink key={item.path} to={item.path} style={{ textDecoration: 'none' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '0.75rem',
                padding: '0.65rem 1rem', margin: '0.1rem 0.5rem',
                borderRadius: '0.5rem', cursor: 'pointer',
                background: active ? 'rgba(255,255,255,0.15)' : 'transparent',
                color: active ? '#fff' : 'rgba(255,255,255,0.7)',
                transition: 'all 0.15s',
                fontSize: '0.875rem', fontWeight: active ? 600 : 400,
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}>
                <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>{item.icon}</span>
                {!collapsed && <span>{item.label}</span>}
              </div>
            </NavLink>
          );
        })}
      </nav>

      {/* User + Logout */}
      <div style={{ padding: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
        {!collapsed && user && (
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.75rem', marginBottom: '0.5rem' }}>
            <div style={{ fontWeight: 600, color: '#fff' }}>{user.username}</div>
            <div>{user.role}</div>
          </div>
        )}
        <button onClick={logout} style={{
          width: '100%', padding: '0.5rem', background: 'rgba(239,68,68,0.2)',
          border: '1px solid rgba(239,68,68,0.4)', borderRadius: '0.375rem',
          color: '#fca5a5', cursor: 'pointer', fontSize: '0.8rem',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
        }}>
          <span>🚪</span>{!collapsed && 'Logout'}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
