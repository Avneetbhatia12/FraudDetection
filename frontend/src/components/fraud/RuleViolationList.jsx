import React from 'react';

const RuleViolationList = ({ rules = [] }) => {
  if (!rules.length) return (
    <div style={{ padding: '1rem', background: '#f0fdf4', borderRadius: '0.5rem', color: '#16a34a', fontSize: '0.875rem' }}>
      ✅ No fraud rules triggered for this claim.
    </div>
  );

  return (
    <div>
      <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.875rem', fontWeight: 600, color: '#374151' }}>
        🚨 Triggered Rules ({rules.length})
      </h4>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {rules.map(rule => (
          <div key={rule.RULE_ID} style={{ padding: '0.75rem 1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.5rem', borderLeft: '4px solid #ef4444' }}>
            <div style={{ fontWeight: 600, color: '#dc2626', fontSize: '0.875rem' }}>{rule.RULE_NAME}</div>
            <div style={{ color: '#6b7280', fontSize: '0.8rem', marginTop: '0.25rem' }}>{rule.DESCRIPTION}</div>
            <div style={{ color: '#9ca3af', fontSize: '0.75rem', marginTop: '0.25rem' }}>Threshold: {rule.THRESHOLD_VALUE}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default RuleViolationList;
