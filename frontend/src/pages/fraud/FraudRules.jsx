import React from 'react';
import { useNavigate } from 'react-router-dom';
import PageLayout from '../../components/layout/PageLayout';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import { getFraudRules } from '../../services/fraudService';
import useFetch from '../../hooks/useFetch';

const FraudRules = () => {
  const navigate = useNavigate();
  const { data, loading } = useFetch(getFraudRules);
  const rules = data?.data || [];

  return (
    <PageLayout title="Fraud Rules">
      <div style={{ background: '#fff', borderRadius: '0.75rem', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600, color: '#111827' }}>⚙️ Fraud Detection Rules</h2>
            <p style={{ margin: '0.25rem 0 0', color: '#6b7280', fontSize: '0.875rem' }}>Rules that automatically trigger fraud flags when claims are submitted</p>
          </div>
          <button onClick={() => navigate('/fraud-rules/new')}
            style={{ padding: '0.5rem 1rem', background: '#6366f1', color: '#fff', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 500, fontSize: '0.875rem' }}>
            + Add Rule
          </button>
        </div>

        {loading ? <LoadingSpinner /> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
            {rules.map(rule => (
              <div key={rule.RULE_ID} onClick={() => navigate(`/fraud-rules/${rule.RULE_ID}/edit`)}
                style={{ padding: '1.25rem', border: '1px solid #e5e7eb', borderRadius: '0.75rem', cursor: 'pointer', transition: 'all 0.15s', background: '#fff' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#6366f1'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(99,102,241,0.1)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.boxShadow = ''; }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '1.25rem' }}>⚙️</span>
                    <span style={{ fontWeight: 600, color: '#111827', fontSize: '0.9rem' }}>{rule.RULE_NAME}</span>
                  </div>
                  <span style={{ background: '#eef2ff', color: '#6366f1', padding: '0.2rem 0.6rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 600 }}>
                    #{rule.RULE_ID}
                  </span>
                </div>
                <p style={{ margin: '0 0 0.75rem', color: '#6b7280', fontSize: '0.8rem', lineHeight: 1.5 }}>{rule.DESCRIPTION}</p>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ background: '#fef3c7', color: '#92400e', padding: '0.25rem 0.75rem', borderRadius: '0.375rem', fontSize: '0.8rem', fontWeight: 600 }}>
                    Threshold: {rule.THRESHOLD_VALUE}
                  </div>
                  <div style={{ background: rule.times_triggered > 0 ? '#fee2e2' : '#f3f4f6', color: rule.times_triggered > 0 ? '#dc2626' : '#6b7280', padding: '0.25rem 0.75rem', borderRadius: '0.375rem', fontSize: '0.8rem', fontWeight: 600 }}>
                    {rule.times_triggered} trigger(s)
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </PageLayout>
  );
};

export default FraudRules;
