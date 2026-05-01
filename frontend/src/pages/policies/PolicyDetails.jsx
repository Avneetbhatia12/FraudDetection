import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import PageLayout from '../../components/layout/PageLayout';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import StatusBadge from '../../components/tables/StatusBadge';
import RiskBadge from '../../components/tables/RiskBadge';
import { getPolicy } from '../../services/claimService';
import { formatDate, formatCurrency } from '../../utils/formatters';
import useFetch from '../../hooks/useFetch';

const PolicyDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, loading } = useFetch(() => getPolicy(id), [id]);
  const p = data?.data;

  return (
    <PageLayout title="Policy Details">
      {loading ? <LoadingSpinner /> : !p ? <p>Policy not found</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div style={{ background: '#fff', borderRadius: '0.75rem', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#111827' }}>Policy #{p.POLICY_ID}</h2>
                <p style={{ margin: '0.25rem 0 0', color: '#6b7280' }}>Patient: <strong>{p.PATIENT_NAME}</strong></p>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button onClick={() => navigate(`/policies/${id}/edit`)}
                  style={{ padding: '0.5rem 1rem', background: '#6366f1', color: '#fff', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 500, fontSize: '0.875rem' }}>
                  Edit Policy
                </button>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginTop: '1.5rem' }}>
              {[
                { label: 'Policy Type',     value: p.POLICY_TYPE },
                { label: 'Coverage Amount', value: formatCurrency(p.COVERAGE_AMOUNT) },
                { label: 'Start Date',      value: formatDate(p.START_DATE) },
                { label: 'End Date',        value: formatDate(p.END_DATE) },
                { label: 'Total Claims',    value: p.claims?.length || 0 },
              ].map(f => (
                <div key={f.label} style={{ background: '#f9fafb', borderRadius: '0.5rem', padding: '0.875rem' }}>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>{f.label}</div>
                  <div style={{ fontWeight: 600, color: '#111827' }}>{f.value}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: '#fff', borderRadius: '0.75rem', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
            <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600, color: '#111827' }}>Claims ({p.claims?.length || 0})</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                    {['ID','Date','Amount','Diagnosis','Provider','Status','Risk'].map(h => (
                      <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, color: '#374151' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {p.claims?.map(c => (
                    <tr key={c.CLAIM_ID} onClick={() => navigate(`/claims/${c.CLAIM_ID}`)}
                      style={{ borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                      onMouseLeave={e => e.currentTarget.style.background = ''}>
                      <td style={{ padding: '0.75rem 1rem', color: '#6366f1', fontWeight: 600 }}>#{c.CLAIM_ID}</td>
                      <td style={{ padding: '0.75rem 1rem' }}>{formatDate(c.CLAIM_DATE)}</td>
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>{formatCurrency(c.CLAIM_AMOUNT)}</td>
                      <td style={{ padding: '0.75rem 1rem', color: '#6b7280' }}>{c.DIAGNOSIS}</td>
                      <td style={{ padding: '0.75rem 1rem' }}>{c.PROVIDER_NAME}</td>
                      <td style={{ padding: '0.75rem 1rem' }}><StatusBadge status={c.STATUS} /></td>
                      <td style={{ padding: '0.75rem 1rem' }}><RiskBadge flagCount={c.flag_count} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  );
};

export default PolicyDetails;
