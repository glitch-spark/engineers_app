// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import type { StatsView } from '../../api/endpoints';
import StatsFrame from './StatsFrame';

const props: { tick?: (v: number) => string; tip?: (v: number) => string } = {};
vi.mock('recharts', async () => {
  const React = await import('react');
  const Stub = ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children);
  return {
    ResponsiveContainer: Stub, LineChart: Stub, Line: Stub, XAxis: Stub, CartesianGrid: Stub,
    YAxis: (p: { tickFormatter: (v: number) => string }) => { props.tick = p.tickFormatter; return null; },
    Tooltip: (p: { formatter: (v: number) => string }) => { props.tip = p.formatter; return null; },
  };
});
vi.mock('../../theme/ThemeProvider', () => ({ useTheme: () => ({ theme: 'light' }) }));
afterEach(cleanup);

const view = (format: 'pct' | 'usd'): StatsView => ({
  tab: 'callers', label: 'L', subject: { userId: 'u', name: 'N' },
  headline: [{ key: 'm', label: 'Main', value: 0.5, format, team: null, rank: 1, of: 1, vsMedian: null, higherIsBetter: true, note: '' }],
  tips: [], everyone: { rowKind: 'person', metric: 'bids', rows: [] },
  trend: { unit: 'week', buckets: [{ label: 'a', you: 5, median: 4 }] }, notEnoughData: false, definitions: [],
});

describe('StatsFrame trend format', () => {
  it('pct headline with count trend: axis and tooltip show plain numbers', () => {
    render(<StatsFrame view={view('pct')} canPick={false} onPick={() => {}} />);
    expect(props.tick!(5)).toBe('5');
    expect(props.tip!(5)).toBe('5');
  });
  it('usd headline formats the trend as dollars', () => {
    render(<StatsFrame view={view('usd')} canPick={false} onPick={() => {}} />);
    expect(props.tick!(5)).toBe('$5.00');
  });
});
