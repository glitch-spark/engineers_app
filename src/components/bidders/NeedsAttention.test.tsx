// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type * as api from '../../api/endpoints';
import NeedsAttention from './NeedsAttention';

const ALERTS: api.BidAlerts = {
  asOf: '2026-11-25',
  flags: [
    { bidderId: 'b1', name: 'Raj', kind: 'inactive', detail: { lastBidDay: '2026-11-10' } },
    { bidderId: 'b2', name: 'Ana', kind: 'review_backlog', detail: { pending: 4, oldestDay: '2026-11-09' } },
    { bidderId: 'b4', name: 'Kim', kind: 'no_interviews', detail: { bids: 120, profileId: 'p9', profileName: 'Kim Dev' } },
  ],
  archive: [{ bidderId: 'b3', name: 'Lee', reason: 'idle', since: '2026-10-20' }],
};

function setup(alerts: api.BidAlerts = ALERTS, canArchive = true) {
  const fns = { onOpenBidder: vi.fn(), onOpenProfile: vi.fn(), onArchive: vi.fn() };
  render(<NeedsAttention alerts={alerts} canArchive={canArchive} {...fns} />);
  return fns;
}

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('NeedsAttention', () => {
  it('lists the inactive and no-interview flags, never the review backlog, and is not an alert', () => {
    setup();
    const region = screen.getByRole('region', { name: 'Needs attention' });
    expect(within(region).getByText(/No bids since .*check in with Raj\./)).toBeTruthy();
    expect(within(region).getAllByRole('button', { name: 'Open' })).toHaveLength(2);
    expect(region.textContent).not.toContain('waiting for review');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('Open goes to the bidder, and to the profile for no interviews', () => {
    const f = setup();
    const [rajOpen, kimOpen] = screen.getAllByRole('button', { name: 'Open' });
    fireEvent.click(rajOpen);
    expect(f.onOpenBidder).toHaveBeenCalledWith('b1');
    fireEvent.click(kimOpen);
    expect(f.onOpenProfile).toHaveBeenCalledWith('p9');
  });

  it('shows the unused bidders as one line with an Archive chip each', () => {
    const f = setup();
    const line = screen.getByText('Looks unused:').closest('li') as HTMLElement;
    expect(within(line).getByText(/^Lee · No bids in 2 weeks/)).toBeTruthy();
    fireEvent.click(within(line).getByRole('button', { name: 'Archive' }));
    expect(f.onArchive).toHaveBeenCalledWith('b3', 'Lee');
  });

  it('has no Archive button when the viewer cannot archive', () => {
    setup(ALERTS, false);
    expect(screen.getByText(/^Lee · /)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Archive' })).toBeNull();
  });

  it('the toggle folds the lines, says so with aria-expanded, and remembers it', () => {
    setup();
    const toggle = screen.getByRole('button', { name: 'Needs attention · 3' });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Looks unused:')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open' })).toBeNull();
    expect(localStorage.getItem('bids.attention.open')).toBe('closed');
    fireEvent.click(toggle);
    expect(screen.getByText('Looks unused:')).toBeTruthy();
    expect(localStorage.getItem('bids.attention.open')).toBe('open');
  });

  it('starts folded when it was left folded', () => {
    localStorage.setItem('bids.attention.open', 'closed');
    setup();
    expect(screen.getByRole('button', { name: 'Needs attention · 3' }).getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Looks unused:')).toBeNull();
  });

  it('still works when localStorage throws', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Needs attention · 3' }));
    expect(screen.queryByText('Looks unused:')).toBeNull();
    get.mockRestore();
    set.mockRestore();
  });

  it('renders nothing when only the review backlog or null lists come in', () => {
    const { container } = render(
      <NeedsAttention
        alerts={{ asOf: 'x', flags: [ALERTS.flags![1]], archive: [] }}
        canArchive onOpenBidder={vi.fn()} onOpenProfile={vi.fn()} onArchive={vi.fn()}
      />,
    );
    expect(container.textContent).toBe('');
    cleanup();
    const nulls = render(
      <NeedsAttention
        alerts={{ asOf: 'x', flags: null, archive: null }}
        canArchive onOpenBidder={vi.fn()} onOpenProfile={vi.fn()} onArchive={vi.fn()}
      />,
    );
    expect(nulls.container.textContent).toBe('');
  });
});
