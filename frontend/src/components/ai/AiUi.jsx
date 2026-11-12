// Shared building blocks for the AI insights pages (same visual language as the rest of the app: white cards,
// #f3f4f6 borders, indigo accent #6366f1, inline styles).
import React from 'react';
import { formatIST } from '../../utils/aiFormat';

export const COLORS = {
  text: '#111827', muted: '#6b7280', faint: '#9ca3af', border: '#f3f4f6', line: '#e5e7eb', accent: '#6366f1', accentBg: '#eef2ff',
};

export const PRIORITY_STYLE = {
  High:     { color: '#b91c1c', bg: '#fee2e2', border: '#fecaca' },
  Elevated: { color: '#b45309', bg: '#fef3c7', border: '#fde68a' },
  Routine:  { color: '#15803d', bg: '#dcfce7', border: '#bbf7d0' },
};

export const Card = ({ title, subtitle, actions, children, style, tone }) => (
  <section style={{
    background: '#fff', borderRadius: '0.75rem', padding: '1.25rem 1.5rem',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: `1px solid ${tone === 'research' ? '#ddd6fe' : COLORS.border}`, minWidth: 0, ...style,
  }}>
    {(title || actions) && (
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <div>
          {title && <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: COLORS.text }}>{title}</h3>}
          {subtitle && <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: COLORS.muted }}>{subtitle}</p>}
        </div>
        {actions && <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>{actions}</div>}
      </header>
    )}
    {children}
  </section>
);

export const PriorityBadge = ({ priority, size = 'md' }) => {
  const s = PRIORITY_STYLE[priority];
  if (!s) return <span style={{ color: COLORS.faint, fontSize: '0.8rem' }}>—</span>;
  const big = size === 'lg';
  return (
    <span title="Review priority: an ordering aid for the review queue, not a score or a decision"
      style={{ display: 'inline-block', background: s.bg, color: s.color, border: `1px solid ${s.border}`, borderRadius: '9999px',
        padding: big ? '0.3rem 0.9rem' : '0.15rem 0.6rem', fontSize: big ? '0.9rem' : '0.75rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
      {priority}
    </span>
  );
};

export const Pill = ({ children, color = COLORS.muted, bg = '#f3f4f6', title }) => (
  <span title={title} style={{ display: 'inline-block', background: bg, color, borderRadius: '9999px', padding: '0.1rem 0.55rem',
    fontSize: '0.72rem', fontWeight: 600, whiteSpace: 'nowrap' }}>{children}</span>
);

/** IST display with the original UTC value preserved in the tooltip and a data attribute. */
export const Timestamp = ({ value, prefix }) => (
  <time dateTime={value || undefined} data-utc={value || ''} title={value ? `UTC: ${value}` : undefined}
    style={{ fontVariantNumeric: 'tabular-nums' }}>
    {prefix}{formatIST(value)}
  </time>
);

export const Button = ({ children, variant = 'primary', disabled, ...rest }) => {
  const v = {
    primary: { background: COLORS.accent, color: '#fff', border: `1px solid ${COLORS.accent}` },
    secondary: { background: '#fff', color: '#374151', border: '1px solid #d1d5db' },
  }[variant];
  return (
    <button type="button" disabled={disabled} {...rest}
      style={{ ...v, padding: '0.5rem 0.95rem', borderRadius: '0.5rem', fontSize: '0.85rem', fontWeight: 500,
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1, whiteSpace: 'nowrap', ...rest.style }}>
      {children}
    </button>
  );
};

const shimmer = `@keyframes aiPulse { 0%,100% { opacity: 1 } 50% { opacity: .45 } }`;
export const Skeleton = ({ height = 16, width = '100%', style }) => (
  <>
    <div aria-hidden="true" style={{ height, width, borderRadius: 6, background: '#e5e7eb', animation: 'aiPulse 1.4s ease-in-out infinite', ...style }} />
    <style>{shimmer}</style>
  </>
);

export const SkeletonCard = ({ lines = 4 }) => (
  <Card>
    <div role="status" aria-label="Loading" style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
      <Skeleton height={18} width="40%" />
      {Array.from({ length: lines }).map((_, i) => <Skeleton key={i} height={12} width={`${90 - i * 12}%`} />)}
    </div>
  </Card>
);

const NOTICE = {
  info:     { bg: '#eff6ff', border: '#bfdbfe', color: '#1e40af', icon: 'ℹ️' },
  warning:  { bg: '#fffbeb', border: '#fde68a', color: '#92400e', icon: '⚠️' },
  error:    { bg: '#fef2f2', border: '#fecaca', color: '#991b1b', icon: '⛔' },
  research: { bg: '#f5f3ff', border: '#ddd6fe', color: '#5b21b6', icon: '🔬' },
};

export const Notice = ({ type = 'info', title, children, action, testId }) => {
  const n = NOTICE[type];
  return (
    <div role={type === 'error' || type === 'warning' ? 'alert' : 'note'} data-testid={testId}
      style={{ background: n.bg, border: `1px solid ${n.border}`, color: n.color, borderRadius: '0.6rem', padding: '0.8rem 1rem',
        display: 'flex', gap: '0.75rem', alignItems: 'flex-start', fontSize: '0.85rem', lineHeight: 1.45 }}>
      <span aria-hidden="true">{n.icon}</span>
      <div style={{ flex: 1 }}>
        {title && <div style={{ fontWeight: 700, marginBottom: '0.15rem' }}>{title}</div>}
        <div>{children}</div>
      </div>
      {action}
    </div>
  );
};

/** Renders a describeAiError() result. */
export const AiErrorNotice = ({ error, onRetry }) => {
  if (!error) return null;
  const type = error.kind === 'unavailable' || error.kind === 'rate_limited' || error.kind === 'busy' ? 'warning' : 'error';
  return (
    <Notice type={type} title={error.title} testId={`ai-error-${error.kind}`}
      action={onRetry && error.kind !== 'forbidden' && error.kind !== 'not_found'
        ? <Button variant="secondary" onClick={onRetry}>Retry</Button> : null}>
      {error.message}
    </Notice>
  );
};

export const StatTile = ({ label, value, hint, accent = COLORS.accent }) => (
  <div style={{ background: '#fff', borderRadius: '0.75rem', padding: '1rem 1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
    border: `1px solid ${COLORS.border}`, borderTop: `3px solid ${accent}` }}>
    <div style={{ fontSize: '0.78rem', color: COLORS.muted, fontWeight: 500 }}>{label}</div>
    <div style={{ fontSize: '1.6rem', fontWeight: 700, color: COLORS.text, marginTop: '0.2rem', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    {hint && <div style={{ fontSize: '0.72rem', color: COLORS.faint, marginTop: '0.2rem' }}>{hint}</div>}
  </div>
);

export const Grid = ({ min = 220, gap = '1rem', children, style }) => (
  <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(min(${min}px, 100%), 1fr))`, gap, ...style }}>{children}</div>
);

export const Table = ({ columns, rows, empty = 'Nothing to show yet.', rowKey }) => (
  <div style={{ overflowX: 'auto' }}>
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
      <thead>
        <tr style={{ background: '#f9fafb', borderBottom: `2px solid ${COLORS.line}` }}>
          {columns.map((c) => <th key={c.key} style={{ padding: '0.6rem 0.75rem', textAlign: c.align || 'left', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>{c.label}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr><td colSpan={columns.length} style={{ padding: '1.25rem', textAlign: 'center', color: COLORS.muted }}>{empty}</td></tr>
        ) : rows.map((r, i) => (
          <tr key={rowKey ? rowKey(r) : i} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
            {columns.map((c) => <td key={c.key} style={{ padding: '0.6rem 0.75rem', textAlign: c.align || 'left', verticalAlign: 'top' }}>{c.render ? c.render(r) : r[c.key]}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export const AI_DISCLAIMER = 'Indicators are transparent statistics computed from this application’s data with documented thresholds. '
  + 'They are not machine-learning predictions, not probabilities and not evidence of fraud. Review priority only orders the '
  + 'review queue; it never approves or rejects a claim.';
