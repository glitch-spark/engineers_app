import { describe, expect, it } from 'vitest';
import {
  GENERATED_CLEAR_KEYS,
  GENERATED_URL_DEFAULTS,
  generatedCanClear,
  generatedListParams,
  parseGeneratedValues,
} from './generatedFilters';

const parse = (over: Record<string, string> = {}) => parseGeneratedValues({ ...GENERATED_URL_DEFAULTS, ...over });

describe('Generated filters', () => {
  it('defaults to every profile, page 1, 20 per page', () => {
    expect(GENERATED_URL_DEFAULTS).toEqual({ profile: '', company: '', q: '', page: '1', size: '20' });
    expect(parse()).toEqual({ profile: '', company: '', q: '', page: 1, size: 20 });
  });

  it('never owns the job deep link', () => {
    expect(Object.keys(GENERATED_URL_DEFAULTS)).not.toContain('job');
    expect(GENERATED_CLEAR_KEYS).toEqual(['profile', 'company', 'q']);
  });

  it('reads good values', () => {
    expect(parse({ profile: 'abc', company: 'Acme', q: 'react node', page: '3', size: '50' })).toEqual({
      profile: 'abc', company: 'Acme', q: 'react node', page: 3, size: 50,
    });
  });

  it('falls back to the defaults for junk paging', () => {
    expect(parse({ page: 'two', size: '33' })).toMatchObject({ page: 1, size: 20 });
    expect(parse({ page: '0' }).page).toBe(1);
    expect(parse({ page: '-3' }).page).toBe(1);
    expect(parse({ size: '25' }).size).toBe(20);
  });

  it('sends the same request the page always has: trimmed, empty filters left out', () => {
    expect(generatedListParams(parse())).toEqual({
      page: 1, limit: 20, accountId: undefined, company: undefined, q: undefined,
    });
    expect(generatedListParams(parse({ profile: 'abc', company: ' Acme ', q: ' react  node ', page: '2', size: '10' }))).toEqual({
      page: 2, limit: 10, accountId: 'abc', company: 'Acme', q: 'react  node',
    });
    expect(generatedListParams(parse({ company: '   ', q: '  ' }))).toMatchObject({ company: undefined, q: undefined });
  });

  it('shows Clear only when something differs from the default', () => {
    expect(generatedCanClear(parse())).toBe(false);
    expect(generatedCanClear(parse({ page: '4', size: '100' }))).toBe(false);
    expect(generatedCanClear(parse({ profile: 'abc' }))).toBe(true);
    expect(generatedCanClear(parse({ company: 'a' }))).toBe(true);
    expect(generatedCanClear(parse({ q: 'a' }))).toBe(true);
    expect(generatedCanClear(parse({ company: '  ', q: ' ' }))).toBe(false);
  });
});
