import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import PageLayout from '../../components/layout/PageLayout';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import StatusBadge from '../../components/tables/StatusBadge';
import FraudScoreIndicator from '../../components/fraud/FraudScoreIndicator';
import RuleViolationList from '../../components/fraud/RuleViolationList';
import InvestigationPanel from '../../components/fraud/InvestigationPanel';
import { getFraudFlag } from '../../services/fraudService';
import { formatDate, formatCurrency } from '../../utils/formatters';
import useFetch from '../../hooks/useFetch';

const InvestigationView = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, loading, refetch } = useFetch(() => getFraudFlag(id), [id]);
  const f = data?.data;

  return (
    <PageLayout title="Investigation View">
      {loading ? <LoadingSpinner /> : !f ? <p>Flag not found</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

          {/* Alert Banner */}
          <div style={{ background: 'linear-gradient(135deg,#fef2f2,#fff)', border: '1px solid #fecaca', borderRadius: '0.75rem', padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '1.5rem' }}>🚨</span>
                  <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#dc2626' }}>Fraud Investigation — Flag #{f.FLAG_ID}</h2>
                </div>
                <p style={{ margin: 0, color: '#374151', fontSize: '0.875rem' }}>{f.FLAG_REASON}</p>
                <p style={{ margin: '0.25rem 0 0', color: '#6b7280', fontSize: '0.8rem' }}>Flagged on {formatDate(f.FLAGGED_DATE)}</p>
              </div>
              <StatusBadge status={f.STATUS} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '1.5rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {/* Claim Details */}
              <div style={{ background: '#fff', borderRadius: '0.75rem', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600, color: '#111827' }}>Claim Details</h3>
                <dl style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', margin: 0 }}>
                  {[
                    { label: 'Claim ID',       value: `#${f.CLAIM_ID}` },
                    { label: 'Claim Date',     value: formatDate(f.CLAIM_DATE) },
                    { label: 'Claim Amount',   value: formatCurrency(f.CLAIM_AMOUNT) },
                    { label: 'Approved Amount',value: formatCurrency(f.APPROVED_AMOUNT) },
                    { label: 'Policy Type',    value: f.POLICY_TYPE },
                    { label: 'Coverage',       value: formatCurrency(f.COVERAGE_AMOUNT) },
                  ].map(item => (
                    <div key={item.label}>
                      <dt style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 500, marginBottom: '0.2rem' }}>{item.label}</dt>
                      <dd style={{ margin: 0, fontSize: '0.875rem', color: '#111827', fontWeight: 500 }}>{item.value}</dd>
                    </div>
                  ))}
                  <div style={{ gridColumn: '1/-1' }}>
                    <dt style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 500, marginBottom: '0.2rem' }}>Diagnosis</dt>
                    <dd style={{ margin: 0, fontSize: '0.875rem', color: '#111827', fontWeight: 500 }}>{f.DIAGNOSIS}</dd>
                  </div>
                </dl>
              </div>

              {/* Patient & Provider */}
              <div style={{ background: '#fff', borderRadius: '0.75rem', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600, color: '#111827' }}>Patient & Provider</h3>
                <dl style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', margin: 0 }}>
                  {[
                    { label: 'Patient Name',   value: f.PATIENT_NAME },
                    { label: 'Email',          value: f.EMAIL },
                    { label: 'Gender',         value: f.GENDER },
                    { label: 'Date of Birth',  value: formatDate(f.DOB) },
                    { label: 'Provider Name',  value: f.PROVIDER_NAME },
                    { label: 'Provider Type',  value: f.PROVIDER_TYPE },
                    { label: 'Contact',        value: f.CONTACT_NUMBER },
                  ].map(item => (
                    <div key={item.label}>
                      <dt style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 500, marginBottom: '0.2rem' }}>{item.label}</dt>
                      <dd style={{ margin: 0, fontSize: '0.875rem', color: '#111827', fontWeight: 500 }}>{item.value || '—'}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              {/* All flags for this claim */}
              <div style={{ background: '#fff', borderRadius: '0.75rem', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600, color: '#111827' }}>All Flags for Claim #{f.CLAIM_ID}</h3>
                {f.all_flags?.map(flag => (
                  <div key={flag.FLAG_ID} style={{ padding: '0.75rem', background: '#fef2f2', borderRadius: '0.5rem', marginBottom: '0.5rem', borderLeft: '4px solid #ef4444' }}>
                    <div style={{ fontWeight: 600, color: '#dc2626', fontSize: '0.8rem' }}>Flag #{flag.FLAG_ID} — {formatDate(flag.FLAGGED_DATE)}</div>
                    <div style={{ color: '#374151', fontSize: '0.875rem', marginTop: '0.25rem' }}>{flag.FLAG_REASON}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <FraudScoreIndicator flagCount={f.all_flags?.length || 1} ruleCount={f.triggered_rules?.length || 0} />
              <RuleViolationList rules={f.triggered_rules || []} />
              <InvestigationPanel claim={{ CLAIM_ID: f.CLAIM_ID, STATUS: f.STATUS, APPROVED_AMOUNT: f.APPROVED_AMOUNT }} onUpdate={refetch} />
              <button onClick={() => navigate(`/claims/${f.CLAIM_ID}`)}
                style={{ padding: '0.625rem', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: '0.5rem', cursor: 'pointer', color: '#374151', fontWeight: 500, fontSize: '0.875rem' }}>
                View Full Claim →
              </button>
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  );
};

export default InvestigationView;
