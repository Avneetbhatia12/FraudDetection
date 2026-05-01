import React from 'react';
import { useNavigate } from 'react-router-dom';
import StatusBadge from '../tables/StatusBadge';
import RiskBadge from '../tables/RiskBadge';
import { formatCurrency, formatDate } from '../../utils/formatters';

const RecentClaimsTable = ({ claims = [] }) => {
  const navigate = useNavigate();
  return (
    <div style={{ background: '#fff', borderRadius: '0.75rem', padding: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1px solid #f3f4f6' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#111827' }}>Recent Claims</h3>
        <button onClick={() => navigate('/claims')} style={{ background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500 }}>View all →</button>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
              {['ID', 'Patient', 'Amount', 'Diagnosis', 'Status', 'Risk'].map(h => (
                <th key={h} style={{ padding: '0.5rem 0.75rem', textAlign: 'left', color: '#6b7280', fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {claims.map(c => (
              <tr key={c.CLAIM_ID} onClick={() => navigate(`/claims/${c.CLAIM_ID}`)}
                style={{ borderBottom: '1px solid #f9fafb', cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                onMouseLeave={e => e.currentTarget.style.background = ''}>
                <td style={{ padding: '0.6rem 0.75rem', color: '#6366f1', fontWeight: 600 }}>#{c.CLAIM_ID}</td>
                <td style={{ padding: '0.6rem 0.75rem' }}>{c.PATIENT_NAME}</td>
                <td style={{ padding: '0.6rem 0.75rem', fontWeight: 600 }}>{formatCurrency(c.CLAIM_AMOUNT)}</td>
                <td style={{ padding: '0.6rem 0.75rem', color: '#6b7280' }}>{c.DIAGNOSIS}</td>
                <td style={{ padding: '0.6rem 0.75rem' }}><StatusBadge status={c.STATUS} /></td>
                <td style={{ padding: '0.6rem 0.75rem' }}><RiskBadge flagCount={c.flag_count} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default RecentClaimsTable;
