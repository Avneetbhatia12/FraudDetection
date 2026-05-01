import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PageLayout from '../../components/layout/PageLayout';
import DataTable from '../../components/tables/DataTable';
import TableFilters from '../../components/tables/TableFilters';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import { getPatients } from '../../services/patientService';
import { formatDate } from '../../utils/formatters';
import useDebounce from '../../hooks/useDebounce';

const PatientList = () => {
  const navigate = useNavigate();
  const [patients, setPatients] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const debouncedSearch = useDebounce(search);

  useEffect(() => {
    setLoading(true);
    getPatients({ search: debouncedSearch, limit: 50 })
      .then(r => setPatients(r.data.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [debouncedSearch]);

  const columns = [
    { key: 'PATIENT_ID',  label: 'ID',       render: v => <span style={{ color: '#6366f1', fontWeight: 600 }}>#{v}</span> },
    { key: 'FIRST_NAME',  label: 'First Name' },
    { key: 'LAST_NAME',   label: 'Last Name' },
    { key: 'GENDER',      label: 'Gender' },
    { key: 'DOB',         label: 'DOB',      render: v => formatDate(v) },
    { key: 'EMAIL',       label: 'Email' },
    { key: 'policy_count',label: 'Policies', render: v => <span style={{ background: '#eef2ff', color: '#6366f1', padding: '0.2rem 0.5rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 600 }}>{v || 0}</span> },
    { key: 'claim_count', label: 'Claims',   render: v => <span style={{ background: '#f0fdf4', color: '#16a34a', padding: '0.2rem 0.5rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 600 }}>{v || 0}</span> },
  ];

  return (
    <PageLayout title="Patients">
      <div style={{ background: '#fff', borderRadius: '0.75rem', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600, color: '#111827' }}>All Patients</h2>
          <button onClick={() => navigate('/patients/new')}
            style={{ padding: '0.5rem 1rem', background: '#6366f1', color: '#fff', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 500, fontSize: '0.875rem' }}>
            + Add Patient
          </button>
        </div>
        <TableFilters search={search} onSearch={setSearch} />
        {loading ? <LoadingSpinner /> : (
          <DataTable columns={columns} data={patients} onRowClick={row => navigate(`/patients/${row.PATIENT_ID}`)} />
        )}
      </div>
    </PageLayout>
  );
};

export default PatientList;
