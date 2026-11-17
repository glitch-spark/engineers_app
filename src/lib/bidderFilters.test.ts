import { describe, expect, it } from 'vitest';
import {
  isWholePayWeeks,
  BIDDER_PRESETS,
  BIDDER_URL_DEFAULTS,
  addDays,
  bidderCanClear,
  bidderCanStepBack,
  bidderCanStepForward,
  bidderDays,
  bidderLabel,
  bidderPerfRequest,
  bidderPresetOptions,
  bidderPeriodRequest,
  bidderRangeError,
  matchesBidderSearch,
  parseBidderValues,
  pickBidderPreset,
  shownWeeksOf,
  stepBidderPeriod,
  type BidderFilters,
  type BidderPatch,
  type BidderPeriodRequest,
  type ReportClock,
  type ShownWeeks,
} from './bidderFilters';

// Wed Nov 18, 2026 09:00 Chicago: the long pay week Sun Nov 15 .. Sun Nov 22 (8 report days, across the schedule
// switch); the one before is Sun Nov 8 .. Sat Nov 14.
const CLOCK: ReportClock = {
  today: '2026-11-18', payWeekStart: '2026-11-15', payWeekEnd: '2026-11-22', previousPayWeekStart: '2026-11-08',
  timezone: 'America/Chicago',
};
// Wed Nov 25, 2026: the first Mon..Sun pay week after the switch; the one before is the long week.
const AFTER: ReportClock = {
  today: '2026-11-25', payWeekStart: '2026-11-23', payWeekEnd: '2026-11-29', previousPayWeekStart: '2026-11-15',
  timezone: 'America/Chicago',
};

/**
 * What the server shows for a pay-week request: Sun..Sat weeks up to Nov 14, the long week Nov 15..22, then Mon..Sun.
 * Stands in for `shownWeeksOf(perf.data)`, so the tests step from the days the server would have shown.
 */
function payWeekOf(day: string): ShownWeeks {
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
  if (day >= '2026-11-23') {
    const first = addDays(day, -((dow + 6) % 7));
    return { first, last: addDays(first, 6) };
  }
  if (day >= '2026-11-15') return { first: '2026-11-15', last: '2026-11-22' };
  const first = addDays(day, -dow);
  return { first, last: addDays(first, 6) };
}
function served(req: BidderPeriodRequest | null, clock: ReportClock): ShownWeeks | undefined {
  if (!req || req.period !== 'week') return undefined;
  const w = payWeekOf(req.date ?? clock.payWeekStart);
  return req.weeks === 2 ? { first: payWeekOf(addDays(w.first, -1)).first, last: w.last } : w;
}
const shownFor = (f: BidderFilters, clock = CLOCK) => served(bidderPeriodRequest(f, clock), clock);

const parse = (over: Partial<Record<keyof typeof BIDDER_URL_DEFAULTS, string>> = {}, clock = CLOCK) =>
  parseBidderValues({ ...BIDDER_URL_DEFAULTS, ...over }, clock);
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
/** One arrow click, stepping from the days the server shows for `f` (or `shown` when given). */
const step = (f: BidderFilters, dir: -1 | 1, clock = CLOCK, shown = shownFor(f, clock)) =>
  apply(f, stepBidderPeriod(f, dir, clock, shown)!, clock);

// Mon Nov 16, 2026 09:00 on the short-week schedule: old Sun..Sat weeks end Nov 14, then the 1-day week Sun Nov 15
// (Last pay week), then 7-day weeks from Nov 16 (This pay week: Nov 16..22).
const SHORT: ReportClock = {
  today: '2026-11-16', payWeekStart: '2026-11-16', payWeekEnd: '2026-11-22', previousPayWeekStart: '2026-11-15',
  timezone: 'America/Chicago',
};
const DAY = 86_400_000;
/** The server's pay weeks with the short week: Sun..Sat to Nov 14, Nov 15 alone, then 7-day weeks from Nov 16. */
function shortWeekOf(day: string): ShownWeeks {
  if (day === '2026-11-15') return { first: day, last: day };
  if (day >= '2026-11-16') {
    const n = Math.floor((Date.parse(day) - Date.parse('2026-11-16')) / DAY / 7);
    const first = addDays('2026-11-16', n * 7);
    return { first, last: addDays(first, 6) };
  }
  const first = addDays(day, -new Date(`${day}T00:00:00Z`).getUTCDay());
  return { first, last: addDays(first, 6) };
}
/** The days the server shows for a filter on the short-week schedule (`weeks=2`: the anchor's week and the one before). */
function servedShort(f: BidderFilters): ShownWeeks {
  const req = bidderPeriodRequest(f, SHORT)!;
  const w = shortWeekOf(req.date ?? SHORT.payWeekStart);
  return req.weeks === 2 ? { first: shortWeekOf(addDays(w.first, -1)).first, last: w.last } : w;
}
const showing = (f: BidderFilters) => {
  const w = servedShort(f);
  return `${w.first}..${w.last}`;
};
const stepShort = (f: BidderFilters, dir: -1 | 1) => apply(f, stepBidderPeriod(f, dir, SHORT, servedShort(f))!, SHORT);

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
    expect(parse()).toEqual({
      owner: '', archived: false, q: '', range: 'this_pay_week', date: '', from: '', to: '',
    });
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
  it('Last pay week asks for the day before this pay week', () => {
    expect(bidderPeriodRequest(parse({ range: 'last_pay_week' }, AFTER), AFTER)).toEqual({ period: 'week', date: '2026-11-22' });
    expect(bidderPeriodRequest(parse({ range: 'last_2_pay_weeks' }, AFTER), AFTER)).toEqual({
      period: 'week', date: '2026-11-22', weeks: 2,
    });
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
  it('a stepped pay week sends its date', () => {
    expect(request({ date: '2026-11-01' })).toEqual({ period: 'week', date: '2026-11-01' });
    expect(request({ range: 'last_2_pay_weeks', date: '2026-10-25' })).toEqual({
      period: 'week', date: '2026-10-25', weeks: 2,
    });
  });
});

describe('old URLs', () => {
  it('week= opens that pay week', () => {
    // The previous pay week is Last pay week; any day in it asks for that week.
    expect(parse({ week: '2026-11-10' })).toMatchObject({ range: 'last_pay_week', date: '' });
    expect(request({ week: '2026-11-10' })).toEqual({ period: 'week', date: '2026-11-14' });
    // An older one is the stepped "Pay week", held by the day the link names (the server finds its pay week).
    expect(parse({ week: '2026-11-03' })).toMatchObject({ range: 'pay_week', date: '2026-11-03' });
    expect(request({ week: '2026-11-07' })).toEqual({ period: 'week', date: '2026-11-07' });
  });
  it('week= naming the current pay week is the default', () => {
    expect(parse({ week: '2026-11-21' })).toMatchObject({ range: 'this_pay_week', date: '' });
    expect(parse({ week: '2026-11-22' })).toMatchObject({ range: 'this_pay_week', date: '' });
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
  it("a Slack link's week-ending day opens that pay week", () => {
    // The long week's own key (Sun Nov 22) is Last pay week once Nov 23 has opened.
    expect(parse({ range: 'pay_week', date: '2026-11-22' }, AFTER)).toMatchObject({ range: 'last_pay_week', date: '' });
    expect(parse({ range: 'pay_week', date: '2026-11-15' }, AFTER)).toMatchObject({ range: 'last_pay_week', date: '' });
    const older = parse({ range: 'pay_week', date: '2026-11-14' }, AFTER);
    expect(older).toMatchObject({ range: 'pay_week', date: '2026-11-14' });
    expect(bidderPeriodRequest(older, AFTER)).toEqual({ period: 'week', date: '2026-11-14' });
    // A day past the current pay week is not a period yet.
    expect(parse({ range: 'pay_week', date: '2026-11-30' }, AFTER)).toMatchObject({ range: 'this_pay_week', date: '' });
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
    expect(parse({ date: '2026-11-23' }).date).toBe(''); // the day after the current pay week ends
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

describe('what the server showed', () => {
  it('shownWeeksOf', () => {
    const days = Array.from({ length: 7 }, (_, i) => ({ day: addDays('2026-11-23', i) }));
    expect(shownWeeksOf({ period: 'week', start: '2026-11-23T00:00:00Z', end: '2026-11-30T02:00:00Z', payWeek: { days } }))
      .toEqual({ first: '2026-11-23', last: '2026-11-29' });
    expect(shownWeeksOf({ period: 'week', start: '2026-11-08', end: '2026-11-22', payWeek: null }))
      .toEqual({ first: '2026-11-08', last: '2026-11-22' });
    expect(shownWeeksOf({ period: 'month', start: '2026-11-01', end: '2026-11-30' })).toBeUndefined();
  });
});

describe('stepping across a short week', () => {
  const week = (date: string) => parse({ range: 'pay_week', date }, SHORT);
  const pair = (date: string) => parse({ range: 'two_pay_weeks', date }, SHORT);
  it('forward from the week ending Nov 14 lands on Nov 15, then on Nov 16..22 (never skips the short week)', () => {
    const nov8 = week('2026-11-10');
    expect(showing(nov8)).toBe('2026-11-08..2026-11-14');
    const short = stepShort(nov8, 1);
    expect(short).toMatchObject({ range: 'last_pay_week', date: '' }); // Last pay week on this clock
    expect(showing(short)).toBe('2026-11-15..2026-11-15');
    const now = stepShort(short, 1);
    expect(now).toMatchObject({ range: 'this_pay_week', date: '' });
    expect(showing(now)).toBe('2026-11-16..2026-11-22');
    expect(bidderCanStepForward(now, SHORT)).toBe(false);
  });
  it('back from Nov 16..22 lands on Nov 15, then on Nov 8..14', () => {
    const short = stepShort(parse({}, SHORT), -1);
    expect(short).toMatchObject({ range: 'last_pay_week', date: '' });
    expect(showing(short)).toBe('2026-11-15..2026-11-15');
    const before = stepShort(short, -1);
    expect(before).toMatchObject({ range: 'pay_week', date: '2026-11-14' });
    expect(showing(before)).toBe('2026-11-08..2026-11-14');
  });
  it('the next week is the day after the shown last day, whatever the length', () => {
    expect(stepBidderPeriod(week('2026-11-10'), 1, SHORT, { first: '2026-11-08', last: '2026-11-14' }))
      .toMatchObject({ range: 'last_pay_week', date: undefined });
    expect(stepBidderPeriod(week('2026-11-03'), 1, SHORT, { first: '2026-11-01', last: '2026-11-07' }))
      .toMatchObject({ range: 'pay_week', date: '2026-11-08' });
  });
  it('two pay weeks step to the next two, anchored on the later of them', () => {
    // Nov 1..14 -> Nov 15 + Nov 16..22: the anchor is this pay week, the later one.
    expect(showing(pair('2026-11-14'))).toBe('2026-11-01..2026-11-14');
    const next = stepShort(pair('2026-11-14'), 1);
    expect(next).toMatchObject({ range: 'two_pay_weeks', date: '2026-11-16' });
    expect(showing(next)).toBe('2026-11-15..2026-11-22');
    expect(bidderCanStepForward(next, SHORT)).toBe(false);
    expect(showing(stepShort(next, -1))).toBe('2026-11-01..2026-11-14'); // back undoes forward
    // Oct 18..31 -> Nov 1..14.
    expect(showing(pair('2026-10-31'))).toBe('2026-10-18..2026-10-31');
    expect(showing(stepShort(pair('2026-10-31'), 1))).toBe('2026-11-01..2026-11-14');
    // Oct 25..Nov 7 -> Nov 8..14 + Nov 15, which is Last 2 pay weeks on this clock.
    expect(showing(pair('2026-11-07'))).toBe('2026-10-25..2026-11-07');
    const last2 = stepShort(pair('2026-11-07'), 1);
    expect(last2).toMatchObject({ range: 'last_2_pay_weeks', date: '' });
    expect(showing(last2)).toBe('2026-11-08..2026-11-15');
    // From there the newest two pay weeks: Nov 15 + this week.
    expect(showing(stepShort(last2, 1))).toBe('2026-11-15..2026-11-22');
  });
  it('the Last 2 pay weeks seed waits for the server: the week before Nov 15 is Nov 8..14, not 7 days back', () => {
    const f = parse({ range: 'last_2_pay_weeks' }, SHORT);
    expect(bidderDays(f, SHORT)).toBeNull();
    expect(bidderDays(f, SHORT, servedShort(f))).toEqual({ from: '2026-11-08', to: '2026-11-15' });
  });
  it('Last 2 pay weeks from Nov 23 (Last = Nov 16..22, the week before is the 1-day Nov 15)', () => {
    const NOV23: ReportClock = {
      today: '2026-11-23', payWeekStart: '2026-11-23', payWeekEnd: '2026-11-29', previousPayWeekStart: '2026-11-16',
      timezone: 'America/Chicago',
    };
    const f = parse({ range: 'last_2_pay_weeks' }, NOV23);
    expect(bidderDays(f, NOV23)).toBeNull(); // not Nov 9..22
    expect(bidderLabel(f, bidderDays(f, NOV23), undefined)).toBe('…');
    expect(bidderDays(f, NOV23, { first: '2026-11-15', last: '2026-11-22' })).toEqual({ from: '2026-11-15', to: '2026-11-22' });
    expect(bidderDays(parse({ range: 'last_pay_week' }, NOV23), NOV23)).toEqual({ from: '2026-11-16', to: '2026-11-22' });
  });
});

describe('stepping a seven-day schedule', () => {
  const SEVEN: ReportClock = {
    today: '2026-12-02', payWeekStart: '2026-11-30', payWeekEnd: '2026-12-06', previousPayWeekStart: '2026-11-23',
    timezone: 'America/Chicago',
  };
  const go = (f: BidderFilters, dir: -1 | 1, shown: ShownWeeks) => apply(f, stepBidderPeriod(f, dir, SEVEN, shown)!, SEVEN);
  it('one pay week: back to the day before it, forward to the day after it, snapping to Last and This', () => {
    const w = parse({ range: 'pay_week', date: '2026-11-18' }, SEVEN);
    const shown = { first: '2026-11-16', last: '2026-11-22' };
    expect(go(w, -1, shown)).toMatchObject({ range: 'pay_week', date: '2026-11-15' });
    expect(go(w, 1, shown)).toMatchObject({ range: 'last_pay_week', date: '' }); // Nov 23 is Last
    const last = parse({ range: 'last_pay_week' }, SEVEN);
    expect(go(last, 1, { first: '2026-11-23', last: '2026-11-29' })).toMatchObject({ range: 'this_pay_week', date: '' });
  });
  it('two pay weeks step by two (the later of them is the anchor)', () => {
    const p = parse({ range: 'two_pay_weeks', date: '2026-11-15' }, SEVEN); // Nov 2..8 + Nov 9..15
    const shown = { first: '2026-11-02', last: '2026-11-15' };
    expect(go(p, 1, shown)).toMatchObject({ range: 'last_2_pay_weeks', date: '' }); // Nov 16..22 + Nov 23..29
    expect(go(p, -1, shown)).toMatchObject({ range: 'two_pay_weeks', date: '2026-11-01' });
    const older = parse({ range: 'two_pay_weeks', date: '2026-11-08' }, SEVEN); // Oct 26..Nov 1 + Nov 2..8
    expect(go(older, 1, { first: '2026-10-26', last: '2026-11-08' })).toMatchObject({ range: 'two_pay_weeks', date: '2026-11-16' });
  });
});

describe('stepping', () => {
  it('moves a pay week from the shown days: back to the day before it', () => {
    const last = step(parse(), -1);
    expect(last).toMatchObject({ range: 'last_pay_week', date: '' });
    expect(bidderPeriodRequest(last, CLOCK)).toEqual({ period: 'week', date: '2026-11-14' });

    const before = step(last, -1);
    expect(before).toMatchObject({ range: 'pay_week', date: '2026-11-07' });
    expect(bidderPeriodRequest(before, CLOCK)).toEqual({ period: 'week', date: '2026-11-07' });
    expect(bidderPeriodRequest(step(before, -1), CLOCK)).toEqual({ period: 'week', date: '2026-10-31' });
  });
  it('steps forward again to Last pay week and This pay week', () => {
    const back2 = step(step(step(parse(), -1), -1), -1);
    expect(back2.date).toBe('2026-10-31');
    expect(step(back2, 1).date).toBe('2026-11-01'); // the day after Oct 25..31: the first day of the very next week
    expect(step(step(back2, 1), 1)).toMatchObject({ range: 'last_pay_week', date: '' });
    expect(step(step(step(back2, 1), 1), 1)).toMatchObject({ range: 'this_pay_week', date: '' });
  });
  it('steps across the long week', () => {
    const now = parse({}, AFTER);
    const last = step(now, -1, AFTER, { first: '2026-11-23', last: '2026-11-29' });
    expect(last).toMatchObject({ range: 'last_pay_week', date: '' });
    const long = step(last, -1, AFTER, { first: '2026-11-15', last: '2026-11-22' });
    expect(long).toMatchObject({ range: 'pay_week', date: '2026-11-14' });
    const older = step(long, -1, AFTER, { first: '2026-11-08', last: '2026-11-14' });
    expect(older).toMatchObject({ range: 'pay_week', date: '2026-11-07' });

    const fwd = step(older, 1, AFTER, { first: '2026-11-01', last: '2026-11-07' });
    expect(fwd).toMatchObject({ range: 'pay_week', date: '2026-11-08' });
    expect(step(fwd, 1, AFTER, { first: '2026-11-08', last: '2026-11-14' })).toMatchObject({ range: 'last_pay_week', date: '' });
    expect(step(last, 1, AFTER, { first: '2026-11-15', last: '2026-11-22' })).toMatchObject({ range: 'this_pay_week', date: '' });
  });
  it('no step for a pay week before the period loads', () => {
    const thisWeek = parse({}, AFTER);
    expect(stepBidderPeriod(thisWeek, -1, AFTER)).toBeNull();
    expect(bidderCanStepBack(thisWeek, undefined)).toBe(false);
    expect(bidderCanStepBack(thisWeek, { first: '2026-11-23', last: '2026-11-29' })).toBe(true);
    expect(bidderCanStepBack(parse({ range: 'this_month' }, AFTER), undefined)).toBe(true);
  });
  it('two pay weeks step by two', () => {
    const back = step(parse({ range: 'last_2_pay_weeks' }, AFTER), -1, AFTER, { first: '2026-11-08', last: '2026-11-22' });
    expect(back).toMatchObject({ range: 'two_pay_weeks', date: '2026-11-07' });
    expect(step(back, 1, AFTER, { first: '2026-10-25', last: '2026-11-07' })).toMatchObject({ range: 'last_2_pay_weeks', date: '' });
  });
  it('can not go past the current pay week', () => {
    expect(bidderCanStepForward(parse(), CLOCK)).toBe(false);
    expect(bidderCanStepForward(parse({ range: 'last_pay_week' }), CLOCK)).toBe(true);
    expect(bidderCanStepForward(parse({ range: 'this_month' }), CLOCK)).toBe(false);
    expect(bidderCanStepForward(parse({ range: 'last_month' }), CLOCK)).toBe(true);
    expect(step(parse(), 1)).toMatchObject({ range: 'this_pay_week', date: '' });
  });
  it('step back twice from This pay week: Last pay week, then a "Pay week" held by date', () => {
    const once = step(parse(), -1);
    expect(once).toMatchObject({ range: 'last_pay_week', date: '' });
    const twice = step(once, -1);
    expect(twice).toMatchObject({ range: 'pay_week', date: '2026-11-07' });
    expect(stepBidderPeriod(once, -1, CLOCK, shownFor(once))).toEqual({
      range: 'pay_week', date: '2026-11-07', from: undefined, to: undefined, week: undefined, period: undefined,
    });
    expect(bidderPeriodRequest(twice, CLOCK)).toEqual({ period: 'week', date: '2026-11-07' });
    expect(bidderDays(twice, CLOCK, shownFor(twice))).toEqual({ from: '2026-11-01', to: '2026-11-07' });
    expect(bidderDays(twice, CLOCK)).toBeNull(); // a stepped week's days are the server's
    expect(bidderCanClear(twice, false)).toBe(true);
  });
  it('step forward back onto This pay week: snaps to the preset and drops date', () => {
    const twice = step(step(parse(), -1), -1);
    const once = step(twice, 1);
    expect(once).toMatchObject({ range: 'last_pay_week', date: '' });
    expect(stepBidderPeriod(twice, 1, CLOCK, shownFor(twice))).toMatchObject({ range: 'last_pay_week', date: undefined });
    const now = step(once, 1);
    expect(now).toMatchObject({ range: 'this_pay_week', date: '' });
    expect(stepBidderPeriod(once, 1, CLOCK, shownFor(once))).toMatchObject({ range: '', date: undefined });
    expect(bidderCanStepForward(now, CLOCK)).toBe(false);
  });
  it('a stepped pay week round-trips from a shared URL', () => {
    const f = parse({ range: 'pay_week', date: '2026-11-01' });
    expect(f).toMatchObject({ range: 'pay_week', date: '2026-11-01' });
    expect(parse({ range: 'pay_week', date: '2026-11-04' }).date).toBe('2026-11-04'); // any day of the pay week
    expect(bidderPeriodRequest(f, CLOCK)).toEqual({ period: 'week', date: '2026-11-01' });
    // Its own entry is in the dropdown while active, and only then.
    expect(bidderPresetOptions('pay_week').map((o) => o.label)).toEqual([
      'This pay week', 'Last pay week', 'Last 2 pay weeks', 'Pay week', 'This month', 'Last month', 'Custom',
    ]);
    expect(bidderPresetOptions('this_pay_week')).toBe(BIDDER_PRESETS);
    // The current / previous pay week in a shared URL is the named preset.
    expect(parse({ range: 'pay_week', date: '2026-11-16' })).toMatchObject({ range: 'this_pay_week', date: '' });
    expect(parse({ range: 'pay_week', date: '2026-11-10' })).toMatchObject({ range: 'last_pay_week', date: '' });
  });
  it('a stepped period with no usable date is the preset it came from', () => {
    expect(parse({ range: 'pay_week' })).toMatchObject({ range: 'this_pay_week', date: '' });
    expect(parse({ range: 'pay_week', date: 'junk' })).toMatchObject({ range: 'this_pay_week', date: '' });
    expect(parse({ range: 'pay_week', date: '2027-02-01' })).toMatchObject({ range: 'this_pay_week', date: '' });
    expect(parse({ range: 'two_pay_weeks' })).toMatchObject({ range: 'last_2_pay_weeks', date: '' });
    expect(parse({ range: 'month' })).toMatchObject({ range: 'this_month', date: '' });
  });
  it('two pay weeks: stepping off Last 2 pay weeks is "2 pay weeks", held by date', () => {
    const f = parse({ range: 'last_2_pay_weeks' });
    const back = step(f, -1);
    expect(back).toMatchObject({ range: 'two_pay_weeks', date: '2026-10-31' });
    expect(bidderPeriodRequest(back, CLOCK)).toEqual({ period: 'week', date: '2026-10-31', weeks: 2 });
    expect(bidderDays(back, CLOCK, shownFor(back))).toEqual({ from: '2026-10-18', to: '2026-10-31' });
    expect(bidderPresetOptions('two_pay_weeks').map((o) => o.label)).toContain('2 pay weeks');
    // Forward again lands back on Last 2 pay weeks.
    expect(step(back, 1)).toMatchObject({ range: 'last_2_pay_weeks', date: '' });
    expect(stepBidderPeriod(back, 1, CLOCK, shownFor(back))).toMatchObject({ range: 'last_2_pay_weeks', date: undefined });
    // Forward from Last 2 pay weeks: the 2 pay weeks ending with this one, which has no preset either.
    const ending = step(f, 1);
    expect(ending).toMatchObject({ range: 'two_pay_weeks', date: '2026-11-15' });
    expect(bidderCanStepForward(ending, CLOCK)).toBe(false);
    expect(bidderCanStepForward(back, CLOCK)).toBe(true);
  });
  it('two pay weeks round-trips from a shared URL', () => {
    const f = parse({ range: 'two_pay_weeks', date: '2026-10-25' });
    expect(f).toMatchObject({ range: 'two_pay_weeks', date: '2026-10-25' });
    expect(bidderPeriodRequest(f, CLOCK)).toEqual({ period: 'week', date: '2026-10-25', weeks: 2 });
    expect(parse({ range: 'two_pay_weeks', date: '2026-11-10' })).toMatchObject({ range: 'last_2_pay_weeks', date: '' });
  });
  it('a stepped month is "Month", held by date, and round-trips', () => {
    const f = parse({ range: 'month', date: '2026-09-15' });
    expect(f).toMatchObject({ range: 'month', date: '2026-09-01' });
    expect(bidderPeriodRequest(f, CLOCK)).toEqual({ period: 'month', date: '2026-09-01' });
    expect(bidderPresetOptions('month').map((o) => o.label)).toEqual([
      'This pay week', 'Last pay week', 'Last 2 pay weeks', 'This month', 'Last month', 'Month', 'Custom',
    ]);
  });
  it('picking a preset from the dropdown drops date', () => {
    expect(pickBidderPreset('last_pay_week', '', '', CLOCK)).toMatchObject({ range: 'last_pay_week', date: undefined });
    expect(pickBidderPreset('this_pay_week', '', '', CLOCK)).toMatchObject({ range: '', date: undefined });
  });
  it('steps Last 2 pay weeks by 14 days and never into the future', () => {
    const f = parse({ range: 'last_2_pay_weeks' });
    expect(bidderPeriodRequest(step(f, -1), CLOCK)).toEqual({ period: 'week', date: '2026-10-31', weeks: 2 });
    // Forward from the last 2 pay weeks: the 2 pay weeks ending with this one.
    expect(bidderPeriodRequest(step(f, 1), CLOCK)).toEqual({ period: 'week', date: '2026-11-15', weeks: 2 });
    expect(bidderCanStepForward(step(f, 1), CLOCK)).toBe(false);
  });
  it('steps months', () => {
    expect(step(parse({ range: 'this_month' }), -1)).toMatchObject({ range: 'last_month', date: '' });
    const sep = step(step(parse({ range: 'this_month' }), -1), -1);
    expect(sep).toMatchObject({ range: 'month', date: '2026-09-01' });
    expect(bidderPeriodRequest(sep, CLOCK)).toEqual({ period: 'month', date: '2026-09-01' });
    expect(step(sep, 1)).toMatchObject({ range: 'last_month', date: '' });
    expect(step(step(sep, 1), 1)).toMatchObject({ range: 'this_month', date: '' });
  });
  it('crosses a year boundary', () => {
    // Tue Jan 5, 2027: the pay week Mon Jan 4 .. Sun Jan 10.
    const jan: ReportClock = {
      today: '2027-01-05', payWeekStart: '2027-01-04', payWeekEnd: '2027-01-10', previousPayWeekStart: '2026-12-28',
      timezone: 'America/Chicago',
    };
    const f = parseBidderValues(BIDDER_URL_DEFAULTS, jan);
    const back = step(step(f, -1, jan), -1, jan);
    expect(bidderPeriodRequest(back, jan)).toEqual({ period: 'week', date: '2026-12-27' });
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
    const f = parse({ week: '2026-10-10' });
    const patch = stepBidderPeriod(f, -1, CLOCK, shownFor(f))!;
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
    expect(days).toEqual({ from: '2026-11-15', to: '2026-11-22' });
    expect(pickBidderPreset('custom', days.from, days.to, CLOCK)).toMatchObject({
      range: 'custom', from: '2026-11-15', to: '2026-11-18',
    });
  });
});

describe('days and labels', () => {
  it('works out the days of each period', () => {
    expect(bidderDays(parse({ range: 'last_pay_week' }), CLOCK)).toEqual({ from: '2026-11-08', to: '2026-11-14' });
    // Last 2 pay weeks has no seed: the clock doesn't say where the week before Last starts (1 to 8 days).
    expect(bidderDays(parse({ range: 'last_2_pay_weeks' }), CLOCK)).toBeNull();
    const last2 = parse({ range: 'last_2_pay_weeks' }, SHORT);
    expect(bidderDays(last2, SHORT)).toBeNull(); // Last = the 1-day Nov 15; the week before it is not 7 days back
    expect(bidderLabel(last2, bidderDays(last2, SHORT), undefined)).toBe('…');
    expect(bidderDays(parse({ range: 'this_month' }), CLOCK)).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    expect(bidderDays(parse({ range: 'last_month' }), CLOCK)).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    // After the switch Last pay week is the 8-day week: the clock says where it starts.
    expect(bidderDays(parse({ range: 'last_pay_week' }, AFTER), AFTER)).toEqual({ from: '2026-11-15', to: '2026-11-22' });
    // The server's days win once the period has loaded.
    expect(bidderDays(parse(), CLOCK, { first: '2026-11-15', last: '2026-11-22' })).toEqual({ from: '2026-11-15', to: '2026-11-22' });
    expect(bidderDays(parse({ range: 'last_2_pay_weeks' }, SHORT), SHORT, { first: '2026-11-08', last: '2026-11-15' }))
      .toEqual({ from: '2026-11-08', to: '2026-11-15' });
    // This pay week and Last pay week still come from the clock (Last = the 1-day week).
    expect(bidderDays(parse({ range: 'last_pay_week' }, SHORT), SHORT)).toEqual({ from: '2026-11-15', to: '2026-11-15' });
  });
  it('shows the server label for pay weeks and the dates otherwise', () => {
    const week = parse();
    expect(bidderLabel(week, bidderDays(week, CLOCK), 'Week ending Sun Nov 22')).toBe('Week ending Sun Nov 22');
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
    // The old Show key is gone: it is not a filter any more.
    expect(bidderCanClear(parse({ show: 'self' } as Record<string, string>), false)).toBe(false);
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

describe('whole pay weeks', () => {
  it('is true for the pay-week presets and their stepped versions only', () => {
    for (const r of ['this_pay_week', 'last_pay_week', 'last_2_pay_weeks', 'pay_week', 'two_pay_weeks'] as const) {
      expect(isWholePayWeeks(r)).toBe(true);
    }
    for (const r of ['this_month', 'last_month', 'month', 'custom'] as const) {
      expect(isWholePayWeeks(r)).toBe(false);
    }
  });
});

describe("a bidder's performance period", () => {
  const perf = (over: Parameters<typeof parse>[0] = {}) => bidderPerfRequest(parse(over, AFTER), AFTER);
  it('is Last month by default and for any pay-week range', () => {
    const last = { request: { period: 'month', date: '2026-10-01' }, fromList: false };
    expect(perf()).toEqual(last);
    expect(perf({ range: 'last_pay_week' })).toEqual(last);
    expect(perf({ range: 'two_pay_weeks', date: '2026-11-14' })).toEqual(last);
  });
  it("is the list's month, stepped months and valid Custom ranges, marked as from the list", () => {
    expect(perf({ range: 'this_month' })).toEqual({ request: { period: 'month' }, fromList: true });
    expect(perf({ range: 'last_month' })).toEqual({ request: { period: 'month', date: '2026-10-01' }, fromList: true });
    expect(perf({ range: 'month', date: '2026-09-01' })).toEqual({ request: { period: 'month', date: '2026-09-01' }, fromList: true });
    expect(perf({ range: 'custom', from: '2026-10-05', to: '2026-10-20' })).toEqual({
      request: { period: 'custom', date: '2026-10-05', to: '2026-10-20' }, fromList: true,
    });
  });
  it('falls back to Last month for a Custom range that is partial or invalid', () => {
    const last = { request: { period: 'month', date: '2026-10-01' }, fromList: false };
    expect(perf({ range: 'custom', from: '2026-10-05' })).toEqual(last);
    expect(perf({ range: 'custom', from: '2026-10-20', to: '2026-10-05' })).toEqual(last);
  });
});

describe("the Pay tab's default range (Last pay week)", () => {
  const PAY = 'last_pay_week' as const;
  const parsePay = (over: Parameters<typeof parse>[0] = {}) =>
    parseBidderValues({ ...BIDDER_URL_DEFAULTS, ...over }, AFTER, PAY);
  it('parses an empty range as Last pay week; an explicit range still wins', () => {
    expect(parsePay()).toMatchObject({ range: 'last_pay_week', date: '' });
    expect(parsePay({ range: 'this_pay_week' })).toMatchObject({ range: 'this_pay_week' });
    expect(bidderPeriodRequest(parsePay(), AFTER)).toEqual({ period: 'week', date: '2026-11-22' });
  });
  it('picking This pay week writes it (it is no longer the default); Last pay week leaves the URL', () => {
    expect(pickBidderPreset('this_pay_week', '', '', AFTER, PAY)).toMatchObject({ range: 'this_pay_week', date: undefined });
    expect(pickBidderPreset('last_pay_week', '', '', AFTER, PAY)).toMatchObject({ range: '', date: undefined });
  });
  it('Clear is not offered on Last pay week, but is on This pay week', () => {
    expect(bidderCanClear(parsePay(), false, PAY)).toBe(false);
    expect(bidderCanClear(parsePay({ range: 'this_pay_week' }), false, PAY)).toBe(true);
  });
  it('stepping back from Last pay week and forward again returns to the empty range', () => {
    const last = parsePay();
    const back = stepBidderPeriod(last, -1, AFTER, shownFor(last, AFTER), PAY)!;
    expect(back).toMatchObject({ range: 'pay_week', date: '2026-11-14' });
    const earlier = parseBidderValues({ ...BIDDER_URL_DEFAULTS, range: 'pay_week', date: '2026-11-14' }, AFTER, PAY);
    const fwd = stepBidderPeriod(earlier, 1, AFTER, shownFor(earlier, AFTER), PAY)!;
    expect(fwd).toMatchObject({ range: '', date: undefined });
  });
});
