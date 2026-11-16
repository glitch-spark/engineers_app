import { describe, expect, it } from 'vitest';
import {
  USER_CLEAR_KEYS,
  USER_STATUS_OPTIONS,
  USER_URL_DEFAULTS,
  parseUserValues,
  userCanClear,
  userListParams,
} from './userFilters';

const parse = (over: Record<string, string> = {}) => parseUserValues({ ...USER_URL_DEFAULTS, ...over });

describe('Users filters', () => {
  it('defaults to every user, page 1, 20 per page', () => {
    expect(USER_URL_DEFAULTS).toEqual({ role: '', status: '', q: '', page: '1', size: '20' });
    expect(parse()).toEqual({ role: '', status: '', q: '', page: 1, size: 20 });
  });

  it('keeps the Status labels and values', () => {
    expect(USER_STATUS_OPTIONS).toEqual([
      { value: '', label: 'All statuses' },
      { value: 'active', label: 'Active' },
      { value: 'inactive', label: 'Pending approval' },
    ]);
  });

  it('reads good values', () => {
    expect(parse({ role: 'admin', status: 'inactive', q: 'ann', page: '3', size: '50' })).toEqual({
      role: 'admin', status: 'inactive', q: 'ann', page: 3, size: 50,
    });
  });

  it('falls back to the defaults for junk', () => {
    expect(parse({ role: 'boss', status: 'banned', page: 'x', size: '7' })).toEqual({
      role: '', status: '', q: '', page: 1, size: 20,
    });
    expect(parse({ page: '-4' }).page).toBe(1);
    expect(parse({ page: '0' }).page).toBe(1);
    expect(parse({ size: '5' }).size).toBe(20); // the old 5 and 10-only picker is gone: 5 is not offered
  });

  it('sends only the filters that are set', () => {
    expect(userListParams(parse())).toEqual({ page: 1, limit: 20 });
    expect(userListParams(parse({ role: 'staff', status: 'active', q: 'ann', page: '2', size: '10' }))).toEqual({
      page: 2, limit: 10, search: 'ann', role: 'staff', status: 'active',
    });
  });

  it('shows Clear only when something differs from the default', () => {
    expect(userCanClear(parse())).toBe(false);
    expect(userCanClear(parse({ page: '4', size: '50' }))).toBe(false);
    expect(userCanClear(parse({ role: 'admin' }))).toBe(true);
    expect(userCanClear(parse({ status: 'active' }))).toBe(true);
    expect(userCanClear(parse({ q: 'a' }))).toBe(true);
    expect(userCanClear(parse({ role: 'junk' }))).toBe(false);
  });

  it('clears the bar keys, not paging', () => {
    expect(USER_CLEAR_KEYS).toEqual(['role', 'status', 'q']);
  });
});
