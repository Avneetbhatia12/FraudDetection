import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import PageLayout from '../../components/layout/PageLayout';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import StatusBadge from '../../components/tables/StatusBadge';
import FraudScoreIndicator from '../../components/fraud/FraudScoreIndicator';
import RuleViolationList from '../../components/fraud/RuleViolationList';
import InvestigationPanel from '../../components/fraud/InvestigationPanel';
import { getClaim } from '../../services/claimService';
import { formatDate, formatCurrency } from '../../utils/formatters';
import useFetch from '../../hooks/useFetch';

const Field = ({ label, value, highlight }) => (
  <div>
    <dt style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 500, marginBottom: '0.2rem' }}>{label}</dt>
    <dd style={{ margin: 0, fontSize: '0.875rem', color: highlight ? '#dc2626' : '#111827', fontWeight: highlight ? 700 : 500 }}>{value || '—'}</dd>
  </div>
);

const ClaimDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, loading, refetch } = useFetch(() => getClaim(id), [id]);
  const c = data?.data;

  return (
    <PageLayout title="Claim Details">
      {loading ? <LoadingSpinner /> : !c ? <p>Claim not found</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

          {/* Header */}
          <div style={{ background: c.fraud_flags?.length > 0 ? 'linear-gradient(135deg,#fef2f2,#fff)' : '#fff', borderRadius: '0.75rem', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: c.fraud_flags?.length > 0 ? '1px solid #fecaca' : '1px solid #f3f4f6' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#111827' }}>Claim #{c.CLAIM_ID}</h2>
                  <StatusBadge status={c.STATUS} />
                  {c.fraud_flags?.length > 0 && (
                    <span style={{ background: '#fee2e2', color: '#dc2626', padding: '0.2rem 0.75rem', borderRadius: '9999px', fontSize: '0.8rem', fontWeight: 700 }}>
                      🚨 FRAUD FLAGGED
                    </span>
                  )}
                </div>
                <p style={{ margin: '0.5rem 0 0', color: '#6b7280', fontSize: '0.875rem' }}>
                  Patient: <strong>{c.PATIENT_NAME}</strong> · {c.PATIENT_EMAIL}
                </p>
              </div>
              <button onClick={() => navigate('/claims')}
                style={{ padding: '0.5rem 1rem', border: '1px solid #d1d5db', borderRadius: '0.5rem', background: '#fff', cursor: 'pointer', color: '#374151', fontSize: '0.875rem' }}>
                ← Back to Claims
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '1.5rem' }}>
            {/* Left column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {/* Claim Info */}
              <div style={{ background: '#fff', borderRadius: '0.75rem', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600, color: '#111827' }}>Claim Information</h3>
                <dl style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', margin: 0 }}>
                  <Field label="Claim Date"      value={formatDate(c.CLAIM_DATE)} />
                  <Field label="Claim Amount"    value={formatCurrency(c.CLAIM_AMOUNT)} highlight={c.fraud_flags?.length > 0} />
                  <Field label="Approved Amount" value={formatCurrency(c.APPROVED_AMOUNT)} />
                  <Field label="Policy Type"     value={c.POLICY_TYPE} />
                  <Field label="Coverage Amount" value={formatCurrency(c.COVERAGE_AMOUNT)} />
                  <div style={{ gridColumn: '1/-1' }}><Field label="Diagnosis" value={c.DIAGNOSIS} /></div>
                </dl>
              </div>

              {/* Provider Info */}
              <div style={{ background: '#fff', borderRadius: '0.75rem', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600, color: '#111827' }}>Provider Information</h3>
                <dl style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', margin: 0 }}>
                  <Field label="Provider Name"  value={c.PROVIDER_NAME} />
                  <Field label="Provider Type"  value={c.PROVIDER_TYPE} />
                  <Field label="Contact"        value={c.CONTACT_NUMBER} />
                </dl>
              </div>

              {/* Fraud Flags */}
              {c.fraud_flags?.length > 0 && (
                <div style={{ background: '#fff', borderRadius: '0.75rem', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1px solid #fecaca' }}>
                  <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600, color: '#dc2626' }}>🚨 Fraud Flags ({c.fraud_flags.length})</h3>
                  {c.fraud_flags.map(f => (
                    <div key={f.FLAG_ID} style={{ padding: '0.875rem', background: '#fef2f2', borderRadius: '0.5rem', marginBottom: '0.5rem', borderLeft: '4px solid #ef4444' }}>
                      <div style={{ fontWeight: 600, color: '#dc2626', fontSize: '0.875rem', marginBottom: '0.25rem' }}>Flag #{f.FLAG_ID}</div>
                      <div style={{ color: '#374151', fontSize: '0.875rem' }}>{f.FLAG_REASON}</div>
                      <div style={{ color: '#9ca3af', fontSize: '0.75rem', marginTop: '0.25rem' }}>Flagged: {formatDate(f.FLAGGED_DATE)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <FraudScoreIndicator flagCount={c.fraud_flags?.length || 0} ruleCount={c.triggered_rules?.length || 0} />
              <RuleViolationList rules={c.triggered_rules || []} />
              <InvestigationPanel claim={c} onUpdate={refetch} />
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  );
};

export default ClaimDetails;
