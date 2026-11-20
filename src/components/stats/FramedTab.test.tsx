// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { SWRConfig } from 'swr';
import type { StatsView } from '../../api/endpoints';
import FramedTab from './FramedTab';

const getStatsView = vi.fn();
const getProfileReport = vi.fn();
vi.mock('../../api/endpoints', async (orig) => ({ ...(await orig<object>()), getStatsView: (...a: unknown[]) => getStatsView(...a), getProfileReport: (...a: unknown[]) => getProfileReport(...a) }));
vi.mock('recharts', async () => {
  const React = await import('react');
  const Stub = ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children);
  return { ResponsiveContainer: Stub, LineChart: Stub, Line: Stub, XAxis: Stub, YAxis: Stub, CartesianGrid: Stub, Tooltip: Stub };
});
vi.mock('../../theme/ThemeProvider', () => ({ useTheme: () => ({ theme: 'light' }) }));
let role = 'staff';
vi.mock('../../auth/useAuth', () => ({ useAuth: () => ({ user: { role, id: 'me' } }) }));
vi.mock('../../lib/useFirstTeamMember', async (orig) => ({
  ...(await orig<object>()),
  useTeamLookup: () => ({ data: { users: [{ _id: 'u1', name: 'Justin' }, { _id: 'u7', name: 'Michael' }] } }),
}));

let search = '';
const Probe = () => { search = useLocation().search; return null; };

const team = { median: 646, p25: 560, p75: 720, min: 482, max: 789, n: 9 };
const view: StatsView = {
  tab: 'bids', label: 'Bids', subject: { userId: 'u7', name: 'Michael' },
  headline: [{ key: 'bids', label: 'Your bids', value: 519, format: 'count', team, rank: 7, of: 9, vsMedian: -0.2, higherIsBetter: true, note: 'n' }],
  tips: [{ id: 'a', severity: 'bad', text: 'Self bids are low', detail: '', evidence: {} }],
  everyone: { rowKind: 'person', metric: 'bids', rows: [
    { userId: 'u1', name: 'Justin', value: 789, vsMedian: 0.22, rank: 1, parts: {}, isSubject: false },
    { userId: 'u7', name: 'Michael', value: 519, vsMedian: -0.2, rank: 7, parts: {}, isSubject: true },
  ] },
  trend: { unit: 'week', buckets: [] }, notEnoughData: false, definitions: [],
};

const show = (url = '/statistics') => render(
  <SWRConfig value={{ provider: () => new Map() }}>
    <MemoryRouter initialEntries={[url]}><Probe /><FramedTab /></MemoryRouter>
  </SWRConfig>,
);

beforeEach(() => { role = 'staff'; getStatsView.mockReset(); getStatsView.mockResolvedValue(view); getProfileReport.mockReset(); });
afterEach(cleanup);

describe('FramedTab (AI usage)', () => {
  it('renders tips, no Region and no per-profile cards', async () => {
    show();
    expect(await screen.findByText('Self bids are low')).toBeTruthy();
    expect(screen.queryByLabelText('Region')).toBeNull();
    expect(getProfileReport).not.toHaveBeenCalled();
    expect(screen.queryByText('Your profiles')).toBeNull();
  });

  it('today maps to a single-day custom range', async () => {
    show('/statistics?range=today');
    await waitFor(() => expect(getStatsView).toHaveBeenCalled());
    const [tab, p] = getStatsView.mock.calls[0];
    expect(tab).toBe('ai-usage');
    expect(p.period).toBe('custom');
    expect(p.date).toBe(p.to);
    expect(p.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('a preset like this month also goes as a custom range', async () => {
    show();
    await waitFor(() => expect(getStatsView).toHaveBeenCalled());
    const p = getStatsView.mock.calls[0][1];
    expect(p.period).toBe('custom');
    expect(p.date < p.to || p.date === p.to).toBe(true);
  });

  it('admin sees Viewing picker and picking sets user in the URL', async () => {
    role = 'admin';
    show();
    const sel = (await screen.findByLabelText('Viewing')) as HTMLSelectElement;
    expect([...sel.options].map((o) => o.text)).toEqual(['Me', 'Justin', 'Michael']);
    fireEvent.change(sel, { target: { value: 'u7' } });
    expect(search).toBe('?user=u7');
    await waitFor(() => expect(getStatsView).toHaveBeenLastCalledWith('ai-usage', expect.objectContaining({ user: 'u7' })));
  });

  it('staff has no Viewing picker and never sends user', async () => {
    show('/statistics?user=u1');
    await screen.findByText('Justin');
    expect(screen.queryByLabelText('Viewing')).toBeNull();
    expect(getStatsView.mock.calls.every((c) => !('user' in c[1]))).toBe(true);
  });

  it('shows loading then error states', async () => {
    getStatsView.mockRejectedValue(new Error('x'));
    show();
    expect(screen.getByText('Loading statistics…')).toBeTruthy();
    expect(await screen.findByText(/Couldn’t load the statistics/)).toBeTruthy();
  });

  it('picker keeps a selected user the lookup filtered out', async () => {
    role = 'admin';
    getStatsView.mockResolvedValue({ ...view, subject: { userId: 'u9', name: 'Inactive Ian' } });
    show('/statistics?user=u9');
    const sel = (await screen.findByLabelText('Viewing')) as HTMLSelectElement;
    await waitFor(() => expect([...sel.options].map((o) => o.text)).toContain('Inactive Ian'));
    expect(sel.value).toBe('u9');
  });
});
