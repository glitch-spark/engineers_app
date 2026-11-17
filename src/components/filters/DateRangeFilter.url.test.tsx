// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import DateRangeFilter from './DateRangeFilter';
import { presetOptions, type DatePreset } from '../../lib/dateRange';
import { useUrlFilters } from '../../lib/useUrlFilters';

afterEach(cleanup);

const TODAY = '2026-11-14';
const DEFAULTS = { range: 'this_week', from: '', to: '', q: '', page: '1' };
const seen = { search: '' };
let latestValues = DEFAULTS;

function Probe() {
  seen.search = useLocation().search;
  return null;
}

/** The wiring every page will write: the filter's value goes straight into the URL hook. */
function Page() {
  const [f, patch] = useUrlFilters(DEFAULTS);
  latestValues = f;
  return (
    <DateRangeFilter
      value={{ preset: f.range as DatePreset, from: f.from, to: f.to }}
      onChange={(v) => patch({ range: v.preset, from: v.from, to: v.to })}
      presets={presetOptions()}
      allowFuture={false}
      today={TODAY}
    />
  );
}

const select = () => screen.getByLabelText('Date range') as HTMLSelectElement;
const pick = (preset: string) => fireEvent.change(select(), { target: { value: preset } });

function renderPage(initial: string) {
  render(
    <MemoryRouter initialEntries={[`/${initial}`]}>
      <Probe />
      <Page />
    </MemoryRouter>,
  );
}

describe('DateRangeFilter wired to useUrlFilters', () => {
  it('drops from/to from the URL when a preset is picked after Custom', () => {
    renderPage('');
    pick('custom');
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-10-09' } });
    const params = new URLSearchParams(seen.search);
    expect(params.get('range')).toBe('custom');
    expect(params.get('from')).toBe('2026-10-01');
    expect(params.get('to')).toBe('2026-10-09');

    pick('this_week');
    expect(seen.search).toBe('');
    expect(latestValues).toEqual(DEFAULTS);

    pick('last_month');
    expect(seen.search).toBe('?range=last_month');
    expect(latestValues).toEqual({ ...DEFAULTS, range: 'last_month' });
  });

  it('drops from/to when stepping from Custom lands on a preset', () => {
    renderPage('?range=custom&from=2026-11-02&to=2026-11-08');
    fireEvent.click(screen.getByRole('button', { name: 'Next period' }));
    expect(seen.search).toBe('');
    expect(latestValues).toEqual(DEFAULTS);
  });

  it('writes from/to when Custom is picked from all_time (no stale or undefined values)', () => {
    renderPage('?range=all_time');
    // all_time is not offered, so the dropdown shows no selection; Custom has no range to seed from.
    pick('custom');
    expect(seen.search).toBe('?range=custom');
    expect(latestValues).toEqual({ ...DEFAULTS, range: 'custom' });
  });
});
