import React from 'react';
import { RISK_LEVELS } from '../../utils/constants';
import { getRiskLevel } from '../../utils/formatters';

const RiskBadge = ({ flagCount }) => {
  const level = getRiskLevel(flagCount);
  const c = RISK_LEVELS[level];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
      padding: '0.2rem 0.65rem', borderRadius: '9999px',
      fontSize: '0.75rem', fontWeight: 600,
      color: c.color, background: c.bg,
    }}>
      {level === 'HIGH' }{level === 'MEDIUM'}{level === 'LOW' }
      {c.label}
    </span>
  );
};

export default RiskBadge;
