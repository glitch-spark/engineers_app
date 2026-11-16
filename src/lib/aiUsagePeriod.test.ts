import { describe, expect, it } from 'vitest';
import { aiUsageDates, aiUsageRange, bucketLabel } from './aiUsagePeriod';
import { rangeFor } from './dateRange';

describe('aiUsageRange', () => {
  it('is local midnight of from up to local midnight after to (to exclusive)', () => {
    expect(aiUsageRange({ from: '2026-11-14', to: '2026-11-14' })).toEqual({
      from: new Date(2026, 10, 14).toISOString(),
      to: new Date(2026, 10, 15).toISOString(),
    });
    expect(aiUsageRange({ from: '2026-11-01', to: '2026-11-30' })).toEqual({
      from: new Date(2026, 10, 1).toISOString(),
      to: new Date(2026, 11, 1).toISOString(),
    });
  });

  it('rolls over a year end', () => {
    expect(aiUsageRange({ from: '2026-12-31', to: '2026-12-31' }).to).toBe(new Date(2027, 0, 1).toISOString());
  });
});

describe('aiUsageDates', () => {
  const MONDAY = '2026-11-09';
  const shown = (preset: 'this_week' | 'this_month' | 'this_year' | 'last_week' | 'today', today: string) =>
    rangeFor(preset, today, { allowFuture: false })!;
  const spanDays = (r: { from: string; to: string }) =>
    Math.round((new Date(r.to).getTime() - new Date(r.from).getTime()) / 86_400_000);

  it('asks for the whole week on a Monday, so the chart stays daily', () => {
    expect(shown('this_week', MONDAY)).toEqual({ from: '2026-11-09', to: '2026-11-09' });
    const dates = aiUsageDates('this_week', shown('this_week', MONDAY), MONDAY);
    expect(dates).toEqual({ from: '2026-11-09', to: '2026-11-15' });
    const request = aiUsageRange(dates);
    expect(request).toEqual({ from: new Date(2026, 10, 9).toISOString(), to: new Date(2026, 10, 16).toISOString() });
    expect(Math.round(spanDays(request))).toBeGreaterThanOrEqual(7); // 7 days (7 days +/- 1h across a DST change)
  });

  it('asks for the whole month and the whole year', () => {
    expect(aiUsageDates('this_month', shown('this_month', '2026-11-01'), '2026-11-01'))
      .toEqual({ from: '2026-11-01', to: '2026-11-30' });
    expect(aiUsageDates('this_year', shown('this_year', '2026-01-02'), '2026-01-02'))
      .toEqual({ from: '2026-01-01', to: '2026-12-31' });
  });

  it('leaves the other presets and Custom as shown', () => {
    const lw = shown('last_week', MONDAY);
    expect(aiUsageDates('last_week', lw, MONDAY)).toBe(lw);
    const td = shown('today', MONDAY);
    expect(aiUsageDates('today', td, MONDAY)).toBe(td);
    const custom = { from: '2026-11-01', to: '2026-11-03' };
    expect(aiUsageDates('custom', custom, MONDAY)).toBe(custom);
  });
});

describe('bucketLabel', () => {
  it('labels hours and days', () => {
    expect(bucketLabel('2026-11-14T13:00')).toBe('13:00');
    expect(bucketLabel('2026-11-14')).toBe('Nov 14');
  });
});
