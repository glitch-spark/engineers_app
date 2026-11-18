// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SWRConfig } from 'swr';
import ProfilesTab from './ProfilesTab';
import Statistics from '../../pages/Statistics';

const getStatsView = vi.fn();
vi.mock('../../api/endpoints', async (orig) => ({ ...(await orig<object>()), getStatsView: (...a: unknown[]) => getStatsView(...a) }));
vi.mock('recharts', async () => {
  const React = await import('react');
  const Stub = ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children);
  return { ResponsiveContainer: Stub, LineChart: Stub, Line: Stub, XAxis: Stub, YAxis: Stub, CartesianGrid: Stub, Tooltip: Stub };
});
vi.mock('../../theme/ThemeProvider', () => ({ useTheme: () => ({ theme: 'light' }) }));
vi.mock('../../auth/useAuth', () => ({ useAuth: () => ({ user: { role: 'staff', id: 'me' } }) }));
vi.mock('../statistics/BidsTab', () => ({ default: () => null }));
vi.mock('../statistics/InterviewsTab', () => ({ default: () => null }));
vi.mock('../statistics/CallersTab', () => ({ default: () => null }));
vi.mock('../statistics/ResumeCompareTab', () => ({ default: () => null }));
vi.mock('../statistics/EarningsTab', () => ({ default: () => null }));
vi.mock('../statistics/AiUsageCard', () => ({ default: () => null }));

afterEach(cleanup);

const team = { median: 3, p25: 2, p75: 4, min: 1, max: 5, n: 4 };
const view = {
  tab: 'profiles', label: 'Nov', subject: { userId: 'me', name: 'Me' },
  headline: [{ key: 'best', label: 'Best profile', value: 4.2, format: 'per100', team, rank: 1, of: 5, vsMedian: 0.1, higherIsBetter: true, note: 'Acme Dev' }],
  tips: [], everyone: { rowKind: 'profile', metric: 'per100', rows: [
    { userId: 'p1', name: 'Acme Dev', region: 'EU', value: 4.2, vsMedian: 0.1, rank: 1, parts: {}, isSubject: false },
  ] },
  trend: null, notEnoughData: false, definitions: [],
};
const wrap = (ui: React.ReactNode) => render(
  <SWRConfig value={{ provider: () => new Map() }}><MemoryRouter>{ui}</MemoryRouter></SWRConfig>,
);

describe('ProfilesTab', () => {
  it('profiles tab renders from /stats/profiles', async () => {
    getStatsView.mockResolvedValue(view);
    wrap(<ProfilesTab />);
    expect(await screen.findByText('Acme Dev', { selector: 'span' })).toBeTruthy();
    expect(getStatsView).toHaveBeenCalledWith('profiles', expect.objectContaining({ region: 'all' }));
  });

  it('tab order includes Profiles after Interviews', () => {
    wrap(<Statistics />);
    const names = screen.getAllByRole('tab').map((t) => t.textContent);
    expect(names.indexOf('Profiles')).toBe(names.indexOf('Interviews') + 1);
  });
});
