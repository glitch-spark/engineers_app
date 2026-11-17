import { describe, expect, it } from 'vitest';
import {
  PANEL_URL_DEFAULTS,
  PROFILE_ALL_USERS,
  PROFILE_CLEAR_KEYS,
  PROFILE_PRESETS,
  PROFILE_REGION_OPTIONS,
  PROFILE_URL_DEFAULTS,
  legacyRangePatch,
  normalizeProfileRange,
  panelRequest,
  parsePanelValues,
  parseProfileValues,
  profileBenchmarkParams,
  profileCanClear,
  profileDays,
  profileListParams,
  profileMetricsParams,
  profileRangeError,
  type ProfileUrlValues,
} from './profileFilters';

// Wed Nov 11, 2026.
const TODAY = '2026-11-11';
const parse = (over: Record<string, string> = {}) => parseProfileValues({ ...PROFILE_URL_DEFAULTS, ...over });
const panel = (over: Record<string, string> = {}) => parsePanelValues({ ...PANEL_URL_DEFAULTS, ...over });

describe('presets and defaults', () => {
  it('offers the standard presets with All time below them', () => {
    expect(PROFILE_PRESETS.map((p) => p.value)).toEqual([
      'this_week', 'last_week', 'last_2_weeks', 'last_month', 'this_month', 'this_year', 'all_time', 'custom',
    ]);
  });
  it('lists Canada, Asia and No region too', () => {
    expect(PROFILE_REGION_OPTIONS.map((o) => o.value)).toEqual(['', 'Latam', 'EU', 'US', 'Canada', 'Asia', 'none']);
  });
  it('defaults to active profiles, all time, page 1, 20 per page', () => {
    expect(PROFILE_URL_DEFAULTS).toEqual({
      user: '', status: 'active', region: '', q: '', range: 'all_time', from: '', to: '', page: '1', size: '20',
    });
    expect(parse()).toEqual({
      user: 'all', status: 'active', region: '', q: '', range: 'all_time', from: '', to: '', page: 1, size: 20,
    });
  });
});

describe('URL -> filters', () => {
  it('reads every key', () => {
    expect(parse({
      user: 'u9', status: 'archived', region: 'Asia', q: 'ann', range: 'last_month', page: '3', size: '50',
    })).toEqual({
      user: 'u9', status: 'archived', region: 'Asia', q: 'ann', range: 'last_month', from: '', to: '', page: 3, size: 50,
    });
  });
  it('maps the old Interviews names', () => {
    expect(parse({ range: 'prev_week' }).range).toBe('last_week');
    expect(parse({ range: 'prev_month' }).range).toBe('last_month');
  });
  it('falls back to the defaults for junk', () => {
    const f = parse({ range: 'next_week', status: 'gone', region: 'Mars', page: 'x', size: '7' });
    expect(f).toMatchObject({ range: 'all_time', status: 'active', region: '', page: 1, size: 20 });
    expect(parse({ page: '-4' }).page).toBe(1);
    expect(parse({ size: '25' }).size).toBe(20);
    expect(normalizeProfileRange('whatever')).toBe('all_time');
    expect(normalizeProfileRange('today')).toBe('all_time'); // not offered here
  });
  it('keeps from / to only for Custom', () => {
    expect(parse({ range: 'this_week', from: '2026-01-01', to: '2026-01-09' })).toMatchObject({ from: '', to: '' });
    expect(parse({ range: 'custom', from: '2026-01-01', to: '2026-01-09' })).toMatchObject({
      range: 'custom', from: '2026-01-01', to: '2026-01-09',
    });
  });
});

describe('list request', () => {
  it('sends the page, size, search, status and region; the owner only for an admin', () => {
    const f = parse({ user: 'u9', status: 'all', region: 'none', q: 'ann', page: '2', size: '10' });
    expect(profileListParams(f, true)).toEqual({
      page: 2, limit: 10, search: 'ann', status: 'all', region: 'none', userId: 'u9',
    });
    expect(profileListParams(f, false)).toEqual({ page: 2, limit: 10, search: 'ann', status: 'all', region: 'none' });
  });
  it('leaves region and owner out when they are not set', () => {
    expect(profileListParams(parse(), true)).toEqual({ page: 1, limit: 20, search: '', status: 'active' });
  });
});

describe('metrics request (the same days as before the shared control)', () => {
  it('All time asks for every week since each profile was created', () => {
    expect(profileMetricsParams(parse(), TODAY, false)).toEqual({ weeks: 'all' });
    expect(profileBenchmarkParams(parse(), TODAY)).toEqual({ period: 'all' });
  });
  it('a preset asks for its whole calendar period (Monday to Sunday, future days included)', () => {
    const cases: [string, { from: string; to: string }][] = [
      ['this_week', { from: '2026-11-09', to: '2026-11-15' }],
      ['last_week', { from: '2026-11-02', to: '2026-11-08' }],
      ['last_2_weeks', { from: '2026-10-26', to: '2026-11-08' }],
      ['this_month', { from: '2026-11-01', to: '2026-11-30' }],
      ['last_month', { from: '2026-10-01', to: '2026-10-31' }],
      ['this_year', { from: '2026-01-01', to: '2026-12-31' }],
    ];
    for (const [range, days] of cases) {
      expect(profileDays(parse({ range }), TODAY)).toEqual(days);
      expect(profileMetricsParams(parse({ range }), TODAY, false)).toEqual(days);
      expect(profileBenchmarkParams(parse({ range }), TODAY)).toEqual({ period: 'custom', date: days.from, to: days.to });
    }
  });
  it('old prev_week / prev_month ask for the same days as last_week / last_month', () => {
    expect(profileDays(parse({ range: 'prev_week' }), TODAY)).toEqual({ from: '2026-11-02', to: '2026-11-08' });
    expect(profileDays(parse({ range: 'prev_month' }), TODAY)).toEqual({ from: '2026-10-01', to: '2026-10-31' });
  });
  it('Custom asks for the typed days; an admin adds the owner', () => {
    const f = parse({ range: 'custom', from: '2026-01-01', to: '2026-01-09', user: 'u9' });
    expect(profileMetricsParams(f, TODAY, true)).toEqual({ from: '2026-01-01', to: '2026-01-09', userId: 'u9' });
    expect(profileMetricsParams(f, TODAY, false)).toEqual({ from: '2026-01-01', to: '2026-01-09' });
    expect(profileMetricsParams(parse({ user: 'u9' }), TODAY, true)).toEqual({ weeks: 'all', userId: 'u9' });
  });
  it('a partial or invalid Custom range asks for nothing and says why', () => {
    for (const over of [
      { from: '', to: '' },
      { from: '2026-11-01', to: '' },
      { from: '2026-02-31', to: '2026-03-01' },
      { from: '2026-11-05', to: '2026-11-01' },
      { from: '2025-01-01', to: '2026-11-01' },
    ]) {
      const f = parse({ range: 'custom', ...over });
      expect(profileRangeError(f)).not.toBeNull();
      expect(profileDays(f, TODAY)).toBeNull();
      expect(profileMetricsParams(f, TODAY, true)).toBeNull();
      expect(profileBenchmarkParams(f, TODAY)).toBeNull();
    }
    expect(profileRangeError(parse({ range: 'custom', from: '', to: '' }))).toBe('Pick both dates.');
    expect(profileRangeError(parse({ range: 'custom', from: '2026-11-05', to: '2026-11-01' }))).toBe('From must be on or before To.');
    expect(profileRangeError(parse())).toBeNull();
  });
});

describe('Clear', () => {
  it('shows only when something differs from the defaults', () => {
    expect(profileCanClear(parse(), true)).toBe(false);
    expect(profileCanClear(parse({ status: 'archived' }), false)).toBe(true);
    expect(profileCanClear(parse({ region: 'EU' }), false)).toBe(true);
    expect(profileCanClear(parse({ q: 'x' }), false)).toBe(true);
    expect(profileCanClear(parse({ range: 'this_year' }), false)).toBe(true);
    expect(profileCanClear(parse({ user: 'u9' }), true)).toBe(true);
    expect(profileCanClear(parse({ user: 'u9' }), false)).toBe(false);
    expect(profileCanClear(parse({ page: '4', size: '50' }), false)).toBe(false);
  });
});

describe("the admin's User default (the first team member)", () => {
  const withDefault = (over: Partial<ProfileUrlValues> = {}) => parseProfileValues({ ...PROFILE_URL_DEFAULTS, ...over }, 't1');
  it('an absent user is the first team member, sent as userId', () => {
    const f = withDefault();
    expect(f.user).toBe('t1');
    expect(profileListParams(f, true)).toMatchObject({ userId: 't1' });
    expect(profileMetricsParams(f, TODAY, true)).toEqual({ weeks: 'all', userId: 't1' });
    expect(profileCanClear(f, true, 't1')).toBe(false);
  });
  it('an explicit All users survives (sent without userId) and offers Clear', () => {
    const f = withDefault({ user: PROFILE_ALL_USERS });
    expect(f.user).toBe('all');
    expect('userId' in profileListParams(f, true)).toBe(false);
    expect(profileMetricsParams(f, TODAY, true)).toEqual({ weeks: 'all' });
    expect(profileCanClear(f, true, 't1')).toBe(true);
  });
  it('another user is kept; Clear removes the key, which is the default again', () => {
    const f = withDefault({ user: 'u9' });
    expect(profileListParams(f, true)).toMatchObject({ userId: 'u9' });
    expect(profileCanClear(f, true, 't1')).toBe(true);
    expect(PROFILE_CLEAR_KEYS).toContain('user');
    expect(PROFILE_URL_DEFAULTS.user).toBe('');
  });
  it('without team members an absent user is every owner', () => {
    expect(parse().user).toBe('all');
    expect(profileCanClear(parse(), true, '')).toBe(false);
  });
  it('staff never send a user', () => {
    expect('userId' in profileListParams(withDefault({ user: 'u9' }), false)).toBe(false);
  });
});

describe('the range once kept in localStorage (profiles.range)', () => {
  const saved = (preset: string, from = '', to = '') => JSON.stringify({ preset, from, to });
  it('maps the old names and applies the range once', () => {
    expect(legacyRangePatch(false, saved('prev_week'))).toEqual({ range: 'last_week', from: undefined, to: undefined });
    expect(legacyRangePatch(false, saved('prev_month'))).toEqual({ range: 'last_month', from: undefined, to: undefined });
    expect(legacyRangePatch(false, saved('this_year'))).toEqual({ range: 'this_year', from: undefined, to: undefined });
    expect(legacyRangePatch(false, saved('custom', '2026-01-01', '2026-01-09'))).toEqual({
      range: 'custom', from: '2026-01-01', to: '2026-01-09',
    });
  });
  it('does nothing when the URL has a range, or the saved value is All time', () => {
    expect(legacyRangePatch(true, saved('this_week'))).toBeNull();
    expect(legacyRangePatch(false, saved('all'))).toBeNull();
    expect(legacyRangePatch(false, saved('all_time'))).toBeNull();
  });
  it('ignores missing, junk and invalid values', () => {
    expect(legacyRangePatch(false, null)).toBeNull();
    expect(legacyRangePatch(false, '')).toBeNull();
    expect(legacyRangePatch(false, 'not json')).toBeNull();
    expect(legacyRangePatch(false, 'null')).toBeNull();
    expect(legacyRangePatch(false, '42')).toBeNull();
    expect(legacyRangePatch(false, JSON.stringify({ preset: 7 }))).toBeNull();
    expect(legacyRangePatch(false, saved('next_week'))).toBeNull();
    expect(legacyRangePatch(false, saved('custom', '2026-01-09', '2026-01-01'))).toBeNull();
    expect(legacyRangePatch(false, saved('custom', '', ''))).toBeNull();
    expect(legacyRangePatch(false, JSON.stringify({ preset: 'custom', from: 5, to: 6 }))).toBeNull();
  });
});

describe('Metrics tab', () => {
  it('defaults to All time', () => {
    expect(PANEL_URL_DEFAULTS).toEqual({ range: 'all_time', from: '', to: '' });
    expect(panelRequest(panel(), TODAY)).toEqual({ period: 'all' });
  });
  it('This week and This month name their period (the end is clipped to today by the control and the server)', () => {
    expect(panelRequest(panel({ range: 'this_week' }), TODAY)).toEqual({ period: 'week', date: '2026-11-09' });
    expect(panelRequest(panel({ range: 'last_week' }), TODAY)).toEqual({ period: 'week', date: '2026-11-02' });
    expect(panelRequest(panel({ range: 'this_month' }), TODAY)).toEqual({ period: 'month', date: '2026-11-01' });
    expect(panelRequest(panel({ range: 'last_month' }), TODAY)).toEqual({ period: 'month', date: '2026-10-01' });
  });
  it('other presets are a custom range, this year ending today', () => {
    expect(panelRequest(panel({ range: 'last_2_weeks' }), TODAY)).toEqual({ period: 'custom', date: '2026-10-26', to: '2026-11-08' });
    expect(panelRequest(panel({ range: 'this_year' }), TODAY)).toEqual({ period: 'custom', date: '2026-01-01', to: TODAY });
  });
  it('Custom asks for the typed days', () => {
    expect(panelRequest(panel({ range: 'custom', from: '2026-10-01', to: '2026-10-20' }), TODAY)).toEqual({
      period: 'custom', date: '2026-10-01', to: '2026-10-20',
    });
  });
  it('a partial or invalid Custom range asks for nothing', () => {
    expect(panelRequest(panel({ range: 'custom', from: '2026-10-01' }), TODAY)).toBeNull();
    expect(panelRequest(panel({ range: 'custom', from: '2026-02-31', to: '2026-03-02' }), TODAY)).toBeNull();
    expect(panelRequest(panel({ range: 'custom', from: '2026-10-09', to: '2026-10-01' }), TODAY)).toBeNull();
  });
  it('maps old names and falls back to All time for junk', () => {
    expect(panel({ range: 'prev_week' }).range).toBe('last_week');
    expect(panel({ range: 'month' }).range).toBe('all_time');
    expect(panelRequest(panel({ range: 'junk', from: '2026-01-01', to: '2026-01-02' }), TODAY)).toEqual({ period: 'all' });
  });
});
