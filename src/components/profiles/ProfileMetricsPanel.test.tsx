// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { SWRConfig } from 'swr';

const api = vi.hoisted(() => ({ getProfileMetric: vi.fn(), getMetricsBenchmark: vi.fn() }));
vi.mock('../../api/endpoints', () => api);
vi.mock('../../theme/useChartTheme', () => ({ useChartTheme: () => ({}) }));
vi.mock('../../theme/ThemeProvider', () => ({ useTheme: () => ({ theme: 'light' }) }));

import ProfileMetricsPanel from './ProfileMetricsPanel';

const seen = { search: '' };
function Probe() {
  seen.search = useLocation().search;
  return null;
}

function renderPanel(initial: string) {
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <MemoryRouter initialEntries={[initial]}>
        <ProfileMetricsPanel accountId="a1" />
        <Probe />
      </MemoryRouter>
    </SWRConfig>,
  );
}

beforeEach(() => {
  localStorage.clear();
  api.getProfileMetric.mockResolvedValue(new Promise(() => {})); // never settles: only the request matters
  api.getMetricsBenchmark.mockResolvedValue(new Promise(() => {}));
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Metrics tab range', () => {
  it('opens on All time and asks for period=all', async () => {
    renderPanel('/accounts/a1?tab=metrics');
    await waitFor(() => expect(api.getProfileMetric).toHaveBeenCalledWith('a1', { period: 'all' }));
    expect(api.getMetricsBenchmark).toHaveBeenCalledWith({ period: 'all' });
    expect((screen.getByLabelText('Date range') as HTMLSelectElement).value).toBe('all_time');
  });

  it('reads a custom range from the URL next to the page\'s own tab key', async () => {
    renderPanel('/accounts/a1?tab=metrics&range=custom&from=2026-10-01&to=2026-10-20');
    await waitFor(() =>
      expect(api.getProfileMetric).toHaveBeenCalledWith('a1', { period: 'custom', date: '2026-10-01', to: '2026-10-20' }));
    expect(api.getMetricsBenchmark).toHaveBeenCalledWith({ period: 'custom', date: '2026-10-01', to: '2026-10-20' });
  });

  it('writes a picked range to the URL and keeps tab', async () => {
    renderPanel('/accounts/a1?tab=metrics');
    fireEvent.change(screen.getByLabelText('Date range'), { target: { value: 'last_month' } });
    await waitFor(() => expect(seen.search).toBe('?tab=metrics&range=last_month'));
    await waitFor(() =>
      expect(api.getProfileMetric).toHaveBeenLastCalledWith('a1', expect.objectContaining({ period: 'month' })));
  });

  it('a bad range in the URL asks for nothing and shows the bar\'s error', async () => {
    renderPanel('/accounts/a1?tab=metrics&range=custom&from=2026-02-31&to=2026-03-01');
    expect(screen.getByRole('alert').textContent).toBe('Pick both dates.');
    expect(api.getProfileMetric).not.toHaveBeenCalled();
    expect(api.getMetricsBenchmark).not.toHaveBeenCalled();
  });

  it('an unknown range is All time', async () => {
    renderPanel('/accounts/a1?tab=metrics&range=month');
    await waitFor(() => expect(api.getProfileMetric).toHaveBeenCalledWith('a1', { period: 'all' }));
  });
});
