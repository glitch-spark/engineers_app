import { useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Page filters kept in the URL query string, so a reload or a shared link keeps them.
 *
 * `defaults` lists the hook's own keys and their default values (all strings). A value equal to its default is left
 * out of the URL. Keys the hook doesn't own (a `tab`, say) are never touched.
 *
 * Returns `[values, patch, reset]`:
 * - `values` has every key of `defaults`: the URL's value, or the default. It is the same object until the URL (or
 *   the defaults' content) changes, so pages can use it in SWR keys and effect dependencies.
 * - `patch` merges changes into the URL (history entry replaced, not pushed). If any key other than `page` changes
 *   and the patch doesn't set `page` itself, `page` goes back to its default.
 * - `reset` removes only the hook's own keys.
 * `patch` and `reset` keep their identity across renders.
 */
export function useUrlFilters<T extends Record<string, string>>(
  defaults: T,
): [T, (patch: Partial<T>) => void, () => void] {
  const [searchParams, setSearchParams] = useSearchParams();

  // Callers often pass an inline object; key everything by its content instead.
  const defaultsKey = JSON.stringify(defaults);
  const defaultsRef = useRef(defaults);
  defaultsRef.current = defaults;

  // Two patches in one tick must compose, so keep the params we last wrote (or last rendered with).
  const searchKey = searchParams.toString();
  const latest = useRef(searchParams);
  const lastRenderedKey = useRef(searchKey);
  if (lastRenderedKey.current !== searchKey) {
    lastRenderedKey.current = searchKey;
    latest.current = searchParams;
  }
  const setRef = useRef(setSearchParams);
  setRef.current = setSearchParams;

  const values = useMemo(() => {
    const params = new URLSearchParams(searchKey);
    const out: Record<string, string> = {};
    for (const [key, fallback] of Object.entries(JSON.parse(defaultsKey) as Record<string, string>)) {
      out[key] = params.get(key) ?? fallback;
    }
    return out as T;
  }, [searchKey, defaultsKey]);

  const patch = useCallback((changes: Partial<T>) => {
    const defs = defaultsRef.current;
    const next = new URLSearchParams(latest.current);
    let otherKeyChanged = false;
    for (const [key, value] of Object.entries(changes)) {
      if (value === undefined) continue;
      const before = next.get(key) ?? defs[key] ?? '';
      if (key !== 'page' && before !== value) otherKeyChanged = true;
      if (value === (defs[key] ?? '')) next.delete(key);
      else next.set(key, value);
    }
    if (otherKeyChanged && !('page' in changes)) next.delete('page');
    latest.current = next;
    lastRenderedKey.current = next.toString();
    setRef.current(next, { replace: true });
  }, []);

  const reset = useCallback(() => {
    const next = new URLSearchParams(latest.current);
    for (const key of Object.keys(defaultsRef.current)) next.delete(key);
    latest.current = next;
    lastRenderedKey.current = next.toString();
    setRef.current(next, { replace: true });
  }, []);

  return useMemo(() => [values, patch, reset], [values, patch, reset]);
}
