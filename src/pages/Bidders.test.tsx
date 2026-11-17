// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate, type NavigateFunction } from 'react-router-dom';
import { SWRConfig } from 'swr';

const api = vi.hoisted(() => ({
  getBidClock: vi.fn(),
  getBidPerformance: vi.fn(),
  lookupUsers: vi.fn(),
  listBidders: vi.fn(),
  getBidAlerts: vi.fn(),
  getBidInsights: vi.fn(),
  getBidBacklog: vi.fn(),
  getBidPay: vi.fn(),
  bidsWeek: vi.fn(),
  listBids: vi.fn(),
  bidScreenshots: vi.fn(),
  archiveBidder: vi.fn(),
  bidderReports: vi.fn(),
}));
// The real module's constants (reasons, labels) stay; every call is mocked.
vi.mock('../api/endpoints', async (orig) => ({ ...(await orig<object>()), ...api }));
const auth = vi.hoisted(() => ({ user: { id: 'u1', role: 'admin' } as { id: string; role: string } | null }));
vi.mock('../auth/useAuth', () => ({ useAuth: () => ({ user: auth.user }) }));
vi.mock('../components/bids/FocusReview', () => ({
  default: (props: { scope: unknown; onExit: () => void }) => (
    <div data-testid="focus">
      {JSON.stringify(props.scope)}
      <button type="button" onClick={props.onExit}>Close</button>
    </div>
  ),
}));

import BiddersPage from './Bidders';

const AFTER = {
  today: '2026-11-23', payWeekStart: '2026-11-23', payWeekEnd: '2026-11-29', previousPayWeekStart: '2026-11-15',
  timezone: 'America/Chicago',
};

const DAYS = ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29'];

function perf(selfOwner = { id: 'u1', name: 'Pat' }) {
  return {
    period: 'week', start: '2026-11-23', end: '2026-11-29', label: 'Week ending Sun Nov 29', recordsStart: null,
    weeks: [{ start: '2026-11-23', end: '2026-11-29', partial: false }],
    bidders: [{
      id: 'b1', name: 'Ana', ownerName: 'Pat', profileId: 'a1', profileName: 'Alpha', status: 'active',
      weekly: [13], total: 13, approved: 10, pending: 3, rejected: 0, previousTotal: 0, change: null,
      longestStreak: 0, currentStreak: 0, hitDays: 0, weekdays: 0, hitRate: null, avgPerWeekday: null,
      interviews: 0, sharedProfile: false, sharedWith: [], profileSelfBids: false, untaggedInterviews: 0, days: [],
      per100: null, lastBidAt: null, rate: 0.06, pay: 0.6,
      week: { approved: 10, pending: 3, rejected: 0, toReview: 3, pay: 0.6, source: 'records', error: null },
    }],
    totals: { total: 13, interviews: 0, hitRate: null, avgPerWeekday: null, per100: null, approved: 10, pending: 3, rejected: 0, toReview: 3, pay: 0.6 },
    selfRows: [{
      ownerId: selfOwner.id, ownerName: selfOwner.name, total: 2, weekly: [2, 0, 0, 0, 0, 0, 0], interviews: 0, lastBidAt: null,
      profiles: [{ accountId: 'p1', name: 'Alpha', total: 2, weekly: [2, 0, 0, 0, 0, 0, 0], interviews: 0 }],
    }],
    payWeek: {
      start: '2026-11-23', end: '2026-11-30', label: 'Week ending Sun Nov 29', timezone: 'America/Chicago',
      days: DAYS.map((day) => ({ day, isToday: day === '2026-11-23', isFuture: day > '2026-11-23' })),
    },
    top: { bids: [], streak: [], interviews: [], conversion: [] },
  };
}

const seen = { search: '', pathname: '', navigate: null as NavigateFunction | null };
function Probe() {
  const loc = useLocation();
  seen.search = loc.search;
  seen.pathname = loc.pathname;
  seen.navigate = useNavigate();
  return null;
}

/** `before`: history entries below the page (another page of the app), so Back has somewhere to go. */
function renderPage(initial: string, before: string[] = []) {
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <MemoryRouter initialEntries={[...before, initial]} initialIndex={before.length}>
        <BiddersPage />
        <Probe />
      </MemoryRouter>
    </SWRConfig>,
  );
}

const lastPerfCall = () => api.getBidPerformance.mock.calls.at(-1)?.[0];
const owner = () => screen.getByLabelText('Owner') as HTMLSelectElement;

beforeEach(() => {
  auth.user = { id: 'u1', role: 'admin' };
  api.getBidClock.mockResolvedValue(AFTER);
  api.getBidPerformance.mockResolvedValue(perf());
  api.lookupUsers.mockResolvedValue({ users: [{ _id: 'u1', name: 'Pat', email: null }, { _id: 'u2', name: 'Zed', email: null }] });
  api.listBidders.mockResolvedValue({ bidders: [] });
  api.getBidAlerts.mockResolvedValue({ asOf: '2026-11-23', flags: [], archive: [] });
  api.getBidInsights.mockResolvedValue({ mine: null, platform: null });
  api.getBidBacklog.mockResolvedValue({ today: '2026-11-23', total: 0, todayCount: 0, oldestDay: null, bidders: [] });
  api.listBids.mockResolvedValue({ bids: [], week: '2026-11-29' });
  api.getBidPay.mockResolvedValue({
    label: 'Week ending Sun Nov 22', timezone: 'America/Chicago', first: '2026-11-15', last: '2026-11-22',
    weeks: [{
      weekEnd: '2026-11-22', label: 'Week ending Sun Nov 22', end: '2026-11-23T02:00:00Z', first: '2026-11-15', last: '2026-11-22',
      state: 'closed', source: 'report',
      bidders: [{ bidderId: 'b1', name: 'Ana', country: null, profileName: null, ownerId: 'u1', ownerName: 'Pat', approved: 10, pending: 3, rate: 0.06, pay: 0.6, error: null }],
      totals: { approved: 10, pending: 3, pay: 0.6, errors: 0 },
    }],
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('the Bids page', () => {
  it("opens on Bids › Bidders with the admin's own team", async () => {
    renderPage('/bidders');
    expect(screen.getByRole('heading', { name: 'Bids' })).toBeTruthy();
    const tabs = screen.getAllByRole('tab').map((t) => t.textContent);
    expect(tabs).toEqual(['Bidders', 'My bids', 'Pay']);
    expect(screen.getByRole('tab', { name: 'Bidders' }).getAttribute('aria-selected')).toBe('true');
    await waitFor(() => expect(api.getBidPerformance).toHaveBeenCalled());
    expect(lastPerfCall()).toMatchObject({ ownerId: 'u1' });
    expect(api.getBidPerformance.mock.calls.every(([p]) => p.ownerId === 'u1')).toBe(true);
    await waitFor(() => expect(owner().selectedOptions[0].text).toBe('Me'));
    expect([...owner().options].map((o) => o.text)).toEqual(['Me', 'Zed', 'All owners']);
    expect(screen.queryByRole('radiogroup', { name: 'Show' })).toBeNull();
    // Ana is in the table, the owner's own bids are not (they live on My bids).
    expect(await screen.findByRole('button', { name: 'Ana' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Self' })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: /Owner/ })).toBeNull();
    expect(document.title).toContain('Bids');
  });

  it('show=self opens My bids', async () => {
    renderPage('/bidders?show=self');
    await waitFor(() => expect(screen.getByRole('tab', { name: 'My bids' }).getAttribute('aria-selected')).toBe('true'));
    expect(await screen.findByRole('button', { name: 'Alpha' })).toBeTruthy();
    // The old key is replaced by the new one.
    await waitFor(() => expect(seen.search).toBe('?section=mine'));
    // My bids has no search or Show archived.
    expect(screen.queryByPlaceholderText('Search bidders…')).toBeNull();
    expect(screen.queryByRole('switch', { name: 'Show archived' })).toBeNull();
  });

  it('show=bidders opens the Bidders tab', async () => {
    renderPage('/bidders?show=bidders');
    expect(screen.getByRole('tab', { name: 'Bidders' }).getAttribute('aria-selected')).toBe('true');
    await waitFor(() => expect(seen.search).toBe(''));
  });

  it('the Pay tab opens on Last pay week', async () => {
    renderPage('/bidders?section=pay');
    await waitFor(() => expect(api.getBidPay).toHaveBeenCalled());
    expect(api.getBidPay).toHaveBeenCalledWith({ period: 'week', date: '2026-11-22', ownerId: 'u1' });
    expect(screen.getByRole('tab', { name: 'Pay' }).getAttribute('aria-selected')).toBe('true');
    expect(await screen.findByRole('button', { name: 'Copy pay summary' })).toBeTruthy();
    // The bar shows the server's pay-week label, and the tab needs no performance request.
    expect(await screen.findByText('Week ending Sun Nov 22')).toBeTruthy();
    expect(api.getBidPerformance).not.toHaveBeenCalled();
    expect(api.getBidPay.mock.calls.every(([p]) => p.ownerId === 'u1')).toBe(true);
  });

  it('a Pay tab Review opens that bidder over that pay week', async () => {
    renderPage('/bidders?section=pay');
    fireEvent.click(await screen.findByRole('button', { name: 'Review' }));
    const q = new URLSearchParams(seen.search);
    expect(q.get('review')).toBe('week');
    expect(q.get('at')).toBe('2026-11-22');
    expect(q.get('reviewBidder')).toBe('b1');
    expect(q.get('section')).toBe('pay');
  });

  it('the Pay tab is reached from the tab bar', async () => {
    renderPage('/bidders');
    await screen.findByRole('button', { name: 'Ana' });
    fireEvent.click(screen.getByRole('tab', { name: 'Pay' }));
    await waitFor(() => expect(new URLSearchParams(seen.search).get('section')).toBe('pay'));
    await waitFor(() => expect(api.getBidPay).toHaveBeenCalledWith({ period: 'week', date: '2026-11-22', ownerId: 'u1' }));
  });


  it('a tab change writes section and drops search and archived', async () => {
    renderPage('/bidders?q=ana&archived=1');
    await waitFor(() => expect(api.getBidPerformance).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('tab', { name: 'My bids' }));
    expect(seen.search).toBe('?section=mine');
    expect(screen.getByRole('tab', { name: 'My bids' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByRole('tab', { name: 'Bidders' }));
    expect(seen.search).toBe('');
  });

  it('All owners asks for everyone and shows the Owner column', async () => {
    renderPage('/bidders');
    await waitFor(() => expect(owner().options.length).toBe(3));
    fireEvent.change(owner(), { target: { value: 'all' } });
    expect(seen.search).toBe('?owner=all');
    await waitFor(() => expect(lastPerfCall().ownerId).toBeUndefined());
    expect(await screen.findByRole('columnheader', { name: /Owner/ })).toBeTruthy();
    // Back to Me: the default is never written.
    fireEvent.change(owner(), { target: { value: '' } });
    expect(seen.search).toBe('');
  });

  it("another owner with no bidders offers every owner's", async () => {
    api.getBidPerformance.mockResolvedValue({ ...perf(), bidders: [], selfRows: [] });
    renderPage('/bidders?owner=u2');
    expect(await screen.findByText('This owner has no active bidders.')).toBeTruthy();
    expect(lastPerfCall()).toMatchObject({ ownerId: 'u2' });
    fireEvent.click(screen.getByRole('button', { name: 'Show all owners' }));
    expect(seen.search).toBe('?owner=all');
  });

  it('an empty own team says how to start', async () => {
    api.getBidPerformance.mockResolvedValue({ ...perf(), bidders: [], selfRows: [] });
    renderPage('/bidders');
    expect(await screen.findByText('No bidders yet')).toBeTruthy();
    expect(screen.getByText('Add a bidder, then send them the invite code and the Bid Track download.')).toBeTruthy();
  });

  it('waits for the signed-in user before asking for anything owner-scoped', async () => {
    auth.user = null;
    renderPage('/bidders');
    await waitFor(() => expect(api.getBidClock).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 30));
    expect(api.getBidPerformance).not.toHaveBeenCalled();
    expect(api.getBidAlerts).not.toHaveBeenCalled();
    expect(api.getBidInsights).not.toHaveBeenCalled();
    expect(api.getBidBacklog).not.toHaveBeenCalled();
    expect(document.querySelector('[aria-busy="true"]')).toBeTruthy();
  });

  it('staff see their own team without an owner id', async () => {
    auth.user = { id: 'u3', role: 'user' };
    renderPage('/bidders?owner=all');
    await waitFor(() => expect(api.getBidPerformance).toHaveBeenCalled());
    expect(lastPerfCall().ownerId).toBeUndefined();
    expect(screen.queryByLabelText('Owner')).toBeNull();
    expect(api.lookupUsers).not.toHaveBeenCalled();
  });
});

const BACKLOG = {
  today: '2026-11-25', total: 3, todayCount: 1, oldestDay: '2026-11-23',
  bidders: [{ bidderId: 'b1', name: 'Ana', ownerName: 'Pat', pending: 3, oldestDay: '2026-11-23' }],
};
const shownScope = async () => JSON.parse((await screen.findByTestId('focus')).firstChild!.textContent!);
const closeReview = () => fireEvent.click(within(screen.getByTestId('focus')).getByRole('button', { name: 'Close' }));
const toReview = async () => {
  const line = await screen.findByText(/^To review · /);
  return line.closest('[role="status"]') as HTMLElement;
};

function board() {
  const days = DAYS.map((day) => ({
    day, start: `${day}T00:00:00Z`, end: `${day}T23:00:00Z`, isToday: day === '2026-11-23', isFuture: day > '2026-11-23',
  }));
  const cell = (day: string) => ({ day, approved: 0, pending: 0, rejected: 0, source: 'records', error: null });
  return {
    week: { start: '2026-11-23T02:00:00Z', end: '2026-11-30T02:00:00Z', label: 'Week ending Sun Nov 29', timezone: 'America/Chicago', days },
    bidders: [{
      id: 'b1', name: 'Ana', status: 'active', country: null, profileName: 'Alpha', rate: 0.06, ownerId: 'u2', ownerName: 'Zed',
      days: DAYS.map(cell), week: { approved: 10, pending: 3, rejected: 0, pay: 0.6, toReview: 3, source: 'records', error: null },
    }],
    totals: { approved: 10, pending: 3, rejected: 0, pay: 0.6, toReview: 3, days: [] },
  };
}

describe('To review', () => {
  beforeEach(() => {
    api.getBidBacklog.mockResolvedValue(BACKLOG);
  });

  it("sits on the Bidders tab with the owner's backlog, all pending of any age", async () => {
    renderPage('/bidders');
    const block = await toReview();
    expect(block.textContent).toContain('To review · 3 pending (all, any age) · oldest Mon Nov 23');
    expect(api.getBidBacklog.mock.calls.every(([p]) => p.ownerId === 'u1')).toBe(true);
    expect(within(block).getByRole('button', { name: 'Ana 3' })).toBeTruthy();
    // The old strip's review item and its Review all are gone: the block is the one place.
    await screen.findByRole('button', { name: 'Ana' });
    expect(screen.getAllByRole('button', { name: 'Review all' })).toHaveLength(1);
    expect(screen.queryByText(/to review$/)).toBeNull();
  });

  it('is not on My bids', async () => {
    renderPage('/bidders?section=mine');
    await screen.findByRole('button', { name: 'Alpha' });
    expect(screen.queryByText(/^To review · /)).toBeNull();
  });

  it('opens on the Week view; the View switch writes lens=performance and back to no key', async () => {
    renderPage('/bidders');
    const view = await screen.findByRole('radiogroup', { name: 'View' });
    expect(within(view).getByRole('radio', { name: 'Week' }).getAttribute('aria-checked')).toBe('true');
    expect(await screen.findByRole('columnheader', { name: 'Pay' })).toBeTruthy();
    expect(screen.queryByText(/^Pay is counted per pay week/)).toBeNull();
    expect(api.getBidInsights).not.toHaveBeenCalled();
    fireEvent.click(within(view).getByRole('radio', { name: 'Performance' }));
    expect(new URLSearchParams(seen.search).get('lens')).toBe('performance');
    expect(await screen.findByRole('columnheader', { name: 'Days at 50+' })).toBeTruthy();
    expect(screen.queryByRole('columnheader', { name: 'Pay' })).toBeNull();
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'View' })).getByRole('radio', { name: 'Week' }));
    expect(new URLSearchParams(seen.search).has('lens')).toBe(false);
  });

  it('a month hides Pay and points to the Pay tab, keeping the range', async () => {
    renderPage('/bidders?range=this_month');
    expect(await screen.findByText('Pay is counted per pay week — see the Pay tab.')).toBeTruthy();
    expect(screen.queryByRole('columnheader', { name: 'Pay' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open Pay tab' }));
    const q = new URLSearchParams(seen.search);
    expect(q.get('section')).toBe('pay');
    expect(q.get('range')).toBe('this_month');
    await waitFor(() => expect(api.getBidPay).toHaveBeenCalledWith({ period: 'month', ownerId: 'u1' }));
  });

  it("the row's Pending badge opens the review over the list and Close returns to the list", async () => {
    renderPage('/bidders');
    fireEvent.click(await screen.findByRole('button', { name: 'Review 3 pending bids of Ana' }));
    const q = new URLSearchParams(seen.search);
    expect(q.get('mode')).toBe('focus');
    expect(q.get('review')).toBe('range');
    expect(q.get('reviewBidder')).toBe('b1');
    expect(q.has('bidder')).toBe(false);
    expect(await shownScope()).toEqual({ queue: { period: 'week', ownerId: 'u1', bidderId: 'b1' } });
    closeReview();
    expect(seen.search).toBe('');
    expect(await screen.findByRole('button', { name: 'Ana' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '← Bidders' })).toBeNull();
  });

  it('To review › Review all walks every pending bid of the owner', async () => {
    renderPage('/bidders');
    fireEvent.click(within(await toReview()).getByRole('button', { name: 'Review all' }));
    expect(await shownScope()).toEqual({ queue: { period: 'all', ownerId: 'u1' } });
    closeReview();
    expect(seen.search).toBe('');
  });

  it("a bidder's chip walks every pending bid of that bidder over the list", async () => {
    renderPage('/bidders');
    fireEvent.click(within(await toReview()).getByRole('button', { name: 'Ana 3' }));
    expect(new URLSearchParams(seen.search).has('bidder')).toBe(false);
    expect(await shownScope()).toEqual({ queue: { period: 'all', ownerId: 'u1', bidderId: 'b1' } });
    closeReview();
    expect(seen.search).toBe('');
  });

  it("Review today uses the server's today", async () => {
    renderPage('/bidders');
    fireEvent.click(within(await toReview()).getByRole('button', { name: 'Review today (1)' }));
    expect(seen.search).toContain('review=day&at=2026-11-25');
    expect(await shownScope()).toEqual({ queue: { period: 'day', date: '2026-11-25', ownerId: 'u1' } });
  });

  it("an old focus link opens that week's review", async () => {
    renderPage('/bidders?mode=focus&week=2026-11-22');
    expect(await shownScope()).toEqual({ queue: { period: 'week', date: '2026-11-22', ownerId: 'u1' } });
  });

  it("the bidder page's tile reviews that bidder's pay week, whoever owns it, and Close returns to the page", async () => {
    api.bidsWeek.mockResolvedValue(board());
    renderPage('/bidders?bidder=b1');
    fireEvent.click(await screen.findByRole('button', { name: 'Review' }));
    const q = new URLSearchParams(seen.search);
    expect(q.get('bidder')).toBe('b1');
    expect(q.get('review')).toBe('week');
    expect(q.get('at')).toBe('2026-11-29');
    expect(q.has('reviewBidder')).toBe(false);
    // The bidder's own owner (Ruling 4): no ownerId from the bar.
    expect(await shownScope()).toEqual({ queue: { period: 'week', date: '2026-11-29', bidderId: 'b1' } });
    closeReview();
    // Back to the exact origin entry (the tile's `week` was only on the review's entry).
    await waitFor(() => expect(seen.search).toBe('?bidder=b1'));
    expect(screen.queryByTestId('focus')).toBeNull();
  });

  it('Close from a Pay review returns to Pay', async () => {
    renderPage('/bidders?section=pay&mode=focus&review=all');
    expect(await shownScope()).toEqual({ queue: { period: 'all', ownerId: 'u1' } });
    closeReview();
    expect(seen.search).toBe('?section=pay');
  });

  it('Close after an in-app open steps back to the origin; Back then leaves the page, never reopening the review', async () => {
    renderPage('/bidders', ['/accounts']);
    fireEvent.click(within(await toReview()).getByRole('button', { name: 'Review all' }));
    await shownScope();
    closeReview();
    await waitFor(() => expect(seen.search).toBe(''));
    expect(seen.pathname).toBe('/bidders');
    expect(screen.queryByTestId('focus')).toBeNull();
    act(() => seen.navigate!(-1));
    await waitFor(() => expect(seen.pathname).toBe('/accounts'));
    expect(screen.queryByTestId('focus')).toBeNull();
  });

  it('Close after an in-app open from the bidder page steps back to that page', async () => {
    api.bidsWeek.mockResolvedValue(board());
    renderPage('/bidders?bidder=b1', ['/accounts']);
    fireEvent.click(await screen.findByRole('button', { name: 'Review' }));
    await shownScope();
    closeReview();
    await waitFor(() => expect(seen.search).toBe('?bidder=b1'));
    act(() => seen.navigate!(-1));
    await waitFor(() => expect(seen.pathname).toBe('/accounts'));
  });

  it("a deep link's Close replaces its entry with the origin", async () => {
    renderPage('/bidders?mode=focus&review=all', ['/accounts']);
    await shownScope();
    closeReview();
    expect(seen.search).toBe('');
    expect(seen.pathname).toBe('/bidders');
    act(() => seen.navigate!(-1));
    await waitFor(() => expect(seen.pathname).toBe('/accounts'));
    expect(screen.queryByTestId('focus')).toBeNull();
  });

  it("a failed backlog says so and retries, it doesn't vanish", async () => {
    api.getBidBacklog.mockRejectedValueOnce(new Error('boom'));
    renderPage('/bidders');
    expect(await screen.findByText(/Couldn.t load To review/)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await toReview()).toBeTruthy();
  });

  it('nothing pending hides the block', async () => {
    api.getBidBacklog.mockResolvedValue({ today: '2026-11-25', total: 0, todayCount: 0, oldestDay: null, bidders: [] });
    renderPage('/bidders');
    await screen.findByRole('button', { name: 'Ana' });
    await waitFor(() => expect(api.getBidBacklog).toHaveBeenCalled());
    expect(screen.queryByText(/^To review · /)).toBeNull();
  });
});

describe("a bidder's page", () => {
  it("is titled with the bidder's name; an old tab=history link opens Past weeks; ← Bidders drops the week", async () => {
    api.bidsWeek.mockResolvedValue(board());
    api.bidderReports.mockResolvedValue({ reports: [] });
    renderPage('/bidders?bidder=b1&week=2026-11-22&day=2026-11-23&tab=history');
    expect(await screen.findByRole('heading', { level: 1, name: 'Ana' })).toBeTruthy();
    expect(document.title).toBe('Ana · Engineer');
    expect(screen.getByRole('tab', { name: 'Past weeks' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByRole('tab', { name: 'Days' }));
    expect(new URLSearchParams(seen.search).has('tab')).toBe(false);
    fireEvent.click(screen.getAllByRole('button', { name: 'Bidders' })[0]);
    expect(seen.search).toBe('');
  });

  it('the header steps the pay week with the server days', async () => {
    api.bidsWeek.mockResolvedValue(board());
    renderPage('/bidders?bidder=b1');
    fireEvent.click(await screen.findByRole('button', { name: 'Previous week' }));
    expect(new URLSearchParams(seen.search).get('week')).toBe('2026-11-22');
  });
});

describe('the review overlay', () => {
  it("an old pay-week review link opens the admin's own queue, and Close leaves it", async () => {
    renderPage('/bidders?mode=focus&week=2026-11-29');
    const stub = await screen.findByTestId('focus');
    expect(JSON.parse(stub.firstChild!.textContent!)).toEqual({ queue: { period: 'week', date: '2026-11-29', ownerId: 'u1' } });
    fireEvent.click(within(stub).getByRole('button', { name: 'Close' }));
    expect(seen.search).toBe('?week=2026-11-29');
  });

  it('waits for the signed-in user', async () => {
    auth.user = null;
    renderPage('/bidders?mode=focus&week=2026-11-29');
    await waitFor(() => expect(api.getBidClock).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByTestId('focus')).toBeNull();
  });
});

describe('My bids panel names', () => {
  const openAlpha = async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'Alpha' }));
    await waitFor(() => expect(api.listBids).toHaveBeenCalled());
  };

  it("an admin's own bids are not named", async () => {
    renderPage('/bidders?section=mine');
    await openAlpha();
    expect(await screen.findByText('Your own bids from Bid Track')).toBeTruthy();
    expect(screen.queryByText(/Pat's own bids/)).toBeNull();
  });

  it('staff bids are not named', async () => {
    auth.user = { id: 'u3', role: 'user' };
    api.getBidPerformance.mockResolvedValue(perf({ id: 'u3', name: 'Sam' }));
    renderPage('/bidders?section=mine');
    await openAlpha();
    expect(await screen.findByText('Your own bids from Bid Track')).toBeTruthy();
    expect(screen.queryByText(/Sam's own bids/)).toBeNull();
  });

  it("another owner's bids are named", async () => {
    api.getBidPerformance.mockResolvedValue(perf({ id: 'u2', name: 'Zed' }));
    renderPage('/bidders?section=mine&owner=u2');
    await openAlpha();
    expect(await screen.findByText("Zed's own bids from Bid Track")).toBeTruthy();
    expect(api.listBids.mock.calls[0][0]).toMatchObject({ self: true, ownerId: 'u2', accountId: 'p1' });
  });

  it("All owners names other owners' bids, not the admin's own", async () => {
    const zed = perf({ id: 'u2', name: 'Zed' }).selfRows[0];
    api.getBidPerformance.mockResolvedValue({ ...perf(), selfRows: [...perf().selfRows, zed] });
    const openIn = async (name: string) => {
      const block = (await screen.findByRole('heading', { name })).parentElement!;
      fireEvent.click(within(block).getByRole('button', { name: 'Alpha' }));
      await waitFor(() => expect(api.listBids).toHaveBeenCalled());
    };
    renderPage('/bidders?section=mine&owner=all');
    await openIn('Pat');
    expect(await screen.findByText('Your own bids from Bid Track')).toBeTruthy();
    expect(screen.queryByText(/Pat's own bids/)).toBeNull();
    cleanup();
    api.listBids.mockClear();
    renderPage('/bidders?section=mine&owner=all');
    await openIn('Zed');
    expect(await screen.findByText("Zed's own bids from Bid Track")).toBeTruthy();
  });
});
