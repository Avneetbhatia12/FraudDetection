import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getClaimOutcomes, recordOutcome } from '../../services/aiService';
import { describeAiError, shortDigest } from '../../utils/aiFormat';
import { AiErrorNotice, Button, COLORS, Card, Notice, Pill, Timestamp } from './AiUi';

export const OUTCOMES = ['Confirmed Fraud', 'Legitimate', 'Requires Further Investigation'];
const BASES = [
  ['', 'Not specified'], ['documentary_evidence', 'Documentary evidence'], ['investigator_judgement', 'Investigator judgement'],
  ['external_finding', 'External finding'], ['other', 'Other'],
];
const OUTCOME_STYLE = {
  'Confirmed Fraud': { color: '#b91c1c', bg: '#fee2e2' },
  Legitimate: { color: '#15803d', bg: '#dcfce7' },
  'Requires Further Investigation': { color: '#6d28d9', bg: '#ede9fe' },
};
const EXCLUSION_TEXT = {
  no_linked_snapshot: 'no linked snapshot',
  linked_snapshot_missing: 'linked snapshot missing',
  linked_snapshot_other_claim: 'snapshot of another claim',
  linked_snapshot_failed: 'linked snapshot was a failed attempt',
  linked_snapshot_after_decision: 'snapshot dated after the decision',
};
export const CAN_RECORD = ['Admin', 'Investigator'];

const field = { width: '100%', padding: '0.5rem 0.65rem', border: '1px solid #d1d5db', borderRadius: '0.45rem', fontSize: '0.85rem', background: '#fff' };

/**
 * Investigation outcomes. A new outcome is always linked to `assessment`: the exact snapshot displayed above.
 * The ID is taken only from that snapshot; it is never chosen, typed or substituted here.
 */
const OutcomePanel = ({ claimId, assessment }) => {
  const { user } = useAuth();
  const [list, setList] = useState({ loading: true, rows: [], error: null });
  const [form, setForm] = useState({ outcome: '', basis: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [saved, setSaved] = useState(null);

  const load = useCallback(() => getClaimOutcomes(claimId)
    .then((r) => setList({ loading: false, rows: r.data.data, error: null }))
    .catch((e) => setList({ loading: false, rows: [], error: describeAiError(e) })), [claimId]);
  useEffect(() => { load(); }, [load]);

  const canRecord = user && CAN_RECORD.includes(user.role);
  const linkable = assessment && assessment.assessment_status !== 'failed' && Number.isInteger(assessment.assessment_id);

  const submit = async (e) => {
    e.preventDefault();
    if (!linkable || !form.outcome) return;
    setSubmitting(true);
    setSubmitError(null);
    setSaved(null);
    try {
      const r = await recordOutcome(claimId, { outcome: form.outcome, outcomeBasis: form.basis, notes: form.notes.trim(), assessmentId: assessment.assessment_id });
      setSaved(r.data.data);
      setForm({ outcome: '', basis: '', notes: '' });
      load();
    } catch (err) {
      setSubmitError(describeAiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card title="Investigation outcome" subtitle="Recorded decisions are permanent and do not change the claim status." style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {!canRecord ? (
        <Notice type="info" testId="outcome-readonly">Only Admin and Investigator users can record investigation outcomes. You can view the history below.</Notice>
      ) : !linkable ? (
        <Notice type="info" testId="outcome-no-snapshot">An outcome can only be recorded against an assessment snapshot shown on this page. No valid snapshot is currently displayed.</Notice>
      ) : (
        <form onSubmit={submit} data-testid="outcome-form" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div data-testid="linked-snapshot" style={{ background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: '0.5rem', padding: '0.65rem 0.85rem', fontSize: '0.82rem', color: '#3730a3' }}>
            This decision will be linked to <strong>assessment #{assessment.assessment_id}</strong>, the snapshot displayed above
            (assessed <Timestamp value={assessment.assessed_at} />, priority {assessment.review_priority}, digest {shortDigest(assessment.indicators_digest)}).
          </div>
          <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
            <legend style={{ fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: '0.4rem' }}>Outcome</legend>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {OUTCOMES.map((o) => (
                <label key={o} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', padding: '0.4rem 0.7rem', cursor: 'pointer',
                  border: `1px solid ${form.outcome === o ? COLORS.accent : '#d1d5db'}`, borderRadius: '0.45rem', background: form.outcome === o ? COLORS.accentBg : '#fff' }}>
                  <input type="radio" name="outcome" value={o} checked={form.outcome === o} onChange={() => setForm((f) => ({ ...f, outcome: o }))} />
                  {o}
                </label>
              ))}
            </div>
          </fieldset>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: '0.75rem' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#374151' }}>Basis
              <select value={form.basis} onChange={(e) => setForm((f) => ({ ...f, basis: e.target.value }))} style={{ ...field, marginTop: '0.3rem' }}>
                {BASES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#374151' }}>Notes (optional)
              <textarea value={form.notes} maxLength={2000} rows={2} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                style={{ ...field, marginTop: '0.3rem', resize: 'vertical' }} />
            </label>
          </div>
          {submitError && <AiErrorNotice error={submitError} />}
          {saved && (
            <Notice type="info" title="Outcome recorded" testId="outcome-saved">
              Outcome #{saved.outcome_id} was linked to assessment #{saved.assessment_id} at <Timestamp value={saved.decided_at} />. The claim status was not changed.
            </Notice>
          )}
          <div><Button type="submit" disabled={!form.outcome || submitting} data-testid="outcome-submit">
            {submitting ? 'Recording…' : 'Record outcome'}
          </Button></div>
        </form>
      )}

      <div>
        <h4 style={{ margin: '0 0 0.6rem', fontSize: '0.875rem', fontWeight: 600, color: COLORS.text }}>Outcome history</h4>
        {list.loading ? <p style={{ color: COLORS.muted, fontSize: '0.85rem' }}>Loading…</p>
          : list.error ? <AiErrorNotice error={list.error} onRetry={load} />
          : list.rows.length === 0 ? <p data-testid="outcomes-empty" style={{ margin: 0, color: COLORS.muted, fontSize: '0.85rem' }}>No outcome has been recorded for this claim.</p>
          : (
            <ul data-testid="outcome-history" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {list.rows.map((o) => {
                const s = OUTCOME_STYLE[o.outcome] || {};
                return (
                  <li key={o.outcome_id} style={{ border: `1px solid ${COLORS.line}`, borderRadius: '0.5rem', padding: '0.65rem 0.85rem', fontSize: '0.82rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <span><Pill color={s.color} bg={s.bg}>{o.outcome}</Pill>{o.outcome_basis && <span style={{ color: COLORS.muted }}> · {o.outcome_basis.replace(/_/g, ' ')}</span>}</span>
                      <span style={{ color: COLORS.muted }}><Timestamp value={o.decided_at} /></span>
                    </div>
                    <div style={{ marginTop: '0.35rem', color: '#374151' }}>
                      By {o.decided_by.email} ({o.decided_by.role}) · linked to {o.assessment_id ? <strong>assessment #{o.assessment_id}</strong> : 'no snapshot'}
                      {o.training && (o.training.eligible
                        ? <> · <Pill color="#15803d" bg="#dcfce7" title="Final outcome with a valid linked snapshot">usable as a future training label</Pill></>
                        : o.training.exclusion_reason && <> · <Pill title="Excluded from future training">{EXCLUSION_TEXT[o.training.exclusion_reason] || o.training.exclusion_reason}</Pill></>)}
                    </div>
                    {o.notes && <div style={{ marginTop: '0.3rem', color: COLORS.muted, whiteSpace: 'pre-wrap' }}>{o.notes}</div>}
                  </li>
                );
              })}
            </ul>
          )}
      </div>
    </Card>
  );
};

export default OutcomePanel;
