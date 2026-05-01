import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PageLayout from '../../components/layout/PageLayout';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import { createProvider, updateProvider, getProvider } from '../../services/claimService';
import { PROVIDER_TYPES } from '../../utils/constants';

const inputStyle = { width: '100%', padding: '0.625rem 0.875rem', border: '1px solid #d1d5db', borderRadius: '0.5rem', fontSize: '0.875rem', boxSizing: 'border-box' };

const ProviderForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [form, setForm]     = useState({ PROVIDER_NAME: '', PROVIDER_TYPE: 'Hospital', ADDRESS: '', CONTACT_NUMBER: '' });
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(isEdit);
  const [msg, setMsg]       = useState('');

  useEffect(() => {
    if (!isEdit) return;
    getProvider(id).then(r => {
      const p = r.data.data;
      setForm({ PROVIDER_NAME: p.PROVIDER_NAME, PROVIDER_TYPE: p.PROVIDER_TYPE, ADDRESS: p.ADDRESS, CONTACT_NUMBER: p.CONTACT_NUMBER });
    }).finally(() => setFetching(false));
  }, [id, isEdit]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isEdit) await updateProvider(id, form);
      else await createProvider(form);
      navigate('/providers');
    } catch (err) {
      setMsg(err.response?.data?.message || 'Failed to save provider');
    } finally {
      setLoading(false);
    }
  };

  if (fetching) return <PageLayout title="Provider"><LoadingSpinner /></PageLayout>;

  return (
    <PageLayout title={isEdit ? 'Edit Provider' : 'Add Provider'}>
      <div style={{ background: '#fff', borderRadius: '0.75rem', padding: '2rem', maxWidth: '640px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
        <h2 style={{ margin: '0 0 1.5rem', fontSize: '1.125rem', fontWeight: 600, color: '#111827' }}>
          {isEdit ? 'Edit Provider' : 'Add Medical Provider'}
        </h2>
        {msg && <div style={{ background: '#fee2e2', border: '1px solid #fecaca', borderRadius: '0.5rem', padding: '0.75rem', marginBottom: '1rem', color: '#dc2626', fontSize: '0.875rem' }}>{msg}</div>}
        <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div style={{ gridColumn: '1/-1' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#374151', marginBottom: '0.375rem' }}>Provider Name *</label>
            <input style={inputStyle} value={form.PROVIDER_NAME} onChange={e => set('PROVIDER_NAME', e.target.value)} required />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#374151', marginBottom: '0.375rem' }}>Provider Type *</label>
            <select style={inputStyle} value={form.PROVIDER_TYPE} onChange={e => set('PROVIDER_TYPE', e.target.value)}>
              {PROVIDER_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#374151', marginBottom: '0.375rem' }}>Contact Number *</label>
            <input style={inputStyle} value={form.CONTACT_NUMBER} onChange={e => set('CONTACT_NUMBER', e.target.value)} required />
          </div>
          <div style={{ gridColumn: '1/-1' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#374151', marginBottom: '0.375rem' }}>Address *</label>
            <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: '80px' }} value={form.ADDRESS} onChange={e => set('ADDRESS', e.target.value)} required />
          </div>
          <div style={{ gridColumn: '1/-1', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
            <button type="button" onClick={() => navigate('/providers')}
              style={{ padding: '0.625rem 1.25rem', border: '1px solid #d1d5db', borderRadius: '0.5rem', background: '#fff', cursor: 'pointer', color: '#374151' }}>
              Cancel
            </button>
            <button type="submit" disabled={loading}
              style={{ padding: '0.625rem 1.25rem', background: '#6366f1', color: '#fff', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 600 }}>
              {loading ? 'Saving...' : isEdit ? 'Update Provider' : 'Add Provider'}
            </button>
          </div>
        </form>
      </div>
    </PageLayout>
  );
};

export default ProviderForm;
