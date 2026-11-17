// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { SWRConfig } from 'swr';

const api = vi.hoisted(() => ({
  listAccounts: vi.fn(),
  getProfileMetrics: vi.fn(),
  getMetricsBenchmark: vi.fn(),
  lookupUsers: vi.fn(),
}));
vi.mock('../api/endpoints', () => api);
vi.mock('../auth/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1', role: 'user' } }) }));

import AccountsPage from './Accounts';

const seen = { search: '' };
function Probe() {
  seen.search = useLocation().search;
  return null;
}

function renderPage(initial: string) {
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <MemoryRouter initialEntries={[initial]}>
        <AccountsPage />
        <Probe />
      </MemoryRouter>
    </SWRConfig>,
  );
}

const pagination = { page: 1, limit: 20, total: 0, totalPages: 0, hasNext: false, hasPrev: false };

beforeEach(() => {
  localStorage.clear();
  api.listAccounts.mockResolvedValue({ accounts: [], pagination });
  api.getProfileMetrics.mockResolvedValue({ start: '2026-01-01', end: '2026-01-02', weeks: 'all', rows: [] });
  api.getMetricsBenchmark.mockResolvedValue({});
  api.lookupUsers.mockResolvedValue({ users: [] });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Profiles list filters in the URL', () => {
  it('asks for all time, 20 per page and the active profiles by default', async () => {
    renderPage('/accounts');
    await waitFor(() => expect(api.listAccounts).toHaveBeenCalled());
    expect(api.listAccounts).toHaveBeenCalledWith({ page: 1, limit: 20, search: '', status: 'active' });
    await waitFor(() => expect(api.getProfileMetrics).toHaveBeenCalledWith({ weeks: 'all' }));
    expect(screen.getByPlaceholderText('Search profiles…')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull();
  });

  it('reads the filters from the URL', async () => {
    renderPage('/accounts?status=archived&region=Asia&q=ann&size=50&page=2&range=custom&from=2026-01-01&to=2026-01-09');
    await waitFor(() => expect(api.listAccounts).toHaveBeenCalled());
    expect(api.listAccounts).toHaveBeenCalledWith({
      page: 2, limit: 50, search: 'ann', status: 'archived', region: 'Asia',
    });
    expect(screen.getByRole('button', { name: 'Clear' })).toBeTruthy();
  });

  it('a bad range in the URL asks for no metrics, shows the bar\'s error and does not crash', async () => {
    renderPage('/accounts?range=custom&from=2026-02-31&to=2026-03-01');
    await waitFor(() => expect(api.listAccounts).toHaveBeenCalled());
    expect(screen.getByRole('alert').textContent).toBe('Pick both dates.');
    expect(api.getProfileMetrics).not.toHaveBeenCalled();
    expect(api.getMetricsBenchmark).not.toHaveBeenCalled();
  });

  it('an unknown range falls back to All time', async () => {
    renderPage('/accounts?range=bogus&size=7&page=zero');
    await waitFor(() => expect(api.getProfileMetrics).toHaveBeenCalledWith({ weeks: 'all' }));
    expect(api.listAccounts).toHaveBeenCalledWith({ page: 1, limit: 20, search: '', status: 'active' });
  });
});

describe('the range this page used to keep in localStorage', () => {
  it('moves to the URL once, is deleted, and the first request already uses it', async () => {
    localStorage.setItem('profiles.range', JSON.stringify({ preset: 'prev_week', from: '', to: '' }));
    renderPage('/accounts');
    await waitFor(() => expect(api.getProfileMetrics).toHaveBeenCalled());
    expect(api.getProfileMetrics).toHaveBeenCalledTimes(1);
    expect(api.getProfileMetrics.mock.calls[0][0]).not.toEqual({ weeks: 'all' });
    expect(api.getProfileMetrics.mock.calls[0][0]).toHaveProperty('from');
    expect(seen.search).toBe('?range=last_week');
    expect(localStorage.getItem('profiles.range')).toBeNull();
  });

  it('is dropped without changing a URL that already has a range', async () => {
    localStorage.setItem('profiles.range', JSON.stringify({ preset: 'this_year', from: '', to: '' }));
    renderPage('/accounts?range=last_month');
    await waitFor(() => expect(api.getProfileMetrics).toHaveBeenCalled());
    expect(seen.search).toBe('?range=last_month');
    expect(localStorage.getItem('profiles.range')).toBeNull();
  });

  it('survives storage that throws', async () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    try {
      renderPage('/accounts');
      await waitFor(() => expect(api.getProfileMetrics).toHaveBeenCalledWith({ weeks: 'all' }));
    } finally {
      spy.mockRestore();
    }
  });
});
