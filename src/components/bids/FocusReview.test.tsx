// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SWRConfig, useSWRConfig, type ScopedMutator } from 'swr';
import type { BidReviewItem, PendingBids } from '../../api/endpoints';

vi.mock('../../api/endpoints', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/endpoints')>();
  return { ...actual, listPendingBids: vi.fn(), bidScreenshots: vi.fn(), getBidClock: vi.fn(), getBid: vi.fn(), reviewBid: vi.fn() };
});

import * as api from '../../api/endpoints';
import FocusReview from './FocusReview';

const listPendingBids = vi.mocked(api.listPendingBids);
const bidScreenshots = vi.mocked(api.bidScreenshots);
const getBidClock = vi.mocked(api.getBidClock);

// Wed Nov 18, 2026: the long pay week Sun Nov 15 .. Sun Nov 22. AFTER: past the Sunday 8 pm cutoff, the next pay week.
const CLOCK = {
  today: '2026-11-18', payWeekStart: '2026-11-15', payWeekEnd: '2026-11-22', previousPayWeekStart: '2026-11-08',
  timezone: 'America/Chicago',
};
const AFTER = {
  today: '2026-11-23', payWeekStart: '2026-11-23', payWeekEnd: '2026-11-29', previousPayWeekStart: '2026-11-15',
  timezone: 'America/Chicago',
};

function pendingBid(id: string, extra: Partial<BidReviewItem> = {}): BidReviewItem {
  return {
    id,
    kind: 'bidder',
    bidderId: 'b1',
    bidderName: 'Ana',
    jobUrl: `https://jobs.example.com/${id}`,
    jobTitle: `Job ${id}`,
    firstAt: '2026-11-24T15:00:00Z',
    submittedAt: '2026-11-24T15:05:00Z',
    screenshotCount: 0,
    missingUploads: 0,
    status: 'pending',
    reviewedByName: null,
    reviewedAt: null,
    note: null,
    changedSinceReview: false,
    jobDomain: 'jobs.example.com',
    durationSec: 300,
    profileName: null,
    resumeNames: [],
    tailoredResumeName: null,
    rejectReason: null,
    thumbUrl: null,
    ...extra,
  };
}

const page = (bids: BidReviewItem[]): PendingBids => ({
  label: 'Week ending Sun Nov 29',
  timezone: 'America/Chicago',
  bidderName: null,
  bids,
});

let swrMutate: ScopedMutator | null = null;
function GrabMutate() {
  swrMutate = useSWRConfig().mutate;
  return null;
}

function renderReview(extra: Partial<React.ComponentProps<typeof FocusReview>> = {}) {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <GrabMutate />
      <FocusReview scope={{ queue: { period: 'week' } }} set="pending" onExit={() => {}} {...extra} />
    </SWRConfig>,
  );
}

beforeEach(() => {
  listPendingBids.mockResolvedValue(page([pendingBid('x1')]));
  bidScreenshots.mockResolvedValue([]);
  getBidClock.mockResolvedValue(CLOCK);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  swrMutate = null;
});

describe('FocusReview over a server queue', () => {
  it("shows the server's label", async () => {
    renderReview();
    await screen.findByText('Week ending Sun Nov 29 · All bidders');
    expect(listPendingBids).toHaveBeenCalledTimes(1);
    const q = listPendingBids.mock.calls[0][0];
    expect(q.period).toBe('week');
    expect(q.since).toMatch(/Z$/);
  });

  it("freezes a dateless week queue on the clock's pay week for the whole visit", async () => {
    renderReview();
    await screen.findByText('Job x1');
    expect(listPendingBids.mock.calls[0][0].date).toBe('2026-11-15');
    getBidClock.mockResolvedValue(AFTER);
    await act(async () => {
      await swrMutate!((key) => Array.isArray(key) && key[0] === 'bid-clock');
      await swrMutate!((key) => Array.isArray(key) && key[0] === 'bid-focus');
    });
    await waitFor(() => expect(listPendingBids).toHaveBeenCalledTimes(2));
    expect(listPendingBids.mock.calls[1][0].date).toBe('2026-11-15');
  });

  it("freezes a dateless day queue on the clock's today", async () => {
    renderReview({ scope: { queue: { period: 'day' } } });
    await screen.findByText('Job x1');
    expect(listPendingBids.mock.calls[0][0].date).toBe('2026-11-18');
  });

  it('keeps a given date and needs no clock for range or all', async () => {
    renderReview({ scope: { queue: { period: 'all' } } });
    await screen.findByText('Job x1');
    expect(listPendingBids.mock.calls[0][0].date).toBeUndefined();
  });

  it('says so when a refresh drops the shown bid, and moves to the next pending one', async () => {
    listPendingBids
      .mockResolvedValueOnce(page([pendingBid('x1'), pendingBid('x2', { firstAt: '2026-11-24T16:00:00Z' })]))
      .mockResolvedValueOnce(page([pendingBid('x2', { firstAt: '2026-11-24T16:00:00Z' })]));
    renderReview();
    await screen.findByText('Job x1');
    await act(async () => {
      await swrMutate!((key) => Array.isArray(key) && key[0] === 'bid-focus');
    });
    await screen.findByText('Job x2');
    expect(screen.getByRole('alert').textContent).toContain('No longer in this queue');
  });

  it('the scope switch reports the pick', async () => {
    const onChange = vi.fn();
    renderReview({ scopeSwitch: { value: 'week', onChange } });
    await screen.findByText('Job x1');
    expect(screen.getByRole('radiogroup', { name: 'Review' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'This pay week' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: 'Today' }).getAttribute('aria-checked')).toBe('false');
    fireEvent.click(screen.getByRole('radio', { name: 'Today' }));
    expect(onChange).toHaveBeenCalledWith('today');
  });

  it('checks no option when the scope is not one of them', async () => {
    renderReview({ scopeSwitch: { value: null, onChange: vi.fn() } });
    await screen.findByText('Job x1');
    for (const r of screen.getAllByRole('radio')) expect(r.getAttribute('aria-checked')).toBe('false');
  });

  it('keeps the shown bid when a refresh says it was decided', async () => {
    listPendingBids
      .mockResolvedValueOnce(page([pendingBid('x1')]))
      .mockResolvedValueOnce(page([pendingBid('x1', { status: 'approved', reviewedByName: 'Kim' })]));
    renderReview();
    await screen.findByText('Job x1');
    await act(async () => {
      await swrMutate!((key) => Array.isArray(key) && key[0] === 'bid-focus');
    });
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Changed by Kim to approved'));
    expect(screen.getByText('Job x1')).toBeTruthy();
    expect(listPendingBids).toHaveBeenCalledTimes(2);
  });

  it('says no pending bids are left, with the label', async () => {
    listPendingBids.mockResolvedValue(page([]));
    renderReview();
    await screen.findByText('No pending bids left · Week ending Sun Nov 29');
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
  });
});
