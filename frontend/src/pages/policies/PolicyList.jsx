import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PageLayout from '../../components/layout/PageLayout';
import DataTable from '../../components/tables/DataTable';
import TableFilters from '../../components/tables/TableFilters';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import { getPolicies } from '../../services/claimService';
import { formatDate, formatCurrency } from '../../utils/formatters';
import { POLICY_TYPES } from '../../utils/constants';
import useDebounce from '../../hooks/useDebounce';

const PolicyList = () => {
  const navigate = useNavigate();
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const debouncedSearch = useDebounce(search);

  useEffect(() => {
    setLoading(true);
    getPolicies({ search: debouncedSearch, limit: 50 })
      .then(r => setPolicies(r.data.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [debouncedSearch]);

  const filtered = typeFilter ? policies.filter(p => p.POLICY_TYPE === typeFilter) : policies;

  const columns = [
    { key: 'POLICY_ID',       label: 'ID',          render: v => <span style={{ color: '#6366f1', fontWeight: 600 }}>#{v}</span> },
    { key: 'POLICY_TYPE',     label: 'Type' },
    { key: 'PATIENT_NAME',    label: 'Patient' },
    { key: 'COVERAGE_AMOUNT', label: 'Coverage',    render: v => formatCurrency(v) },
    { key: 'START_DATE',      label: 'Start',       render: v => formatDate(v) },
    { key: 'END_DATE',        label: 'End',         render: v => formatDate(v) },
    { key: 'claim_count',     label: 'Claims',      render: v => <span style={{ background: '#eef2ff', color: '#6366f1', padding: '0.2rem 0.5rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 600 }}>{v || 0}</span> },
  ];

  return (
    <PageLayout title="Policies">
      <div style={{ background: '#fff', borderRadius: '0.75rem', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600, color: '#111827' }}>All Policies</h2>
          <button onClick={() => navigate('/policies/new')}
            style={{ padding: '0.5rem 1rem', background: '#6366f1', color: '#fff', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 500, fontSize: '0.875rem' }}>
            + Add Policy
          </button>
        </div>
        <TableFilters search={search} onSearch={setSearch}
          filters={[{ value: typeFilter, onChange: setTypeFilter, placeholder: 'All Types', options: POLICY_TYPES.map(t => ({ value: t, label: t })) }]} />
        {loading ? <LoadingSpinner /> : (
          <DataTable columns={columns} data={filtered} onRowClick={row => navigate(`/policies/${row.POLICY_ID}`)} />
        )}
      </div>
    </PageLayout>
  );
};

export default PolicyList;
