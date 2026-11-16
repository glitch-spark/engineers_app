// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type * as api from '../../api/endpoints';
import ToReviewBlock from './ToReviewBlock';

const BACKLOG: api.BidBacklog = {
  today: '2026-11-25', total: 18, todayCount: 6, oldestDay: '2026-11-09',
  bidders: [
    { bidderId: 'b1', name: 'Ana', ownerName: 'Pat', pending: 12, oldestDay: '2026-11-09' },
    { bidderId: 'b2', name: 'Raj', ownerName: 'Zed', pending: 6, oldestDay: '2026-11-20' },
  ],
};

afterEach(cleanup);

describe('ToReviewBlock', () => {
  it('says how many bids wait (all, any age) and since when, as a status, not an alert', () => {
    render(<ToReviewBlock backlog={BACKLOG} allOwners={false} onReview={vi.fn()} />);
    expect(screen.getByRole('status').textContent).toContain('To review · 18 pending (all, any age) · oldest Mon Nov 9');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'Ana 12' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Raj 6' })).toBeTruthy();
  });

  it('Review today walks the server today', () => {
    const onReview = vi.fn();
    render(<ToReviewBlock backlog={BACKLOG} allOwners={false} onReview={onReview} />);
    fireEvent.click(screen.getByRole('button', { name: 'Review today (6)' }));
    expect(onReview).toHaveBeenCalledWith({ kind: 'day', day: '2026-11-25' });
  });

  it("a bidder's chip walks every pending bid of that bidder", () => {
    const onReview = vi.fn();
    render(<ToReviewBlock backlog={BACKLOG} allOwners={false} onReview={onReview} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ana 12' }));
    expect(onReview).toHaveBeenCalledWith({ kind: 'all' }, 'b1');
  });

  it('Review all walks every pending bid', () => {
    const onReview = vi.fn();
    render(<ToReviewBlock backlog={BACKLOG} allOwners={false} onReview={onReview} />);
    fireEvent.click(screen.getByRole('button', { name: 'Review all' }));
    expect(onReview).toHaveBeenCalledWith({ kind: 'all' });
  });

  it('All owners names each chip owner', () => {
    render(<ToReviewBlock backlog={BACKLOG} allOwners onReview={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Ana · Pat 12' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Raj · Zed 6' })).toBeTruthy();
  });

  it('no Review today when nothing of today waits', () => {
    render(<ToReviewBlock backlog={{ ...BACKLOG, todayCount: 0 }} allOwners={false} onReview={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Review today/ })).toBeNull();
  });

  it('nothing pending renders nothing', () => {
    const { container } = render(
      <ToReviewBlock backlog={{ ...BACKLOG, total: 0, todayCount: 0, oldestDay: null, bidders: [] }} allOwners={false} onReview={vi.fn()} />,
    );
    expect(container.innerHTML).toBe('');
  });
});
