// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SWRConfig } from 'swr';
import type * as Api from '../../api/endpoints';

const api = vi.hoisted(() => ({
  listBids: vi.fn(), bidderReports: vi.fn(), getBidPerformance: vi.fn(), getBidInsights: vi.fn(),
}));
vi.mock('../../api/endpoints', async (orig) => ({ ...(await orig<object>()), ...api }));
vi.mock('../../auth/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1', role: 'staff' } }) }));

import BidderView from './BidderView';

afterEach(cleanup);

const DAYS = ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29'];

const board: Api.BidWeek = {
  week: {
    start: '2026-11-23T02:00:00Z', end: '2026-11-30T02:00:00Z', label: 'Week ending Sun Nov 29', timezone: 'America/Chicago',
    days: DAYS.map((day) => ({
      day, start: `${day}T00:00:00Z`, end: `${day}T23:00:00Z`, isToday: day === '2026-11-23', isFuture: day > '2026-11-23',
    })),
  },
  bidders: [],
  totals: { approved: 10, pending: 3, rejected: 0, pay: 0.6, toReview: 3, days: [] },
};

const row: Api.BidWeekRow = {
  id: 'b1', name: 'Ana', status: 'active', country: null, profileId: 'p1', profileName: 'Dev-A', rate: 0.06,
  ownerId: 'u1', ownerName: 'Pat',
  days: DAYS.map((day) => ({ day, approved: 0, pending: 0, rejected: 0, source: 'records', error: null })),
  week: { approved: 10, pending: 3, rejected: 0, pay: 0.6, toReview: 3, source: 'records', error: null },
};

const bidder: Api.Bidder = {
  _id: 'b1', name: 'Ana', country: null, profileId: 'p1', profileName: 'Dev-A', rate: 0.06, screenshotFolderUrl: '',
  folder: 'ana', status: 'active', username: 'ana', inviteExpiresAt: null, registeredAt: '2026-01-01T00:00:00Z',
  archivedAt: null, createdAt: '2026-01-01T00:00:00Z',
};

function renderView(over: { tab?: string | null; onParam?: () => void; onBack?: () => void } = {}) {
  const onParam = over.onParam ?? vi.fn();
  const onBack = over.onBack ?? vi.fn();
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <MemoryRouter>
        <BidderView
          row={row}
          board={board}
          weekKey="2026-11-29"
          bidder={bidder}
          day={null}
          reviewing={false}
          tab={over.tab ?? null}
          isCurrent
          perfRequest={{ period: 'month', date: '2026-10-01' }}
          week={{ shown: { first: DAYS[0], last: DAYS[6] }, label: 'Week ending Sun Nov 29', isCurrent: true, onChange: vi.fn() }}
          onBack={onBack}
          onParam={onParam}
          onReview={vi.fn()}
          onChanged={vi.fn()}
        />
      </MemoryRouter>
    </SWRConfig>,
  );
  return { onParam, onBack };
}

beforeEach(() => {
  api.listBids.mockResolvedValue({ bids: [], week: '2026-11-29' });
  api.bidderReports.mockResolvedValue({ reports: [] });
  api.getBidPerformance.mockResolvedValue({ label: 'Oct 2026', bidders: [{
    id: 'b1', name: 'Ana', hitDays: 14, weekdays: 21, interviews: 3, per100: 0.8, total: 120, approvalRate: 0.96,
    costPerInterview: 5, lastBidAt: null,
  }] });
  api.getBidInsights.mockResolvedValue({ platform: { per100: 1.5 } });
});

describe('BidderView', () => {
  it('opens with ← Bidders, the status, the profile link and the rate', () => {
    const { onBack } = renderView();
    const first = screen.getAllByRole('button')[0];
    expect(first.textContent?.trim()).toBe('Bidders');
    expect(screen.getAllByRole('button', { name: 'Bidders' })[0]).toBe(first);
    fireEvent.click(first);
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Active · @ana')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Dev-A' }).getAttribute('href')).toBe('/accounts/p1');
    expect(screen.getByText(/\$0\.06 per approved bid/)).toBeTruthy();
  });

  it('has Days and Past weeks tabs; Past weeks has no tiles', () => {
    renderView();
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Days', 'Past weeks']);
    expect(screen.getByText('Approved')).toBeTruthy();
    cleanup();
    renderView({ tab: 'history' });
    expect(screen.getByRole('tab', { name: 'Past weeks' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.queryByText('Approved')).toBeNull();
  });

  it("shows the bidder's performance line under the header on both tabs, for the bidder's own owner", async () => {
    renderView();
    expect(await screen.findByText(/^Oct 2026: 50\+ on 14 of 21 weekdays/)).toBeTruthy();
    expect(api.getBidPerformance).toHaveBeenCalledWith({ period: 'month', date: '2026-10-01', ownerId: 'u1', includeArchived: true });
    cleanup();
    renderView({ tab: 'history' });
    expect(await screen.findByText(/^Oct 2026: 50\+ on 14 of 21 weekdays/)).toBeTruthy();
  });

  it("the Pending tile's Review opens this pay week's review", () => {
    const { onParam } = renderView();
    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    expect(onParam).toHaveBeenCalledWith({ mode: 'focus', review: 'week', at: '2026-11-29', reviewBidder: null, bid: null });
  });
});
