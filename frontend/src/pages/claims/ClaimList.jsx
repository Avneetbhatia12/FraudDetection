import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PageLayout from '../../components/layout/PageLayout';
import DataTable from '../../components/tables/DataTable';
import TableFilters from '../../components/tables/TableFilters';
import StatusBadge from '../../components/tables/StatusBadge';
import RiskBadge from '../../components/tables/RiskBadge';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import { getClaims } from '../../services/claimService';
import { formatDate, formatCurrency } from '../../utils/formatters';
import { CLAIM_STATUSES } from '../../utils/constants';
import useDebounce from '../../hooks/useDebounce';

const ClaimList = () => {
  const navigate = useNavigate();
  const [claims, setClaims]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const debouncedSearch = useDebounce(search);

  useEffect(() => {
    setLoading(true);
    getClaims({ search: debouncedSearch, status: statusFilter, limit: 50 })
      .then(r => setClaims(r.data.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [debouncedSearch, statusFilter]);

  const columns = [
    { key: 'CLAIM_ID',     label: 'ID',       render: v => <span style={{ color: '#6366f1', fontWeight: 600 }}>#{v}</span> },
    { key: 'CLAIM_DATE',   label: 'Date',     render: v => formatDate(v) },
    { key: 'PATIENT_NAME', label: 'Patient' },
    { key: 'CLAIM_AMOUNT', label: 'Amount',   render: v => <span style={{ fontWeight: 600 }}>{formatCurrency(v)}</span> },
    { key: 'DIAGNOSIS',    label: 'Diagnosis', render: v => <span style={{ color: '#6b7280' }}>{v}</span> },
    { key: 'PROVIDER_NAME',label: 'Provider' },
    { key: 'STATUS',       label: 'Status',   render: v => <StatusBadge status={v} /> },
    { key: 'flag_count',   label: 'Risk',     render: v => <RiskBadge flagCount={v} /> },
  ];

  return (
    <PageLayout title="Claims">
      <div style={{ background: '#fff', borderRadius: '0.75rem', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600, color: '#111827' }}>All Claims</h2>
          <button onClick={() => navigate('/claims/new')}
            style={{ padding: '0.5rem 1rem', background: '#6366f1', color: '#fff', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 500, fontSize: '0.875rem' }}>
            + New Claim
          </button>
        </div>
        <TableFilters search={search} onSearch={setSearch}
          filters={[{ value: statusFilter, onChange: setStatusFilter, placeholder: 'All Statuses', options: CLAIM_STATUSES.map(s => ({ value: s, label: s })) }]} />
        {loading ? <LoadingSpinner /> : (
          <DataTable columns={columns} data={claims} onRowClick={row => navigate(`/claims/${row.CLAIM_ID}`)} />
        )}
      </div>
    </PageLayout>
  );
};

export default ClaimList;
