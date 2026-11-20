// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { SWRConfig } from 'swr';
import type { ConversionGroup, ConversionReport, StatsView } from '../../api/endpoints';
import ConversionTab from './ConversionTab';

const getStatsView = vi.fn();
const getConversion = vi.fn();
const getProfileReport = vi.fn();
const getChanges = vi.fn();
const getTiming = vi.fn();
const listAccounts = vi.fn();
vi.mock('../../api/endpoints', async (orig) => ({
  ...(await orig<object>()),
  getStatsView: (...a: unknown[]) => getStatsView(...a),
  getConversion: (...a: unknown[]) => getConversion(...a),
  getProfileReport: (...a: unknown[]) => getProfileReport(...a),
  getChanges: (...a: unknown[]) => getChanges(...a),
  getTiming: (...a: unknown[]) => getTiming(...a),
  listAccounts: (...a: unknown[]) => listAccounts(...a),
}));
vi.mock('../../theme/ThemeProvider', () => ({ useTheme: () => ({ theme: 'light' }) }));
let role = 'staff';
vi.mock('../../auth/useAuth', () => ({ useAuth: () => ({ user: { role, id: 'me' } }) }));
vi.mock('../../lib/useFirstTeamMember', async (orig) => ({
  ...(await orig<object>()),
  useTeamLookup: () => ({ data: { users: [{ _id: 'u7', name: 'Michael' }] } }),
}));

let search = '';
const Probe = () => { search = useLocation().search; return null; };

const view: StatsView = {
  tab: 'bids', label: 'Bids', subject: { userId: 'me', name: 'Me' },
  headline: [{ key: 'bids', label: 'Your bids', value: 519, format: 'count', team: null, rank: 1, of: 2, vsMedian: null, higherIsBetter: true, note: '' }],
  tips: [], everyone: { rowKind: 'person', metric: 'bids', rows: [] }, trend: null, notEnoughData: false, definitions: [],
};
const g = (key: string, label: string, over: Partial<ConversionGroup> = {}): ConversionGroup =>
  ({ key, label, bids: 100, matured: 60, interviews: 1, rate: 1.7, few: false, ...over });
const report: ConversionReport = {
  label: 'Oct 6 – Nov 19, 2026', startClamped: true, scope: 'me',
  window: { median: null, p90: 14, matured_days: 14, n: 0, thin: true },
  totals: { bids: 9840, matured: 6120, interviews: 41, interviewsAll: 44, interviewOnly: 0, inPlay: 3720, rate: 0.7, untied: 0 },
  byWho: [g('self', 'Self'), g('bidder', 'Bidder')],
  byBidder: [g('self', 'Self'), g('b1', 'Ana', { matured: 12, rate: 8.3, few: true })],
  bySite: [g('lever', 'Lever')], byScore: [g('80', '80+', { rate: null, matured: 0 })], byArea: [g('be', 'Backend')], byAge: [g('new', 'Under 30 days')],
};

const show = (url = '/statistics') => render(
  <SWRConfig value={{ provider: () => new Map() }}>
    <MemoryRouter initialEntries={[url]}><Probe /><ConversionTab /></MemoryRouter>
  </SWRConfig>,
);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 19, 12, 0, 0));
  role = 'staff';
  getStatsView.mockReset(); getStatsView.mockResolvedValue(view);
  getConversion.mockReset(); getConversion.mockImplementation((p: { scope: string }) => Promise.resolve(
    p.scope === 'team' ? { ...report, scope: 'team', byBidder: undefined } : { ...report, scope: p.scope }));
  getChanges.mockReset(); getChanges.mockResolvedValue({ label: 'L', subject: { userId: 'me', name: 'Me' }, profiles: [] });
  getTiming.mockReset(); getTiming.mockResolvedValue({ label: 'L', subject: { userId: 'me', name: 'Me' }, timezone: 'UTC', window: { median: null, p90: 14, matured_days: 14, n: 0, thin: true }, weekday: [], hours: [], bidders: [{ bidderId: 'b', name: 'Bo', bids: 5, matured: 4, interviews: 1, per100: null, tooFew: true, rejectedShare: 0 }], teamBidder: { per100: null, matured: 0, interviews: 0 } });
  getProfileReport.mockReset(); getProfileReport.mockResolvedValue({ label: 'L', subject: { userId: 'me', name: 'Me' }, window: { median: null, p90: 14, matured_days: 14, n: 0, thin: true }, coverage: { rows: 0, headerBids: null, noLink: 0, unmatchedInterviews: null }, team: { per100: null, medianDays: null, profiles: 0 }, profiles: [] });
  listAccounts.mockReset(); listAccounts.mockResolvedValue({ accounts: [{ _id: 'a1', name: 'Pedro', region: 'US' }, { _id: 'a2', name: 'Maria', region: 'EU' }], pagination: {} });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('ConversionTab', () => {
  it('shows untied interviews and the interview-only note with its counts', async () => {
    getConversion.mockResolvedValue({ ...report, totals: { ...report.totals, untied: 5, interviewOnly: 20 } });
    show();
    expect(await screen.findByText(/0\.7% · 3,720 in play · 5 more interviews not tied to a bid$/)).toBeTruthy();
    expect(screen.getByText('20 of these 44 interviews are from applications known only from their interview (no tracked bid), so rates can read high.')).toBeTruthy();
  });

  it('has no interview-only note when none', async () => {
    show();
    await screen.findByText(/0\.7% · 3,720 in play/);
    expect(screen.queryByText(/known only from their interview/)).toBeNull();
  });

  it('omits the untied part when untied is 0', async () => {
    show();
    expect(await screen.findByText(/3,720 in play$/)).toBeTruthy();
    expect(screen.queryByText(/not tied to a bid/)).toBeNull();
  });

  it('lists archived profiles in the picker, selectable', async () => {
    listAccounts.mockResolvedValue({ accounts: [{ _id: 'a1', name: 'Pedro', region: 'US' }, { _id: 'a3', name: 'Old', region: 'EU', archived: true }], pagination: {} });
    show('/statistics?scope=profile&profile=a3');
    const picker = (await screen.findByLabelText('Profile')) as HTMLSelectElement;
    expect(listAccounts).toHaveBeenCalledWith(expect.objectContaining({ status: 'all' }));
    await waitFor(() => expect(picker.value).toBe('a3'));
    expect(within(picker).getByText('Old · EU · archived')).toBeTruthy();
  });

  it('renders totals and six tables', async () => {
    show();
    expect(await screen.findByText('Oct 6 – Nov 19, 2026 · 9,840 bids · 6,120 matured · 41 interviews from matured bids (44 in all) · 0.7% · 3,720 in play')).toBeTruthy();
    for (const t of ['Self vs bidder', 'By bidder', 'By job site', 'By resume score', 'By job area', 'By profile age']) {
      expect(screen.getByRole('table', { name: t })).toBeTruthy();
    }
    const site = screen.getByRole('table', { name: 'By job site' });
    expect(within(site).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Group', 'Bids', 'Matured', 'Interviews', 'Rate']);
    expect(within(site).getByText('1.7%')).toBeTruthy();
    expect(within(screen.getByRole('table', { name: 'By resume score' })).getByText('—')).toBeTruthy();
    expect(screen.getByText('Bids counted from Plans and Bid Track, all profiles.')).toBeTruthy();
    expect((await screen.findAllByText('Your bids')).length).toBeGreaterThan(0); // header strip
    expect(await screen.findByText('Your profiles')).toBeTruthy();
    expect(screen.getByText('What to change')).toBeTruthy();
    expect(await screen.findByText('When to bid')).toBeTruthy();
    expect(screen.queryByText('Bidder quality')).toBeNull();
  });

  it('score table carries the undercount caption, other tables do not', async () => {
    show();
    const note = 'Interviews are easier to match to bids with a tailored resume, so "No score" is undercounted.';
    const el = await screen.findByText(note);
    expect(screen.getAllByText(note)).toHaveLength(1);
    expect(el.previousElementSibling?.querySelector('table')?.getAttribute('aria-label')).toBe('By resume score');
  });

  it('few rate shows warning tooltip', async () => {
    show();
    const bidder = await screen.findByRole('table', { name: 'By bidder' });
    const warn = within(bidder).getByRole('button', { name: /Only 12 matured bids — this rate can swing a lot\./ });
    expect(warn.textContent).toContain('⚠');
    fireEvent.click(warn);
    expect(within(bidder).getByRole('note').textContent).toBe('Only 12 matured bids — this rate can swing a lot.');
  });

  it('changing region or the viewed user drops a chosen profile back to My profiles', async () => {
    role = 'admin';
    show('/statistics?region=US&scope=profile&profile=a1');
    await waitFor(() => expect(getConversion).toHaveBeenCalledWith(expect.objectContaining({ scope: 'profile', profile: 'a1' })));
    fireEvent.change(screen.getByLabelText('Region'), { target: { value: 'EU' } });
    expect(search).toContain('region=EU');
    expect(search).not.toContain('scope=');
    expect(search).not.toContain('profile=');
    await waitFor(() => expect(getConversion).toHaveBeenLastCalledWith(expect.objectContaining({ scope: 'me', region: 'EU' })));
    cleanup();
    show('/statistics?scope=profile&profile=a1');
    await screen.findByLabelText('Viewing');
    fireEvent.change(screen.getByLabelText('Viewing'), { target: { value: 'u7' } });
    await waitFor(() => expect(search).toContain('user=u7'));
    expect(search).not.toContain('scope=');
    expect(search).not.toContain('profile=');
  });

  it('a URL profile missing from the picker list falls back to My profiles', async () => {
    show('/statistics?scope=profile&profile=gone');
    await waitFor(() => expect(search).not.toContain('profile='));
    expect(search).not.toContain('scope=');
    await waitFor(() => expect(getConversion).toHaveBeenLastCalledWith(expect.objectContaining({ scope: 'me' })));
    expect(screen.getByRole('button', { name: 'My profiles' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('choosing the empty profile option goes back to My profiles and leaves the URL clean', async () => {
    show('/statistics?scope=profile&profile=a1');
    const picker = (await screen.findByLabelText('Profile')) as HTMLSelectElement;
    await waitFor(() => expect(picker.value).toBe('a1'));
    fireEvent.change(picker, { target: { value: '' } });
    expect(search).toBe('');
  });

  it('team total hides bidder table and per-person cards', async () => {
    show('/statistics?scope=team');
    expect(await screen.findByRole('table', { name: 'By job site' })).toBeTruthy();
    expect(screen.queryByRole('table', { name: 'By bidder' })).toBeNull();
    expect(screen.getByRole('table', { name: 'Self vs bidder' })).toBeTruthy();
    expect(await screen.findByText('When to bid')).toBeTruthy();
    expect(screen.queryByText('Your profiles')).toBeNull();
    expect(screen.queryByText('What to change')).toBeNull();
    expect(screen.queryByText('Bidder quality')).toBeNull();
    expect(getConversion).toHaveBeenCalledWith(expect.objectContaining({ scope: 'team' }));
    expect(getTiming).toHaveBeenCalledWith(expect.objectContaining({ scope: 'team' }));
    expect(getProfileReport).not.toHaveBeenCalled();
    expect(getChanges).not.toHaveBeenCalled();
  });

  it('one profile narrows tables and cards', async () => {
    show('/statistics?region=US');
    const picker = (await screen.findByLabelText('Profile')) as HTMLSelectElement;
    await waitFor(() => expect([...picker.options].map((o) => o.text)).toContain('Pedro · US'));
    expect(listAccounts).toHaveBeenCalledWith(expect.objectContaining({ region: 'US' }));
    fireEvent.change(picker, { target: { value: 'a1' } });
    expect(search).toContain('scope=profile');
    expect(search).toContain('profile=a1');
    const narrowed = expect.objectContaining({ scope: 'profile', profile: 'a1' });
    await waitFor(() => expect(getConversion).toHaveBeenLastCalledWith(narrowed));
    await waitFor(() => expect(getProfileReport).toHaveBeenLastCalledWith(narrowed));
    await waitFor(() => expect(getChanges).toHaveBeenLastCalledWith(narrowed));
    await waitFor(() => expect(getTiming).toHaveBeenLastCalledWith(narrowed));
    fireEvent.click(screen.getByRole('button', { name: 'My profiles' }));
    expect(search).not.toContain('scope=');
    expect(search).not.toContain('profile=');
  });

  it('Since Oct 6 is the default and sends custom 2026-10-06..today', async () => {
    show();
    await waitFor(() => expect(getConversion).toHaveBeenCalled());
    expect(getConversion).toHaveBeenCalledWith(expect.objectContaining({ period: 'custom', date: '2026-10-06', to: '2026-11-19', region: 'all', scope: 'me' }));
    expect(getStatsView).toHaveBeenCalledWith('bids', expect.objectContaining({ period: 'custom', date: '2026-10-06', to: '2026-11-19' }));
    expect((screen.getByLabelText('Date range') as HTMLSelectElement).value).toBe('since_oct6');
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull();
  });

  it('admin viewing a teammate sends user everywhere and lists their profiles; staff never sends user', async () => {
    role = 'admin';
    show('/statistics?user=u7');
    await waitFor(() => expect(getTiming).toHaveBeenCalled());
    for (const fn of [getConversion, getProfileReport, getChanges, getTiming]) expect(fn).toHaveBeenCalledWith(expect.objectContaining({ user: 'u7' }));
    expect(getStatsView).toHaveBeenCalledWith('bids', expect.objectContaining({ user: 'u7' }));
    expect(listAccounts).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u7' }));
    cleanup(); role = 'staff'; getConversion.mockClear();
    show('/statistics?user=u7');
    await waitFor(() => expect(getConversion).toHaveBeenCalled());
    expect(getConversion.mock.calls.every((c) => !('user' in c[0]))).toBe(true);
  });

  it('empty clamped report message', async () => {
    getConversion.mockResolvedValue({ ...report, label: 'Sep 2026', startClamped: true,
      totals: { bids: 0, matured: 0, interviews: 0, interviewsAll: 0, interviewOnly: 0, inPlay: 0, rate: null },
      byBidder: [], bySite: [], byScore: [], byArea: [], byAge: [] });
    show('/statistics?range=last_month');
    expect(await screen.findByText('No data before Oct 6, 2026 — pick a later period.')).toBeTruthy();
    expect(screen.queryByRole('table', { name: 'By job site' })).toBeNull();
  });

  it('none matured yet shows the Show last month note', async () => {
    getConversion.mockResolvedValue({ ...report, startClamped: false, totals: { ...report.totals, matured: 0, rate: null } });
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Show last month' }));
    await waitFor(() => expect(search).toContain('range=last_month'));
  });
});
