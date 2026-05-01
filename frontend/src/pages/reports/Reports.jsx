import React from 'react';
import PageLayout from '../../components/layout/PageLayout';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { getReports } from '../../services/fraudService';
import { formatCurrency } from '../../utils/formatters';
import useFetch from '../../hooks/useFetch';

const Section = ({ title, children }) => (
  <div style={{ background: '#fff', borderRadius: '0.75rem', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', marginBottom: '1.5rem' }}>
    <h3 style={{ margin: '0 0 1.25rem', fontSize: '1rem', fontWeight: 600, color: '#111827' }}>{title}</h3>
    {children}
  </div>
);

const Reports = () => {
  const { data, loading } = useFetch(getReports);
  const d = data?.data;

  return (
    <PageLayout title="Reports & Analytics">
      {loading ? <LoadingSpinner /> : !d ? null : (
        <>
          {/* Claims above average */}
          <Section title="📊 Claims Above Average Amount">
            <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1rem' }}>
              {d.above_average_claims?.length} claims exceed the average claim amount
            </p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                    {['Claim ID','Patient','Amount','Diagnosis','Status'].map(h => (
                      <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, color: '#374151' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {d.above_average_claims?.slice(0, 10).map(c => (
                    <tr key={c.CLAIM_ID} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '0.75rem 1rem', color: '#6366f1', fontWeight: 600 }}>#{c.CLAIM_ID}</td>
                      <td style={{ padding: '0.75rem 1rem' }}>{c.PATIENT_NAME}</td>
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#dc2626' }}>{formatCurrency(c.CLAIM_AMOUNT)}</td>
                      <td style={{ padding: '0.75rem 1rem', color: '#6b7280' }}>{c.DIAGNOSIS}</td>
                      <td style={{ padding: '0.75rem 1rem' }}>{c.STATUS}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          {/* Claims per provider chart */}
          <Section title="🏥 Claims per Provider">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={d.per_provider?.slice(0, 10)} margin={{ top: 5, right: 20, left: 20, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="PROVIDER_NAME" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" interval={0} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v, name) => name === 'total_amount' ? [formatCurrency(v), 'Total Amount'] : [v, 'Claims']} />
                <Legend />
                <Bar dataKey="total_claims" fill="#6366f1" name="Total Claims" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </Section>

          {/* Suspicious providers */}
          <Section title="⚠️ Suspicious Providers (>3 Claims)">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
              {d.suspicious_providers?.map(p => (
                <div key={p.PROVIDER_ID} style={{ padding: '1rem', border: `1px solid ${p.fraud_flags > 0 ? '#fecaca' : '#e5e7eb'}`, borderRadius: '0.75rem', background: p.fraud_flags > 0 ? '#fef2f2' : '#f9fafb' }}>
                  <div style={{ fontWeight: 600, color: '#111827', marginBottom: '0.5rem' }}>{p.PROVIDER_NAME}</div>
                  <div style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '0.5rem' }}>{p.PROVIDER_TYPE}</div>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ background: '#eef2ff', color: '#6366f1', padding: '0.2rem 0.6rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 600 }}>{p.claim_count} claims</span>
                    <span style={{ background: '#f0fdf4', color: '#16a34a', padding: '0.2rem 0.6rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 600 }}>{formatCurrency(p.total_billed)}</span>
                    {p.fraud_flags > 0 && <span style={{ background: '#fee2e2', color: '#dc2626', padding: '0.2rem 0.6rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 600 }}>🚨 {p.fraud_flags} flags</span>}
                  </div>
                </div>
              ))}
            </div>
          </Section>

          {/* Fraud summary */}
          <Section title="🔍 Fraud Detection Summary">
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                    {['Claim ID','Amount','Status','Fraud Flags','Rules Triggered'].map(h => (
                      <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, color: '#374151' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {d.fraud_summary?.map(c => (
                    <tr key={c.CLAIM_ID} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '0.75rem 1rem', color: '#6366f1', fontWeight: 600 }}>#{c.CLAIM_ID}</td>
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>{formatCurrency(c.CLAIM_AMOUNT)}</td>
                      <td style={{ padding: '0.75rem 1rem' }}>{c.STATUS}</td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span style={{ background: '#fee2e2', color: '#dc2626', padding: '0.2rem 0.6rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 600 }}>🚨 {c.fraud_flags}</span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span style={{ background: '#ede9fe', color: '#7c3aed', padding: '0.2rem 0.6rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 600 }}>⚙️ {c.rules_triggered}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </>
      )}
    </PageLayout>
  );
};

export default Reports;
