import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PageLayout from '../../components/layout/PageLayout';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import { createFraudRule, updateFraudRule, getFraudRules } from '../../services/fraudService';

const inputStyle = { width: '100%', padding: '0.625rem 0.875rem', border: '1px solid #d1d5db', borderRadius: '0.5rem', fontSize: '0.875rem', boxSizing: 'border-box' };

const FraudRuleForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [form, setForm]     = useState({ RULE_NAME: '', DESCRIPTION: '', THRESHOLD_VALUE: '' });
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(isEdit);
  const [msg, setMsg]       = useState('');

  useEffect(() => {
    if (!isEdit) return;
    getFraudRules().then(r => {
      const rule = r.data.data?.find(r => String(r.RULE_ID) === String(id));
      if (rule) setForm({ RULE_NAME: rule.RULE_NAME, DESCRIPTION: rule.DESCRIPTION, THRESHOLD_VALUE: rule.THRESHOLD_VALUE });
    }).finally(() => setFetching(false));
  }, [id, isEdit]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isEdit) await updateFraudRule(id, form);
      else await createFraudRule(form);
      navigate('/fraud-rules');
    } catch (err) {
      setMsg(err.response?.data?.message || 'Failed to save rule');
    } finally {
      setLoading(false);
    }
  };

  if (fetching) return <PageLayout title="Fraud Rule"><LoadingSpinner /></PageLayout>;

  return (
    <PageLayout title={isEdit ? 'Edit Fraud Rule' : 'Add Fraud Rule'}>
      <div style={{ background: '#fff', borderRadius: '0.75rem', padding: '2rem', maxWidth: '640px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
        <h2 style={{ margin: '0 0 1.5rem', fontSize: '1.125rem', fontWeight: 600, color: '#111827' }}>
          {isEdit ? 'Edit Fraud Rule' : 'Create New Fraud Rule'}
        </h2>
        {msg && <div style={{ background: '#fee2e2', border: '1px solid #fecaca', borderRadius: '0.5rem', padding: '0.75rem', marginBottom: '1rem', color: '#dc2626', fontSize: '0.875rem' }}>{msg}</div>}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#374151', marginBottom: '0.375rem' }}>Rule Name *</label>
            <input style={inputStyle} value={form.RULE_NAME} onChange={e => set('RULE_NAME', e.target.value)} required placeholder="e.g. High Claim Amount" />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#374151', marginBottom: '0.375rem' }}>Description *</label>
            <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: '100px' }} value={form.DESCRIPTION} onChange={e => set('DESCRIPTION', e.target.value)} required placeholder="Describe when this rule triggers..." />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#374151', marginBottom: '0.375rem' }}>Threshold Value *</label>
            <input type="number" style={inputStyle} value={form.THRESHOLD_VALUE} onChange={e => set('THRESHOLD_VALUE', e.target.value)} required min="0" step="0.01" placeholder="e.g. 10000 for dollar amount, 3 for count" />
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: '#6b7280' }}>For amount rules: dollar value. For count rules: number of occurrences.</p>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
            <button type="button" onClick={() => navigate('/fraud-rules')}
              style={{ padding: '0.625rem 1.25rem', border: '1px solid #d1d5db', borderRadius: '0.5rem', background: '#fff', cursor: 'pointer', color: '#374151' }}>
              Cancel
            </button>
            <button type="submit" disabled={loading}
              style={{ padding: '0.625rem 1.25rem', background: '#6366f1', color: '#fff', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 600 }}>
              {loading ? 'Saving...' : isEdit ? 'Update Rule' : 'Create Rule'}
            </button>
          </div>
        </form>
      </div>
    </PageLayout>
  );
};

export default FraudRuleForm;
