import { describe, expect, it } from 'vitest';
import {
  JD_CLEAR_KEYS,
  JD_URL_DEFAULTS,
  RUNS_ALL_USERS,
  RUNS_CLEAR_KEYS,
  RUNS_URL_DEFAULTS,
  jdCanClear,
  matchesJd,
  parseJdValues,
  parseRunsValues,
  runsCanClear,
  runsForUser,
  runsListParams,
  runsProfiles,
} from './promptEvalFilters';

const jd = (over: Record<string, string> = {}) => parseJdValues({ ...JD_URL_DEFAULTS, ...over });

describe('Prompt Eval keys', () => {
  it('keeps the two tabs off each other and off the page keys', () => {
    const keys = [...Object.keys(RUNS_URL_DEFAULTS), ...Object.keys(JD_URL_DEFAULTS)];
    expect(new Set(keys).size).toBe(keys.length);
    for (const page of ['tab', 'ids', 'with']) expect(keys).not.toContain(page);
  });
});

describe('Runs tab', () => {
  it('has no profile by default and sends no accountId', () => {
    expect(parseRunsValues(RUNS_URL_DEFAULTS)).toEqual({ account: '', user: 'all' });
    expect(runsListParams(parseRunsValues(RUNS_URL_DEFAULTS))).toEqual({ accountId: undefined, limit: 50 });
  });
  it('sends the profile it was given', () => {
    expect(runsListParams(parseRunsValues({ account: ' abc123 ', user: '' }))).toEqual({ accountId: 'abc123', limit: 50 });
  });
  it('shows Clear only with a profile picked', () => {
    expect(runsCanClear(parseRunsValues({ account: '', user: '' }))).toBe(false);
    expect(runsCanClear(parseRunsValues({ account: 'abc', user: '' }))).toBe(true);
    expect(RUNS_CLEAR_KEYS).toEqual(['account', 'user']);
  });
});

describe('Runs tab: the User filter (admins)', () => {
  const accounts = [
    { _id: 'a1', name: 'Alpha', createdBy: 't1' },
    { _id: 'a2', name: 'Beta', createdBy: 't2' },
    { _id: 'a3', name: 'Gamma', createdBy: 'me' },
  ];
  const runs = [{ _id: 'r1', accountId: 'a1' }, { _id: 'r2', accountId: 'a2' }, { _id: 'r3', accountId: 'a3' }];
  const parse = (over: Partial<Record<'account' | 'user', string>> = {}, d = 't1') =>
    parseRunsValues({ ...RUNS_URL_DEFAULTS, ...over }, d);

  it("an absent user is the default (the first team member); All users and another user are kept", () => {
    expect(parse().user).toBe('t1');
    expect(parse({ user: RUNS_ALL_USERS }).user).toBe('all');
    expect(parse({ user: 't2' }).user).toBe('t2');
    // No team members: every user.
    expect(parse({}, '').user).toBe('all');
  });
  it("offers the picked user's profiles, every profile under All users, and staff only their own", () => {
    expect(runsProfiles(accounts, parse(), true, 'me').map((a) => a._id)).toEqual(['a1']);
    expect(runsProfiles(accounts, parse({ user: 'all' }), true, 'me').map((a) => a._id)).toEqual(['a1', 'a2', 'a3']);
    expect(runsProfiles(accounts, parse({ user: 't2' }), false, 'me').map((a) => a._id)).toEqual(['a3']);
  });
  it("narrows the runs to the user's profiles unless a profile is picked or All users", () => {
    const ids = (f: ReturnType<typeof parse>) => new Set(runsProfiles(accounts, f, true, 'me').map((a) => a._id));
    const shown = (f: ReturnType<typeof parse>, admin = true) => runsForUser(runs, f, admin, ids(f)).map((r) => r._id);
    expect(shown(parse())).toEqual(['r1']);
    expect(shown(parse({ user: 'all' }))).toEqual(['r1', 'r2', 'r3']);
    expect(shown(parse({ account: 'a2' }))).toEqual(['r1', 'r2', 'r3']);
    expect(shown(parse(), false)).toEqual(['r1', 'r2', 'r3']);
  });
  it('asks for the most runs the server allows while narrowing by user', () => {
    expect(runsListParams(parse(), true)).toEqual({ accountId: undefined, limit: 100 });
    expect(runsListParams(parse({ user: 'all' }), true)).toEqual({ accountId: undefined, limit: 50 });
    expect(runsListParams(parse(), false)).toEqual({ accountId: undefined, limit: 50 });
  });
  it('Clear shows for a user other than the default (admins only) and puts the default back', () => {
    expect(runsCanClear(parse(), true, 't1')).toBe(false);
    expect(runsCanClear(parse({ user: 'all' }), true, 't1')).toBe(true);
    expect(runsCanClear(parse({ user: 't2' }), true, 't1')).toBe(true);
    expect(runsCanClear(parse({ user: 't2' }), false, 't1')).toBe(false);
    expect(runsCanClear(parse({ user: 'all' }, ''), true, '')).toBe(false);
    expect(RUNS_CLEAR_KEYS).toContain('user');
  });
});

describe('Job descriptions tab', () => {
  it('defaults to every role, archived hidden, no search', () => {
    expect(jd()).toEqual({ role: '', archived: false, q: '' });
  });
  it('reads good values', () => {
    expect(jd({ role: 'ml', archived: '1', q: 'acme' })).toEqual({ role: 'ml', archived: true, q: 'acme' });
  });
  it('falls back to the defaults for junk', () => {
    expect(jd({ role: 'wizard', archived: 'yes' })).toEqual({ role: '', archived: false, q: '' });
  });
  it('filters by role', () => {
    const f = jd({ role: 'ai' });
    expect(matchesJd({ role: 'ai', title: 'A', company: 'B' }, f)).toBe(true);
    expect(matchesJd({ role: 'ml', title: 'A', company: 'B' }, f)).toBe(false);
  });
  it('searches title and company, any case, ignoring surrounding spaces', () => {
    const f = jd({ q: '  AcMe ' });
    expect(matchesJd({ role: 'ai', title: 'Senior Engineer', company: 'Acme Corp' }, f)).toBe(true);
    expect(matchesJd({ role: 'ai', title: 'Acme platform lead', company: 'Other' }, f)).toBe(true);
    expect(matchesJd({ role: 'ai', title: 'Senior Engineer', company: 'Other' }, f)).toBe(false);
  });
  it('matches everything with an empty or blank search', () => {
    expect(matchesJd({ role: 'ai', title: 'x', company: 'y' }, jd({ q: '   ' }))).toBe(true);
  });
  it('combines role and search', () => {
    const f = jd({ role: 'ai', q: 'acme' });
    expect(matchesJd({ role: 'ml', title: 'x', company: 'Acme' }, f)).toBe(false);
    expect(matchesJd({ role: 'ai', title: 'x', company: 'Acme' }, f)).toBe(true);
  });
  it('shows Clear only when something differs from the default', () => {
    expect(jdCanClear(jd())).toBe(false);
    expect(jdCanClear(jd({ role: 'ai' }))).toBe(true);
    expect(jdCanClear(jd({ archived: '1' }))).toBe(true);
    expect(jdCanClear(jd({ q: 'a' }))).toBe(true);
    expect(jdCanClear(jd({ role: 'junk', archived: 'no' }))).toBe(false);
    expect(JD_CLEAR_KEYS).toEqual(['role', 'archived', 'q']);
  });
});
