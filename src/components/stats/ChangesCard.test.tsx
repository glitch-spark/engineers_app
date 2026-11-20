// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { SWRConfig } from 'swr';
import ChangesCard from './ChangesCard';

const getChanges = vi.fn();
vi.mock('../../api/endpoints', async (orig) => ({ ...(await orig<object>()), getChanges: (...a: unknown[]) => getChanges(...a) }));
const params = { period: 'month' as const, date: '2026-11-01', region: 'all' as const };
const show = (user = '') => render(<SWRConfig value={{ provider: () => new Map() }}><ChangesCard params={params} user={user} /></SWRConfig>);
const base = { label: 'L', subject: { userId: 'me', name: 'Me' } };

beforeEach(() => { getChanges.mockReset(); });
afterEach(cleanup);

describe('ChangesCard', () => {
  it('renders profiles with badge and suggestion bullets', async () => {
    getChanges.mockResolvedValue({ ...base, profiles: [
      { accountId: 'a1', name: 'Alpha', grade: 'dead', suggestions: [{ pattern: 'dead', text: 'Stop bidding on Alpha.', evidence: {} }, { pattern: 'slow', text: 'Replies are slow.', evidence: {} }] },
      { accountId: 'a2', name: 'Beta', grade: 'watch', suggestions: [{ pattern: 'low_scores', text: 'Scores are low.', evidence: {} }] },
    ] });
    show('u7');
    expect(await screen.findByText('What to change')).toBeTruthy();
    expect(screen.getByText('Alpha')).toBeTruthy();
    expect(screen.getByText('⛔ Dead')).toBeTruthy();
    expect(screen.getByText('⚠ Watch')).toBeTruthy();
    expect(screen.getAllByRole('listitem').map((l) => l.textContent)).toEqual(['Stop bidding on Alpha.', 'Replies are slow.', 'Scores are low.']);
    expect(getChanges).toHaveBeenCalledWith({ ...params, user: 'u7' });
  });

  it('shows the empty state when no profile has suggestions', async () => {
    getChanges.mockResolvedValue({ ...base, profiles: [] });
    show();
    expect(await screen.findByText('Nothing to change right now — no profile shows a clear problem in this period.')).toBeTruthy();
  });

  it('shows an error', async () => {
    getChanges.mockRejectedValue(new Error('x'));
    show();
    expect(await screen.findByText(/Couldn’t load/)).toBeTruthy();
  });
});
