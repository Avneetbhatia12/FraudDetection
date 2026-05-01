import React from 'react';
import { STATUS_COLORS } from '../../utils/constants';

const StatusBadge = ({ status }) => {
  const c = STATUS_COLORS[status] || { color: '#6b7280', bg: '#f3f4f6' };
  return (
    <span style={{
      display: 'inline-block', padding: '0.2rem 0.65rem',
      borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 600,
      color: c.color, background: c.bg, whiteSpace: 'nowrap',
    }}>
      {status}
    </span>
  );
};

export default StatusBadge;
