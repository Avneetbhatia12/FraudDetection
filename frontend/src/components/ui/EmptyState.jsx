import React from 'react';

const EmptyState = ({ icon = '📭', title = 'No data found', description = '', action }) => (
  <div style={{ textAlign: 'center', padding: '4rem 2rem', color: '#6b7280' }}>
    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>{icon}</div>
    <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#374151', marginBottom: '0.5rem' }}>{title}</h3>
    {description && <p style={{ fontSize: '0.875rem', marginBottom: '1.5rem' }}>{description}</p>}
    {action}
  </div>
);

export default EmptyState;
