import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PageLayout from '../../components/layout/PageLayout';
import DataTable from '../../components/tables/DataTable';
import StatusBadge from '../../components/tables/StatusBadge';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import { getFraudFlags } from '../../services/fraudService';
import { formatDate, formatCurrency, truncate } from '../../utils/formatters';

const FlaggedClaims = () => {
  const navigate = useNavigate();
  const [flags, setFlags]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getFraudFlags({ limit: 100 })
      .then(r => setFlags(r.data.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const columns = [
    { key: 'FLAG_ID',      label: 'Flag ID',   render: v => <span style={{ color: '#dc2626', fontWeight: 600 }}>#{v}</span> },
    { key: 'CLAIM_ID',     label: 'Claim ID',  render: v => <span style={{ color: '#6366f1', fontWeight: 600 }}>#{v}</span> },
    { key: 'FLAGGED_DATE', label: 'Flagged',   render: v => formatDate(v) },
    { key: 'PATIENT_NAME', label: 'Patient' },
    { key: 'CLAIM_AMOUNT', label: 'Amount',    render: v => <span style={{ fontWeight: 600, color: '#dc2626' }}>{formatCurrency(v)}</span> },
    { key: 'DIAGNOSIS',    label: 'Diagnosis' },
    { key: 'PROVIDER_NAME',label: 'Provider' },
    { key: 'STATUS',       label: 'Status',    render: v => <StatusBadge status={v} /> },
    { key: 'FLAG_REASON',  label: 'Reason',    render: v => <span style={{ color: '#6b7280', fontSize: '0.8rem' }}>{truncate(v, 60)}</span> },
  ];

  return (
    <PageLayout title="Fraud Flags">
      <div style={{ background: '#fff', borderRadius: '0.75rem', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600, color: '#111827' }}>🚨 Flagged Claims</h2>
            <p style={{ margin: '0.25rem 0 0', color: '#6b7280', fontSize: '0.875rem' }}>{flags.length} fraud flag(s) detected</p>
          </div>
        </div>
        {loading ? <LoadingSpinner /> : (
          <DataTable columns={columns} data={flags} onRowClick={row => navigate(`/fraud-flags/${row.FLAG_ID}`)} />
        )}
      </div>
    </PageLayout>
  );
};

export default FlaggedClaims;
