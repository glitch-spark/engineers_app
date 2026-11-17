// @vitest-environment jsdom
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { useInterviewFilters } from './useInterviewFilters';

vi.mock('../../auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'me', role: 'staff' } }),
}));

afterEach(cleanup);

const seen = { search: '' };
function Probe() {
  seen.search = useLocation().search;
  return null;
}

function setup(initial: string, callers = false) {
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(MemoryRouter, { initialEntries: [`/interviews${initial}`] }, createElement(Probe), children);
  return renderHook(() => useInterviewFilters(callers), { wrapper });
}

describe('useInterviewFilters', () => {
  it('starts at the defaults: this week, your own interviews', () => {
    const { result } = setup('');
    expect(result.current.filters).toMatchObject({ user: 'me', range: 'this_week', q: '', stage: '', page: 1 });
    expect(result.current.canClear).toBe(false);
  });

  it('reads an old ?range=prev_week as last week', () => {
    const { result } = setup('?range=prev_week');
    expect(result.current.filters.range).toBe('last_week');
    expect(result.current.canClear).toBe(true);
  });

  it('survives bad values', () => {
    const { result } = setup('?range=zzz&from=nope&to=2026-02-31&page=-1&sort=x&call=maybe');
    expect(result.current.filters).toMatchObject({ range: 'this_week', from: '', to: '', page: 1, sort: 'latest' });
    expect(result.current.filters).not.toHaveProperty('call');
  });

  it('writes filters to the URL, leaves defaults out, and resets the page', () => {
    const { result } = setup('?page=3');
    act(() => result.current.update({ q: 'acme' }));
    expect(seen.search).toBe('?q=acme');
    act(() => result.current.update({ range: 'next_week', from: '', to: '' }));
    expect(seen.search).toBe('?q=acme&range=next_week');
    act(() => result.current.update({ range: 'this_week', from: '', to: '' }));
    expect(seen.search).toBe('?q=acme');
    act(() => result.current.update({ page: 2 }));
    expect(seen.search).toBe('?q=acme&page=2');
  });

  it('keeps page and size in the URL (defaults left out); a size change goes back to page 1', () => {
    const { result } = setup('?page=3');
    act(() => result.current.update({ size: 50 }));
    expect(seen.search).toBe('?size=50');
    expect(result.current.filters).toMatchObject({ size: 50, page: 1 });
    act(() => result.current.update({ page: 2 }));
    expect(seen.search).toBe('?size=50&page=2');
    act(() => result.current.update({ q: 'x' }));
    expect(seen.search).toBe('?size=50&q=x');
    act(() => result.current.update({ size: 20 }));
    expect(seen.search).toBe('?q=x');
  });

  it('Clear keeps the page size', () => {
    const { result } = setup('?size=100&q=x');
    act(() => result.current.clear());
    expect(seen.search).toBe('?size=100');
  });

  it('a date change with undefined from / to leaves no stale custom dates behind', () => {
    const { result } = setup('?range=custom&from=2026-11-01&to=2026-11-05');
    act(() => result.current.update({ range: 'last_week', from: undefined, to: undefined }));
    expect(seen.search).toBe('?range=last_week');
  });

  it('keeps the deep-link keys when updating', () => {
    const { result } = setup('?panel=abc&round=i:r&brief=1&zone=eastern');
    act(() => result.current.update({ q: 'acme', stage: 'intro' }));
    const p = new URLSearchParams(seen.search);
    expect(Object.fromEntries(p)).toEqual({ panel: 'abc', round: 'i:r', brief: '1', zone: 'eastern', q: 'acme', stage: 'intro' });
  });

  it('Clear puts back what the Self interviews bar shows and keeps deep links, sort and the other tab\'s keys', () => {
    const { result } = setup('?user=all&profile=p&stage=intro&status=passed&q=x&range=custom&from=2026-11-01&to=2026-11-05&owner=u&caller=c&sort=company&dir=asc&panel=abc&zone=eastern');
    expect(result.current.canClear).toBe(true);
    act(() => result.current.clear());
    expect(Object.fromEntries(new URLSearchParams(seen.search))).toEqual({
      owner: 'u', caller: 'c', sort: 'company', dir: 'asc', panel: 'abc', zone: 'eastern',
    });
  });

  it('Clear on Caller interviews resets Owner and Caller and keeps the Self-interviews-only keys', () => {
    const { result } = setup('?owner=u&caller=c&stage=intro&q=x&range=next_week&user=all&profile=p&brief=1', true);
    expect(result.current.canClear).toBe(true);
    act(() => result.current.clear());
    expect(Object.fromEntries(new URLSearchParams(seen.search))).toEqual({ user: 'all', profile: 'p', brief: '1' });
  });

  it('does not count call toward Clear, and leaves it in the URL', () => {
    const { result } = setup('?call=caller');
    expect(result.current.canClear).toBe(false);
    act(() => result.current.update({ q: 'acme' }));
    expect(result.current.sharedQs).toBe('?q=acme');
  });

  it('exposes the query string the List | Calendar switch carries', () => {
    const { result } = setup('?range=next_week&q=acme&page=2&panel=abc');
    expect(result.current.sharedQs).toBe('?range=next_week&q=acme');
  });
});
