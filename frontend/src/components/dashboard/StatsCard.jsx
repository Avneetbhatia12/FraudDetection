import React from 'react';

const StatsCard = ({ title, value, icon, color = '#6366f1', bg = '#eef2ff', change, subtitle }) => (
  <div style={{
    background: '#fff', borderRadius: '0.75rem', padding: '1.25rem',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1px solid #f3f4f6',
    display: 'flex', alignItems: 'flex-start', gap: '1rem',
  }}>
    <div style={{ width: '48px', height: '48px', borderRadius: '0.75rem', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', flexShrink: 0 }}>
      {icon}
    </div>
    <div style={{ flex: 1 }}>
      <p style={{ margin: 0, fontSize: '0.8rem', color: '#6b7280', fontWeight: 500 }}>{title}</p>
      <p style={{ margin: '0.25rem 0 0', fontSize: '1.75rem', fontWeight: 700, color: '#111827', lineHeight: 1 }}>{value}</p>
      {subtitle && <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: '#9ca3af' }}>{subtitle}</p>}
    </div>
  </div>
);

export default StatsCard;
