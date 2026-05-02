import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const Login = () => {
  const { login }   = useAuth();
  const navigate    = useNavigate();
  const [form, setForm]       = useState({ email: '', password: '' });
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(form.email, form.password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Incorrect email or password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      background: '#f1f5f9',
      fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }}>

      {/* ── Left branding panel ──────────────────────────── */}
      <div style={{
        flex: 1,
        background: '#0f172a',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '3rem',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Subtle grid overlay */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }} />

        {/* Top: logo */}
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            width: '36px', height: '36px',
            background: '#6366f1',
            borderRadius: '8px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <span style={{ color: '#fff', fontWeight: 700, fontSize: '1rem', letterSpacing: '-0.01em' }}>
            FraudGuard
          </span>
        </div>

        {/* Middle: headline */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <h1 style={{
            margin: '0 0 1rem',
            fontSize: '2.25rem',
            fontWeight: 700,
            color: '#fff',
            lineHeight: 1.25,
            letterSpacing: '-0.02em',
          }}>
            Health Insurance<br />Claim Fraud<br />Detection
          </h1>
          <p style={{
            margin: 0,
            color: '#94a3b8',
            fontSize: '0.9rem',
            lineHeight: 1.7,
            maxWidth: '340px',
          }}>
            Monitor, investigate and flag suspicious insurance claims using automated rule-based detection.
          </p>

          {/* Divider */}
          <div style={{ width: '40px', height: '3px', background: '#6366f1', borderRadius: '2px', margin: '1.75rem 0' }} />

          {/* Stats row */}
          <div style={{ display: 'flex', gap: '2.5rem' }}>
            {[
              { value: '35+', label: 'Sample Claims' },
              { value: '5',   label: 'Fraud Rules' },
              { value: '30+', label: 'Patients' },
            ].map(s => (
              <div key={s.label}>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' }}>{s.value}</div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.125rem' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom: tagline */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <p style={{ margin: 0, color: '#334155', fontSize: '0.75rem' }}>
            DBMS Project · MySQL · Node.js · React
          </p>
        </div>
      </div>

      {/* ── Right login panel ────────────────────────────── */}
      <div style={{
        width: '460px',
        flexShrink: 0,
        background: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2.5rem',
        boxShadow: '-1px 0 0 #e2e8f0',
      }}>
        <div style={{ width: '100%', maxWidth: '360px' }}>

          {/* Heading */}
          <div style={{ marginBottom: '2rem' }}>
            <h2 style={{
              margin: '0 0 0.375rem',
              fontSize: '1.5rem',
              fontWeight: 700,
              color: '#0f172a',
              letterSpacing: '-0.02em',
            }}>
              Sign in
            </h2>
            <p style={{ margin: 0, color: '#64748b', fontSize: '0.875rem' }}>
              Enter your credentials to access the system.
            </p>
          </div>

          {/* Error */}
          {error && (
            <div style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderLeft: '3px solid #ef4444',
              borderRadius: '6px',
              padding: '0.75rem 1rem',
              marginBottom: '1.25rem',
              color: '#b91c1c',
              fontSize: '0.85rem',
            }}>
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.125rem' }}>

            {/* Email */}
            <div>
              <label style={{
                display: 'block',
                fontSize: '0.8rem',
                fontWeight: 600,
                color: '#374151',
                marginBottom: '0.4rem',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}>
                Email
              </label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                required
                placeholder="admin@frauddetect.com"
                style={{
                  width: '100%',
                  padding: '0.7rem 0.875rem',
                  border: '1.5px solid #e2e8f0',
                  borderRadius: '7px',
                  fontSize: '0.9rem',
                  boxSizing: 'border-box',
                  outline: 'none',
                  color: '#0f172a',
                  background: '#f8fafc',
                  transition: 'border-color 0.15s',
                }}
                onFocus={e => e.target.style.borderColor = '#6366f1'}
                onBlur={e => e.target.style.borderColor = '#e2e8f0'}
              />
            </div>

            {/* Password */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                <label style={{
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  color: '#374151',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}>
                  Password
                </label>
                <Link to="/forgot-password" style={{ fontSize: '0.8rem', color: '#6366f1', textDecoration: 'none' }}>
                  Forgot password?
                </Link>
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPass ? 'text' : 'password'}
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  required
                  placeholder="••••••••"
                  style={{
                    width: '100%',
                    padding: '0.7rem 2.75rem 0.7rem 0.875rem',
                    border: '1.5px solid #e2e8f0',
                    borderRadius: '7px',
                    fontSize: '0.9rem',
                    boxSizing: 'border-box',
                    outline: 'none',
                    color: '#0f172a',
                    background: '#f8fafc',
                    transition: 'border-color 0.15s',
                  }}
                  onFocus={e => e.target.style.borderColor = '#6366f1'}
                  onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(s => !s)}
                  style={{
                    position: 'absolute', right: '0.75rem', top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#94a3b8', padding: 0, lineHeight: 1,
                  }}>
                  {showPass ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '0.8rem',
                background: loading ? '#a5b4fc' : '#6366f1',
                color: '#fff',
                border: 'none',
                borderRadius: '7px',
                fontSize: '0.9rem',
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                marginTop: '0.25rem',
                letterSpacing: '0.01em',
                transition: 'background 0.15s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
              }}
              onMouseEnter={e => { if (!loading) e.target.style.background = '#4f46e5'; }}
              onMouseLeave={e => { if (!loading) e.target.style.background = '#6366f1'; }}
            >
              {loading ? (
                <>
                  <span style={{
                    width: '14px', height: '14px',
                    border: '2px solid rgba(255,255,255,0.35)',
                    borderTop: '2px solid #fff',
                    borderRadius: '50%',
                    animation: 'spin 0.7s linear infinite',
                    display: 'inline-block',
                  }} />
                  Signing in...
                </>
              ) : 'Sign In'}
            </button>
          </form>

          {/* Footer */}
          <p style={{ textAlign: 'center', marginTop: '2.5rem', fontSize: '0.75rem', color: '#cbd5e1' }}>
            Health Insurance Fraud Detection System
          </p>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default Login;
