// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SWRConfig } from 'swr';
import type { CallerStats, StatsView } from '../../api/endpoints';
import CallersTab from './CallersTab';

const getStatsView = vi.fn();
const getCallerStats = vi.fn();
vi.mock('../../api/endpoints', async (orig) => ({
  ...(await orig<object>()),
  getStatsView: (...a: unknown[]) => getStatsView(...a),
  getCallerStats: (...a: unknown[]) => getCallerStats(...a),
}));
vi.mock('recharts', async () => {
  const React = await import('react');
  const Stub = ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children);
  return { ResponsiveContainer: Stub, LineChart: Stub, Line: Stub, XAxis: Stub, YAxis: Stub, CartesianGrid: Stub, Tooltip: Stub };
});
vi.mock('../../theme/ThemeProvider', () => ({ useTheme: () => ({ theme: 'light' }) }));
vi.mock('../../auth/useAuth', () => ({ useAuth: () => ({ user: { role: 'staff', id: 'me' } }) }));
vi.mock('../../lib/useFirstTeamMember', async (orig) => ({ ...(await orig<object>()), useTeamLookup: () => ({ data: { users: [] } }) }));
vi.mock('../../lib/callerStatsPdf', () => ({ exportCallerStatsPdf: vi.fn() }));

const team = { median: 0.5, p25: 0.4, p75: 0.6, min: 0.3, max: 0.8, n: 4 };
const view: StatsView = {
  tab: 'callers', mode: 'caller', label: 'Month', subject: { userId: 'me', name: 'Me' },
  headline: [{ key: 'passRate', label: 'Your pass rate as a caller', value: 0.6, format: 'pct', team, rank: 1, of: 4, vsMedian: 0.1, higherIsBetter: true, note: 'n' }],
  tips: [{ id: 'a', severity: 'bad', text: 'Callers pass fewer', detail: '', evidence: {} }],
  everyone: { rowKind: 'caller', metric: 'passRate', rows: [
    { userId: 'c1', name: 'Ann', value: 0.62, vsMedian: 0.1, rank: 1, parts: { passed: 5, rejected: 3 }, isSubject: true },
    { userId: 'c2', name: 'Bob', value: 0.4, vsMedian: -0.1, rank: 2, parts: { passed: 2, rejected: 3 }, isSubject: false },
  ] },
  trend: null, notEnoughData: false, definitions: [],
};

const grp = { done: 0, passed: 0, rejected: 0, passRate: null };
const byType = { intro: grp, tech: grp, hiring: grp, panel: grp, final: grp };
const tot = { counts: { passed: 1, rejected: 1, awaiting: 0, canceled: 0, scheduled: 0 }, done: 2, passRate: 0.5, byType };
const caller = (id: string, name: string) => ({ ...tot, callerId: id, name, color: null, ranked: true, vsTeam: 0 });
const round = (id: string, callerId: string, company: string) => ({
  interviewId: id, roundId: id, callerId, roundDate: '2026-11-03T10:00:00Z', company, stage: null, engineer: 'Eng', result: 'passed' as const,
});
const stats = {
  period: 'month', region: 'all', start: '', end: '', label: 'Month',
  callers: [caller('c1', 'Ann'), caller('c2', 'Bob')], team: tot, self: tot,
  weekly: { unit: 'week', buckets: [] },
  rounds: [round('1', 'c1', 'AnnCo'), round('2', 'c2', 'BobCo')],
} as unknown as CallerStats;

const show = (url = '/statistics?tab=callers', initialCaller?: string) => render(
  <SWRConfig value={{ provider: () => new Map() }}>
    <MemoryRouter initialEntries={[url]}><CallersTab initialCaller={initialCaller} /></MemoryRouter>
  </SWRConfig>,
);

beforeEach(() => {
  getStatsView.mockReset(); getStatsView.mockResolvedValue(view);
  getCallerStats.mockReset(); getCallerStats.mockResolvedValue(stats);
});
afterEach(cleanup);

describe('CallersTab', () => {
  it('renders the frame from /stats/callers', async () => {
    show();
    expect(await screen.findByText('Callers pass fewer')).toBeTruthy();
    expect(getStatsView).toHaveBeenCalledWith('callers', expect.objectContaining({ region: 'all', period: 'month' }));
  });

  it('extras still render (round types grid, rounds held, export button)', async () => {
    show();
    expect(await screen.findByText('Pass rate by round type')).toBeTruthy();
    expect(screen.getByText(/Rounds held/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Export all callers/ })).toBeTruthy();
    expect(screen.queryByText('Click a caller to see their round types, trend and rounds below.')).toBeNull();
  });

  it('caller select filters rounds', async () => {
    show();
    await screen.findByText('AnnCo');
    expect(screen.getByText('BobCo')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Caller'), { target: { value: 'c2' } });
    await waitFor(() => expect(screen.queryByText('AnnCo')).toBeNull());
    expect(screen.getByText('BobCo')).toBeTruthy();
  });

  it('?caller= preselects, and an unknown caller falls back to All callers', async () => {
    show('/statistics?tab=callers', 'c2');
    await screen.findByText('BobCo');
    expect(screen.queryByText('AnnCo')).toBeNull();
    cleanup();
    show('/statistics?tab=callers', 'gone');
    await screen.findByText('AnnCo');
    expect(screen.getByText('BobCo')).toBeTruthy();
  });

  it('caller rows are not clickable', async () => {
    show();
    const row = await screen.findByTestId('everyone-c2');
    expect(within(row).queryByRole('button')).toBeNull();
  });

  it('everyone shows pass rate as %', async () => {
    show();
    const row = await screen.findByTestId('everyone-c1');
    expect(row.textContent).toContain('62%');
    expect(screen.getByText(/pass rate, ranked/)).toBeTruthy();
  });
});
