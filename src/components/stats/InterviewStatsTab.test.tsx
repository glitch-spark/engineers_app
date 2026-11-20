// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { SWRConfig } from 'swr';
import type { InterviewGroup, InterviewStatsReport } from '../../api/endpoints';
import InterviewStatsTab from './InterviewStatsTab';

const getInterviewsReport = vi.fn();
vi.mock('../../api/endpoints', async (orig) => ({
  ...(await orig<object>()),
  getInterviewsReport: (...a: unknown[]) => getInterviewsReport(...a),
}));
let role = 'staff';
vi.mock('../../auth/useAuth', () => ({ useAuth: () => ({ user: { role, id: 'me' } }) }));
vi.mock('../../lib/useFirstTeamMember', async (orig) => ({
  ...(await orig<object>()),
  useTeamLookup: () => ({ data: { users: [{ _id: 'u7', name: 'Michael' }] } }),
}));

let search = '';
const Probe = () => { search = useLocation().search; return null; };

const g = (key: string, label: string, over: Partial<InterviewGroup> = {}): InterviewGroup => ({
  key, label, rounds: 100, held: 80, decided: 60, passed: 15, rejected: 30, noAnswer: 15, waiting: 20, canceled: 15,
  scheduled: 5, rate: 25, few: false, mark: null, ...over,
});
const person = (userId: string, name: string, companies: number, held: number, passRate: number | null, offers: number,
  ranks: [number | null, number | null, number | null, number | null], o: { few?: boolean; isSubject?: boolean } = {}) => ({
  userId, name, companies, held, decided: o.few ? 7 : 40, passed: 2, passRate, few: !!o.few, offers, isSubject: !!o.isSubject,
  ranks: { companies: ranks[0], held: ranks[1], passRate: ranks[2], offers: ranks[3] },
});
const everyone = [
  person('me', 'Nicholas', 27, 29, 33.3, 0, [3, 3, 1, 3], { isSubject: true }),
  person('u2', 'Puma', 55, 72, 32.3, 1, [2, 2, 2, 1]),
  person('u3', 'Michael', 66, 77, 20.8, 0, [1, 1, 3, 3]),
  person('u4', 'Athen@', 20, 21, 28.6, 0, [4, 4, null, 3], { few: true }),
  person('u5', 'Justin', 2, 2, 0, 0, [5, 5, null, 3], { few: true }),
];
const findings: InterviewStatsReport['findings'] = [
  { kind: 'best', text: 'Tech round 1 passes best for stage: 59.1% (13 of 22 decided rounds) vs 23.9% overall.' },
  { kind: 'reason', text: '58% of canceled rounds: Company (38 of 65).' },
];
const teamCards: InterviewStatsReport['summary']['cards'] = {
  companies: { value: 229, rank: null, of: null, median: 41, vsMedian: null },
  rounds: { value: 357, held: 270, canceled: 65, scheduled: 22, rank: null, of: null, median: 50, vsMedian: null },
  passRate: { value: 23.9, passed: 58, decided: 243, waiting: 27, rank: null, of: null, teamRate: 23.9 },
  offers: { value: 2, rank: null, of: null },
};
const meCards: InterviewStatsReport['summary']['cards'] = {
  companies: { value: 27, rank: 3, of: 4, median: 41, vsMedian: -0.34 },
  rounds: { value: 40, held: 29, canceled: 8, scheduled: 3, rank: 4, of: 6, median: 50, vsMedian: -0.42 },
  passRate: { value: 33.3, passed: 8, decided: 24, waiting: 5, rank: 1, of: 4, teamRate: 23.9 },
  offers: { value: 0, rank: 2, of: 5 },
};
const report: InterviewStatsReport = {
  window: { start: '2026-10-06', end: '2026-11-20', startClamped: false },
  totals: { ...g('all', 'All', { rounds: 357, held: 270, decided: 243, passed: 58, rate: 23.9 }), companies: 229, offers: 2 },
  summary: { cards: teamCards, everyone },
  findings,
  byStage: [
    g('intro', 'Intro', { rounds: 297, held: 218, decided: 195, passed: 36, rejected: 107, noAnswer: 52, waiting: 23, canceled: 62, rate: 18.5 }),
    g('tech1', 'Tech round 1', { rounds: 29, held: 26, decided: 22, passed: 13, rejected: 6, noAnswer: 3, waiting: 4, canceled: 1, rate: 59.1, mark: 'best' }),
    g('final', 'Final', { rounds: 7, held: 6, decided: 6, passed: 2, rejected: 4, noAnswer: 0, waiting: 0, canceled: 0, rate: 33.3, few: true }),
  ],
  byWho: [g('self', 'Self', { rate: 21.9 }), g('caller', 'Caller', { rate: 29.2 })],
  byCaller: [
    g('c1', 'Muhammad', { rate: 39.5, mark: 'best' }),
    g('other', 'Other callers', { rounds: 16, decided: 6, passed: 1, rate: 16.7, few: true, memberCount: 6,
      members: [g('c8', 'Jamil', { decided: 5, rate: 0, few: true }), g('c9', 'Rui', { decided: 1, rate: 100, few: true })] }),
  ],
  reasons: {
    rejected: [
      { key: 'no_answer', label: 'No answer from the company', count: 55, share: 30.1 },
      { key: 'none', label: 'Reason not filled in yet', count: 20, share: 10.9 },
      { key: 'weak_tech', label: 'Weak technical answers', count: 11, share: 6 },
    ],
    canceled: [{ key: 'company', label: 'Company', count: 38, share: 58.5 }, { key: 'me', label: 'Me', count: 6, share: 9.2 }],
    rescheduled: [{ key: 'company', label: 'Company asked', count: 1, share: 100 }],
    rescheduleRate: { rescheduled: 1, rounds: 19, since: '2026-11-20' },
  },
  byProfile: [g('p1', 'Pedro')], byRegion: [g('US', 'US')], byArea: [g('be', 'Backend'), g('unknown', 'Unknown', { rate: 12.1 })],
  byScore: [g('80', '80+')], byAppliedBy: [g('self', 'Self bid')], byWeekday: [g('mon', 'Mon')], byHour: [g('morning', 'Morning')],
  followUps: [
    { key: 'followed_up', label: 'Followed up', rounds: 0, passed: 0, rejected: 0, noAnswer: 0, waiting: 0 },
    { key: 'not_followed_up', label: 'Not followed up', rounds: 84, passed: 0, rejected: 0, noAnswer: 57, waiting: 27 },
  ],
};
const meReport: InterviewStatsReport = { ...report, summary: { cards: meCards, everyone } };

const show = (url = '/statistics') => render(
  <SWRConfig value={{ provider: () => new Map() }}>
    <MemoryRouter initialEntries={[url]}><Probe /><InterviewStatsTab /></MemoryRouter>
  </SWRConfig>,
);
const table = (name: string) => screen.findByRole('table', { name });
const cells = (row: HTMLElement) => [...(row as HTMLTableRowElement).cells].map((td) => td.textContent);
const heads = (t: HTMLElement) => within(t).getAllByRole('columnheader').map((h) => h.textContent);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 20, 12, 0, 0));
  role = 'staff';
  getInterviewsReport.mockReset();
  getInterviewsReport.mockImplementation((p: { scope: string }) => Promise.resolve(p.scope === 'me' ? meReport : report));
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('InterviewStatsTab', () => {
  describe('request', () => {
    it('defaults: Whole team, all regions, Since Oct 6 as a custom range up to today', async () => {
      show();
      await waitFor(() => expect(getInterviewsReport).toHaveBeenCalled());
      expect(getInterviewsReport).toHaveBeenCalledWith({ period: 'custom', date: '2026-10-06', to: '2026-11-20', region: 'all', scope: 'team' });
      expect((screen.getByLabelText('Date range') as HTMLSelectElement).value).toBe('since_oct6');
      expect([...(screen.getByLabelText('Profiles') as HTMLSelectElement).options].map((o) => o.text)).toEqual(['Whole team', 'All my profiles']);
      expect(screen.getByRole('button', { name: 'About the date range' }).getAttribute('title'))
        .toBe('Data starts Oct 6, 2026. Pick a month or more (Since Oct 6 is best) for reliable numbers.');
    });

    it('carries region, scope and the custom dates from the URL', async () => {
      show('/statistics?region=EU&scope=me&range=custom&from=2026-10-10&to=2026-11-10');
      await waitFor(() => expect(getInterviewsReport).toHaveBeenCalled());
      expect(getInterviewsReport).toHaveBeenCalledWith({ period: 'custom', date: '2026-10-10', to: '2026-11-10', region: 'EU', scope: 'me' });
    });

    it('changing Profiles refetches with scope me', async () => {
      show();
      fireEvent.change(await screen.findByLabelText('Profiles'), { target: { value: 'me' } });
      expect(search).toContain('scope=me');
      await waitFor(() => expect(getInterviewsReport).toHaveBeenLastCalledWith(expect.objectContaining({ scope: 'me' })));
    });

    it('an admin viewing a teammate sends user; staff never does', async () => {
      role = 'admin';
      show('/statistics?user=u7&scope=me');
      await waitFor(() => expect(getInterviewsReport).toHaveBeenCalledWith(expect.objectContaining({ user: 'u7', scope: 'me' })));
      cleanup(); role = 'staff'; getInterviewsReport.mockClear();
      show('/statistics?user=u7');
      await waitFor(() => expect(getInterviewsReport).toHaveBeenCalled());
      expect(getInterviewsReport.mock.calls.every((c) => !('user' in c[0]))).toBe(true);
    });
  });

  describe('states', () => {
    it('loading, then an error message when the request fails', async () => {
      getInterviewsReport.mockRejectedValue(new Error('boom'));
      show();
      expect(screen.getByText('Loading statistics…')).toBeTruthy();
      expect(await screen.findByText('Couldn’t load the statistics. Try again.')).toBeTruthy();
    });

    it('a range before Oct 6 with no rounds says where the data starts', async () => {
      getInterviewsReport.mockResolvedValue({ ...report, window: { ...report.window, startClamped: true }, totals: { ...report.totals, rounds: 0 } });
      show('/statistics?range=last_month');
      expect(await screen.findByText('No data before Oct 6, 2026 — pick a later period.')).toBeTruthy();
      expect(screen.queryByRole('table', { name: 'By stage' })).toBeNull();
    });

    it('no rounds in the period', async () => {
      getInterviewsReport.mockResolvedValue({ ...report, totals: { ...report.totals, rounds: 0 } });
      show();
      expect(await screen.findByText('No interview rounds in this period.')).toBeTruthy();
    });

    it('an older server without the report fields shows the update note', async () => {
      getInterviewsReport.mockResolvedValue({ window: report.window });
      show();
      expect(await screen.findByText(/need the latest server update/)).toBeTruthy();
    });

    it('renders with empty lists, null rates and missing optional parts', async () => {
      getInterviewsReport.mockResolvedValue({
        window: report.window,
        totals: { ...g('all', 'All', { rate: null }), companies: 1, offers: 0 },
        summary: {
          cards: {
            companies: { value: 1, rank: null, of: null, median: null, vsMedian: null },
            rounds: { value: 1, held: 0, canceled: 0, scheduled: 1, rank: null, of: null, median: null, vsMedian: null },
            passRate: { value: null, passed: 0, decided: 0, waiting: 0, rank: null, of: null, teamRate: null },
            offers: { value: 0, rank: null, of: null },
          },
          everyone: [],
        },
        findings: [], byStage: [], byWho: [], byCaller: [],
        reasons: { canceled: [], rescheduled: [], rejected: [] },
        byProfile: [], byRegion: [], byArea: [], byScore: [], byAppliedBy: [], byWeekday: [], byHour: [],
      });
      show();
      expect(within(await table('By stage')).getByText('No rounds.')).toBeTruthy();
      expect(within(screen.getByRole('region', { name: 'Team numbers' })).getByText('—')).toBeTruthy();
      expect(screen.getByText('No reschedules logged yet')).toBeTruthy();
      expect(screen.getByText('No rejected rounds in this period.')).toBeTruthy();
      expect(screen.getByRole('table', { name: 'Follow-ups' })).toBeTruthy();
      expect(screen.queryByText(/Green = clearly above/)).toBeNull();
    });
  });

  describe('cards', () => {
    it('Whole team: totals with the lines under them, no rank', async () => {
      show();
      const c = within(await screen.findByRole('region', { name: 'Team numbers' }));
      expect(c.getByText('Companies interviewed').nextElementSibling!.textContent).toBe('229');
      expect(c.getByText('First round held in this period · median per person 41')).toBeTruthy();
      expect(c.getByText('Total rounds').nextElementSibling!.textContent).toBe('357');
      expect(c.getByText('270 held · 65 canceled · 22 scheduled, not held yet')).toBeTruthy();
      expect(c.getByText('Pass rate').nextElementSibling!.textContent).toBe('23.9%');
      expect(c.getByText('58 passed of 243 decided · 27 waiting')).toBeTruthy();
      expect(c.getByText('Offers').nextElementSibling!.textContent).toBe('2');
      expect(c.getByText('Final round passed')).toBeTruthy();
      expect(c.queryByText(/^#/)).toBeNull();
      expect(c.queryByText(/team median/)).toBeNull();
    });

    it('All my profiles: every card shows its rank and the gap to the team', async () => {
      show('/statistics?scope=me');
      const c = within(await screen.findByRole('region', { name: 'Your numbers' }));
      for (const r of ['#3 of 4', '#4 of 6', '#1 of 4', '#2 of 5']) expect(c.getByText(r)).toBeTruthy();
      expect(c.getByText('▼ 34% below team median (41)')).toBeTruthy();
      expect(c.getByText('29 held · 8 canceled · 3 scheduled, not held yet')).toBeTruthy();
      expect(c.getByText('▲ team 23.9%')).toBeTruthy();
      expect(c.getByText('8 passed of 24 decided · 5 waiting')).toBeTruthy();
    });

    it('a pass rate under 20 decided rounds reads "not ranked"', async () => {
      getInterviewsReport.mockResolvedValue({ ...meReport, summary: { everyone, cards: { ...meCards, passRate: { ...meCards.passRate, rank: null } } } });
      show('/statistics?scope=me');
      const c = within(await screen.findByRole('region', { name: 'Your numbers' }));
      expect(c.getByText('not ranked (under 20 decided rounds)')).toBeTruthy();
      expect(c.queryByText(/team 23\.9/)).toBeNull();
    });
  });

  describe('Everyone', () => {
    const rows = () => within(screen.getByRole('table', { name: 'Everyone' })).getAllByRole('row').slice(1);
    const names = () => rows().map((r) => (r as HTMLTableRowElement).cells[1].textContent);

    it('ranks by Pass rate by default; too-few people stay unranked at the bottom with ⚠', async () => {
      show('/statistics?scope=me');
      const t = await table('Everyone');
      expect(heads(t)).toEqual(['#', 'Person', '', 'Companies', 'Rounds held', 'Pass rate', 'Offers']);
      expect(within(screen.getByRole('group', { name: 'Rank by' })).getAllByRole('button').map((b) => b.textContent))
        .toEqual(['Companies', 'Rounds held', 'Pass rate', 'Offers']);
      expect(screen.getByRole('button', { name: 'Pass rate' }).getAttribute('aria-pressed')).toBe('true');
      expect(names()).toEqual(['Nicholas', 'Puma', 'Michael', 'Athen@', 'Justin']);
      expect(cells(rows()[0])).toEqual(['1', 'Nicholas', '', '27', '29', '33.3%', '0']);
      expect(cells(rows()[3])).toEqual(['—', 'Athen@', '', '20', '21', '28.6% ⚠', '0']);
      expect(rows()[3].className).toContain('text-muted');
      expect(rows()[3].querySelector('[aria-hidden]')).toBeNull(); // no bar for an unranked rate
      expect(rows()[0].getAttribute('aria-current')).toBe('true');
      expect(screen.getByText('Pass rate is ranked only with 20 or more decided rounds. ⚠ = too few to tell.')).toBeTruthy();
    });

    it('the switch reorders by the picked number', async () => {
      show();
      await table('Everyone');
      fireEvent.click(screen.getByRole('button', { name: 'Companies' }));
      expect(names()).toEqual(['Michael', 'Puma', 'Nicholas', 'Athen@', 'Justin']);
      expect(cells(rows()[3])[0]).toBe('4'); // ranked here, though too few for a pass rate
      expect(rows()[3].className).not.toContain('text-muted');
      fireEvent.click(screen.getByRole('button', { name: 'Offers' }));
      expect(names()[0]).toBe('Puma');
      fireEvent.click(screen.getByRole('button', { name: 'Rounds held' }));
      expect(names().slice(0, 2)).toEqual(['Michael', 'Puma']);
    });

    it('an admin clicking a name views that person', async () => {
      role = 'admin';
      show();
      fireEvent.click(await screen.findByRole('button', { name: 'Puma' }));
      expect(search).toContain('user=u2');
      expect(search).toContain('scope=me');
    });
  });

  it('Key findings render ★ / ⚠, and the fallback sentence muted', async () => {
    show();
    const box = within(await screen.findByRole('region', { name: 'Key findings' }));
    expect(box.getByText(findings[0].text).parentElement!.textContent).toBe(`★ ${findings[0].text}`);
    expect(box.getByText(findings[1].text).parentElement!.textContent).toBe(`⚠ ${findings[1].text}`);
    expect(box.getByText('Only findings that are unlikely to be chance are shown.')).toBeTruthy();
    cleanup();
    const none = 'No clear pattern yet in this period — try a longer date range.';
    getInterviewsReport.mockResolvedValue({ ...report, findings: [{ kind: 'none', text: none }] });
    show();
    const line = await screen.findByText(none);
    expect(line.className).toContain('text-muted');
    expect(line.textContent).not.toMatch(/[★⚠]/);
  });

  describe('By stage', () => {
    it('one row per stage with the counts, the outcome bar in words, ★ and muted too-few rows', async () => {
      show();
      const t = await table('By stage');
      expect(heads(t)).toEqual(['Stage', 'Rounds', 'What happened', 'Held', 'Passed', 'Rejected', 'No answer', 'Waiting', 'Canceled', 'Pass rate']);
      const row = (label: string) => within(t).getByText(label).closest('tr')!;
      expect(cells(row('Intro'))).toEqual(['Intro', '297', '', '218', '36', '107', '52', '23', '62', '18.5%']);
      const stack = within(row('Intro')).getByRole('img', { name: '36 passed, 107 rejected, 52 no answer, 23 waiting, 62 canceled' });
      const seg = (name: string) => (stack.querySelector(`[data-seg="${name}"]`) as HTMLElement).style.width;
      expect(seg('passed')).toBe('12.86%'); // 36 of 280
      expect(seg('canceled')).toBe('22.14%');
      expect(within(row('Final')).getByRole('img', { name: /^2 passed, 4 rejected/ }).querySelector('[data-seg="waiting"]')).toBeNull();
      expect(row('Tech round 1').contains(screen.getAllByRole('img', { name: 'Best group' })[0])).toBe(true);
      expect(row('Final').className).toContain('text-muted');
      expect(row('Intro').className).not.toContain('text-muted');
      // a too-few row keeps its rate with ⚠ and no bar, and does not set the bar scale
      expect(row('Final').querySelector('[data-bar="fill"]')).toBeNull();
      expect((row('Tech round 1').querySelector('[data-bar="fill"]') as HTMLElement).style.width).toBe('100%');
      fireEvent.click(within(row('Final')).getByRole('button', { name: /swing a lot/ }));
      expect(screen.getByRole('note').textContent).toBe('Only 6 decided rounds — this rate can swing a lot.');
    });

    it('has the outcome legend and the pass-rate definition', async () => {
      show();
      await table('By stage');
      expect([...screen.getByRole('list', { name: 'Outcomes' }).children].map((li) => li.textContent))
        .toEqual(['Passed', 'Rejected', 'No answer', 'Waiting', 'Canceled']);
      expect(screen.getByText('Pass rate = passed ÷ (passed + rejected + no answer). "No answer" = closed as no answer, or silent for 14 days. Waiting rounds are not counted yet.')).toBeTruthy();
    });
  });

  describe('breakdown tables', () => {
    it('Self vs caller shows Canceled; the others Group · Rounds · Decided · Passed · Pass rate', async () => {
      show();
      expect(heads(await table('Self vs caller'))).toEqual(['Group', 'Rounds', 'Canceled', 'Decided', 'Passed', 'Pass rate']);
      expect(heads(screen.getByRole('table', { name: 'By caller' }))).toEqual(['Caller', 'Rounds', 'Decided', 'Passed', 'Pass rate']);
      for (const name of ['By time of day', 'By who applied', 'By weekday', 'By resume score', 'By job area', 'By profile', 'By region']) {
        expect(heads(screen.getByRole('table', { name }))).toEqual(['Group', 'Rounds', 'Decided', 'Passed', 'Pass rate']);
      }
      expect(cells(within(screen.getByRole('table', { name: 'Self vs caller' })).getByText('Self').closest('tr')!))
        .toEqual(['Self', '100', '15', '60', '15', '21.9%']);
    });

    it('the bar colour legend with the team rate appears once, under the first table', async () => {
      show();
      const legend = await screen.findAllByText('Green = clearly above the team rate (23.9%), red = clearly below, grey = about the same or too few to tell.');
      expect(legend).toHaveLength(1);
      const first = screen.getByRole('table', { name: 'Self vs caller' });
      expect(first.compareDocumentPosition(legend[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(legend[0].compareDocumentPosition(screen.getByRole('table', { name: 'By caller' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('"Other callers" expands to its members', async () => {
      show();
      const t = await table('By caller');
      const btn = within(t).getByRole('button', { name: /Other callers \(6\)/ });
      expect(btn.textContent).not.toContain('sites');
      expect(btn.getAttribute('aria-expanded')).toBe('false');
      expect(within(t).queryByText('Jamil')).toBeNull();
      fireEvent.click(btn);
      expect(btn.getAttribute('aria-expanded')).toBe('true');
      expect(cells(within(t).getByText('Jamil').closest('tr')!).slice(0, 4)).toEqual(['Jamil', '100', '5', '15']);
      expect(within(t).getByText('Rui')).toBeTruthy();
      fireEvent.click(btn);
      expect(within(t).queryByText('Jamil')).toBeNull();
    });

    it('"Caller not assigned" in Self vs caller is muted with its counts, no bar and no say in the bar scale', async () => {
      getInterviewsReport.mockResolvedValue({ ...report, byWho: [
        g('self', 'Self', { rate: 21.9 }), g('caller', 'Caller', { rate: 29.2 }),
        g('unassigned', 'Caller not assigned', { rounds: 30, canceled: 4, decided: 25, passed: 20, rate: 80 }),
      ] });
      show();
      const t = await table('Self vs caller');
      expect(within(t).getAllByRole('row').slice(1).map((r) => (r as HTMLTableRowElement).cells[0].textContent)).toEqual(['Self', 'Caller', 'Caller not assigned']);
      const row = within(t).getByText('Caller not assigned').closest('tr')!;
      expect(cells(row)).toEqual(['Caller not assigned', '30', '4', '25', '20', '80%']);
      expect(row.className).toContain('text-muted');
      expect(row.querySelector('[data-bar="fill"]')).toBeNull();
      const fill = within(t).getByText('Caller').closest('tr')!.querySelector('[data-bar="fill"]') as HTMLElement;
      expect(fill.style.width).toBe('100%'); // scaled to 29.2, not 80
      expect(fill.getAttribute('data-tone')).toBe('same');
    });

    it('an Unknown group is muted, with no bar and no say in the bar scale', async () => {
      show();
      const t = await table('By job area');
      const unknown = within(t).getByText('Unknown').closest('tr')!;
      expect(unknown.className).toContain('text-muted');
      expect(unknown.querySelector('[data-bar="fill"]')).toBeNull();
      expect(within(t).getByText('Backend').closest('tr')!.querySelector('[data-bar="fill"]')).toBeTruthy();
    });
  });

  describe('reasons', () => {
    it('one row per reason with count and share; "Reason not filled in yet" muted and last', async () => {
      show();
      const t = await table('Why rounds were rejected');
      const rows = within(t).getAllByRole('row');
      expect(rows.map(cells)).toEqual([
        ['No answer from the company', '', '55', '30.1%'],
        ['Weak technical answers', '', '11', '6%'],
        ['Reason not filled in yet', '', '20', '10.9%'],
      ]);
      expect(rows[2].className).toContain('text-muted');
      expect(rows[0].className).not.toContain('text-muted');
      expect((rows[0].querySelector('[data-bar]') as HTMLElement).style.width).toBe('100%');
      expect((rows[1].querySelector('[data-bar]') as HTMLElement).style.width).toBe('20%');
      expect(screen.getByRole('heading', { name: 'Why rounds were rejected (86)' })).toBeTruthy();
      expect(screen.getByRole('heading', { name: 'Why rounds were canceled (44)' })).toBeTruthy();
      expect(within(screen.getByRole('table', { name: 'Why rounds were canceled' })).getAllByRole('row').map(cells)[0]).toEqual(['Company', '', '38', '58.5%']);
    });

    it('Rescheduled: the count since the logging start with its reasons', async () => {
      show();
      const box = await screen.findByRole('region', { name: 'Rescheduled' });
      expect(box.textContent).toContain('1 of 19 rounds since Nov 20');
      expect(within(box).getAllByRole('row').map(cells)).toEqual([['Company asked', '', '1', '100%']]);
      expect(screen.queryByText('No reschedules logged yet')).toBeNull();
    });

    it('Rescheduled: a muted note while nothing is logged', async () => {
      getInterviewsReport.mockResolvedValue({ ...report, reasons: { ...report.reasons, rescheduled: [], rescheduleRate: { rescheduled: 0, rounds: 19, since: '2026-11-20' } } });
      show();
      const box = await screen.findByRole('region', { name: 'Rescheduled' });
      const note = within(box).getByText('No reschedules logged yet');
      expect(note.className).toContain('text-muted');
      expect(within(box).queryByRole('table')).toBeNull();
      expect(box.textContent).not.toContain('0 of 19');
    });
  });

  it('Follow-ups table with its note', async () => {
    show();
    const t = await table('Follow-ups');
    expect(heads(t)).toEqual(['Group', 'Rounds', 'Passed', 'Rejected', 'No answer', 'Still waiting']);
    const rows = within(t).getAllByRole('row').slice(1);
    expect(rows.map(cells)).toEqual([['Followed up', '0', '0', '0', '0', '0'], ['Not followed up', '84', '0', '0', '57', '27']]);
    expect(rows[0].className).toContain('text-muted'); // nothing followed up yet
    expect(screen.getByText('Fills in once the follow-up reminder is live: how many silent rounds got an answer after a follow-up.')).toBeTruthy();
  });

  it('has no answer-score table and no Depth and speed section', async () => {
    show();
    await table('Follow-ups');
    expect(screen.queryByText(/answer score/i)).toBeNull();
    expect(screen.queryByText(/Depth and speed|Rounds until it ended|Days until an answer|Days between rounds/)).toBeNull();
  });

  it('sections in the agreed order', async () => {
    show();
    await table('Follow-ups');
    const order = [
      screen.getByRole('group', { name: 'Filters' }),
      screen.getByRole('region', { name: 'Team numbers' }),
      screen.getByRole('table', { name: 'Everyone' }),
      screen.getByRole('region', { name: 'Key findings' }),
      screen.getByRole('table', { name: 'By stage' }),
      screen.getByRole('table', { name: 'Self vs caller' }),
      screen.getByRole('table', { name: 'By caller' }),
      screen.getByRole('table', { name: 'Why rounds were rejected' }),
      screen.getByRole('table', { name: 'Why rounds were canceled' }),
      screen.getByRole('region', { name: 'Rescheduled' }),
      screen.getByRole('heading', { name: 'What raises the pass rate' }),
      ...['By time of day', 'By who applied', 'By weekday', 'By resume score', 'By job area', 'By profile', 'By region']
        .map((name) => screen.getByRole('table', { name })),
      screen.getByRole('table', { name: 'Follow-ups' }),
    ];
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });
});
