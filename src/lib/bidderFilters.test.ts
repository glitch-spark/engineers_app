import { describe, expect, it } from 'vitest';
import {
  BIDDER_PRESETS,
  BIDDER_URL_DEFAULTS,
  bidderCanClear,
  bidderCanStepForward,
  bidderDays,
  bidderLabel,
  bidderPeriodRequest,
  bidderRangeError,
  matchesBidderSearch,
  parseBidderValues,
  pickBidderPreset,
  reportClock,
  stepBidderPeriod,
  type BidderFilters,
  type BidderPatch,
  type ReportClock,
} from './bidderFilters';

// Wed Nov 18, 2026 09:00 Chicago: the pay week is Sun Nov 15 .. Sat Nov 21.
const CLOCK: ReportClock = { today: '2026-11-18', payWeekStart: '2026-11-15' };
const parse = (over: Partial<Record<keyof typeof BIDDER_URL_DEFAULTS, string>> = {}) =>
  parseBidderValues({ ...BIDDER_URL_DEFAULTS, ...over }, CLOCK);
const request = (over: Parameters<typeof parse>[0] = {}) => bidderPeriodRequest(parse(over), CLOCK);

/** Apply a stepping patch to filters the way the URL would (undefined = back to the default). */
function apply(f: BidderFilters, patch: BidderPatch, clock = CLOCK): BidderFilters {
  const values = {
    ...BIDDER_URL_DEFAULTS,
    owner: f.owner, q: f.q, archived: f.archived ? '1' : '',
    range: f.range === 'this_pay_week' ? '' : f.range, date: f.date, from: f.from, to: f.to,
    ...Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, v ?? ''])),
  };
  return parseBidderValues(values, clock);
}
const step = (f: BidderFilters, dir: -1 | 1, clock = CLOCK) => apply(f, stepBidderPeriod(f, dir, clock)!, clock);

describe('presets', () => {
  it('offers the Bidders presets in order', () => {
    expect(BIDDER_PRESETS.map((p) => p.value)).toEqual([
      'this_pay_week', 'last_pay_week', 'last_2_pay_weeks', 'this_month', 'last_month', 'custom',
    ]);
    expect(BIDDER_PRESETS.map((p) => p.label)).toEqual([
      'This pay week', 'Last pay week', 'Last 2 pay weeks', 'This month', 'Last month', 'Custom',
    ]);
  });
  it('defaults to This pay week with nothing in the URL', () => {
    expect(parse()).toEqual({ owner: '', archived: false, q: '', range: 'this_pay_week', date: '', from: '', to: '' });
  });
});

describe('request params for each preset', () => {
  it('This pay week is just period=week, as before', () => {
    expect(request()).toEqual({ period: 'week' });
  });
  it('Last pay week asks for a day of the previous pay week (this one starts the day after)', () => {
    expect(request({ range: 'last_pay_week' })).toEqual({ period: 'week', date: '2026-11-14' });
  });
  it('Last 2 pay weeks adds weeks=2 on that day', () => {
    expect(request({ range: 'last_2_pay_weeks' })).toEqual({ period: 'week', date: '2026-11-14', weeks: 2 });
  });
  it('months ask for the month', () => {
    expect(request({ range: 'this_month' })).toEqual({ period: 'month' });
    expect(request({ range: 'last_month' })).toEqual({ period: 'month', date: '2026-10-01' });
  });
  it('Custom is period=custom with date and to, as before', () => {
    expect(request({ range: 'custom', from: '2026-10-01', to: '2026-10-20' })).toEqual({
      period: 'custom', date: '2026-10-01', to: '2026-10-20',
    });
  });
  it('a stepped pay week sends its Sunday', () => {
    expect(request({ date: '2026-11-01' })).toEqual({ period: 'week', date: '2026-11-01' });
    expect(request({ range: 'last_2_pay_weeks', date: '2026-10-25' })).toEqual({
      period: 'week', date: '2026-10-25', weeks: 2,
    });
  });
});

describe('the report clock', () => {
  it('uses the Chicago pay week and report day', () => {
    // Wed Nov 18 09:00 CST.
    expect(reportClock(new Date('2026-11-18T15:00:00Z'))).toEqual({ today: '2026-11-18', payWeekStart: '2026-11-15' });
    // Wed 19:30 CST: Thursday's report day is open.
    expect(reportClock(new Date('2026-11-19T01:30:00Z')).today).toBe('2026-11-19');
    // Sat Nov 21 15:59 CST: still the pay week of Nov 15; 16:00 opens the next one.
    expect(reportClock(new Date('2026-11-21T21:59:00Z')).payWeekStart).toBe('2026-11-15');
    expect(reportClock(new Date('2026-11-21T22:00:00Z')).payWeekStart).toBe('2026-11-22');
  });
  it('follows daylight saving (Chicago leaves DST on Nov 1)', () => {
    // Sun Nov 1 00:30 CDT is 05:30Z; Sun Nov 1 23:30 CST is Mon 05:30Z.
    expect(reportClock(new Date('2026-11-01T05:30:00Z'))).toEqual({ today: '2026-11-01', payWeekStart: '2026-11-01' });
    expect(reportClock(new Date('2026-11-02T05:30:00Z')).today).toBe('2026-11-02');
  });
});

describe('old URLs', () => {
  it('week= opens that pay week', () => {
    expect(parse({ week: '2026-11-10' })).toMatchObject({ range: 'this_pay_week', date: '2026-11-08' });
    expect(request({ week: '2026-11-10' })).toEqual({ period: 'week', date: '2026-11-08' });
    // A Saturday belongs to the pay week that ends on it.
    expect(parse({ week: '2026-11-14' }).date).toBe('2026-11-08');
  });
  it('week= naming the current pay week is the default', () => {
    expect(parse({ week: '2026-11-21' }).date).toBe('');
    expect(bidderCanClear(parse({ week: '2026-11-21' }), true)).toBe(false);
  });
  it('period=month&date= opens that month', () => {
    expect(request({ period: 'month', date: '2026-10-15' })).toEqual({ period: 'month', date: '2026-10-01' });
  });
  it('period=custom&date=&to= opens that range', () => {
    expect(parse({ period: 'custom', date: '2026-10-01', to: '2026-10-20' })).toMatchObject({
      range: 'custom', from: '2026-10-01', to: '2026-10-20',
    });
    expect(request({ period: 'custom', date: '2026-10-01', to: '2026-10-20' })).toEqual({
      period: 'custom', date: '2026-10-01', to: '2026-10-20',
    });
  });
  it('range= wins over the old keys', () => {
    expect(parse({ range: 'this_month', week: '2026-10-10', period: 'custom' })).toMatchObject({ range: 'this_month', date: '' });
  });
});

describe('bad URL values', () => {
  it('an unknown range is the default', () => {
    expect(parse({ range: 'this_year', date: '2026-10-10' })).toMatchObject({ range: 'this_pay_week', date: '' });
    expect(parse({ range: 'prev_week' }).range).toBe('this_pay_week');
  });
  it('a bad or future date is ignored', () => {
    expect(parse({ date: '2026-02-31' }).date).toBe('');
    expect(parse({ date: 'tomorrow' }).date).toBe('');
    expect(parse({ date: '2027-01-01' }).date).toBe('');
    expect(parse({ week: 'x' }).date).toBe('');
  });
  it('a partial or invalid Custom range asks for nothing and says why', () => {
    for (const over of [
      { range: 'custom' }, { range: 'custom', from: '2026-10-01' }, { range: 'custom', from: '2026-02-31', to: '2026-03-01' },
      { range: 'custom', from: '2026-10-05', to: '2026-10-01' }, { range: 'custom', from: '2024-01-01', to: '2026-01-01' },
    ]) {
      expect(request(over)).toBeNull();
      expect(bidderRangeError(parse(over))).not.toBeNull();
    }
    expect(bidderRangeError(parse({ range: 'custom', from: '2026-10-05', to: '2026-10-01' }))).toBe('From must be on or before To.');
    expect(bidderRangeError(parse())).toBeNull();
  });
  it('from / to are ignored outside Custom', () => {
    expect(parse({ from: '2026-10-01', to: '2026-10-20' })).toMatchObject({ from: '', to: '' });
  });
});

describe('stepping', () => {
  it('moves a pay week by 7 days on date', () => {
    const last = step(parse(), -1);
    expect(last).toMatchObject({ range: 'last_pay_week', date: '' });
    expect(bidderPeriodRequest(last, CLOCK)).toEqual({ period: 'week', date: '2026-11-14' });

    const before = step(last, -1);
    expect(before).toMatchObject({ range: 'last_pay_week', date: '2026-11-01' });
    expect(bidderPeriodRequest(before, CLOCK)).toEqual({ period: 'week', date: '2026-11-01' });
    expect(bidderPeriodRequest(step(before, -1), CLOCK)).toEqual({ period: 'week', date: '2026-10-25' });
  });
  it('steps forward again to Last pay week and This pay week', () => {
    const back2 = step(step(step(parse(), -1), -1), -1);
    expect(back2.date).toBe('2026-10-25');
    expect(step(back2, 1).date).toBe('2026-11-01');
    expect(step(step(back2, 1), 1)).toMatchObject({ range: 'last_pay_week', date: '' });
    expect(step(step(step(back2, 1), 1), 1)).toMatchObject({ range: 'this_pay_week', date: '' });
  });
  it('can not go past the current pay week', () => {
    expect(bidderCanStepForward(parse(), CLOCK)).toBe(false);
    expect(bidderCanStepForward(parse({ range: 'last_pay_week' }), CLOCK)).toBe(true);
    expect(bidderCanStepForward(parse({ range: 'this_month' }), CLOCK)).toBe(false);
    expect(bidderCanStepForward(parse({ range: 'last_month' }), CLOCK)).toBe(true);
    expect(step(parse(), 1)).toMatchObject({ range: 'this_pay_week', date: '' });
  });
  it('steps Last 2 pay weeks by 14 days and never into the future', () => {
    const f = parse({ range: 'last_2_pay_weeks' });
    expect(bidderPeriodRequest(step(f, -1), CLOCK)).toEqual({ period: 'week', date: '2026-10-25', weeks: 2 });
    // Forward from the last 2 pay weeks: the 2 pay weeks ending with this one.
    expect(bidderPeriodRequest(step(f, 1), CLOCK)).toEqual({ period: 'week', date: '2026-11-15', weeks: 2 });
    expect(bidderCanStepForward(step(f, 1), CLOCK)).toBe(false);
  });
  it('steps months', () => {
    expect(step(parse({ range: 'this_month' }), -1)).toMatchObject({ range: 'last_month', date: '' });
    const sep = step(step(parse({ range: 'this_month' }), -1), -1);
    expect(sep).toMatchObject({ range: 'last_month', date: '2026-09-01' });
    expect(bidderPeriodRequest(sep, CLOCK)).toEqual({ period: 'month', date: '2026-09-01' });
    expect(step(sep, 1)).toMatchObject({ range: 'last_month', date: '' });
  });
  it('crosses a year boundary', () => {
    const jan: ReportClock = { today: '2027-01-05', payWeekStart: '2027-01-03' };
    const f = parseBidderValues(BIDDER_URL_DEFAULTS, jan);
    const back = step(step(f, -1, jan), -1, jan);
    expect(bidderPeriodRequest(back, jan)).toEqual({ period: 'week', date: '2026-12-20' });
    const m = parseBidderValues({ ...BIDDER_URL_DEFAULTS, range: 'this_month' }, jan);
    expect(stepBidderPeriod(m, -1, jan)).toMatchObject({ range: 'last_month' });
    expect(bidderPeriodRequest(parseBidderValues({ ...BIDDER_URL_DEFAULTS, range: 'last_month' }, jan), jan)).toEqual({
      period: 'month', date: '2026-12-01',
    });
  });
  it('steps a Custom range by its own length, not past today', () => {
    const f = parse({ range: 'custom', from: '2026-10-01', to: '2026-10-10' });
    expect(step(f, -1)).toMatchObject({ range: 'custom', from: '2026-09-21', to: '2026-09-30' });
    expect(step(f, 1)).toMatchObject({ range: 'custom', from: '2026-10-11', to: '2026-10-20' });
    const recent = parse({ range: 'custom', from: '2026-11-10', to: '2026-11-17' });
    expect(step(recent, 1)).toMatchObject({ from: '2026-11-18', to: '2026-11-18' });
    expect(bidderCanStepForward(parse({ range: 'custom', from: '2026-11-10', to: '2026-11-18' }), CLOCK)).toBe(false);
    expect(bidderCanStepForward(recent, CLOCK)).toBe(true);
  });
  it('has nothing to step for a bad Custom range', () => {
    expect(stepBidderPeriod(parse({ range: 'custom', from: '2026-10-01' }), -1, CLOCK)).toBeNull();
  });
  it('clears the old period keys so they cannot pin the page', () => {
    const patch = stepBidderPeriod(parse({ week: '2026-10-10' }), -1, CLOCK)!;
    expect(patch).toMatchObject({ week: undefined, period: undefined });
    expect('week' in patch && 'period' in patch).toBe(true);
  });
});

describe('picking a preset', () => {
  it('leaves only the preset in the URL (This pay week is the default)', () => {
    expect(pickBidderPreset('this_pay_week', '', '', CLOCK)).toEqual({
      range: '', date: undefined, from: undefined, to: undefined, week: undefined, period: undefined,
    });
    expect(pickBidderPreset('last_month', '', '', CLOCK).range).toBe('last_month');
  });
  it('seeds Custom from the days shown, up to today', () => {
    const days = bidderDays(parse(), CLOCK)!;
    expect(days).toEqual({ from: '2026-11-15', to: '2026-11-21' });
    expect(pickBidderPreset('custom', days.from, days.to, CLOCK)).toMatchObject({
      range: 'custom', from: '2026-11-15', to: '2026-11-18',
    });
  });
});

describe('days and labels', () => {
  it('works out the calendar days of each period', () => {
    expect(bidderDays(parse({ range: 'last_pay_week' }), CLOCK)).toEqual({ from: '2026-11-08', to: '2026-11-14' });
    expect(bidderDays(parse({ range: 'last_2_pay_weeks' }), CLOCK)).toEqual({ from: '2026-11-01', to: '2026-11-14' });
    expect(bidderDays(parse({ range: 'this_month' }), CLOCK)).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    expect(bidderDays(parse({ range: 'last_month' }), CLOCK)).toEqual({ from: '2026-10-01', to: '2026-10-31' });
  });
  it('shows the server label for pay weeks and the dates otherwise', () => {
    const week = parse();
    expect(bidderLabel(week, bidderDays(week, CLOCK), 'Week ending Sat Nov 21')).toBe('Week ending Sat Nov 21');
    expect(bidderLabel(week, bidderDays(week, CLOCK), undefined)).toBe('…');
    const month = parse({ range: 'last_month' });
    expect(bidderLabel(month, bidderDays(month, CLOCK), 'Oct 2026')).toBe('Oct 2026');
    const custom = parse({ range: 'custom', from: '2026-10-01', to: '2026-10-20' });
    expect(bidderLabel(custom, bidderDays(custom, CLOCK), undefined)).toBe('Oct 1–20, 2026');
  });
});

describe('Clear', () => {
  it('shows only when something differs from the defaults', () => {
    expect(bidderCanClear(parse(), true)).toBe(false);
    expect(bidderCanClear(parse({ archived: '1' }), false)).toBe(true);
    expect(bidderCanClear(parse({ q: 'ana' }), false)).toBe(true);
    expect(bidderCanClear(parse({ range: 'this_month' }), false)).toBe(true);
    expect(bidderCanClear(parse({ date: '2026-11-01' }), false)).toBe(true);
    expect(bidderCanClear(parse({ owner: 'u1' }), true)).toBe(true);
    expect(bidderCanClear(parse({ owner: 'u1' }), false)).toBe(false);
  });
});

describe('search', () => {
  const ana = { name: 'Ana Souza', profileName: 'Dev Profile' };
  it('matches the bidder name or the profile, any case', () => {
    expect(matchesBidderSearch(ana, 'souza')).toBe(true);
    expect(matchesBidderSearch(ana, 'DEV')).toBe(true);
    expect(matchesBidderSearch(ana, '  ana ')).toBe(true);
    expect(matchesBidderSearch(ana, 'zed')).toBe(false);
  });
  it('matches everything when empty, and a bidder without a profile by name', () => {
    expect(matchesBidderSearch(ana, '')).toBe(true);
    expect(matchesBidderSearch(ana, '   ')).toBe(true);
    expect(matchesBidderSearch({ name: 'Bo', profileName: null }, 'bo')).toBe(true);
    expect(matchesBidderSearch({ name: 'Bo', profileName: null }, 'null')).toBe(false);
  });
});
