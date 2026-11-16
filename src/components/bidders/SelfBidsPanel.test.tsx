// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import * as api from '../../api/endpoints';
import SelfBidsPanel from './SelfBidsPanel';

vi.mock('../../api/endpoints', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/endpoints')>();
  return { ...actual, listBids: vi.fn() };
});

afterEach(cleanup);

const weekListing = { day: null, week: '2026-11-29', start: 'a', end: 'b', timezone: 'UTC', bids: [], summary: {} };

describe('SelfBidsPanel', () => {
  it('shows a pay week without review parts', async () => {
    vi.mocked(api.listBids).mockResolvedValue(weekListing as never);
    render(<SelfBidsPanel scope={{ ownerId: 'o1', profileName: 'Alpha', week: '2026-11-29' }} onClose={() => undefined} />);
    expect(await screen.findByText('No bids in this period')).toBeTruthy();
    expect(screen.queryByRole('columnheader', { name: 'Status' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Status' })).toBeNull();
    expect(document.body.textContent).toContain('My bids · Alpha · Week ending Sun Nov 29');
    expect(screen.getByText('Your own bids from Bid Track')).toBeTruthy();
  });

  it("names the owner when an admin views another owner's bids", async () => {
    vi.mocked(api.listBids).mockResolvedValue(weekListing as never);
    render(<SelfBidsPanel scope={{ ownerId: 'o1', ownerName: 'Pedro', profileName: 'Alpha', day: '2026-11-24' }} onClose={() => undefined} />);
    expect(await screen.findByText("Pedro's own bids from Bid Track")).toBeTruthy();
    expect(document.body.textContent).toContain('My bids · Pedro · Alpha · Tue Nov 24');
  });

  it('says … while a pay week loads', () => {
    vi.mocked(api.listBids).mockReturnValue(new Promise(() => undefined));
    render(<SelfBidsPanel scope={{ ownerId: 'o9', week: '2026-11-29' }} onClose={() => undefined} />);
    expect(document.body.textContent).toContain('Week ending …');
  });
});
