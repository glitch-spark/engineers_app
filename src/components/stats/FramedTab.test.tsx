// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { SWRConfig } from 'swr';
import type { StatsView } from '../../api/endpoints';
import FramedTab from './FramedTab';
import InterviewsTab from '../statistics/InterviewsTab';

const getStatsView = vi.fn();
vi.mock('../../api/endpoints', async (orig) => ({ ...(await orig<object>()), getStatsView: (...a: unknown[]) => getStatsView(...a) }));
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
    <MemoryRouter initialEntries={[url]}><Probe /><FramedTab tab="bids" /></MemoryRouter>
  </SWRConfig>,
);

beforeEach(() => { role = 'staff'; getStatsView.mockReset(); getStatsView.mockResolvedValue(view); });
afterEach(cleanup);

describe('FramedTab', () => {
  it('renders the frame from /stats/bids', async () => {
    show();
    expect(await screen.findByText('Self bids are low')).toBeTruthy();
    expect(getStatsView).toHaveBeenCalledWith('bids', expect.objectContaining({ region: 'all', period: 'month' }));
    expect(getStatsView.mock.calls[0][1]).not.toHaveProperty('user');
  });

  it('admin sees Viewing picker and picking sets user in the URL', async () => {
    role = 'admin';
    show();
    const sel = (await screen.findByLabelText('Viewing')) as HTMLSelectElement;
    expect([...sel.options].map((o) => o.text)).toEqual(['Me', 'Justin', 'Michael']);
    fireEvent.change(sel, { target: { value: 'u7' } });
    expect(search).toBe('?user=u7');
    await waitFor(() => expect(getStatsView).toHaveBeenLastCalledWith('bids', expect.objectContaining({ user: 'u7' })));
  });

  it('staff has no Viewing picker and never sends user', async () => {
    show('/statistics?user=u1');
    await screen.findByText('Self bids are low');
    expect(screen.queryByLabelText('Viewing')).toBeNull();
    expect(getStatsView.mock.calls.every((c) => !('user' in c[1]))).toBe(true);
    expect(screen.queryByRole('button', { name: 'Justin' })).toBeNull();
  });

  it('clicking a name in Everyone (admin) switches the viewed person', async () => {
    role = 'admin';
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Justin' }));
    expect(search).toBe('?user=u1');
    await waitFor(() => expect(getStatsView).toHaveBeenLastCalledWith('bids', expect.objectContaining({ user: 'u1' })));
  });

  it('Clear keeps the viewed person', async () => {
    role = 'admin';
    show('/statistics?user=u7&region=EU');
    fireEvent.click(await screen.findByRole('button', { name: 'Clear' }));
    expect(search).toBe('?user=u7');
  });

  it('shows loading then error states', async () => {
    getStatsView.mockRejectedValue(new Error('x'));
    show();
    expect(screen.getByText('Loading statistics…')).toBeTruthy();
    expect(await screen.findByText(/Couldn’t load the statistics/)).toBeTruthy();
  });

  it('names who and when: Viewing {name} when the subject is not me, else just the label', async () => {
    show();
    expect(await screen.findByText('Viewing Michael · Bids')).toBeTruthy();
    cleanup();
    getStatsView.mockResolvedValue({ ...view, subject: { userId: 'me', name: 'Me' } });
    show();
    expect(await screen.findByText('Bids', { selector: 'p' })).toBeTruthy();
    expect(screen.queryByText(/Viewing Me/)).toBeNull();
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

describe('InterviewsTab', () => {
  const iview: StatsView = { ...view, tab: 'interviews', label: 'Interviews', everyone: { rowKind: 'person', metric: 'per100', rows: [] } };

  it('renders the frame from /stats/interviews', async () => {
    getStatsView.mockResolvedValue(iview);
    render(
      <SWRConfig value={{ provider: () => new Map() }}>
        <MemoryRouter initialEntries={['/statistics']}><InterviewsTab /></MemoryRouter>
      </SWRConfig>,
    );
    expect(await screen.findByText('Self bids are low')).toBeTruthy();
    expect(getStatsView).toHaveBeenCalledWith('interviews', expect.objectContaining({ region: 'all', period: 'month' }));
  });

  it('viewing choice carries from Bids to Interviews (same user param)', async () => {
    role = 'admin';
    const Switch = () => {
      const [t, setT] = React.useState<'bids' | 'interviews'>('bids');
      return <><button onClick={() => setT('interviews')}>go</button><FramedTab tab={t} /></>;
    };
    render(
      <SWRConfig value={{ provider: () => new Map() }}>
        <MemoryRouter initialEntries={['/statistics']}><Probe /><Switch /></MemoryRouter>
      </SWRConfig>,
    );
    fireEvent.change((await screen.findByLabelText('Viewing')) as HTMLSelectElement, { target: { value: 'u7' } });
    await waitFor(() => expect(getStatsView).toHaveBeenLastCalledWith('bids', expect.objectContaining({ user: 'u7' })));
    fireEvent.click(screen.getByText('go'));
    await waitFor(() => expect(getStatsView).toHaveBeenLastCalledWith('interviews', expect.objectContaining({ user: 'u7' })));
    expect((screen.getByLabelText('Viewing') as HTMLSelectElement).value).toBe('u7');
  });
});
