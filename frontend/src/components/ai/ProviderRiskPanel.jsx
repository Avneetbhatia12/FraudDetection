import React, { useCallback, useEffect, useState } from 'react';
import { getProviderProfile } from '../../services/aiService';
import { describeAiError, formatCalendarDate, todayIST } from '../../utils/aiFormat';
import { PROVIDER_INDICATORS } from '../../utils/aiIndicators';
import IndicatorList from './IndicatorList';
import { AI_DISCLAIMER, AiErrorNotice, Button, COLORS, Card, Notice, Pill, SkeletonCard, StatTile, Grid, Timestamp } from './AiUi';

/** Provider-level indicators, compared with peer providers at the same as-of date. Never combined with claim-level results. */
const ProviderRiskPanel = ({ providerId }) => {
  const [asOf, setAsOf] = useState('');          // '' = server default (today in IST on the MySQL clock)
  const [draft, setDraft] = useState('');
  const [state, setState] = useState({ loading: true, result: null, stale: null, error: null });

  const load = useCallback(() => {
    setState((s) => ({ ...s, loading: true }));
    return getProviderProfile(providerId, asOf || undefined)
      .then((r) => setState({ loading: false, result: r.data, stale: null, error: null }))
      .catch((e) => {
        const d = describeAiError(e);
        setState({ loading: false, result: null, stale: (d.data && d.data.last_valid_profile) || null, error: d });
      });
  }, [providerId, asOf]);
  useEffect(() => { load(); }, [load]);

  const p = state.result ? state.result.profile : state.stale;
  const source = state.result ? state.result.as_of_source : (state.error && state.error.data && state.error.data.as_of_source);
  const peers = state.result ? state.result.comparable_peers : null;
  const raised = p && Array.isArray(p.indicators) ? p.indicators.filter((i) => i.triggered === true).length : 0;
  const notJudged = p && Array.isArray(p.indicators) ? p.indicators.filter((i) => i.status === 'insufficient_history').length : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }} data-testid="provider-risk">
      <Card title="As-of date" subtitle="Only claims dated on or before this date are used, and the provider is compared with other providers at the same date.">
        <form onSubmit={(e) => { e.preventDefault(); setAsOf(draft); }} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="date" value={draft} max={todayIST()} onChange={(e) => setDraft(e.target.value)} aria-label="As-of date"
            style={{ padding: '0.45rem 0.6rem', border: '1px solid #d1d5db', borderRadius: '0.45rem', fontSize: '0.85rem' }} />
          <Button type="submit" disabled={!draft || draft === asOf}>Apply</Button>
          <Button variant="secondary" onClick={() => { setDraft(''); setAsOf(''); }} disabled={!asOf}>Use today (IST)</Button>
        </form>
      </Card>

      {state.loading ? <SkeletonCard lines={6} /> : (
        <>
          {state.error && <AiErrorNotice error={state.error} onRetry={load} />}
          {state.stale && (
            <Notice type="warning" title="Showing the last stored profile" testId="stale-profile">
              A current profile could not be computed. The profile below was stored at <Timestamp value={state.stale.computed_at} />.
            </Notice>
          )}
          {p && (
            <>
              <Card title="Provider risk profile"
                actions={state.result && <Pill color={state.result.snapshot === 'new' ? '#1d4ed8' : COLORS.muted} bg={state.result.snapshot === 'new' ? '#dbeafe' : '#f3f4f6'}>
                  {state.result.snapshot === 'new' ? 'new profile stored' : 'unchanged: stored profile reused'}</Pill>}>
                <Grid min={150} gap="0.75rem">
                  <StatTile label="Effective as-of date" value={<span data-testid="as-of-date" style={{ fontSize: '1.15rem' }}>{formatCalendarDate(p.as_of_date)}</span>}
                    hint={source === 'default_today_ist' ? 'Today in IST (server default)' : source === 'requested' ? 'Selected date' : undefined} />
                  <StatTile label="Claims used" value={p.claim_count ?? '—'} />
                  <StatTile label="Indicators raised" value={raised} accent="#f59e0b" hint={`${notJudged} not judged (insufficient history)`} />
                  <StatTile label="Comparable peer providers" value={peers ?? '—'} accent="#8b5cf6" />
                </Grid>
                <div style={{ marginTop: '0.75rem', fontSize: '0.78rem', color: COLORS.muted }}>
                  Profile #{p.profile_id} · {p.model_key} · computed <Timestamp value={p.computed_at} />
                </div>
                {p.profile_status === 'insufficient_data' && (
                  <div style={{ marginTop: '0.75rem' }}>
                    <Notice type="info" title="Not enough data yet" testId="insufficient-data">
                      This provider has too few claims up to this date for the ratio indicators, or there are too few comparable
                      providers to tell what is unusual. Those indicators are shown as &ldquo;Not enough history&rdquo; instead of guessing.
                    </Notice>
                  </div>
                )}
              </Card>
              <Card title="Provider indicators" subtitle="Unusual = above the 90th (or below the 10th) percentile of comparable providers.">
                <IndicatorList indicators={p.indicators || []} catalogue={PROVIDER_INDICATORS} testId="provider-indicators" />
                <p style={{ margin: '1rem 0 0', fontSize: '0.75rem', color: COLORS.muted, lineHeight: 1.5 }}>
                  {AI_DISCLAIMER} Provider-level and claim-level results are kept separate and never combined into one number.
                </p>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
};

export default ProviderRiskPanel;
