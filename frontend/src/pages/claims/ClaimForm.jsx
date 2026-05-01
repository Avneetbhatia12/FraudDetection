import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PageLayout from '../../components/layout/PageLayout';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import { createClaim, getPolicies, getProviders } from '../../services/claimService';
import { validateClaim } from '../../utils/validators';
import { CLAIM_STATUSES } from '../../utils/constants';
import { formatCurrency } from '../../utils/formatters';

const inputStyle = { width: '100%', padding: '0.625rem 0.875rem', border: '1px solid #d1d5db', borderRadius: '0.5rem', fontSize: '0.875rem', boxSizing: 'border-box' };

const ClaimForm = () => {
  const navigate = useNavigate();
  const [form, setForm]       = useState({ CLAIM_DATE: new Date().toISOString().split('T')[0], CLAIM_AMOUNT: '', APPROVED_AMOUNT: '0', DIAGNOSIS: '', STATUS: 'Pending', POLICY_ID: '', PROVIDER_ID: '' });
  const [policies, setPolicies]   = useState([]);
  const [providers, setProviders] = useState([]);
  const [errors, setErrors]   = useState({});
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [result, setResult]   = useState(null);

  useEffect(() => {
    Promise.all([getPolicies({ limit: 100 }), getProviders({ limit: 100 })])
      .then(([polRes, provRes]) => {
        setPolicies(polRes.data.data || []);
        setProviders(provRes.data.data || []);
      }).finally(() => setFetching(false));
  }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validateClaim(form);
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({});
    setLoading(true);
    try {
      const res = await createClaim(form);
      setResult(res.data);
    } catch (err) {
      setErrors({ submit: err.response?.data?.message || 'Failed to submit claim' });
    } finally {
      setLoading(false);
    }
  };

  if (fetching) return <PageLayout title="New Claim"><LoadingSpinner /></PageLayout>;

  // Show fraud result after submission
  if (result) return (
    <PageLayout title="Claim Submitted">
      <div style={{ maxWidth: '640px' }}>
        <div style={{ background: result.fraud_detected ? '#fef2f2' : '#f0fdf4', border: `1px solid ${result.fraud_detected ? '#fecaca' : '#bbf7d0'}`, borderRadius: '0.75rem', padding: '2rem', textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>{result.fraud_detected ? '🚨' : '✅'}</div>
          <h2 style={{ margin: '0 0 0.5rem', color: result.fraud_detected ? '#dc2626' : '#16a34a' }}>
            {result.fraud_detected ? 'Fraud Detected!' : 'Claim Submitted Successfully'}
          </h2>
          <p style={{ color: '#374151', margin: 0 }}>{result.message}</p>
          <p style={{ color: '#6b7280', fontSize: '0.875rem', marginTop: '0.5rem' }}>Claim ID: <strong>#{result.data?.CLAIM_ID}</strong></p>
        </div>

        {result.fraud_detected && (
          <div style={{ background: '#fff', borderRadius: '0.75rem', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', marginBottom: '1.5rem' }}>
            <h3 style={{ margin: '0 0 1rem', color: '#dc2626', fontSize: '1rem', fontWeight: 600 }}>🚨 Fraud Flags Raised</h3>
            {result.fraud_flags?.map(f => (
              <div key={f.FLAG_ID} style={{ padding: '0.75rem', background: '#fef2f2', borderRadius: '0.5rem', marginBottom: '0.5rem', borderLeft: '4px solid #ef4444' }}>
                <div style={{ fontSize: '0.875rem', color: '#374151' }}>{f.FLAG_REASON}</div>
              </div>
            ))}
            <h3 style={{ margin: '1rem 0 0.75rem', color: '#7c3aed', fontSize: '1rem', fontWeight: 600 }}>⚙️ Rules Triggered</h3>
            {result.triggered_rules?.map(r => (
              <div key={r.RULE_ID} style={{ padding: '0.5rem 0.75rem', background: '#ede9fe', borderRadius: '0.375rem', marginBottom: '0.375rem', fontSize: '0.875rem', color: '#5b21b6', fontWeight: 500 }}>
                {r.RULE_NAME}
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button onClick={() => navigate(`/claims/${result.data?.CLAIM_ID}`)}
            style={{ padding: '0.625rem 1.25rem', background: '#6366f1', color: '#fff', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 600 }}>
            View Claim Details
          </button>
          <button onClick={() => { setResult(null); setForm({ CLAIM_DATE: new Date().toISOString().split('T')[0], CLAIM_AMOUNT: '', APPROVED_AMOUNT: '0', DIAGNOSIS: '', STATUS: 'Pending', POLICY_ID: '', PROVIDER_ID: '' }); }}
            style={{ padding: '0.625rem 1.25rem', border: '1px solid #d1d5db', borderRadius: '0.5rem', background: '#fff', cursor: 'pointer', color: '#374151' }}>
            Submit Another Claim
          </button>
        </div>
      </div>
    </PageLayout>
  );

  return (
    <PageLayout title="New Claim">
      <div style={{ background: '#fff', borderRadius: '0.75rem', padding: '2rem', maxWidth: '640px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
        <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.125rem', fontWeight: 600, color: '#111827' }}>Register New Claim</h2>
        <p style={{ margin: '0 0 1.5rem', color: '#6b7280', fontSize: '0.875rem' }}>Fraud detection rules will run automatically upon submission.</p>

        {errors.submit && <div style={{ background: '#fee2e2', border: '1px solid #fecaca', borderRadius: '0.5rem', padding: '0.75rem', marginBottom: '1rem', color: '#dc2626', fontSize: '0.875rem' }}>{errors.submit}</div>}

        <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div style={{ gridColumn: '1/-1' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#374151', marginBottom: '0.375rem' }}>Policy *</label>
            <select style={inputStyle} value={form.POLICY_ID} onChange={e => set('POLICY_ID', e.target.value)} required>
              <option value="">Select policy...</option>
              {policies.map(p => <option key={p.POLICY_ID} value={p.POLICY_ID}>#{p.POLICY_ID} — {p.PATIENT_NAME} ({p.POLICY_TYPE}) — Coverage: {formatCurrency(p.COVERAGE_AMOUNT)}</option>)}
            </select>
            {errors.POLICY_ID && <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: '#dc2626' }}>{errors.POLICY_ID}</p>}
          </div>
          <div style={{ gridColumn: '1/-1' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#374151', marginBottom: '0.375rem' }}>Medical Provider *</label>
            <select style={inputStyle} value={form.PROVIDER_ID} onChange={e => set('PROVIDER_ID', e.target.value)} required>
              <option value="">Select provider...</option>
              {providers.map(p => <option key={p.PROVIDER_ID} value={p.PROVIDER_ID}>{p.PROVIDER_NAME} ({p.PROVIDER_TYPE})</option>)}
            </select>
            {errors.PROVIDER_ID && <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: '#dc2626' }}>{errors.PROVIDER_ID}</p>}
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#374151', marginBottom: '0.375rem' }}>Claim Date *</label>
            <input type="date" style={inputStyle} value={form.CLAIM_DATE} onChange={e => set('CLAIM_DATE', e.target.value)} required />
            {errors.CLAIM_DATE && <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: '#dc2626' }}>{errors.CLAIM_DATE}</p>}
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#374151', marginBottom: '0.375rem' }}>Status</label>
            <select style={inputStyle} value={form.STATUS} onChange={e => set('STATUS', e.target.value)}>
              {CLAIM_STATUSES.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#374151', marginBottom: '0.375rem' }}>Claim Amount ($) *</label>
            <input type="number" style={inputStyle} value={form.CLAIM_AMOUNT} onChange={e => set('CLAIM_AMOUNT', e.target.value)} min="0" step="0.01" required />
            {errors.CLAIM_AMOUNT && <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: '#dc2626' }}>{errors.CLAIM_AMOUNT}</p>}
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#374151', marginBottom: '0.375rem' }}>Approved Amount ($)</label>
            <input type="number" style={inputStyle} value={form.APPROVED_AMOUNT} onChange={e => set('APPROVED_AMOUNT', e.target.value)} min="0" step="0.01" />
          </div>
          <div style={{ gridColumn: '1/-1' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#374151', marginBottom: '0.375rem' }}>Diagnosis *</label>
            <input style={inputStyle} value={form.DIAGNOSIS} onChange={e => set('DIAGNOSIS', e.target.value)} required placeholder="e.g. Hypertension, Fracture Treatment..." />
            {errors.DIAGNOSIS && <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: '#dc2626' }}>{errors.DIAGNOSIS}</p>}
          </div>
          <div style={{ gridColumn: '1/-1', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '0.5rem', padding: '0.875rem', fontSize: '0.8rem', color: '#92400e' }}>
            ⚠️ <strong>Fraud Detection Active:</strong> Claims exceeding $10,000, frequent claims on the same policy, provider overuse, or repeated diagnoses will be automatically flagged.
          </div>
          <div style={{ gridColumn: '1/-1', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
            <button type="button" onClick={() => navigate('/claims')}
              style={{ padding: '0.625rem 1.25rem', border: '1px solid #d1d5db', borderRadius: '0.5rem', background: '#fff', cursor: 'pointer', color: '#374151' }}>
              Cancel
            </button>
            <button type="submit" disabled={loading}
              style={{ padding: '0.625rem 1.25rem', background: '#6366f1', color: '#fff', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 600 }}>
              {loading ? 'Submitting...' : 'Submit Claim'}
            </button>
          </div>
        </form>
      </div>
    </PageLayout>
  );
};

export default ClaimForm;
