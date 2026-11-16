import { describe, expect, it } from 'vitest';
import {
  INTERVIEW_PRESETS,
  barDiffers,
  barKeys,
  calendarFromFilters,
  callerRoundsQuery,
  filtersForCalendar,
  interviewUrlDefaults,
  listQuery,
  normalizeRange,
  parseInterviewValues,
  patchToUrl,
  rangeDates,
  roundsQuery,
  stepCalendar,
  viewSwitchQuery,
  type InterviewFilters,
} from './interviewFilters';

const D = { userId: 'me' };
const parse = (over: Record<string, string> = {}) =>
  parseInterviewValues({ ...interviewUrlDefaults(D), ...over }, D);
// Mon Nov 9 - Sun Nov 15, 2026 is "this week"; today is Wed Nov 11.
const TODAY = '2026-11-11';
const base = (over: Partial<InterviewFilters> = {}): InterviewFilters => ({ ...parse(), ...over });

describe('presets', () => {
  it('offers Next week right after This week', () => {
    expect(INTERVIEW_PRESETS.map((p) => p.value)).toEqual([
      'this_week', 'next_week', 'last_week', 'last_2_weeks', 'last_month', 'this_month', 'this_year', 'custom',
    ]);
    expect(INTERVIEW_PRESETS[1].label).toBe('Next week');
  });
});

describe('normalizeRange (old URLs)', () => {
  it('maps prev_week and prev_month to Last week and Last month', () => {
    expect(normalizeRange('prev_week')).toBe('last_week');
    expect(normalizeRange('prev_month')).toBe('last_month');
  });
  it('keeps the presets this page offers', () => {
    for (const p of INTERVIEW_PRESETS) expect(normalizeRange(p.value)).toBe(p.value);
  });
  it('falls back to This week for anything else (including presets other pages have)', () => {
    for (const bad of ['', 'nonsense', 'all_time', 'today', 'yesterday', 'THIS_WEEK']) {
      expect(normalizeRange(bad)).toBe('this_week');
    }
  });
});

describe('parseInterviewValues', () => {
  it('reads the defaults for an empty URL', () => {
    expect(parse()).toEqual({
      user: 'me', profile: '', stage: '', status: '', caller: '', owner: '', call: '', q: '',
      range: 'this_week', from: '', to: '', sort: 'latest', dir: 'desc', page: 1, size: 20,
    });
  });
  it('maps a bookmarked ?range=prev_week', () => {
    expect(parse({ range: 'prev_week' }).range).toBe('last_week');
  });
  it('survives junk without throwing', () => {
    const f = parse({ range: 'xx', from: 'abc', to: '2026-02-31', sort: 'zzz', dir: '?', page: '-4', call: 'both', user: '' });
    expect(f).toMatchObject({ range: 'this_week', from: '', to: '', sort: 'latest', dir: 'desc', page: 1, call: '', user: 'me' });
    expect(parse({ page: 'x' }).page).toBe(1);
    expect(parse({ page: '3' }).page).toBe(3);
  });
  it('reads size from the shared sizes only, default 20', () => {
    for (const s of [10, 20, 50, 100]) expect(parse({ size: String(s) }).size).toBe(s);
    for (const bad of ['', '25', '0', '-10', 'big', '1000']) expect(parse({ size: bad }).size).toBe(20);
  });
  it('keeps custom dates as typed so the bar can explain them', () => {
    const f = parse({ range: 'custom', from: '2026-02-31', to: '2026-03-01' });
    expect(f).toMatchObject({ range: 'custom', from: '2026-02-31', to: '2026-03-01' });
  });
  it('ignores from / to unless the range is Custom', () => {
    expect(parse({ range: 'last_week', from: '2026-01-01', to: '2026-01-02' })).toMatchObject({ from: '', to: '' });
  });
});

describe('patchToUrl', () => {
  it('turns numbers into strings and keeps undefined (back to default)', () => {
    expect(patchToUrl({ page: 2, q: 'acme', from: undefined })).toEqual({ page: '2', q: 'acme', from: undefined });
    expect('from' in patchToUrl({ from: undefined })).toBe(true);
  });
});

describe('rangeDates', () => {
  it('resolves presets (Monday-Sunday weeks, Next week in the future)', () => {
    expect(rangeDates({ range: 'this_week', from: '', to: '' }, TODAY)).toEqual({ from: '2026-11-09', to: '2026-11-15' });
    expect(rangeDates({ range: 'next_week', from: '', to: '' }, TODAY)).toEqual({ from: '2026-11-16', to: '2026-11-22' });
    expect(rangeDates({ range: 'last_week', from: '', to: '' }, TODAY)).toEqual({ from: '2026-11-02', to: '2026-11-08' });
    // not clipped to today: Interviews allows the future
    expect(rangeDates({ range: 'this_month', from: '', to: '' }, TODAY)).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    expect(rangeDates({ range: 'this_year', from: '', to: '' }, TODAY)).toEqual({ from: '2026-01-01', to: '2026-12-31' });
  });
  it('is null for an invalid or partial custom range', () => {
    expect(rangeDates({ range: 'custom', from: '', to: '' }, TODAY)).toBeNull();
    expect(rangeDates({ range: 'custom', from: '2026-11-01', to: '' }, TODAY)).toBeNull();
    expect(rangeDates({ range: 'custom', from: '2026-02-31', to: '2026-03-01' }, TODAY)).toBeNull();
    expect(rangeDates({ range: 'custom', from: '2026-11-05', to: '2026-11-01' }, TODAY)).toBeNull();
    expect(rangeDates({ range: 'custom', from: '2025-01-01', to: '2026-11-01' }, TODAY)).toBeNull();
    expect(rangeDates({ range: 'custom', from: '2026-11-01', to: '2026-11-05' }, TODAY)).toEqual({ from: '2026-11-01', to: '2026-11-05' });
  });
});

describe('listQuery', () => {
  // Wed Nov 11 2026 noon in New York is 17:00 UTC; EST (UTC-5) since Nov 1.
  const now = new Date('2026-11-11T17:00:00Z');
  it('sends the chosen zone\'s midnights for the from / to calendar days', () => {
    const q = listQuery(base(), 20, now, 'America/New_York')!;
    expect(q.from).toBe('2026-11-09T05:00:00.000Z');
    expect(q.to).toBe('2026-11-16T04:59:59.999Z');
    expect(q).toMatchObject({ page: 1, limit: 20, sort: 'latest', dir: 'desc' });
  });
  it('works out "this week" from today in the chosen zone, not the browser', () => {
    // 02:00 UTC Monday Nov 16 is still Sunday Nov 15 in Los Angeles.
    const late = new Date('2026-11-16T02:00:00Z');
    expect(listQuery(base(), 20, late, 'America/Los_Angeles')!.from).toBe('2026-11-09T08:00:00.000Z');
    expect(listQuery(base(), 20, late, 'UTC')!.from).toBe('2026-11-16T00:00:00.000Z');
  });
  it('asks for next week', () => {
    const q = listQuery(base({ range: 'next_week' }), 20, now, 'UTC')!;
    expect(q.from).toBe('2026-11-16T00:00:00.000Z');
    expect(q.to).toBe('2026-11-22T23:59:59.999Z');
  });
  it('converts a custom range the same way', () => {
    const q = listQuery(base({ range: 'custom', from: '2026-11-01', to: '2026-11-05' }), 10, now, 'America/New_York')!;
    expect(q.from).toBe('2026-11-01T04:00:00.000Z'); // still EDT until 2 am Nov 1
    expect(q.to).toBe('2026-11-06T04:59:59.999Z');
  });
  it('is null while a custom range is invalid or partial', () => {
    expect(listQuery(base({ range: 'custom', from: '2026-11-01', to: '' }), 20, now, 'UTC')).toBeNull();
    expect(listQuery(base({ range: 'custom', from: '2026-02-31', to: '2026-03-01' }), 20, now, 'UTC')).toBeNull();
  });
  it('adds the filters, and q only when it has text', () => {
    const q = listQuery(base({ user: 'u1', profile: 'a1', stage: 'intro', status: 'scheduled', call: 'caller', q: '  acme  ' }), 20, now, 'UTC')!;
    expect(q).toMatchObject({ creatorId: 'u1', accountId: 'a1', stage: 'intro', status: 'scheduled', callType: 'caller', q: 'acme' });
    expect('q' in listQuery(base({ q: '   ' }), 20, now, 'UTC')!).toBe(false);
    expect('creatorId' in listQuery(base({ user: 'all' }), 20, now, 'UTC')!).toBe(false);
  });
});

describe('page size', () => {
  const now = new Date('2026-11-11T17:00:00Z');
  it('is sent as the request limit', () => {
    expect(listQuery(base({ size: 100, page: 2 }), 100, now, 'UTC')).toMatchObject({ limit: 100, page: 2 });
    expect(callerRoundsQuery(base({ size: 50 }), 50, now, 'UTC')).toMatchObject({ limit: 50 });
  });
});

describe('callerRoundsQuery', () => {
  const now = new Date('2026-11-11T17:00:00Z');
  it('uses the same range, the Caller / User filters and q', () => {
    const q = callerRoundsQuery(base({ caller: 'c1', owner: 'u2', stage: 'intro', q: 'acme' }), 20, now, 'UTC')!;
    expect(q).toMatchObject({ from: '2026-11-09T00:00:00.000Z', to: '2026-11-15T23:59:59.999Z', callerId: 'c1', creatorId: 'u2', stage: 'intro', q: 'acme', page: 1, limit: 20, dir: 'desc' });
  });
  it('is null while the range is invalid', () => {
    expect(callerRoundsQuery(base({ range: 'custom', from: '', to: '' }), 20, now, 'UTC')).toBeNull();
  });
});

describe('roundsQuery (calendar)', () => {
  it('adds q and the tab\'s filters', () => {
    const r = { from: '2026-11-09', to: '2026-11-16' };
    expect(roundsQuery(base({ user: 'u1', q: 'acme' }), r, 'UTC')).toMatchObject({ creatorId: 'u1', q: 'acme', from: '2026-11-09T00:00:00.000Z', to: '2026-11-16T00:00:00.000Z' });
    expect(roundsQuery(base({ caller: 'c1', q: 'acme' }), r, 'UTC', { callers: true })).toMatchObject({ callerOnly: 'true', callerId: 'c1', q: 'acme' });
    expect('q' in roundsQuery(base(), r, 'UTC')).toBe(false);
  });
});

describe('calendar <-> Date range', () => {
  it('shows the week for week presets', () => {
    expect(calendarFromFilters(base(), TODAY)).toEqual({ view: 'week', anchor: '2026-11-09' });
    expect(calendarFromFilters(base({ range: 'next_week' }), TODAY)).toEqual({ view: 'week', anchor: '2026-11-16' });
    expect(calendarFromFilters(base({ range: 'last_week' }), TODAY)).toEqual({ view: 'week', anchor: '2026-11-02' });
  });
  it('shows Month view for longer ranges; This year shows the current month', () => {
    expect(calendarFromFilters(base({ range: 'this_month' }), TODAY)).toEqual({ view: 'month', anchor: '2026-11-01' });
    expect(calendarFromFilters(base({ range: 'last_month' }), TODAY)).toEqual({ view: 'month', anchor: '2026-10-01' });
    expect(calendarFromFilters(base({ range: 'last_2_weeks' }), TODAY)).toEqual({ view: 'month', anchor: '2026-10-26' });
    expect(calendarFromFilters(base({ range: 'this_year' }), TODAY)).toEqual({ view: 'month', anchor: '2026-11-01' });
  });
  it('shows the week of a custom range of 7 days or less, else its month', () => {
    expect(calendarFromFilters(base({ range: 'custom', from: '2026-12-02', to: '2026-12-04' }), TODAY)).toEqual({ view: 'week', anchor: '2026-12-02' });
    expect(calendarFromFilters(base({ range: 'custom', from: '2026-12-01', to: '2026-12-31' }), TODAY)).toEqual({ view: 'month', anchor: '2026-12-01' });
  });
  it('shows nothing for an invalid custom range', () => {
    expect(calendarFromFilters(base({ range: 'custom', from: '', to: '' }), TODAY)).toBeNull();
  });

  it('writes a named preset when the period matches, else a custom range', () => {
    expect(filtersForCalendar('week', '2026-11-12', TODAY)).toEqual({ range: 'this_week', from: '', to: '' });
    expect(filtersForCalendar('week', '2026-11-17', TODAY)).toEqual({ range: 'next_week', from: '', to: '' });
    expect(filtersForCalendar('week', '2026-11-04', TODAY)).toEqual({ range: 'last_week', from: '', to: '' });
    expect(filtersForCalendar('week', '2026-12-02', TODAY)).toEqual({ range: 'custom', from: '2026-11-30', to: '2026-12-06' });
    expect(filtersForCalendar('month', '2026-11-20', TODAY)).toEqual({ range: 'this_month', from: '', to: '' });
    expect(filtersForCalendar('month', '2026-10-09', TODAY)).toEqual({ range: 'last_month', from: '', to: '' });
    expect(filtersForCalendar('month', '2026-12-09', TODAY)).toEqual({ range: 'custom', from: '2026-12-01', to: '2026-12-31' });
  });

  it('steps by a week or a month and writes the shared range', () => {
    expect(stepCalendar('week', '2026-11-09', 1, TODAY)).toEqual({ range: 'next_week', from: '', to: '' });
    expect(stepCalendar('week', '2026-11-09', -1, TODAY)).toEqual({ range: 'last_week', from: '', to: '' });
    expect(stepCalendar('week', '2026-11-16', 1, TODAY)).toEqual({ range: 'custom', from: '2026-11-23', to: '2026-11-29' });
    expect(stepCalendar('week', '2026-11-16', -1, TODAY)).toEqual({ range: 'this_week', from: '', to: '' });
    expect(stepCalendar('month', '2026-11-01', -1, TODAY)).toEqual({ range: 'last_month', from: '', to: '' });
    expect(stepCalendar('month', '2026-11-01', 1, TODAY)).toEqual({ range: 'custom', from: '2026-12-01', to: '2026-12-31' });
    // across a year boundary
    expect(stepCalendar('month', '2026-12-01', 1, TODAY)).toEqual({ range: 'custom', from: '2027-01-01', to: '2027-01-31' });
    expect(stepCalendar('week', '2026-12-28', 1, TODAY)).toEqual({ range: 'custom', from: '2027-01-04', to: '2027-01-10' });
  });

  it('round-trips: what the calendar writes, the calendar reads back', () => {
    const f = stepCalendar('week', '2026-11-16', 1, TODAY);
    expect(calendarFromFilters(base(f), TODAY)).toEqual({ view: 'week', anchor: '2026-11-23' });
    const m = stepCalendar('month', '2026-11-01', 1, TODAY);
    expect(calendarFromFilters(base(m), TODAY)).toEqual({ view: 'month', anchor: '2026-12-01' });
  });
});

describe('barDiffers / barKeys (Clear)', () => {
  it('is false at the defaults, ignoring sort and page', () => {
    expect(barDiffers(parse({ sort: 'company', dir: 'asc', page: '3' }), D, false)).toBe(false);
    expect(barDiffers(parse(), D, true)).toBe(false);
  });
  it('is true when anything the Interviews bar shows changed', () => {
    for (const over of <Record<string, string>[]>[{ user: 'all' }, { profile: 'a' }, { call: 'self' }, { stage: 'intro' }, { status: 'passed' }, { q: 'x' }, { range: 'next_week' }, { range: 'prev_week' }]) {
      expect(barDiffers(parse(over), D, false)).toBe(true);
    }
  });
  it('is true when anything the Caller schedule bar shows changed, and ignores the Interviews-only keys', () => {
    for (const over of <Record<string, string>[]>[{ owner: 'u' }, { caller: 'c' }, { stage: 'intro' }, { q: 'x' }, { range: 'this_month' }]) {
      expect(barDiffers(parse(over), D, true)).toBe(true);
    }
    expect(barDiffers(parse({ user: 'all', profile: 'a', call: 'self' }), D, true)).toBe(false);
  });
  it('never lists the deep-link or sort keys', () => {
    for (const callers of [false, true]) {
      const keys = barKeys(callers) as string[];
      for (const k of ['panel', 'round', 'brief', 'zone', 'sort', 'dir', 'page']) expect(keys).not.toContain(k);
      expect(keys).toEqual(expect.arrayContaining(['q', 'range', 'from', 'to', 'stage', 'status']));
    }
  });
});

describe('viewSwitchQuery (List | Calendar and the tabs)', () => {
  it('carries filters and drops the page and one-off links', () => {
    const p = new URLSearchParams('range=next_week&q=acme&stage=intro&page=3&panel=abc&round=a:b&brief=1&zone=x');
    expect(viewSwitchQuery(p)).toBe('?range=next_week&q=acme&stage=intro&zone=x');
    expect(viewSwitchQuery(new URLSearchParams('page=2'))).toBe('');
  });
});
