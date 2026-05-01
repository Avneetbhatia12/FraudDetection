import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import PageLayout from '../../components/layout/PageLayout';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import StatusBadge from '../../components/tables/StatusBadge';
import RiskBadge from '../../components/tables/RiskBadge';
import { getPatient } from '../../services/patientService';
import { formatDate, formatCurrency } from '../../utils/formatters';
import useFetch from '../../hooks/useFetch';

const Field = ({ label, value }) => (
  <div>
    <dt style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 500, marginBottom: '0.2rem' }}>{label}</dt>
    <dd style={{ margin: 0, fontSize: '0.875rem', color: '#111827', fontWeight: 500 }}>{value || '—'}</dd>
  </div>
);

const PatientDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, loading } = useFetch(() => getPatient(id), [id]);
  const p = data?.data;

  return (
    <PageLayout title="Patient Details">
      {loading ? <LoadingSpinner /> : !p ? <p>Patient not found</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

          {/* Header card */}
          <div style={{ background: '#fff', borderRadius: '0.75rem', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '1.5rem', fontWeight: 700 }}>
                {p.FIRST_NAME?.[0]}{p.LAST_NAME?.[0]}
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#111827' }}>{p.FIRST_NAME} {p.LAST_NAME}</h2>
                <p style={{ margin: '0.25rem 0 0', color: '#6b7280', fontSize: '0.875rem' }}>{p.EMAIL}</p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button onClick={() => navigate(`/patients/${id}/edit`)}
                style={{ padding: '0.5rem 1rem', background: '#6366f1', color: '#fff', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 500, fontSize: '0.875rem' }}>
                Edit Patient
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            {/* Patient Info */}
            <div style={{ background: '#fff', borderRadius: '0.75rem', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
              <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600, color: '#111827' }}>Personal Information</h3>
              <dl style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', margin: 0 }}>
                <Field label="First Name"  value={p.FIRST_NAME} />
                <Field label="Last Name"   value={p.LAST_NAME} />
                <Field label="Gender"      value={p.GENDER} />
                <Field label="Date of Birth" value={formatDate(p.DOB)} />
                <Field label="Total Claims" value={p.total_claims} />
                <div style={{ gridColumn: '1/-1' }}><Field label="Address" value={p.ADDRESS} /></div>
              </dl>
            </div>

            {/* Policies */}
            <div style={{ background: '#fff', borderRadius: '0.75rem', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#111827' }}>Policies ({p.policies?.length || 0})</h3>
                <button onClick={() => navigate('/policies/new')} style={{ background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500 }}>+ Add Policy</button>
              </div>
              {p.policies?.map(pol => (
                <div key={pol.POLICY_ID} onClick={() => navigate(`/policies/${pol.POLICY_ID}`)}
                  style={{ padding: '0.75rem', background: '#f9fafb', borderRadius: '0.5rem', marginBottom: '0.5rem', cursor: 'pointer', border: '1px solid #e5e7eb' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 600, color: '#6366f1', fontSize: '0.875rem' }}>#{pol.POLICY_ID} — {pol.POLICY_TYPE}</span>
                    <span style={{ fontWeight: 600, color: '#111827', fontSize: '0.875rem' }}>{formatCurrency(pol.COVERAGE_AMOUNT)}</span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                    {formatDate(pol.START_DATE)} → {formatDate(pol.END_DATE)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Claims */}
          <div style={{ background: '#fff', borderRadius: '0.75rem', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
            <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600, color: '#111827' }}>Claim History ({p.claims?.length || 0})</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                    {['Claim ID','Date','Amount','Diagnosis','Provider','Status','Risk'].map(h => (
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

export default PatientDetails;
