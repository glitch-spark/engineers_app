// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { SWRConfig } from 'swr';
import type { ConversionFinding, ConversionGroup, ConversionReport, ConversionSummary } from '../../api/endpoints';
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

const g = (key: string, label: string, over: Partial<ConversionGroup> = {}): ConversionGroup =>
  ({ key, label, bids: 100, matured: 60, interviews: 1, rate: 1.7, few: false, ...over });
const person = (userId: string, name: string, bids: number, interviews: number, per100: number | null, ranks: [number | null, number | null, number | null], isSubject = false) =>
  ({ userId, name, bids, interviews, per100, isSubject, ranks: { bids: ranks[0], interviews: ranks[1], per100: ranks[2] } });
const everyone = [
  person('u1', 'Puma', 3686, 47, 1.3, [2, 1, 2]),
  person('me', 'Nicholas', 3917, 41, 1.4, [1, 2, 1], true),
  person('u3', 'Justin', 12, 3, null, [3, 3, null]),
];
const meSummary: ConversionSummary = {
  cards: {
    bids: { value: 3917, self: 1497, bidder: 2420, rank: 1, of: 6, median: 3504, vsMedian: 0.12 },
    interviews: { value: 41, rounds: 63, rank: 2, of: 6, median: 32, vsMedian: 0.28 },
    per100: { value: 1.0, rank: 3, of: 6, teamRate: 1.2 },
  },
  everyone, coverage: { rows: 2594, bids: 3917, matched: 38, interviews: 41 },
};
const teamSummary: ConversionSummary = {
  cards: {
    bids: { value: 42458, self: 20000, bidder: 22458, rank: null, of: null, median: 3504, vsMedian: null },
    interviews: { value: 233, rounds: 300, rank: null, of: null, median: 32, vsMedian: null },
    per100: { value: 0.5, rank: null, of: null, teamRate: 0.5 },
  },
  everyone, coverage: { rows: 40000, bids: 42458, matched: 200, interviews: 233 },
};
const findings: ConversionFinding[] = [
  { kind: 'best', text: '80+ converts best for resume score: 1.5% (27 interviews from 1,800 matured bids) vs 0.6% across all matured bids.', evidence: {} },
  { kind: 'weak', text: 'Backend: 0 interviews from 791 matured bids — the team rate would give about 5.', evidence: {} },
];
const report: ConversionReport = {
  label: 'Oct 6 – Nov 19, 2026', startClamped: false, scope: 'me', subject: { userId: 'me', name: 'Nicholas' },
  summary: meSummary, findings, teamRate: 1.2,
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
  getStatsView.mockReset();
  getConversion.mockReset(); getConversion.mockImplementation((p: { scope: string }) => Promise.resolve(
    p.scope === 'team' ? { ...report, scope: 'team', byBidder: undefined, summary: teamSummary } : { ...report, scope: p.scope }));
  getChanges.mockReset(); getChanges.mockResolvedValue({ label: 'L', subject: { userId: 'me', name: 'Me' }, profiles: [] });
  getTiming.mockReset(); getTiming.mockResolvedValue({ label: 'L', subject: { userId: 'me', name: 'Me' }, timezone: 'UTC', window: { median: null, p90: 14, matured_days: 14, n: 0, thin: true }, weekday: [], hours: [] });
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

  it('renders totals and six tables', async () => {
    show('/statistics?scope=me');
    expect(await screen.findByText('Oct 6 – Nov 19, 2026 · 9,840 bids · 6,120 matured · 41 interviews from matured bids (44 in all) · 0.7% · 3,720 in play')).toBeTruthy();
    for (const t of ['Self vs bidder', 'By bidder', 'By job site', 'By resume score', 'By job area', 'By profile age']) {
      expect(screen.getByRole('table', { name: t })).toBeTruthy();
    }
    const site = screen.getByRole('table', { name: 'By job site' });
    expect(within(site).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Group', 'Bids', 'Matured', 'Interviews', 'Rate (│ = team)']);
    expect(within(site).getByText('1.7%')).toBeTruthy();
    expect(within(screen.getByRole('table', { name: 'By resume score' })).getByText('—')).toBeTruthy();
    expect(getStatsView).not.toHaveBeenCalled(); // the old StatsFrame bids strip is gone
    expect(screen.queryByText('Bids counted from Plans and Bid Track, all profiles.')).toBeNull();
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
    show('/statistics?scope=me');
    const bidder = await screen.findByRole('table', { name: 'By bidder' });
    const warn = within(bidder).getByRole('button', { name: /Only 12 matured bids — this rate can swing a lot\./ });
    expect(warn.textContent).toContain('⚠');
    fireEvent.click(warn);
    expect(within(bidder).getByRole('note').textContent).toBe('Only 12 matured bids — this rate can swing a lot.');
  });

  it('Profiles dropdown offers Whole team (default) and All my profiles only', async () => {
    show('/statistics');
    const picker = (await screen.findByLabelText('Profiles')) as HTMLSelectElement;
    expect([...picker.options].map((o) => o.text)).toEqual(['Whole team', 'All my profiles']);
    expect(picker.value).toBe('team');
    fireEvent.change(picker, { target: { value: 'me' } });
    expect(search).toContain('scope=me');
    await waitFor(() => expect(getConversion).toHaveBeenLastCalledWith(expect.objectContaining({ scope: 'me' })));
    fireEvent.change(picker, { target: { value: 'team' } });
    expect(search).not.toContain('scope=');
  });

  it('Whole team is the default: hides the bidder table and per-person cards', async () => {
    show('/statistics');
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

  it('Since Oct 6 is the default and sends custom 2026-10-06..today', async () => {
    show();
    await waitFor(() => expect(getConversion).toHaveBeenCalled());
    expect(getConversion).toHaveBeenCalledWith(expect.objectContaining({ period: 'custom', date: '2026-10-06', to: '2026-11-19', region: 'all', scope: 'team' }));
    expect((screen.getByLabelText('Date range') as HTMLSelectElement).value).toBe('since_oct6');
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull();
  });

  it('an admin picking a person under Viewing switches to that person\'s profiles', async () => {
    role = 'admin';
    show('/statistics');
    const viewing = (await screen.findByLabelText('Viewing')) as HTMLSelectElement;
    await waitFor(() => expect([...viewing.options].map((o) => o.value)).toContain('u7'));
    fireEvent.change(viewing, { target: { value: 'u7' } });
    expect(search).toContain('user=u7');
    expect(search).toContain('scope=me');
  });

  it('admin viewing a teammate sends user everywhere; staff never sends user', async () => {
    role = 'admin';
    show('/statistics?user=u7&scope=me');
    await waitFor(() => expect(getTiming).toHaveBeenCalled());
    for (const fn of [getConversion, getProfileReport, getChanges, getTiming]) expect(fn).toHaveBeenCalledWith(expect.objectContaining({ user: 'u7' }));
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
  describe('redesign', () => {
    const names = () => within(screen.getByRole('table', { name: 'Everyone' })).getAllByRole('row').slice(1)
      .map((r) => (r as HTMLTableRowElement).cells[1].textContent);

    it('All my profiles: cards show the subject with rank, % vs team median and basis lines', async () => {
      show('/statistics?scope=me');
      const cards = await screen.findByRole('region', { name: 'Your numbers' });
      const c = within(cards);
      expect(c.getByText('3,917')).toBeTruthy();
      expect(c.getByText('#1 of 6')).toBeTruthy();
      expect(c.getByText('▲ 12% above team median (3,504)')).toBeTruthy();
      expect(c.getByText('Self 1,497 · bidder 2,420')).toBeTruthy();
      expect(c.getByText('#2 of 6')).toBeTruthy();
      expect(c.getByText('▲ 28% above team median (32)')).toBeTruthy();
      expect(c.getByText('Interviews started in the period · 63 rounds held')).toBeTruthy();
      expect(c.getByText('Interviews per 100 bids')).toBeTruthy();
      expect(c.getByText('1.0')).toBeTruthy();
      expect(c.getByText('#3 of 6')).toBeTruthy();
      expect(c.getByText('▼ team 1.2')).toBeTruthy();
      expect(c.getByText('41 interviews from 3,917 bids')).toBeTruthy();
    });

    it('per 100 under 30 bids reads "not ranked"', async () => {
      getConversion.mockResolvedValue({ ...report, summary: { ...meSummary, cards: { ...meSummary.cards, per100: { value: 25, rank: null, of: 4, teamRate: 1.2 } } } });
      show('/statistics?scope=me');
      expect(await screen.findByText('not ranked (under 30 bids)')).toBeTruthy();
    });

    it('Whole team: cards show team totals, no rank, the median per person', async () => {
      show('/statistics');
      const c = within(await screen.findByRole('region', { name: 'Your numbers' }));
      expect(c.getByText('42,458')).toBeTruthy();
      expect(c.getByText('233')).toBeTruthy();
      expect(c.getByText('median per person 3,504')).toBeTruthy();
      expect(c.getByText('median per person 32')).toBeTruthy();
      expect(c.queryByText(/^#/)).toBeNull();
      expect(c.getByText('233 interviews from 42,458 bids')).toBeTruthy();
    });

    it('Everyone: Interviews by default, the switch re-sorts by rank (nulls last), subject highlighted', async () => {
      show('/statistics?scope=me');
      await screen.findByRole('table', { name: 'Everyone' });
      expect(screen.getByRole('button', { name: 'Interviews' }).getAttribute('aria-pressed')).toBe('true');
      expect(names()).toEqual(['Puma', 'Nicholas', 'Justin']);
      fireEvent.click(screen.getByRole('button', { name: 'Bids' }));
      expect(names()).toEqual(['Nicholas', 'Puma', 'Justin']);
      fireEvent.click(screen.getByRole('button', { name: 'Per 100 bids' }));
      expect(names()).toEqual(['Nicholas', 'Puma', 'Justin']);
      const justin = within(screen.getByRole('table', { name: 'Everyone' })).getAllByRole('row')[3] as HTMLTableRowElement;
      expect([...justin.cells].map((td) => td.textContent)).toEqual(['—', 'Justin', '', '12', '3', '—']);
      const subject = screen.getByText('Nicholas').closest('tr')!;
      expect(subject.getAttribute('aria-current')).toBe('true');
      expect(screen.queryByRole('button', { name: 'Puma' })).toBeNull(); // staff can't switch person
    });

    it('Everyone: an admin clicking a name views that person (scope me)', async () => {
      role = 'admin';
      show('/statistics');
      fireEvent.click(await screen.findByRole('button', { name: 'Puma' }));
      expect(search).toContain('user=u1');
      expect(search).toContain('scope=me');
    });

    it('Key findings render ★ / ⚠ and the none line muted', async () => {
      show();
      const box = within(await screen.findByRole('region', { name: 'Key findings' }));
      expect(box.getByText(findings[0].text).parentElement!.textContent).toBe(`★ ${findings[0].text}`);
      expect(box.getByText(findings[1].text).parentElement!.textContent).toBe(`⚠ ${findings[1].text}`);
      cleanup();
      getConversion.mockResolvedValue({ ...report, findings: [{ kind: 'none', text: 'No clear pattern yet in this period — try a longer date range.', evidence: {} }] });
      show();
      const none = await screen.findByText('No clear pattern yet in this period — try a longer date range.');
      expect(none.className).toContain('text-muted');
      expect(none.textContent).not.toMatch(/[★⚠]/);
    });

    it('coverage line', async () => {
      show('/statistics?scope=me');
      const line = await screen.findByText(/^Breakdowns below use job-level data/);
      expect(line.textContent).toBe('Breakdowns below use job-level data: they cover 2,594 of 3,917 bids and 38 of 41 interviews.');
    });

    it('sections in spec order', async () => {
      show('/statistics?scope=me');
      await screen.findByText('When to bid');
      await screen.findByText('Your profiles');
      const order = [
        screen.getByRole('group', { name: 'Filters' }),
        screen.getByRole('region', { name: 'Your numbers' }),
        screen.getByRole('table', { name: 'Everyone' }),
        screen.getByRole('region', { name: 'Key findings' }),
        screen.getByText(/^Breakdowns below use job-level data/),
        screen.getByRole('table', { name: 'Self vs bidder' }),
        screen.getByText('What to change'),
        screen.getByText('Your profiles'),
        screen.getByText('When to bid'),
      ];
      for (let i = 1; i < order.length; i++) {
        expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      }
    });
  });

  describe('date range guidance', () => {
    const SHORT = 'Short period — rates can swing a lot. For reliable numbers, use Since Oct 6 or a range of a month or more.';

    it('hint under the date range; no short note for Since Oct 6', async () => {
      show();
      expect(await screen.findByText('Data starts Oct 6, 2026 · pick a month or more for reliable numbers.')).toBeTruthy();
      await screen.findByRole('table', { name: 'Everyone' });
      expect(screen.queryByText(SHORT)).toBeNull();
      expect(screen.queryByText('Data starts Oct 6 — showing Oct 6 onward.')).toBeNull();
    });

    it('custom range pickers start at 2026-10-06', async () => {
      show('/statistics?range=custom&from=2026-10-10&to=2026-11-15');
      expect((await screen.findByLabelText('From') as HTMLInputElement).min).toBe('2026-10-06');
      expect((screen.getByLabelText('To') as HTMLInputElement).min).toBe('2026-10-10');
    });

    it('clamped note when the range starts before Oct 6', async () => {
      getConversion.mockResolvedValue({ ...report, startClamped: true });
      show('/statistics?range=last_month');
      expect(await screen.findByText('Data starts Oct 6 — showing Oct 6 onward.')).toBeTruthy();
    });

    it('short-period note for a 2-week range; its buttons set the range', async () => {
      show('/statistics?range=custom&from=2026-11-01&to=2026-11-14');
      expect(await screen.findByText(SHORT)).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Since Oct 6' }));
      await waitFor(() => expect(search).not.toContain('range='));
      expect(search).not.toContain('from=');
      await waitFor(() => expect(screen.queryByText(SHORT)).toBeNull());
      cleanup();
      show('/statistics?range=custom&from=2026-11-01&to=2026-11-14');
      fireEvent.click(await screen.findByRole('button', { name: 'Last month' }));
      await waitFor(() => expect(search).toContain('range=last_month'));
      expect(search).not.toContain('from=');
    });
  });
});
