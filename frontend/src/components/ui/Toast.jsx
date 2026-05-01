import React, { useEffect } from 'react';

const COLORS = {
  success: { bg: '#dcfce7', border: '#16a34a', icon: '✅' },
  error:   { bg: '#fee2e2', border: '#dc2626', icon: '❌' },
  warning: { bg: '#fef3c7', border: '#d97706', icon: '⚠️' },
  info:    { bg: '#dbeafe', border: '#2563eb', icon: 'ℹ️' },
};

const Toast = ({ message, type = 'info', onClose, duration = 4000 }) => {
  const c = COLORS[type] || COLORS.info;

  useEffect(() => {
    if (!duration) return;
    const t = setTimeout(onClose, duration);
    return () => clearTimeout(t);
  }, [duration, onClose]);

  return (
    <div style={{
      position: 'fixed', bottom: '1.5rem', right: '1.5rem', zIndex: 9999,
      display: 'flex', alignItems: 'center', gap: '0.75rem',
      padding: '0.875rem 1.25rem',
      background: c.bg, border: `1px solid ${c.border}`,
      borderRadius: '0.5rem', boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      maxWidth: '400px', animation: 'slideIn 0.3s ease',
    }}>
      <span style={{ fontSize: '1.25rem' }}>{c.icon}</span>
      <span style={{ fontSize: '0.875rem', color: '#1f2937', flex: 1 }}>{message}</span>
      <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', color: '#6b7280' }}>✕</button>
      <style>{`@keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`}</style>
    </div>
  );
};

export default Toast;
