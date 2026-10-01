import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/useAuth';
import { zonedDateKey } from '../../lib/interviewTimezone';
import { useInterviewTimezone } from '../../lib/useInterviewTimezone';
import {
  parseInterviewFilters,
  serializeInterviewFilters,
  type InterviewFilters,
} from '../../lib/interviewFilters';

/** Filters for the Interviews tab, read from and written to the URL. */
export function useInterviewFilters(): [InterviewFilters, (patch: Partial<InterviewFilters>) => void, string] {
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const { tz } = useInterviewTimezone();
  const defaults = useMemo(
    () => ({ userId: user?.id || 'all', today: zonedDateKey(new Date(), tz) }),
    [user?.id, tz],
  );
  const filters = useMemo(() => parseInterviewFilters(params, defaults), [params, defaults]);
  const update = useCallback((patch: Partial<InterviewFilters>) => {
    const next = { ...filters, ...patch };
    if (!('page' in patch)) next.page = 1;
    setParams(serializeInterviewFilters(next, defaults), { replace: true });
  }, [filters, defaults, setParams]);
  // Shared filters only (no view-specific keys), for the List | Calendar links.
  const shared = useMemo(() => {
    const keep = new URLSearchParams();
    for (const k of ['user', 'profile', 'stage', 'status']) {
      const v = params.get(k);
      if (v) keep.set(k, v);
    }
    const s = keep.toString();
    return s ? `?${s}` : '';
  }, [params]);
  return [filters, update, shared];
}
