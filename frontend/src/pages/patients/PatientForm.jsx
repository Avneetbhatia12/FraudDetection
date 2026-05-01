import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PageLayout from '../../components/layout/PageLayout';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import { createPatient, updatePatient, getPatient } from '../../services/patientService';
import { validatePatient } from '../../utils/validators';
import { GENDERS } from '../../utils/constants';
import { formatDateInput } from '../../utils/formatters';

const Field = ({ label, error, children }) => (
  <div>
    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#374151', marginBottom: '0.375rem' }}>{label}</label>
    {children}
    {error && <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: '#dc2626' }}>{error}</p>}
  </div>
);

const inputStyle = { width: '100%', padding: '0.625rem 0.875rem', border: '1px solid #d1d5db', borderRadius: '0.5rem', fontSize: '0.875rem', boxSizing: 'border-box', outline: 'none' };

const PatientForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [form, setForm]     = useState({ FIRST_NAME: '', LAST_NAME: '', GENDER: 'Male', DOB: '', ADDRESS: '', EMAIL: '' });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(isEdit);
  const [msg, setMsg]       = useState('');

  useEffect(() => {
    if (!isEdit) return;
    getPatient(id).then(r => {
      const p = r.data.data;
      setForm({ FIRST_NAME: p.FIRST_NAME, LAST_NAME: p.LAST_NAME, GENDER: p.GENDER, DOB: formatDateInput(p.DOB), ADDRESS: p.ADDRESS, EMAIL: p.EMAIL });
    }).finally(() => setFetching(false));
  }, [id, isEdit]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validatePatient(form);
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({});
    setLoading(true);
    try {
      if (isEdit) await updatePatient(id, form);
      else await createPatient(form);
      navigate('/patients');
    } catch (err) {
      setMsg(err.response?.data?.message || 'Failed to save patient');
    } finally {
      setLoading(false);
    }
  };

  if (fetching) return <PageLayout title="Patient"><LoadingSpinner /></PageLayout>;

  return (
    <PageLayout title={isEdit ? 'Edit Patient' : 'Add Patient'}>
      <div style={{ background: '#fff', borderRadius: '0.75rem', padding: '2rem', maxWidth: '640px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
        <h2 style={{ margin: '0 0 1.5rem', fontSize: '1.125rem', fontWeight: 600, color: '#111827' }}>
          {isEdit ? 'Edit Patient' : 'Register New Patient'}
        </h2>
        {msg && <div style={{ background: '#fee2e2', border: '1px solid #fecaca', borderRadius: '0.5rem', padding: '0.75rem', marginBottom: '1rem', color: '#dc2626', fontSize: '0.875rem' }}>{msg}</div>}
        <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <Field label="First Name *" error={errors.FIRST_NAME}>
            <input style={inputStyle} value={form.FIRST_NAME} onChange={e => set('FIRST_NAME', e.target.value)} />
          </Field>
          <Field label="Last Name *" error={errors.LAST_NAME}>
            <input style={inputStyle} value={form.LAST_NAME} onChange={e => set('LAST_NAME', e.target.value)} />
          </Field>
          <Field label="Gender *" error={errors.GENDER}>
            <select style={inputStyle} value={form.GENDER} onChange={e => set('GENDER', e.target.value)}>
              {GENDERS.map(g => <option key={g}>{g}</option>)}
            </select>
          </Field>
          <Field label="Date of Birth *" error={errors.DOB}>
            <input type="date" style={inputStyle} value={form.DOB} onChange={e => set('DOB', e.target.value)} />
          </Field>
          <Field label="Email *" error={errors.EMAIL} >
            <input type="email" style={{ ...inputStyle, gridColumn: '1/-1' }} value={form.EMAIL} onChange={e => set('EMAIL', e.target.value)} />
          </Field>
          <div style={{ gridColumn: '1/-1' }}>
            <Field label="Address *" error={errors.ADDRESS}>
              <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: '80px' }} value={form.ADDRESS} onChange={e => set('ADDRESS', e.target.value)} />
            </Field>
          </div>
          <div style={{ gridColumn: '1/-1', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
            <button type="button" onClick={() => navigate('/patients')}
              style={{ padding: '0.625rem 1.25rem', border: '1px solid #d1d5db', borderRadius: '0.5rem', background: '#fff', cursor: 'pointer', color: '#374151' }}>
              Cancel
            </button>
            <button type="submit" disabled={loading}
              style={{ padding: '0.625rem 1.25rem', background: '#6366f1', color: '#fff', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 600 }}>
              {loading ? 'Saving...' : isEdit ? 'Update Patient' : 'Add Patient'}
            </button>
          </div>
        </form>
      </div>
    </PageLayout>
  );
};

export default PatientForm;
