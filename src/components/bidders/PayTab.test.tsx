// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { BidPay, PayBidderRow, PayWeekBlock } from '../../api/endpoints';

const notify = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('../../lib/notify', () => ({ notify }));

import PayTab from './PayTab';

afterEach(cleanup);

const row = (over: Partial<PayBidderRow> = {}): PayBidderRow => ({
  bidderId: 'b1', name: 'Ana', country: null, profileName: null, ownerId: 'o1', ownerName: 'Pedro',
  approved: 158, pending: 3, rate: 0.06, pay: 9.48, error: null, ...over,
});
const week = (over: Partial<PayWeekBlock> = {}): PayWeekBlock => ({
  weekEnd: '2026-11-29', label: 'Week ending Sun Nov 29', end: '2026-11-30T02:00:00Z', first: '2026-11-23', last: '2026-11-29',
  state: 'closed', source: 'report',
  bidders: [row(), row({ bidderId: 'b2', name: 'Raj', approved: 100, pending: 0, pay: 6 })],
  totals: { approved: 258, pending: 3, pay: 15.48, errors: 0 },
  ...over,
});
const data = (weeks: PayWeekBlock[]): BidPay => ({
  label: 'Week ending Sun Nov 29', timezone: 'America/Chicago', first: '2026-11-23', last: '2026-11-29', weeks,
});

const writeText = vi.fn();
beforeEach(() => {
  writeText.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  notify.success.mockReset();
});

describe('PayTab', () => {
  it('Copy pay summary copies the summary and says so', async () => {
    render(<PayTab data={data([week()])} allOwners={false} onReview={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy pay summary' }));
    expect(writeText).toHaveBeenCalledWith([
      'Pay week ending Sun Nov 29',
      'Ana — 158 approved × $0.06 = $9.48',
      '⚠ Ana: 3 pending — not paid until reviewed',
      'Raj — 100 approved × $0.06 = $6.00',
      'Total $15.48',
    ].join('\n'));
    await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Pay summary copied'));
  });

  it('shows the pending warning, and Review opens that bidder in that pay week', () => {
    const onReview = vi.fn();
    render(<PayTab data={data([week()])} allOwners={false} onReview={onReview} />);
    expect(screen.getByText('⚠ 3 pending — not paid until reviewed')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^Review / })).toHaveLength(1);
    const review = screen.getByRole('button', { name: /^Review 3 pending bids of / });
    expect(review.textContent).toBe('Review');
    fireEvent.click(review);
    expect(onReview).toHaveBeenCalledWith('2026-11-29', 'b1');
  });

  it('a closed week from the report says it was posted to Slack', () => {
    render(<PayTab data={data([week()])} allOwners={false} onReview={vi.fn()} />);
    const h = screen.getByRole('heading', { level: 3 });
    expect(h.textContent).toBe('Pay week ending Sun Nov 29, 8:00 PM · closed (as posted to Slack)');
  });

  it('a closed week that is a live count says so, without claiming the report is unsaved', () => {
    render(<PayTab data={data([week({ source: 'live' })])} allOwners={false} onReview={vi.fn()} />);
    const text = screen.getByRole('heading', { level: 3 }).textContent ?? '';
    expect(text).toContain('closed (live count)');
    expect(text).not.toMatch(/saved/);
  });

  it('the open week says so far', () => {
    render(<PayTab data={data([week({ state: 'open', source: 'live' })])} allOwners={false} onReview={vi.fn()} />);
    expect(screen.getByRole('heading', { level: 3 }).textContent).toContain('· so far');
  });

  it('lists a block per week in the order served, each with its own Copy button', () => {
    const older = week({ weekEnd: '2026-11-22', label: 'Week ending Sun Nov 22', bidders: [], totals: { approved: 0, pending: 0, pay: 0, errors: 0 } });
    render(<PayTab data={data([week(), older])} allOwners={false} onReview={vi.fn()} />);
    const heads = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(heads[0]).toMatch(/^Pay week ending Sun Nov 29/);
    expect(heads[1]).toMatch(/^Pay week ending Sun Nov 22/);
    expect(screen.getAllByRole('button', { name: 'Copy pay summary' })).toHaveLength(2);
    expect(screen.getByText('No approved or pending bids in this pay week.')).toBeTruthy();
  });

  it('shows the money rows, an error row and a Total', () => {
    const w = week({
      bidders: [row({ pending: 0 }), row({ bidderId: 'b3', name: 'Lee', approved: null, pending: null, pay: null, error: 'x' })],
      totals: { approved: 158, pending: 0, pay: 9.48, errors: 1 },
    });
    render(<PayTab data={data([w])} allOwners={false} onReview={vi.fn()} />);
    expect(screen.getByText('158 approved × $0.06 = $9.48')).toBeTruthy();
    expect(screen.getByText("couldn't read the count")).toBeTruthy();
    expect(screen.getByText('Total')).toBeTruthy();
    expect(screen.getByText('$9.48', { selector: '[data-total]' })).toBeTruthy();
  });

  it('All owners groups the rows under owner headings', () => {
    const w = week({ bidders: [row(), row({ bidderId: 'b2', name: 'Raj', ownerId: 'o2', ownerName: 'Maria', pending: 0, pay: 6 })] });
    render(<PayTab data={data([w])} allOwners onReview={vi.fn()} />);
    expect(screen.getByRole('heading', { level: 4, name: 'Pedro' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 4, name: 'Maria' })).toBeTruthy();
  });

  it('has the help popover and no payment actions', () => {
    render(<PayTab data={data([week()])} allOwners={false} onReview={vi.fn()} />);
    expect(screen.getByRole('button', { name: /What do these numbers mean/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /paid/i })).toBeNull();
  });
});
