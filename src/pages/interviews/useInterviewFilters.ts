import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/useAuth';
import {
  parseInterviewFilters,
  serializeInterviewFilters,
  viewSwitchQuery,
  type InterviewFilters,
} from '../../lib/interviewFilters';

/** Filters for the Interviews tab, read from and written to the URL. */
export function useInterviewFilters(): [InterviewFilters, (patch: Partial<InterviewFilters>) => void, string] {
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  // Admins start on every user's interviews; everyone else on their own.
  const defaults = useMemo(
    () => ({ userId: user?.role === 'admin' ? 'all' : user?.id || 'all' }),
    [user?.id, user?.role],
  );
  const filters = useMemo(() => parseInterviewFilters(params, defaults), [params, defaults]);
  const update = useCallback((patch: Partial<InterviewFilters>) => {
    const next = { ...filters, ...patch };
    if (!('page' in patch)) next.page = 1;
    setParams(serializeInterviewFilters(next, defaults), { replace: true });
  }, [filters, defaults, setParams]);
  // Every filter carries over when switching List | Calendar.
  const shared = useMemo(() => viewSwitchQuery(params), [params]);
  return [filters, update, shared];
}
