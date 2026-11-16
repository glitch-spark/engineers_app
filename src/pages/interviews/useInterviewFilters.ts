import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/useAuth';
import {
  barDiffers,
  barKeys,
  interviewUrlDefaults,
  parseInterviewValues,
  patchToUrl,
  viewSwitchQuery,
  type InterviewFilters,
  type InterviewUrlValues,
} from '../../lib/interviewFilters';
import { useUrlFilters } from '../../lib/useUrlFilters';

export interface InterviewFilterState {
  filters: InterviewFilters;
  update: (patch: Partial<InterviewFilters>) => void;
  /** Query string for the List | Calendar switch (every filter; not the page or one-off links). */
  sharedQs: string;
  /** Something the tab's bar shows differs from its default. */
  canClear: boolean;
  /** Puts back only what the tab's bar shows; `panel`, `round`, `brief`, `zone`, sort and the other tab's keys stay. */
  clear: () => void;
}

/**
 * Filters for the Interviews and Caller schedule tabs, read from and written to the URL (`user profile call caller
 * owner stage status q range from to sort dir page`). `callers`: the Caller schedule tab, whose bar shows Owner and
 * Caller instead of User, Profile and Self / Caller.
 */
export function useInterviewFilters(callers = false): InterviewFilterState {
  const { user } = useAuth();
  // Admins start on every user's interviews; everyone else on their own.
  const userId = user?.role === 'admin' ? 'all' : user?.id || 'all';
  const d = useMemo(() => ({ userId }), [userId]);
  const [values, patch] = useUrlFilters<InterviewUrlValues>(interviewUrlDefaults(d));
  const [params] = useSearchParams();

  const filters = useMemo(() => parseInterviewValues(values, d), [values, d]);
  const update = useCallback((changes: Partial<InterviewFilters>) => patch(patchToUrl(changes)), [patch]);
  const sharedQs = useMemo(() => viewSwitchQuery(params), [params]);

  const canClear = barDiffers(filters, d, callers);
  const clear = useCallback(() => {
    patch(Object.fromEntries(barKeys(callers).map((k) => [k, undefined])) as Partial<InterviewUrlValues>);
  }, [patch, callers]);

  return { filters, update, sharedQs, canClear, clear };
}
