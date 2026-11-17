import { describe, expect, it } from 'vitest';
import {
  canStep,
  customError,
  isValidDate,
  legacyPreset,
  matchPreset,
  presetOptions,
  rangeFor,
  rangeLabel,
  stepRange,
  toStatsParams,
  type DatePreset,
  type DateRange,
} from './dateRange';

// 2026-11-14 is a Saturday.
const TODAY = '2026-11-14';
const STANDARD: DatePreset[] = [
  'this_week',
  'last_week',
  'last_2_weeks',
  'last_month',
  'this_month',
  'this_year',
];

const r = (from: string, to: string): DateRange => ({ from, to });

describe('presetOptions', () => {
  it('lists the standard presets in order, Custom last', () => {
    expect(presetOptions()).toEqual([
      { value: 'this_week', label: 'This week' },
      { value: 'last_week', label: 'Last week' },
      { value: 'last_2_weeks', label: 'Last 2 weeks' },
      { value: 'last_month', label: 'Last month' },
      { value: 'this_month', label: 'This month' },
      { value: 'this_year', label: 'This year' },
      { value: 'custom', label: 'Custom' },
    ]);
  });

  it('inserts `before` items right after This week', () => {
    const opts = presetOptions({ before: ['next_week'] });
    expect(opts.map((o) => o.value)).toEqual([
      'this_week',
      'next_week',
      'last_week',
      'last_2_weeks',
      'last_month',
      'this_month',
      'this_year',
      'custom',
    ]);
    expect(opts[1].label).toBe('Next week');
  });

  it('puts `after` items after This year and before Custom', () => {
    const opts = presetOptions({ after: ['today', 'yesterday'] });
    expect(opts.map((o) => o.value)).toEqual([
      'this_week',
      'last_week',
      'last_2_weeks',
      'last_month',
      'this_month',
      'this_year',
      'today',
      'yesterday',
      'custom',
    ]);
    expect(opts[6].label).toBe('Today');
    expect(opts[7].label).toBe('Yesterday');
    const all = presetOptions({ after: ['all_time'] });
    expect(all[all.length - 2]).toEqual({ value: 'all_time', label: 'All time' });
    expect(all[all.length - 1]).toEqual({ value: 'custom', label: 'Custom' });
  });

  it('handles before and after together', () => {
    const values = presetOptions({ before: ['next_week'], after: ['all_time'] }).map((o) => o.value);
    expect(values).toEqual([
      'this_week',
      'next_week',
      'last_week',
      'last_2_weeks',
      'last_month',
      'this_month',
      'this_year',
      'all_time',
      'custom',
    ]);
  });
});

describe('rangeFor', () => {
  it('this_week is the whole Mon-Sun week', () => {
    expect(rangeFor('this_week', TODAY)).toEqual(r('2026-11-09', '2026-11-15'));
  });

  it('this_week is clipped to today when allowFuture is false', () => {
    expect(rangeFor('this_week', TODAY, { allowFuture: false })).toEqual(r('2026-11-09', '2026-11-14'));
  });

  it('last_week, last_2_weeks, next_week', () => {
    expect(rangeFor('last_week', TODAY)).toEqual(r('2026-11-02', '2026-11-08'));
    expect(rangeFor('last_2_weeks', TODAY)).toEqual(r('2026-10-26', '2026-11-08'));
    expect(rangeFor('next_week', TODAY)).toEqual(r('2026-11-16', '2026-11-22'));
  });

  it('months and years', () => {
    expect(rangeFor('last_month', TODAY)).toEqual(r('2026-10-01', '2026-10-31'));
    expect(rangeFor('this_month', TODAY)).toEqual(r('2026-11-01', '2026-11-30'));
    expect(rangeFor('this_year', TODAY)).toEqual(r('2026-01-01', '2026-12-31'));
  });

  it('clips this_month and this_year when allowFuture is false', () => {
    expect(rangeFor('this_month', TODAY, { allowFuture: false })).toEqual(r('2026-11-01', '2026-11-14'));
    expect(rangeFor('this_year', TODAY, { allowFuture: false })).toEqual(r('2026-01-01', '2026-11-14'));
  });

  it('does not clip past periods when allowFuture is false', () => {
    expect(rangeFor('last_week', TODAY, { allowFuture: false })).toEqual(r('2026-11-02', '2026-11-08'));
    expect(rangeFor('last_month', TODAY, { allowFuture: false })).toEqual(r('2026-10-01', '2026-10-31'));
  });

  it('today and yesterday are single days', () => {
    expect(rangeFor('today', TODAY)).toEqual(r('2026-11-14', '2026-11-14'));
    expect(rangeFor('yesterday', TODAY)).toEqual(r('2026-11-13', '2026-11-13'));
  });

  it('all_time and custom have no range', () => {
    expect(rangeFor('all_time', TODAY)).toBeNull();
    expect(rangeFor('custom', TODAY)).toBeNull();
  });

  it('crosses a year boundary (today 2026-01-05)', () => {
    expect(rangeFor('last_2_weeks', '2026-01-05')).toEqual(r('2025-12-22', '2026-01-04'));
    expect(rangeFor('last_week', '2026-01-05')).toEqual(r('2025-12-29', '2026-01-04'));
    expect(rangeFor('last_month', '2026-01-05')).toEqual(r('2025-12-01', '2025-12-31'));
    expect(rangeFor('yesterday', '2026-01-01')).toEqual(r('2025-12-31', '2025-12-31'));
  });

  it('handles a week containing the US DST change (Nov 1 2026)', () => {
    // Nov 1 2026 is a Sunday, so the DST week is Oct 26 - Nov 1; Nov 3 is already the next week.
    expect(rangeFor('this_week', '2026-10-28')).toEqual(r('2026-10-26', '2026-11-01'));
    expect(rangeFor('this_week', '2026-11-03')).toEqual(r('2026-11-02', '2026-11-08'));
    expect(rangeFor('this_week', '2026-11-02')).toEqual(r('2026-11-02', '2026-11-08'));
    expect(rangeFor('this_week', '2026-11-01')).toEqual(r('2026-10-26', '2026-11-01'));
    expect(rangeFor('last_week', '2026-11-09')).toEqual(r('2026-11-02', '2026-11-08'));
    expect(rangeFor('last_2_weeks', '2026-11-09')).toEqual(r('2026-10-26', '2026-11-08'));
  });

  it('handles the spring DST change (Mar 8 2026) and Sunday as week end', () => {
    expect(rangeFor('this_week', '2026-03-08')).toEqual(r('2026-03-02', '2026-03-08'));
    expect(rangeFor('next_week', '2026-03-08')).toEqual(r('2026-03-09', '2026-03-15'));
  });

  it('handles leap years', () => {
    expect(rangeFor('last_month', '2028-03-10')).toEqual(r('2028-02-01', '2028-02-29'));
    expect(rangeFor('last_month', '2026-03-10')).toEqual(r('2026-02-01', '2026-02-28'));
  });
});

describe('matchPreset', () => {
  it('matches a preset range', () => {
    expect(matchPreset(r('2026-11-02', '2026-11-08'), TODAY, STANDARD)).toBe('last_week');
    expect(matchPreset(r('2026-10-26', '2026-11-08'), TODAY, STANDARD)).toBe('last_2_weeks');
    expect(matchPreset(r('2026-11-09', '2026-11-15'), TODAY, STANDARD)).toBe('this_week');
  });

  it('returns custom for an odd range', () => {
    expect(matchPreset(r('2026-11-03', '2026-11-12'), TODAY, STANDARD)).toBe('custom');
  });

  it('only matches presets in the allowed list', () => {
    expect(matchPreset(r('2026-11-16', '2026-11-22'), TODAY, STANDARD)).toBe('custom');
    expect(matchPreset(r('2026-11-16', '2026-11-22'), TODAY, [...STANDARD, 'next_week'])).toBe('next_week');
  });

  it('matches clipped ranges only with allowFuture false', () => {
    const clipped = r('2026-11-09', '2026-11-14');
    expect(matchPreset(clipped, TODAY, STANDARD, { allowFuture: false })).toBe('this_week');
    expect(matchPreset(clipped, TODAY, STANDARD)).toBe('custom');
    expect(matchPreset(r('2026-11-01', '2026-11-14'), TODAY, STANDARD, { allowFuture: false })).toBe('this_month');
    expect(matchPreset(r('2026-01-01', '2026-11-14'), TODAY, STANDARD, { allowFuture: false })).toBe('this_year');
  });

  it('checks presets in allowed order', () => {
    // On a Monday the clipped this_week is the same single day as `today`.
    const monday = '2026-11-09';
    const day = r(monday, monday);
    expect(matchPreset(day, monday, ['this_week', 'today'], { allowFuture: false })).toBe('this_week');
    expect(matchPreset(day, monday, ['today', 'this_week'], { allowFuture: false })).toBe('today');
  });

  it('skips custom and all_time in the allowed list', () => {
    expect(matchPreset(r('2026-11-03', '2026-11-12'), TODAY, ['all_time', 'custom', 'this_week'])).toBe('custom');
    expect(matchPreset(r('2026-11-13', '2026-11-13'), TODAY, ['custom', 'yesterday'])).toBe('yesterday');
  });
});

describe('stepRange', () => {
  it('steps a week by one week', () => {
    expect(stepRange(r('2026-11-09', '2026-11-15'), -1, 'this_week')).toEqual(r('2026-11-02', '2026-11-08'));
    expect(stepRange(r('2026-11-02', '2026-11-08'), 1, 'last_week')).toEqual(r('2026-11-09', '2026-11-15'));
    expect(stepRange(r('2026-11-16', '2026-11-22'), -1, 'next_week')).toEqual(r('2026-11-09', '2026-11-15'));
  });

  it('snaps a clipped week to the whole week', () => {
    expect(stepRange(r('2026-11-09', '2026-11-14'), -1, 'this_week')).toEqual(r('2026-11-02', '2026-11-08'));
    expect(stepRange(r('2026-11-09', '2026-11-14'), 1, 'this_week')).toEqual(r('2026-11-16', '2026-11-22'));
  });

  it('steps across a DST change by whole days', () => {
    expect(stepRange(r('2026-10-26', '2026-11-01'), 1, 'last_week')).toEqual(r('2026-11-02', '2026-11-08'));
    expect(stepRange(r('2026-11-02', '2026-11-08'), -1, 'last_week')).toEqual(r('2026-10-26', '2026-11-01'));
  });

  it('steps last_2_weeks by 14 days', () => {
    expect(stepRange(r('2026-10-26', '2026-11-08'), -1, 'last_2_weeks')).toEqual(r('2026-10-12', '2026-10-25'));
    expect(stepRange(r('2026-10-26', '2026-11-08'), 1, 'last_2_weeks')).toEqual(r('2026-11-09', '2026-11-22'));
  });

  it('steps a 2-week range across a year boundary', () => {
    expect(stepRange(r('2025-12-22', '2026-01-04'), 1, 'last_2_weeks')).toEqual(r('2026-01-05', '2026-01-18'));
  });

  it('steps a month by whole calendar months', () => {
    expect(stepRange(r('2026-01-01', '2026-01-31'), 1, 'last_month')).toEqual(r('2026-02-01', '2026-02-28'));
    expect(stepRange(r('2026-02-01', '2026-02-28'), 1, 'this_month')).toEqual(r('2026-03-01', '2026-03-31'));
    expect(stepRange(r('2028-01-01', '2028-01-31'), 1, 'this_month')).toEqual(r('2028-02-01', '2028-02-29'));
  });

  it('snaps a clipped month to the whole month', () => {
    expect(stepRange(r('2026-11-01', '2026-11-14'), -1, 'this_month')).toEqual(r('2026-10-01', '2026-10-31'));
    expect(stepRange(r('2026-11-01', '2026-11-14'), 1, 'this_month')).toEqual(r('2026-12-01', '2026-12-31'));
  });

  it('steps months across year boundaries', () => {
    expect(stepRange(r('2026-01-01', '2026-01-31'), -1, 'this_month')).toEqual(r('2025-12-01', '2025-12-31'));
    expect(stepRange(r('2025-12-01', '2025-12-31'), 1, 'last_month')).toEqual(r('2026-01-01', '2026-01-31'));
  });

  it('steps a year by whole calendar years', () => {
    expect(stepRange(r('2026-01-01', '2026-12-31'), -1, 'this_year')).toEqual(r('2025-01-01', '2025-12-31'));
    expect(stepRange(r('2026-01-01', '2026-11-14'), 1, 'this_year')).toEqual(r('2027-01-01', '2027-12-31'));
  });

  it('steps a custom range by its own inclusive day count', () => {
    // 10 days: Nov 1..Nov 10
    expect(stepRange(r('2026-11-01', '2026-11-10'), 1, 'custom')).toEqual(r('2026-11-11', '2026-11-20'));
    expect(stepRange(r('2026-11-01', '2026-11-10'), -1, 'custom')).toEqual(r('2026-10-22', '2026-10-31'));
  });

  it('steps a custom range covering one whole month by month', () => {
    expect(stepRange(r('2026-09-01', '2026-09-30'), -1, 'custom')).toEqual(r('2026-08-01', '2026-08-31'));
    expect(stepRange(r('2026-02-01', '2026-02-28'), 1, 'custom')).toEqual(r('2026-03-01', '2026-03-31'));
  });

  it('steps a custom range covering one whole year by year', () => {
    expect(stepRange(r('2025-01-01', '2025-12-31'), 1, 'custom')).toEqual(r('2026-01-01', '2026-12-31'));
    expect(stepRange(r('2026-01-01', '2026-12-31'), -1, 'custom')).toEqual(r('2025-01-01', '2025-12-31'));
  });

  it('keeps stepping other custom ranges by day count', () => {
    // 14 days, not a whole month
    expect(stepRange(r('2026-11-02', '2026-11-15'), 1, 'custom')).toEqual(r('2026-11-16', '2026-11-29'));
    // a clipped month is not a whole month
    expect(stepRange(r('2026-11-01', '2026-11-14'), -1, 'custom')).toEqual(r('2026-10-18', '2026-10-31'));
  });

  it('steps today and yesterday by one day', () => {
    expect(stepRange(r('2026-11-14', '2026-11-14'), -1, 'today')).toEqual(r('2026-11-13', '2026-11-13'));
    expect(stepRange(r('2026-11-13', '2026-11-13'), 1, 'yesterday')).toEqual(r('2026-11-14', '2026-11-14'));
  });

  it('steps a custom range across a year boundary', () => {
    expect(stepRange(r('2025-12-29', '2026-01-02'), 1, 'custom')).toEqual(r('2026-01-03', '2026-01-07'));
  });
});

describe('canStep', () => {
  it('is false at the current period when the future is not allowed', () => {
    expect(canStep(r('2026-11-09', '2026-11-15'), 1, TODAY, false)).toBe(false);
    expect(canStep(r('2026-11-09', '2026-11-14'), 1, TODAY, false)).toBe(false);
    expect(canStep(r('2026-11-01', '2026-11-30'), 1, TODAY, false)).toBe(false);
  });

  it('is true when allowFuture', () => {
    expect(canStep(r('2026-11-09', '2026-11-15'), 1, TODAY, true)).toBe(true);
    expect(canStep(r('2026-11-16', '2026-11-22'), 1, TODAY, true)).toBe(true);
  });

  it('is true for past ranges', () => {
    expect(canStep(r('2026-11-02', '2026-11-08'), 1, TODAY, false)).toBe(true);
    expect(canStep(r('2026-10-01', '2026-10-31'), 1, TODAY, false)).toBe(true);
  });

  it('is true when the next range starts today, false when it starts after', () => {
    expect(canStep(r('2026-11-12', '2026-11-13'), 1, TODAY, false)).toBe(true);
    expect(canStep(r('2026-11-13', '2026-11-14'), 1, TODAY, false)).toBe(false);
  });
});

describe('rangeLabel', () => {
  it('same month', () => {
    expect(rangeLabel(r('2026-11-09', '2026-11-15'))).toBe('Nov 9–15, 2026');
  });

  it('different months, same year', () => {
    expect(rangeLabel(r('2026-10-26', '2026-11-08'))).toBe('Oct 26 – Nov 8, 2026');
  });

  it('different years', () => {
    expect(rangeLabel(r('2025-12-29', '2026-01-04'))).toBe('Dec 29, 2025 – Jan 4, 2026');
  });

  it('a whole calendar month', () => {
    expect(rangeLabel(r('2026-11-01', '2026-11-30'))).toBe('Nov 2026');
    expect(rangeLabel(r('2028-02-01', '2028-02-29'))).toBe('Feb 2028');
  });

  it('a whole calendar year', () => {
    expect(rangeLabel(r('2026-01-01', '2026-12-31'))).toBe('2026');
  });

  it('a single day', () => {
    expect(rangeLabel(r('2026-11-14', '2026-11-14'))).toBe('Nov 14, 2026');
  });

  it('a clipped month is not the whole month', () => {
    expect(rangeLabel(r('2026-11-01', '2026-11-14'))).toBe('Nov 1–14, 2026');
  });

  it('a clipped year is not the whole year', () => {
    expect(rangeLabel(r('2026-01-01', '2026-11-14'))).toBe('Jan 1 – Nov 14, 2026');
  });

  it('null is All time', () => {
    expect(rangeLabel(null)).toBe('All time');
  });
});

describe('isValidDate', () => {
  it('accepts real calendar dates', () => {
    expect(isValidDate('2026-11-14')).toBe(true);
    expect(isValidDate('2028-02-29')).toBe(true);
  });

  it('rejects impossible dates, bad shapes and non-strings', () => {
    expect(isValidDate('2026-02-31')).toBe(false);
    expect(isValidDate('2027-02-29')).toBe(false);
    expect(isValidDate('2026-13-01')).toBe(false);
    expect(isValidDate('2026-00-10')).toBe(false);
    expect(isValidDate('2026-1-5')).toBe(false);
    expect(isValidDate('')).toBe(false);
    expect(isValidDate('nope')).toBe(false);
    expect(isValidDate(undefined as unknown as string)).toBe(false);
  });
});

describe('customError', () => {
  it('treats impossible dates as missing', () => {
    expect(customError('2026-02-31', '2026-03-05')).toBe('Pick both dates.');
    expect(customError('2026-03-01', '2026-04-31')).toBe('Pick both dates.');
  });

  it('accepts a valid range', () => {
    expect(customError('2026-11-01', '2026-11-10')).toBeNull();
    expect(customError('2026-11-10', '2026-11-10')).toBeNull();
  });

  it('rejects empty dates', () => {
    expect(customError('', '')).toBe('Pick both dates.');
    expect(customError('2026-11-01', '')).toBe('Pick both dates.');
    expect(customError('', '2026-11-01')).toBe('Pick both dates.');
  });

  it('rejects from after to', () => {
    expect(customError('2026-11-10', '2026-11-01')).toBe('From must be on or before To.');
  });

  it('allows at most 366 days inclusive', () => {
    // 2026-01-01..2027-01-01 is 366 days inclusive.
    expect(customError('2026-01-01', '2027-01-01')).toBeNull();
    // 2026-01-01..2027-01-02 is 367 days inclusive.
    expect(customError('2026-01-01', '2027-01-02')).toBe('Pick a range of a year or less.');
  });
});

describe('legacyPreset', () => {
  it('maps the old Interviews values', () => {
    expect(legacyPreset('prev_week')).toBe('last_week');
    expect(legacyPreset('prev_month')).toBe('last_month');
  });

  it('returns null for anything else', () => {
    expect(legacyPreset('this_week')).toBeNull();
    expect(legacyPreset('')).toBeNull();
    expect(legacyPreset('nonsense')).toBeNull();
  });
});

describe('toStatsParams', () => {
  it('week presets give the week and its Monday', () => {
    expect(toStatsParams('this_week', r('2026-11-09', '2026-11-15'))).toEqual({ period: 'week', date: '2026-11-09' });
    expect(toStatsParams('last_week', r('2026-11-02', '2026-11-08'))).toEqual({ period: 'week', date: '2026-11-02' });
    expect(toStatsParams('next_week', r('2026-11-16', '2026-11-22'))).toEqual({ period: 'week', date: '2026-11-16' });
  });

  it('month presets give the month and its 1st', () => {
    expect(toStatsParams('last_month', r('2026-10-01', '2026-10-31'))).toEqual({ period: 'month', date: '2026-10-01' });
    expect(toStatsParams('this_month', r('2026-11-01', '2026-11-30'))).toEqual({ period: 'month', date: '2026-11-01' });
  });

  it('everything else is custom', () => {
    expect(toStatsParams('last_2_weeks', r('2026-10-26', '2026-11-08'))).toEqual({
      period: 'custom',
      date: '2026-10-26',
      to: '2026-11-08',
    });
    expect(toStatsParams('this_year', r('2026-01-01', '2026-12-31'))).toEqual({
      period: 'custom',
      date: '2026-01-01',
      to: '2026-12-31',
    });
    expect(toStatsParams('custom', r('2026-11-03', '2026-11-12'))).toEqual({
      period: 'custom',
      date: '2026-11-03',
      to: '2026-11-12',
    });
    expect(toStatsParams('today', r('2026-11-14', '2026-11-14'))).toEqual({
      period: 'custom',
      date: '2026-11-14',
      to: '2026-11-14',
    });
  });
});
