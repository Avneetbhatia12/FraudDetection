/** Phase 5 cleanup checks: API base URL configuration and the labelled rule-based score ring (logic unchanged). */
import '@testing-library/jest-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import FraudScoreIndicator from '../../fraud/FraudScoreIndicator';

// axios' ESM build cannot be loaded by CRA's Jest; a minimal stand-in records the config passed to axios.create().
jest.mock('axios', () => ({
  __esModule: true,
  default: { create: (cfg) => ({ ...cfg, interceptors: { request: { use() {} }, response: { use() {} } } }) },
}));

const baseURLWith = (value) => {
  const saved = process.env.REACT_APP_API_URL;
  if (value === undefined) delete process.env.REACT_APP_API_URL; else process.env.REACT_APP_API_URL = value;
  let url;
  jest.isolateModules(() => { url = require('../../../services/api').default.baseURL; });
  if (saved === undefined) delete process.env.REACT_APP_API_URL; else process.env.REACT_APP_API_URL = saved;
  return url;
};

describe('API base URL (REACT_APP_API_URL)', () => {
  test('unset or empty: same-origin /api (local development uses the package.json proxy)', () => {
    expect(baseURLWith(undefined)).toBe('/api');
    expect(baseURLWith('')).toBe('/api');
  });
  test('configured backend origin, with or without a trailing slash', () => {
    expect(baseURLWith('https://api.example.com')).toBe('https://api.example.com/api');
    expect(baseURLWith('https://api.example.com/')).toBe('https://api.example.com/api');
  });
});

describe('Rule-based risk score ring (existing heuristic)', () => {
  test('is labelled as the existing rule-based heuristic, not AI or ML', () => {
    render(<FraudScoreIndicator flagCount={2} ruleCount={1} />);
    expect(screen.getByText('Rule-based Risk Score')).toBeInTheDocument();
    expect(screen.queryByText('Fraud Risk Score')).toBeNull();
    expect(screen.getByTestId('rule-score-note')).toHaveTextContent('Not an AI indicator or a machine-learning model');
  });
  test('original scoring logic unchanged: min(100, 25 per flag + 15 per rule) and the same bands', () => {
    const { rerender } = render(<FraudScoreIndicator flagCount={2} ruleCount={1} />);
    expect(screen.getByText('65')).toBeInTheDocument();
    expect(screen.getByText('Medium Risk')).toBeInTheDocument();
    rerender(<FraudScoreIndicator flagCount={4} ruleCount={2} />);
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('High Risk')).toBeInTheDocument();
    rerender(<FraudScoreIndicator flagCount={0} ruleCount={1} />);
    expect(screen.getByText('15')).toBeInTheDocument();
    expect(screen.getByText('Low Risk')).toBeInTheDocument();
  });
});
