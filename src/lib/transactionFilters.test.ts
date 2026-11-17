import { describe, expect, it } from 'vitest';
import {
  TX_CLEAR_KEYS,
  TX_PRESETS,
  normalizeTxRange,
  parseTxValues,
  txCanClear,
  txListParams,
  txDefaultUser,
  txRange,
  txUrlDefaults,
  type TxFilters,
} from './transactionFilters';

const ME = 'u1';
// Wed Nov 11, 2026.
const TODAY = '2026-11-11';
const parse = (over: Record<string, string> = {}) => parseTxValues({ ...txUrlDefaults(ME), ...over }, ME);

describe('presets and defaults', () => {
  it('offers the standard presets in order', () => {
    expect(TX_PRESETS.map((p) => p.value)).toEqual([
      'this_week', 'last_week', 'last_2_weeks', 'last_month', 'this_month', 'this_year', 'custom',
    ]);
  });
  it('defaults to your own transactions, This month, page 1, 20 per page', () => {
    expect(txUrlDefaults(ME)).toEqual({
      user: ME, method: '', payer: '', range: 'this_month', from: '', to: '', page: '1', size: '20',
    });
    expect(parse()).toMatchObject({ user: ME, method: '', payer: '', range: 'this_month', page: 1, size: 20 });
  });
  it('defaults the user to all while the signed-in user is unknown', () => {
    expect(txUrlDefaults('').user).toBe('all');
  });
});

describe('the User default by role', () => {
  it('admins default to All users, staff to themselves', () => {
    expect(txDefaultUser(ME, true)).toBe('all');
    expect(txDefaultUser(ME, false)).toBe(ME);
    expect(txDefaultUser('', false)).toBe('all');
  });
  it("an admin's absent user is everyone's transactions (no userId)", () => {
    const d = txDefaultUser(ME, true);
    const f = parseTxValues(txUrlDefaults(d), d);
    expect(f.user).toBe('all');
    expect('userId' in txListParams(f, TODAY)!).toBe(false);
    expect(txCanClear(f, d)).toBe(false);
  });
  it('an explicit Me (their own id) or another user is kept and offers Clear', () => {
    const d = txDefaultUser(ME, true);
    const me = parseTxValues({ ...txUrlDefaults(d), user: ME }, d);
    expect(txListParams(me, TODAY)!.userId).toBe(ME);
    expect(txCanClear(me, d)).toBe(true);
    expect(parseTxValues({ ...txUrlDefaults(d), user: 'u2' }, d).user).toBe('u2');
  });
  it('Clear puts the User filter back to its default (left out of the URL)', () => {
    expect(TX_CLEAR_KEYS).toContain('user');
    expect(txUrlDefaults(txDefaultUser(ME, true)).user).toBe('all');
    expect(txUrlDefaults(txDefaultUser(ME, false)).user).toBe(ME);
  });
});

describe('request params', () => {
  it('This month asks for the whole calendar month, future days included', () => {
    expect(txListParams(parse(), TODAY)).toEqual({
      page: 1, limit: 20, from: '2026-11-01', to: '2026-11-30', userId: ME,
    });
  });
  it('This week is Monday to Sunday, This year the whole year', () => {
    expect(txListParams(parse({ range: 'this_week' }), TODAY)).toMatchObject({ from: '2026-11-09', to: '2026-11-15' });
    expect(txListParams(parse({ range: 'this_year' }), TODAY)).toMatchObject({ from: '2026-01-01', to: '2026-12-31' });
  });
  it('Last week, Last 2 weeks and Last month are whole periods', () => {
    expect(txListParams(parse({ range: 'last_week' }), TODAY)).toMatchObject({ from: '2026-11-02', to: '2026-11-08' });
    expect(txListParams(parse({ range: 'last_2_weeks' }), TODAY)).toMatchObject({ from: '2026-10-26', to: '2026-11-08' });
    expect(txListParams(parse({ range: 'last_month' }), TODAY)).toMatchObject({ from: '2026-10-01', to: '2026-10-31' });
  });
  it('a custom range is sent as typed (inclusive days)', () => {
    expect(txListParams(parse({ range: 'custom', from: '2026-10-05', to: '2026-10-20' }), TODAY)).toMatchObject({
      from: '2026-10-05', to: '2026-10-20',
    });
  });
  it('sends the filters that are set, and leaves out the ones that are not', () => {
    const p = txListParams(parse({ user: 'all', method: 'card', payer: 'p9', page: '3', size: '50' }), TODAY)!;
    expect(p).toEqual({
      page: 3, limit: 50, from: '2026-11-01', to: '2026-11-30', payerId: 'p9', payMethod: 'card',
    });
    expect('userId' in p).toBe(false);
  });
  it('another user is sent as userId', () => {
    expect(txListParams(parse({ user: 'u2' }), TODAY)!.userId).toBe('u2');
  });
});

describe('legacy and invalid values', () => {
  it('maps the old preset names and falls back for anything not offered', () => {
    expect(normalizeTxRange('prev_week')).toBe('last_week');
    expect(normalizeTxRange('prev_month')).toBe('last_month');
    expect(normalizeTxRange('last_2_weeks')).toBe('last_2_weeks');
    for (const bad of ['', 'nope', 'next_week', 'all_time', 'today', 'week']) {
      expect(normalizeTxRange(bad)).toBe('this_month');
    }
  });
  it('an unknown preset reads as This month, ignoring stray dates', () => {
    const f = parse({ range: 'bogus', from: '2026-01-01', to: '2026-01-02' });
    expect(f).toMatchObject({ range: 'this_month', from: '', to: '' });
    expect(txListParams(f, TODAY)).toMatchObject({ from: '2026-11-01', to: '2026-11-30' });
  });
  it('an invalid custom range blocks the request instead of throwing', () => {
    const bad = [
      { from: '', to: '' },
      { from: '2026-10-05', to: '' },
      { from: '2026-02-31', to: '2026-03-02' },
      { from: '2026-10-20', to: '2026-10-05' },
      { from: '2024-01-01', to: '2026-01-01' },
      { from: 'abc', to: 'def' },
    ];
    for (const b of bad) {
      const f = parse({ range: 'custom', ...b });
      expect(txRange(f, TODAY)).toBeNull();
      expect(txListParams(f, TODAY)).toBeNull();
    }
  });
  it('junk method, page and size fall back', () => {
    expect(parse({ method: 'cash' }).method).toBe('');
    expect(parse({ page: 'x' }).page).toBe(1);
    expect(parse({ page: '-4' }).page).toBe(1);
    expect(parse({ size: '5' }).size).toBe(20);
    expect(parse({ size: '100' }).size).toBe(100);
  });
  it('an empty user in the URL reads as the default', () => {
    expect(parse({ user: '' }).user).toBe(ME);
  });
});

describe('Clear', () => {
  const f = (over: Partial<TxFilters> = {}): TxFilters => ({ ...parse(), ...over });
  it('is hidden at the defaults, whatever the page or size', () => {
    expect(txCanClear(f(), ME)).toBe(false);
    expect(txCanClear(parse({ page: '4', size: '100' }), ME)).toBe(false);
  });
  it('shows when any filter differs', () => {
    expect(txCanClear(f({ user: 'all' }), ME)).toBe(true);
    expect(txCanClear(f({ user: 'u2' }), ME)).toBe(true);
    expect(txCanClear(f({ method: 'coin' }), ME)).toBe(true);
    expect(txCanClear(f({ payer: 'p1' }), ME)).toBe(true);
    expect(txCanClear(f({ range: 'last_month' }), ME)).toBe(true);
    expect(txCanClear(f({ range: 'custom', from: '2026-10-01', to: '2026-10-02' }), ME)).toBe(true);
  });
  it('follows the signed-in user as the default', () => {
    expect(txCanClear(parseTxValues(txUrlDefaults(''), ''), '')).toBe(false);
  });
});
