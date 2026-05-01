import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PageLayout from '../../components/layout/PageLayout';
import DataTable from '../../components/tables/DataTable';
import TableFilters from '../../components/tables/TableFilters';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import { getProviders } from '../../services/claimService';
import { formatCurrency } from '../../utils/formatters';
import useDebounce from '../../hooks/useDebounce';

const ProviderList = () => {
  const navigate = useNavigate();
  const [providers, setProviders] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const debouncedSearch = useDebounce(search);

  useEffect(() => {
    setLoading(true);
    getProviders({ search: debouncedSearch, limit: 50 })
      .then(r => setProviders(r.data.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [debouncedSearch]);

  const columns = [
    { key: 'PROVIDER_ID',   label: 'ID',          render: v => <span style={{ color: '#6366f1', fontWeight: 600 }}>#{v}</span> },
    { key: 'PROVIDER_NAME', label: 'Provider Name' },
    { key: 'PROVIDER_TYPE', label: 'Type' },
    { key: 'CONTACT_NUMBER',label: 'Contact' },
    { key: 'total_claims',  label: 'Claims',      render: v => v || 0 },
    { key: 'total_billed',  label: 'Total Billed', render: v => formatCurrency(v) },
    { key: 'fraud_flags',   label: 'Fraud Flags',  render: v => v > 0
        ? <span style={{ background: '#fee2e2', color: '#dc2626', padding: '0.2rem 0.6rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 600 }}>🚨 {v}</span>
        : <span style={{ background: '#dcfce7', color: '#16a34a', padding: '0.2rem 0.6rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 600 }}>✅ 0</span>
    },
  ];

  return (
    <PageLayout title="Medical Providers">
      <div style={{ background: '#fff', borderRadius: '0.75rem', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600, color: '#111827' }}>All Providers</h2>
          <button onClick={() => navigate('/providers/new')}
            style={{ padding: '0.5rem 1rem', background: '#6366f1', color: '#fff', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 500, fontSize: '0.875rem' }}>
            + Add Provider
          </button>
        </div>
        <TableFilters search={search} onSearch={setSearch} />
        {loading ? <LoadingSpinner /> : (
          <DataTable columns={columns} data={providers} onRowClick={row => navigate(`/providers/${row.PROVIDER_ID}`)} />
        )}
      </div>
    </PageLayout>
  );
};

export default ProviderList;
