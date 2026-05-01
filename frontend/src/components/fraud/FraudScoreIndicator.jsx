import React from 'react';

const FraudScoreIndicator = ({ flagCount = 0, ruleCount = 0 }) => {
  const score = Math.min(100, flagCount * 25 + ruleCount * 15);
  const color = score >= 75 ? '#ef4444' : score >= 40 ? '#f59e0b' : '#22c55e';
  const label = score >= 75 ? 'High Risk' : score >= 40 ? 'Medium Risk' : 'Low Risk';

  return (
    <div style={{ background: '#f9fafb', borderRadius: '0.75rem', padding: '1.25rem', border: '1px solid #e5e7eb' }}>
      <h4 style={{ margin: '0 0 1rem', fontSize: '0.875rem', fontWeight: 600, color: '#374151' }}>Fraud Risk Score</h4>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <div style={{ position: 'relative', width: '80px', height: '80px' }}>
          <svg viewBox="0 0 36 36" style={{ width: '80px', height: '80px', transform: 'rotate(-90deg)' }}>
            <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e5e7eb" strokeWidth="3" />
            <circle cx="18" cy="18" r="15.9" fill="none" stroke={color} strokeWidth="3"
              strokeDasharray={`${score} 100`} strokeLinecap="round" />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', fontWeight: 700, color }}>
            {score}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color }}>{label}</div>
          <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>{flagCount} flag(s) · {ruleCount} rule(s) triggered</div>
        </div>
      </div>
    </div>
  );
};

export default FraudScoreIndicator;
