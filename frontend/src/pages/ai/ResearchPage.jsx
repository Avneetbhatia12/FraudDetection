import React, { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import PageLayout from '../../components/layout/PageLayout';
import { AiErrorNotice, Button, COLORS, Card, Grid, Notice, Pill, SkeletonCard, Table } from '../../components/ai/AiUi';
import { getResearchFigure, getResearchModels, getResearchProvider, getResearchShap } from '../../services/aiService';
import { describeAiError } from '../../utils/aiFormat';

const TABS = [['models', 'Model comparison'], ['shap', 'Feature importance (SHAP)'], ['provider', 'Provider explanations'], ['figures', 'Figures']];
const EXAMPLE_IDS = ['PRV51001', 'PRV54742', 'PRV55916', 'PRV56023'];   // Kaggle provider IDs (public dataset)
const FIGURE_TITLES = {
  importance_bar: 'Mean |SHAP| per feature', summary_beeswarm: 'SHAP summary (beeswarm)', group_contribution: 'Contribution by feature group',
};
const f3 = (v) => (typeof v === 'number' ? v.toFixed(3) : '—');
const pct = (v) => (typeof v === 'number' ? `${(v * 100).toFixed(1)}%` : '—');

const useResource = (fn, enabled = true) => {
  const [s, setS] = useState({ loading: enabled, data: null, scope: null, error: null });
  useEffect(() => {
    if (!enabled) return undefined;
    let live = true;
    fn().then((r) => live && setS({ loading: false, data: r.data.data, scope: r.data.scope, error: null }))
      .catch((e) => live && setS({ loading: false, data: null, scope: null, error: describeAiError(e) }));
    return () => { live = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
  return s;
};

const ResearchBanner = ({ scope }) => (
  <Notice type="research" title="Research only: public US Medicare data (Kaggle)" testId="research-banner">
    Everything on this page comes from models trained on the public Kaggle &ldquo;Healthcare Provider Fraud Detection&rdquo;
    dataset. <strong>These research models are not used to score live application claims</strong>; live claims use the
    transparent application indicators instead.
    {scope && <><br /><span style={{ fontSize: '0.8rem' }}>{scope.label_note} {scope.score_note}</span></>}
  </Notice>
);

const Models = () => {
  const r = useResource(getResearchModels);
  if (r.loading) return <SkeletonCard lines={6} />;
  if (r.error) return <AiErrorNotice error={r.error} />;
  const m = r.data;
  const names = Object.keys(m.test);
  const chart = names.map((n) => ({ model: n.replace('volume_baseline', 'Volume baseline'), pr_auc: m.test[n].pr_auc, selected: n === m.selected_model }));
  const ablation = Object.entries(m.ablation).map(([k, v]) => ({ k, ...v }));
  const compat = Object.entries(m.app_compatible_feature_experiment || {}).map(([k, v]) => ({ k, ...v }));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <Grid min={340}>
        <Card tone="research" title="Held-out test PR-AUC" subtitle={`Provider-level models, ${m.split.n_test} test providers (${Math.round(m.split.test_size * 100)}% stratified hold-out).`}>
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={chart} margin={{ left: 0, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="model" fontSize={11} interval={0} />
                <YAxis domain={[0, 1]} fontSize={11} />
                <Tooltip formatter={(v) => [f3(v), 'PR-AUC']} />
                <Bar dataKey="pr_auc" radius={[4, 4, 0, 0]}>{chart.map((c) => <Cell key={c.model} fill={c.selected ? '#7c3aed' : '#c4b5fd'} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p style={{ margin: '0.4rem 0 0', fontSize: '0.75rem', color: COLORS.muted }}>
            PR-AUC suits rare positives. Selected model: <strong>{m.selected_model}</strong>. Run {m.run_id}.
          </p>
        </Card>
        <Card tone="research" title="Why these models are not applied to live claims"
          subtitle="The application records only a fraction of the Kaggle features. Re-trained on the features this app has, performance drops sharply.">
          <Table rowKey={(x) => x.k} rows={compat} columns={[
            { key: 'k', label: 'Model | features' },
            { key: 'p', label: 'CV PR-AUC', align: 'right', render: (x) => f3(x.cv_pr_auc_mean) },
            { key: 'f', label: 'F1', align: 'right', render: (x) => f3(x.oof_f1) },
          ]} />
        </Card>
      </Grid>
      <Card tone="research" title="Test-set metrics" subtitle="95% confidence intervals from bootstrap resampling. Thresholds chosen on development data only.">
        <Table rowKey={(n) => n} rows={names} columns={[
          { key: 'n', label: 'Model', render: (n) => <span style={{ fontWeight: n === m.selected_model ? 700 : 500 }}>{n.replace('volume_baseline', 'Volume-only baseline')}{n === m.selected_model && <> <Pill color="#5b21b6" bg="#ede9fe">selected</Pill></>}</span> },
          { key: 'pr', label: 'PR-AUC (95% CI)', align: 'right', render: (n) => `${f3(m.test[n].pr_auc)} (${f3(m.test[n].pr_auc_95ci[0])}–${f3(m.test[n].pr_auc_95ci[1])})` },
          { key: 'roc', label: 'ROC-AUC', align: 'right', render: (n) => f3(m.test[n].roc_auc) },
          { key: 'p', label: 'Precision', align: 'right', render: (n) => f3(m.test[n].precision) },
          { key: 'r', label: 'Recall', align: 'right', render: (n) => f3(m.test[n].recall) },
          { key: 'f1', label: 'F1', align: 'right', render: (n) => f3(m.test[n].f1) },
          { key: 'cv', label: 'CV PR-AUC', align: 'right', render: (n) => `${f3(m.cross_validation[n].pr_auc_mean)} ± ${f3(m.cross_validation[n].pr_auc_std)}` },
        ]} />
      </Card>
      <Card tone="research" title="Feature-group ablation" subtitle="5-fold cross-validated PR-AUC using one feature group at a time.">
        <Table rowKey={(x) => x.k} rows={ablation} columns={[
          { key: 'k', label: 'Feature set' },
          { key: 'n', label: 'Features', align: 'right', render: (x) => x.n_features },
          { key: 'p', label: 'CV PR-AUC', align: 'right', render: (x) => `${f3(x.pr_auc_mean)} ± ${f3(x.pr_auc_std)}` },
        ]} />
      </Card>
    </div>
  );
};

const Shap = () => {
  const r = useResource(getResearchShap);
  if (r.loading) return <SkeletonCard lines={8} />;
  if (r.error) return <AiErrorNotice error={r.error} />;
  const s = r.data;
  const top = s.global_importance.slice(0, 15).map((g) => ({ ...g, label: g.feature }));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <Card tone="research" title="Global feature importance (top 15)" subtitle={`Mean absolute SHAP value (log-odds) of the ${s.global_importance.length} features, XGBoost research model.`}>
        <div style={{ width: '100%', height: 420 }} data-testid="shap-chart">
          <ResponsiveContainer>
            <BarChart data={top} layout="vertical" margin={{ left: 10, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" fontSize={11} />
              <YAxis type="category" dataKey="label" width={190} fontSize={11} />
              <Tooltip formatter={(v, _n, p) => [f3(v), `${p.payload.group} · ${p.payload.direction}`]} />
              <Bar dataKey="mean_abs_shap" fill="#7c3aed" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <Grid min={340}>
        <Card tone="research" title="Importance by feature group">
          <Table rowKey={(g) => g.group} rows={s.group_importance} columns={[
            { key: 'g', label: 'Group', render: (g) => g.group },
            { key: 'n', label: 'Features', align: 'right', render: (g) => g.n_features },
            { key: 's', label: 'Share of importance', align: 'right', render: (g) => pct(g.share) },
          ]} />
        </Card>
        <Card tone="research" title="Top features explained">
          <Table rowKey={(g) => g.feature} rows={s.global_importance.slice(0, 8)} columns={[
            { key: 'f', label: 'Feature', render: (g) => <><code style={{ fontSize: '0.8rem' }}>{g.feature}</code><div style={{ fontSize: '0.75rem', color: COLORS.muted }}>{g.description}</div></> },
            { key: 'd', label: 'Effect', render: (g) => <span style={{ fontSize: '0.8rem' }}>{g.direction}</span> },
          ]} />
        </Card>
      </Grid>
      <p style={{ margin: 0, fontSize: '0.75rem', color: COLORS.muted }}>
        Checks: {s.checks.n_providers} providers explained; additivity verified (max error {s.checks.max_abs_additivity_error_log_odds.toExponential(1)} log-odds);
        ranking stable between development and test data (Spearman {f3(s.stability.spearman_mean_abs_shap)}).
      </p>
    </div>
  );
};

const ProviderExplanation = () => {
  const [input, setInput] = useState('PRV51001');
  const [state, setState] = useState({ loading: false, data: null, error: null });
  const valid = /^PRV\d{5}$/.test(input);
  const fetchIt = (id) => {
    setState({ loading: true, data: null, error: null });
    getResearchProvider(id).then((r) => setState({ loading: false, data: r.data.data, error: null }))
      .catch((e) => setState({ loading: false, data: null, error: describeAiError(e) }));
  };
  const e = state.data;
  const maxAbs = e ? Math.max(...e.top_contributions.map((c) => Math.abs(c.shap_log_odds)), 0.01) : 1;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <Card tone="research" title="Explain a Kaggle provider" subtitle="Research explanations exist only for providers in the public Kaggle dataset (IDs like PRV51001), not for application providers.">
        <form onSubmit={(ev) => { ev.preventDefault(); if (valid) fetchIt(input); }} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <input value={input} onChange={(ev) => setInput(ev.target.value.trim().toUpperCase())} aria-label="Kaggle provider ID" placeholder="PRV51001"
            style={{ width: 140, padding: '0.5rem 0.65rem', border: `1px solid ${valid || !input ? '#d1d5db' : '#fca5a5'}`, borderRadius: '0.5rem', fontSize: '0.85rem', fontFamily: 'monospace' }} />
          <Button type="submit" disabled={!valid || state.loading}>{state.loading ? 'Loading…' : 'Explain'}</Button>
          <span style={{ fontSize: '0.75rem', color: COLORS.muted }}>Examples:</span>
          {EXAMPLE_IDS.map((x) => (
            <button key={x} type="button" onClick={() => { setInput(x); fetchIt(x); }}
              style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', color: '#5b21b6', borderRadius: 9999, padding: '0.15rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer', fontFamily: 'monospace' }}>{x}</button>
          ))}
        </form>
      </Card>
      {state.error && <AiErrorNotice error={state.error} />}
      {e && (
        <Card tone="research" title={`Research explanation for ${e.provider}`} subtitle={`${e.model} research model, run ${e.run_id} (${e.split} split).`}>
          <Grid min={170} gap="0.75rem">
            <div style={{ background: '#f5f3ff', borderRadius: '0.5rem', padding: '0.75rem' }}>
              <div style={{ fontSize: '0.72rem', color: '#6d28d9' }}>Uncalibrated research score</div>
              <div style={{ fontSize: '1.3rem', fontWeight: 700, color: COLORS.text }}>{f3(e.risk_score)}</div>
              <div style={{ fontSize: '0.7rem', color: COLORS.muted }}>Not a probability of fraud</div>
            </div>
            <div style={{ background: '#f9fafb', borderRadius: '0.5rem', padding: '0.75rem' }}>
              <div style={{ fontSize: '0.72rem', color: COLORS.muted }}>Research threshold</div>
              <div style={{ fontSize: '1.3rem', fontWeight: 700, color: COLORS.text }}>{f3(e.threshold)}</div>
              <div style={{ fontSize: '0.7rem', color: COLORS.muted }}>{e.flagged ? 'At or above the threshold' : 'Below the threshold'}</div>
            </div>
          </Grid>
          <h4 style={{ margin: '1rem 0 0.5rem', fontSize: '0.85rem', color: COLORS.text }}>Largest contributions (log-odds)</h4>
          <ul data-testid="contributions" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {e.top_contributions.map((c) => {
              const w = `${(Math.abs(c.shap_log_odds) / maxAbs) * 50}%`;
              const up = c.shap_log_odds > 0;
              return (
                <li key={c.feature} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)', gap: '0.75rem', alignItems: 'center', fontSize: '0.8rem' }}>
                  <div style={{ minWidth: 0 }}>
                    <code>{c.feature}</code> <span style={{ color: COLORS.muted }}>= {Number(c.value).toFixed(2)} ({Math.round(c.dev_percentile * 100)}th pct)</span>
                    <div style={{ fontSize: '0.72rem', color: COLORS.faint }}>{c.description}</div>
                  </div>
                  <div style={{ position: 'relative', height: 16, background: '#f9fafb', borderRadius: 4 }} title={`${c.direction}: ${f3(c.shap_log_odds)}`}>
                    <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: COLORS.line }} />
                    <div style={{ position: 'absolute', top: 2, bottom: 2, borderRadius: 3, background: up ? '#ef4444' : '#22c55e',
                      left: up ? '50%' : `calc(50% - ${w})`, width: w }} />
                  </div>
                </li>
              );
            })}
          </ul>
          <p style={{ margin: '0.75rem 0 0', fontSize: '0.72rem', color: COLORS.muted }}>
            Red raises the research score, green lowers it. Other features combined: {f3(e.other_features_shap_log_odds)} log-odds. {e.disclaimer}
          </p>
        </Card>
      )}
    </div>
  );
};

const Figures = () => {
  const shap = useResource(getResearchShap);
  const [imgs, setImgs] = useState({});
  const names = shap.data ? shap.data.figures : [];
  useEffect(() => {
    const urls = [];
    names.forEach((n) => getResearchFigure(n)
      .then((r) => { const u = URL.createObjectURL(r.data); urls.push(u); setImgs((s) => ({ ...s, [n]: { url: u } })); })
      .catch((e) => setImgs((s) => ({ ...s, [n]: { error: describeAiError(e) } }))));
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [names.join(',')]);
  if (shap.loading) return <SkeletonCard />;
  if (shap.error) return <AiErrorNotice error={shap.error} />;
  return (
    <Grid min={420}>
      {names.map((n) => (
        <Card key={n} tone="research" title={FIGURE_TITLES[n] || n}>
          {!imgs[n] ? <SkeletonCard lines={3} /> : imgs[n].error ? <AiErrorNotice error={imgs[n].error} />
            : <img src={imgs[n].url} alt={`${FIGURE_TITLES[n] || n} (research, Kaggle data)`} style={{ width: '100%', height: 'auto', borderRadius: 6 }} />}
        </Card>
      ))}
    </Grid>
  );
};

const ResearchPage = () => {
  const [tab, setTab] = useState('models');
  const scope = useResource(getResearchModels);   // for the scope notes in the banner (cached by the browser per request)
  return (
    <PageLayout title="Research & Explainability">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <ResearchBanner scope={scope.scope} />
        <div role="tablist" style={{ display: 'flex', gap: '0.25rem', borderBottom: `1px solid ${COLORS.line}`, flexWrap: 'wrap' }}>
          {TABS.map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k} type="button" onClick={() => setTab(k)}
              style={{ background: 'none', border: 'none', borderBottom: `2px solid ${tab === k ? '#7c3aed' : 'transparent'}`, color: tab === k ? '#5b21b6' : COLORS.muted,
                padding: '0.6rem 0.9rem', fontSize: '0.875rem', fontWeight: tab === k ? 600 : 500, cursor: 'pointer', marginBottom: -1 }}>{label}</button>
          ))}
        </div>
        {tab === 'models' && <Models />}
        {tab === 'shap' && <Shap />}
        {tab === 'provider' && <ProviderExplanation />}
        {tab === 'figures' && <Figures />}
      </div>
    </PageLayout>
  );
};

export default ResearchPage;
