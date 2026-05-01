import React, { useState } from 'react';
import { updateClaimStatus } from '../../services/claimService';

const InvestigationPanel = ({ claim, onUpdate }) => {
  const [status, setStatus]   = useState(claim?.STATUS || 'Pending');
  const [amount, setAmount]   = useState(claim?.APPROVED_AMOUNT || 0);
  const [saving, setSaving]   = useState(false);
  const [msg, setMsg]         = useState('');

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateClaimStatus(claim.CLAIM_ID, { STATUS: status, APPROVED_AMOUNT: amount });
      setMsg('✅ Claim status updated successfully');
      onUpdate && onUpdate();
    } catch (e) {
      setMsg('❌ Failed to update: ' + (e.response?.data?.message || e.message));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ background: '#f9fafb', borderRadius: '0.75rem', padding: '1.25rem', border: '1px solid #e5e7eb' }}>
      <h4 style={{ margin: '0 0 1rem', fontSize: '0.875rem', fontWeight: 600, color: '#374151' }}>🔍 Investigation Actions</h4>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div>
          <label style={{ fontSize: '0.8rem', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '0.25rem' }}>Update Status</label>
          <select value={status} onChange={e => setStatus(e.target.value)}
            style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.875rem' }}>
            {['Pending','Approved','Rejected','Under Review'].map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: '0.8rem', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '0.25rem' }}>Approved Amount ($)</label>
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} min="0"
            style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.875rem', boxSizing: 'border-box' }} />
        </div>
        <button onClick={handleSave} disabled={saving}
          style={{ padding: '0.6rem', background: '#6366f1', color: '#fff', border: 'none', borderRadius: '0.375rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem' }}>
          {saving ? 'Saving...' : 'Save Decision'}
        </button>
        {msg && <p style={{ margin: 0, fontSize: '0.8rem', color: msg.startsWith('✅') ? '#16a34a' : '#dc2626' }}>{msg}</p>}
      </div>
    </div>
  );
};

export default InvestigationPanel;
