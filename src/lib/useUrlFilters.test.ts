// @vitest-environment jsdom
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigationType } from 'react-router-dom';
import { useUrlFilters } from './useUrlFilters';

afterEach(cleanup);

const DEFAULTS = { range: 'this_week', from: '', to: '', q: '', page: '1', size: '20' };

/** The router's current search string and how it was reached, as the hook last left them. */
const seen = { search: '', navType: '' };

function Probe() {
  const location = useLocation();
  seen.search = location.search;
  seen.navType = useNavigationType();
  return null;
}

function setup(initial: string, defaults: Record<string, string> = DEFAULTS) {
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(MemoryRouter, { initialEntries: [`/${initial}`] }, createElement(Probe), children);
  return renderHook(() => useUrlFilters(defaults), { wrapper });
}

describe('useUrlFilters', () => {
  it('returns the defaults for an empty URL and the URL values otherwise', () => {
    expect(setup('').result.current[0]).toEqual(DEFAULTS);
    const { result } = setup('?range=last_week&q=acme&page=3');
    expect(result.current[0]).toEqual({ ...DEFAULTS, range: 'last_week', q: 'acme', page: '3' });
  });

  it('leaves default values out of the URL', () => {
    const { result } = setup('');
    act(() => result.current[1]({ range: 'last_week' }));
    expect(seen.search).toBe('?range=last_week');
    act(() => result.current[1]({ range: 'this_week' }));
    expect(seen.search).toBe('');
    act(() => result.current[1]({ size: '20', q: '' }));
    expect(seen.search).toBe('');
  });

  it('replaces the history entry instead of pushing one', () => {
    const { result } = setup('');
    act(() => result.current[1]({ q: 'acme' }));
    expect(seen.navType).toBe('REPLACE');
  });

  it('resets page when another key changes, removing it from the URL', () => {
    const { result } = setup('?page=3&q=a');
    act(() => result.current[1]({ q: 'b' }));
    expect(seen.search).toBe('?q=b');
    expect(result.current[0].page).toBe('1');
  });

  it('keeps page when only page changes, or when the patch sets page itself', () => {
    const { result } = setup('?q=a');
    act(() => result.current[1]({ page: '2' }));
    expect(seen.search).toBe('?q=a&page=2');
    act(() => result.current[1]({ size: '50', page: '4' }));
    expect(new URLSearchParams(seen.search).get('page')).toBe('4');
    expect(new URLSearchParams(seen.search).get('size')).toBe('50');
  });

  it('keeps page when a patched key does not actually change', () => {
    const { result } = setup('?q=a&page=3');
    act(() => result.current[1]({ q: 'a' }));
    expect(new URLSearchParams(seen.search).get('page')).toBe('3');
  });

  it('applies two patches made in the same tick', () => {
    const { result } = setup('');
    act(() => {
      result.current[1]({ range: 'custom' });
      result.current[1]({ from: '2026-11-01' });
    });
    const params = new URLSearchParams(seen.search);
    expect(params.get('range')).toBe('custom');
    expect(params.get('from')).toBe('2026-11-01');
  });

  it('keeps unknown keys when patching', () => {
    const { result } = setup('?tab=callers&q=a');
    act(() => result.current[1]({ q: 'b' }));
    expect(new URLSearchParams(seen.search).get('tab')).toBe('callers');
    expect(new URLSearchParams(seen.search).get('q')).toBe('b');
  });

  it('reset removes every filter key and keeps unknown keys', () => {
    const { result } = setup('?range=last_week&q=a&page=2&size=50&from=2026-01-01&tab=callers');
    act(() => result.current[2]());
    expect(seen.search).toBe('?tab=callers');
    expect(result.current[0]).toEqual(DEFAULTS);
  });

  it('keeps the same values object while the URL has not changed', () => {
    const { result, rerender } = setup('?q=a');
    const first = result.current[0];
    rerender();
    expect(result.current[0]).toBe(first);
  });

  it('keeps the same values object when the defaults are a new but equal object each render', () => {
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(MemoryRouter, { initialEntries: ['/?q=a'] }, children);
    const { result, rerender } = renderHook(() => useUrlFilters({ q: '', page: '1' }), { wrapper });
    const first = result.current[0];
    rerender();
    expect(result.current[0]).toBe(first);
  });

  it('gives a new values object once the URL changes, and stable callbacks throughout', () => {
    const { result } = setup('');
    const first = result.current[0];
    const [set, reset] = [result.current[1], result.current[2]];
    act(() => result.current[1]({ q: 'x' }));
    expect(result.current[0]).not.toBe(first);
    expect(result.current[1]).toBe(set);
    expect(result.current[2]).toBe(reset);
  });
});
