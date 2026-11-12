import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { COLORS, Pill } from './AiUi';
import { STATUS_TEXT, formatIndicatorValue, statusHelp } from '../../utils/aiIndicators';

const verdict = (ind) => {
  if (ind.triggered === true) return { text: 'Raised', color: '#b45309', bg: '#fef3c7', bar: '#f59e0b' };
  if (ind.triggered === false) return { text: 'Not raised', color: '#15803d', bg: '#dcfce7', bar: '#d1fae5' };
  return { text: STATUS_TEXT[ind.status] || 'Cannot be judged', color: COLORS.muted, bg: '#f3f4f6', bar: COLORS.line };
};

const ComparisonIds = ({ ids }) => {
  const [open, setOpen] = useState(false);
  if (!ids || ids.length === 0) return null;
  const shown = open ? ids : ids.slice(0, 8);
  return (
    <div style={{ fontSize: '0.75rem', color: COLORS.muted, marginTop: '0.35rem' }}>
      Compared with {ids.length} claim{ids.length === 1 ? '' : 's'}:{' '}
      {shown.map((id, i) => (
        <React.Fragment key={id}>{i > 0 && ', '}<Link to={`/claims/${id}`} style={{ color: COLORS.accent }}>#{id}</Link></React.Fragment>
      ))}
      {ids.length > 8 && (
        <button type="button" onClick={() => setOpen((o) => !o)}
          style={{ marginLeft: 6, background: 'none', border: 'none', color: COLORS.accent, cursor: 'pointer', fontSize: '0.75rem', padding: 0 }}>
          {open ? 'show less' : `+${ids.length - 8} more`}
        </button>
      )}
    </div>
  );
};

/** Application-native indicators (claim or provider level). Values come from the stored snapshot; nothing is recomputed here. */
const IndicatorList = ({ indicators = [], catalogue, testId = 'indicator-list' }) => {
  if (!indicators.length) return <p style={{ color: COLORS.muted, fontSize: '0.85rem' }}>No indicators in this snapshot.</p>;
  const sorted = [...indicators].sort((a, b) => (b.triggered === true) - (a.triggered === true));
  return (
    <ul data-testid={testId} style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      {sorted.map((ind) => {
        const v = verdict(ind);
        const spec = catalogue[ind.code] || {};
        const help = statusHelp(ind);
        return (
          <li key={ind.code} data-testid={`indicator-${ind.code}`}
            style={{ border: `1px solid ${COLORS.line}`, borderLeft: `4px solid ${v.bar}`, borderRadius: '0.5rem', padding: '0.75rem 0.9rem', background: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'baseline' }}>
              <div style={{ fontWeight: 600, color: COLORS.text, fontSize: '0.875rem' }}>{ind.name}</div>
              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                <span style={{ fontSize: '0.95rem', fontWeight: 700, color: COLORS.text, fontVariantNumeric: 'tabular-nums' }}>
                  {formatIndicatorValue(ind, catalogue)}
                </span>
                <Pill color={v.color} bg={v.bg}>{v.text}</Pill>
              </div>
            </div>
            {spec.what && <div style={{ fontSize: '0.8rem', color: '#374151', marginTop: '0.3rem' }}>{spec.what}</div>}
            <div style={{ fontSize: '0.78rem', color: COLORS.muted, marginTop: '0.3rem', lineHeight: 1.45 }}>
              {ind.reason}
              {ind.threshold && <> · Threshold: <strong style={{ color: '#374151' }}>{ind.threshold}</strong></>}
              {ind.reference && <> · Compared with: {ind.reference}</>}
            </div>
            {help && <div style={{ fontSize: '0.75rem', color: COLORS.muted, marginTop: '0.3rem', fontStyle: 'italic' }}>{help}</div>}
            {ind.triggered === true && spec.why && <div style={{ fontSize: '0.75rem', color: '#92400e', marginTop: '0.3rem' }}>Why it matters: {spec.why}</div>}
            <ComparisonIds ids={ind.comparison_claim_ids} />
          </li>
        );
      })}
    </ul>
  );
};

/** Existing SQL rule-engine results (trigger trg_after_claim_insert). Shown separately from the indicators. */
export const RuleHitsList = ({ ruleHits = [] }) => (
  <div data-testid="rule-hits">
    {ruleHits.length === 0 ? (
      <p style={{ margin: 0, color: COLORS.muted, fontSize: '0.85rem' }}>No SQL fraud rule was triggered for this claim.</p>
    ) : (
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        {ruleHits.map((r) => (
          <li key={r.rule_id} style={{ background: '#fef2f2', borderLeft: '4px solid #ef4444', borderRadius: '0.4rem', padding: '0.55rem 0.8rem', fontSize: '0.85rem' }}>
            <strong style={{ color: '#b91c1c' }}>{r.rule_name}</strong> <span style={{ color: COLORS.muted }}>· rule #{r.rule_id}</span>
          </li>
        ))}
      </ul>
    )}
  </div>
);

export default IndicatorList;
