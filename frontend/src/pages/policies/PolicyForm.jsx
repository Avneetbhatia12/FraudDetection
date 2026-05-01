import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PageLayout from '../../components/layout/PageLayout';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import { createPolicy, updatePolicy, getPolicy } from '../../services/claimService';
import { getPatients } from '../../services/patientService';
import { POLICY_TYPES } from '../../utils/constants';
import { formatDateInput } from '../../utils/formatters';

const inputStyle = { width: '100%', padding: '0.625rem 0.875rem', border: '1px solid #d1d5db', borderRadius: '0.5rem', fontSize: '0.875rem', boxSizing: 'border-box' };

const PolicyForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [form, setForm]       = useState({ POLICY_TYPE: 'Individual', START_DATE: '', END_DATE: '', COVERAGE_AMOUNT: '', PATIENT_ID: '' });
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [msg, setMsg]         = useState('');

  useEffect(() => {
    Promise.all([
      getPatients({ limit: 100 }),
      isEdit ? getPolicy(id) : Promise.resolve(null),
    ]).then(([pRes, polRes]) => {
      setPatients(pRes.data.data || []);
      if (polRes) {
        const p = polRes.data.data;
        setForm({ POLICY_TYPE: p.POLICY_TYPE, START_DATE: formatDateInput(p.START_DATE), END_DATE: formatDateInput(p.END_DATE), COVERAGE_AMOUNT: p.COVERAGE_AMOUNT, PATIENT_ID: p.PATIENT_ID });
      }
    }).finally(() => setFetching(false));
  }, [id, isEdit]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isEdit) await updatePolicy(id, form);
      else await createPolicy(form);
      navigate('/policies');
    } catch (err) {
      setMsg(err.response?.data?.message || 'Failed to save policy');
    } finally {
      setLoading(false);
    }
  };

  if (fetching) return <PageLayout title="Policy"><LoadingSpinner /></PageLayout>;

  return (
    <PageLayout title={isEdit ? 'Edit Policy' : 'Add Policy'}>
      <div style={{ background: '#fff', borderRadius: '0.75rem', padding: '2rem', maxWidth: '640px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
        <h2 style={{ margin: '0 0 1.5rem', fontSize: '1.125rem', fontWeight: 600, color: '#111827' }}>
          {isEdit ? 'Edit Policy' : 'Create New Policy'}
        </h2>
        {msg && <div style={{ background: '#fee2e2', border: '1px solid #fecaca', borderRadius: '0.5rem', padding: '0.75rem', marginBottom: '1rem', color: '#dc2626', fontSize: '0.875rem' }}>{msg}</div>}
        <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div style={{ gridColumn: '1/-1' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#374151', marginBottom: '0.375rem' }}>Patient *</label>
            <select style={inputStyle} value={form.PATIENT_ID} onChange={e => set('PATIENT_ID', e.target.value)} required>
              <option value="">Select patient...</option>
              {patients.map(p => <option key={p.PATIENT_ID} value={p.PATIENT_ID}>{p.FIRST_NAME} {p.LAST_NAME} — {p.EMAIL}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#374151', marginBottom: '0.375rem' }}>Policy Type *</label>
            <select style={inputStyle} value={form.POLICY_TYPE} onChange={e => set('POLICY_TYPE', e.target.value)}>
              {POLICY_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#374151', marginBottom: '0.375rem' }}>Coverage Amount *</label>
            <input type="number" style={inputStyle} value={form.COVERAGE_AMOUNT} onChange={e => set('COVERAGE_AMOUNT', e.target.value)} min="0" step="0.01" required />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#374151', marginBottom: '0.375rem' }}>Start Date *</label>
            <input type="date" style={inputStyle} value={form.START_DATE} onChange={e => set('START_DATE', e.target.value)} required />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#374151', marginBottom: '0.375rem' }}>End Date *</label>
            <input type="date" style={inputStyle} value={form.END_DATE} onChange={e => set('END_DATE', e.target.value)} required />
          </div>
          <div style={{ gridColumn: '1/-1', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
            <button type="button" onClick={() => navigate('/policies')}
              style={{ padding: '0.625rem 1.25rem', border: '1px solid #d1d5db', borderRadius: '0.5rem', background: '#fff', cursor: 'pointer', color: '#374151' }}>
              Cancel
            </button>
            <button type="submit" disabled={loading}
              style={{ padding: '0.625rem 1.25rem', background: '#6366f1', color: '#fff', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 600 }}>
              {loading ? 'Saving...' : isEdit ? 'Update Policy' : 'Create Policy'}
            </button>
          </div>
        </form>
      </div>
    </PageLayout>
  );
};

export default PolicyForm;
