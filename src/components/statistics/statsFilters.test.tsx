// @vitest-environment jsdom
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { StatsFilterBar, useStatsFilters, type StatsTab } from './statsFilters';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 14, 12, 0, 0)); // Sat Nov 14, 2026, local
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const seen = { search: '' };
function Probe() {
  seen.search = useLocation().search;
  return null;
}

function setup(initial: string, tab: StatsTab = 'stats', opts?: { noRegion?: boolean }) {
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(MemoryRouter, { initialEntries: [`/statistics${initial}`] }, createElement(Probe), children);
  return renderHook(() => useStatsFilters(tab, opts), { wrapper });
}

describe('useStatsFilters requests', () => {
  it('defaults to this month, all regions: a month report for Nov 1', () => {
    const { result } = setup('');
    expect(result.current.params).toEqual({ period: 'month', date: '2026-11-01', region: 'all' });
    expect(result.current.canClear).toBe(false);
  });

  it('sends the server the period contract for each preset', () => {
    const cases: [string, object][] = [
      ['this_week', { period: 'week', date: '2026-11-09' }],
      ['last_week', { period: 'week', date: '2026-11-02' }],
      ['last_2_weeks', { period: 'custom', date: '2026-10-26', to: '2026-11-08' }],
      ['last_month', { period: 'month', date: '2026-10-01' }],
      ['this_month', { period: 'month', date: '2026-11-01' }],
      ['this_year', { period: 'custom', date: '2026-01-01', to: '2026-11-14' }],
    ];
    for (const [range, expected] of cases) {
      expect(setup(`?range=${range}`).result.current.params).toEqual({ ...expected, region: 'all' });
    }
  });

  it('sends a custom range as custom, and nothing for an invalid or partial one', () => {
    expect(setup('?range=custom&from=2026-10-01&to=2026-10-09').result.current.params).toEqual(
      { period: 'custom', date: '2026-10-01', to: '2026-10-09', region: 'all' },
    );
    expect(setup('?range=custom&from=2026-10-01').result.current.params).toBeNull();
    expect(setup('?range=custom&from=2026-10-09&to=2026-10-01').result.current.params).toBeNull();
    expect(setup('?range=custom&from=2026-10-01&to=2026-10-01').result.current.rangeError).toBeNull();
  });

  it('maps the region and ignores values the endpoints do not take', () => {
    expect(setup('?region=Latam').result.current.params?.region).toBe('Latam');
    expect(setup('?region=EU').result.current.params?.region).toBe('EU');
    expect(setup('?region=Canada').result.current.params?.region).toBe('all');
    expect(setup('?region=Latam').result.current.canClear).toBe(true);
  });

  it('shows the default for a preset this tab does not offer (AI usage carried Today over)', () => {
    const { result } = setup('?range=today');
    expect(result.current.value.preset).toBe('this_month');
    expect(result.current.params?.period).toBe('month');
    expect(result.current.canClear).toBe(false);
    expect(setup('?range=today', 'ai').result.current.value.preset).toBe('today');
  });
});

describe('Clear', () => {
  it('a carried-over region does not make Clear available on a tab that hides Region', () => {
    expect(setup('?region=EU', 'stats', { noRegion: true }).result.current.canClear).toBe(false);
    expect(setup('?region=EU&range=last_week', 'stats', { noRegion: true }).result.current.canClear).toBe(true);
  });

  it('on a report tab resets region and range but leaves AI usage and search keys alone', () => {
    const { result } = setup('?region=EU&range=last_week&users=a,b&q=acme');
    expect(result.current.canClear).toBe(true);
    act(() => result.current.clear());
    expect(new URLSearchParams(seen.search).toString()).toBe('users=a%2Cb&q=acme');
  });

  it('on Resume compare also clears the search', () => {
    const { result } = setup('?region=EU&q=acme&users=a', 'resume');
    act(() => result.current.clear());
    expect(new URLSearchParams(seen.search).toString()).toBe('users=a');
  });

  it('on AI usage clears the multiselects and range but keeps the region', () => {
    const { result } = setup('?region=EU&range=today&users=a&features=resume&models=m', 'ai');
    expect(result.current.canClear).toBe(true);
    act(() => result.current.clear());
    expect(new URLSearchParams(seen.search).toString()).toBe('region=EU');
  });

  it('leaves the Viewing choice (user) alone', () => {
    const { result } = setup('?region=EU&user=u7');
    act(() => result.current.clear());
    expect(seen.search).toBe('?user=u7');
    expect(setup('?user=u7').result.current.canClear).toBe(false);
    expect(setup('').result.current.values.user).toBe('');
  });

  it('is only offered when something differs from the default', () => {
    expect(setup('?users=a').result.current.canClear).toBe(false);
    expect(setup('?users=a', 'ai').result.current.canClear).toBe(true);
    expect(setup('?q=acme').result.current.canClear).toBe(false);
    expect(setup('?q=acme', 'resume').result.current.canClear).toBe(true);
  });
});

describe('StatsFilterBar', () => {
  function Bar({ tab }: { tab: StatsTab }) {
    const f = useStatsFilters(tab);
    return createElement(StatsFilterBar, { f });
  }
  const renderBar = (initial: string, tab: StatsTab) =>
    render(
      createElement(MemoryRouter, { initialEntries: [`/statistics${initial}`] }, createElement(Probe), createElement(Bar, { tab })),
    );

  it('offers the Statistics regions and the standard presets, plus Today/Yesterday on AI usage', () => {
    renderBar('', 'stats');
    const region = screen.getByLabelText('Region') as HTMLSelectElement;
    expect([...region.options].map((o) => o.text)).toEqual(['All', 'LATAM', 'EU', 'US']);
    const range = screen.getByLabelText('Date range') as HTMLSelectElement;
    expect([...range.options].map((o) => o.text)).toEqual(
      ['This week', 'Last week', 'Last 2 weeks', 'Last month', 'This month', 'This year', 'Custom'],
    );
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull();
    expect(screen.queryByRole('searchbox')).toBeNull();
    cleanup();
    renderBar('', 'ai');
    expect(screen.queryByLabelText('Region')).toBeNull();
    expect([...(screen.getByLabelText('Date range') as HTMLSelectElement).options].map((o) => o.text)).toEqual(
      ['This week', 'Last week', 'Last 2 weeks', 'Last month', 'This month', 'This year', 'Today', 'Yesterday', 'Custom'],
    );
  });

  it('writes the selection to the URL and Clear puts the defaults back', () => {
    renderBar('', 'resume');
    fireEvent.change(screen.getByLabelText('Region'), { target: { value: 'US' } });
    fireEvent.change(screen.getByLabelText('Date range'), { target: { value: 'last_week' } });
    expect(seen.search).toBe('?region=US&range=last_week');
    expect(screen.getByPlaceholderText('Search companies…')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(seen.search).toBe('');
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull();
  });

  it('is sticky', () => {
    renderBar('', 'stats');
    expect(screen.getByRole('group', { name: 'Filters' }).className).toContain('sticky');
  });
});
