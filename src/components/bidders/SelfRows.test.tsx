// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { SelfBidRow } from '../../api/endpoints';
import { SelfRows, type OpenSelf } from './BiddersTable';

afterEach(cleanup);

const cols = [
  { key: 'd1', label: 'Mon', sub: 'Nov 16', day: '2026-11-16', isFuture: false },
  { key: 'd2', label: 'Tue', sub: 'Nov 17', day: '2026-11-17', isFuture: false },
] as Parameters<typeof SelfRows>[0]['cols'];

const twoProfiles: SelfBidRow = {
  ownerId: 'o1', ownerName: 'Pedro', total: 7, weekly: [3, 4], interviews: 1, lastBidAt: null,
  profiles: [
    { accountId: 'a1', name: 'Alpha', total: 5, weekly: [1, 4], interviews: 1 },
    { accountId: 'a2', name: 'Zeta', total: 2, weekly: [2, 0], interviews: 0 },
  ],
};

function renderRows(rows: SelfBidRow[], onOpenSelf: OpenSelf = vi.fn()) {
  render(
    <table>
      <tbody>
        <SelfRows rows={rows} cols={cols} showOwner={false} now={Date.now()} onOpenSelf={onOpenSelf} />
      </tbody>
    </table>,
  );
  return onOpenSelf;
}

describe('SelfRows', () => {
  it('splits an owner with several profiles into a sub-row per profile, open by default', () => {
    renderRows([twoProfiles]);
    expect(screen.getByRole('button', { name: 'Alpha' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Zeta' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Self, Alpha, Tue Nov 17: 4 applies' })).toBeTruthy();
    expect(screen.getByText(/2 profiles/)).toBeTruthy();
  });

  it('folds and unfolds the profile sub-rows', () => {
    renderRows([twoProfiles]);
    fireEvent.click(screen.getByRole('button', { name: 'Hide profiles' }));
    expect(screen.queryByRole('button', { name: 'Alpha' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show profiles' }));
    expect(screen.getByRole('button', { name: 'Alpha' })).toBeTruthy();
  });

  it("opens one profile's applies for a day from its sub-row", () => {
    const open = renderRows([twoProfiles]);
    fireEvent.click(screen.getByRole('button', { name: 'Self, Zeta, Mon Nov 16: 2 applies' }));
    expect(open).toHaveBeenCalledWith('o1', 'Pedro', '2026-11-16', { accountId: 'a2', name: 'Zeta' });
  });

  it('names a single profile on the row instead of splitting it', () => {
    renderRows([{ ...twoProfiles, total: 5, weekly: [1, 4], profiles: [twoProfiles.profiles![0]] }]);
    expect(screen.queryByRole('button', { name: 'Hide profiles' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Alpha' })).toBeNull();
    expect(screen.getByText(/· Alpha/)).toBeTruthy();
  });
});
