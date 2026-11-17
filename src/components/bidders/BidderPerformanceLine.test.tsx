// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import type * as Api from '../../api/endpoints';
import type { BidderPeriodRequest } from '../../lib/bidderFilters';

const api = vi.hoisted(() => ({ getBidPerformance: vi.fn(), getBidInsights: vi.fn() }));
vi.mock('../../api/endpoints', async (orig) => ({ ...(await orig<object>()), ...api }));

import BidderPerformanceLine from './BidderPerformanceLine';

afterEach(cleanup);

const row = (over: Partial<Api.BidPerformanceRow> = {}) => ({
  id: 'b1', name: 'Ana', hitDays: 14, weekdays: 21, interviews: 3, per100: 0.8, total: 120, approvalRate: 0.96,
  costPerInterview: 5, lastBidAt: null, ...over,
}) as Api.BidPerformanceRow;
const perf = (rows: Api.BidPerformanceRow[]) => ({ label: 'Oct 2026', bidders: rows }) as Api.BidPerformance;
const insights = (per100: number | null) => ({ platform: { per100 } }) as unknown as Api.BidInsights;

function show(request: BidderPeriodRequest = { period: 'month', date: '2026-10-01' }) {
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <BidderPerformanceLine bidderId="b1" ownerId="u7" request={request} />
    </SWRConfig>,
  );
}

beforeEach(() => {
  api.getBidPerformance.mockReset().mockResolvedValue(perf([row(), row({ id: 'b2' })]));
  api.getBidInsights.mockReset().mockResolvedValue(insights(1.5));
});

describe('BidderPerformanceLine', () => {
  it("shows the bidder's period against the platform", async () => {
    show();
    expect(await screen.findByText(
      'Oct 2026: 50+ on 14 of 21 weekdays · 3 interviews (0.80 per 100 ▼ vs the platform) · 96% approved · $5 per interview · last bid —',
    )).toBeTruthy();
  });

  it("asks for the bidder's own owner and the request's period, archived included", async () => {
    show({ period: 'custom', date: '2026-10-05', to: '2026-10-20' });
    await screen.findByText(/^Oct 2026:/);
    expect(api.getBidPerformance).toHaveBeenCalledWith({
      period: 'custom', date: '2026-10-05', to: '2026-10-20', ownerId: 'u7', includeArchived: true,
    });
    expect(api.getBidInsights).toHaveBeenCalledWith({ period: 'custom', date: '2026-10-05', to: '2026-10-20', ownerId: 'u7' });
  });

  it('has no arrow with too few bids to judge, and ▲ when well above the platform', async () => {
    api.getBidPerformance.mockResolvedValue(perf([row({ total: 40 })]));
    show();
    expect((await screen.findByText(/^Oct 2026:/)).textContent).toContain('(0.80 per 100) ·');
    cleanup();
    api.getBidPerformance.mockResolvedValue(perf([row({ per100: 2.4 })]));
    show();
    expect((await screen.findByText(/^Oct 2026:/)).textContent).toContain('(2.40 per 100 ▲ vs the platform)');
  });

  it('shows — for what is unknown', async () => {
    api.getBidPerformance.mockResolvedValue(perf([row({
      hitDays: 0, weekdays: 0, interviews: null, per100: null, approvalRate: null, costPerInterview: null,
    })]));
    show();
    expect((await screen.findByText(/^Oct 2026:/)).textContent).toBe(
      'Oct 2026: 50+ on — weekdays · — interviews (— per 100) · — approved · — per interview · last bid —',
    );
  });

  it('says how long ago the last bid was', async () => {
    api.getBidPerformance.mockResolvedValue(perf([row({ lastBidAt: new Date(Date.now() - 3 * 3_600_000).toISOString() })]));
    show();
    expect((await screen.findByText(/^Oct 2026:/)).textContent).toMatch(/last bid 3h ago$/);
  });

  it('shows a skeleton while loading', () => {
    api.getBidPerformance.mockReturnValue(new Promise(() => {}));
    show();
    expect(screen.getByLabelText('Loading performance')).toBeTruthy();
  });

  it("says so and retries when it can't load", async () => {
    api.getBidPerformance.mockRejectedValueOnce(new Error('boom'));
    show();
    expect(await screen.findByText(/Couldn't load performance\./)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.getByText(/^Oct 2026:/)).toBeTruthy());
  });
});
