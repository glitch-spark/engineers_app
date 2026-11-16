import { describe, expect, it } from 'vitest';
import {
  JD_CLEAR_KEYS,
  JD_URL_DEFAULTS,
  RUNS_CLEAR_KEYS,
  RUNS_URL_DEFAULTS,
  jdCanClear,
  matchesJd,
  parseJdValues,
  parseRunsValues,
  runsCanClear,
  runsListParams,
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
    expect(parseRunsValues(RUNS_URL_DEFAULTS)).toEqual({ account: '' });
    expect(runsListParams(parseRunsValues(RUNS_URL_DEFAULTS))).toEqual({ accountId: undefined, limit: 50 });
  });
  it('sends the profile it was given', () => {
    expect(runsListParams(parseRunsValues({ account: ' abc123 ' }))).toEqual({ accountId: 'abc123', limit: 50 });
  });
  it('shows Clear only with a profile picked', () => {
    expect(runsCanClear(parseRunsValues({ account: '' }))).toBe(false);
    expect(runsCanClear(parseRunsValues({ account: 'abc' }))).toBe(true);
    expect(RUNS_CLEAR_KEYS).toEqual(['account']);
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
