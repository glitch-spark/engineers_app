import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/useAuth';
import {
  barDiffers,
  barKeys,
  defaultInterviewUser,
  interviewUrlDefaults,
  parseInterviewValues,
  patchToUrl,
  viewSwitchQuery,
  type InterviewFilters,
  type InterviewUrlValues,
} from '../../lib/interviewFilters';
import { useUrlFilters } from '../../lib/useUrlFilters';
import { useFirstTeamMember } from '../../lib/useFirstTeamMember';

export interface InterviewFilterState {
  filters: InterviewFilters;
  update: (patch: Partial<InterviewFilters>) => void;
  /** Query string for the List | Calendar switch (every filter; not the page or one-off links). */
  sharedQs: string;
  /** Something the tab's bar shows differs from its default. */
  canClear: boolean;
  /** Puts back only what the tab's bar shows; `panel`, `round`, `brief`, `zone`, sort and the other tab's keys stay. */
  clear: () => void;
  /**
   * Self interviews: an admin's default user (the first team member) is still loading. Nothing should be asked for
   * yet, so another user's interviews never flash first.
   */
  pending: boolean;
}

/**
 * Filters for the Self interviews and Caller interviews tabs, read from and written to the URL (`user profile caller
 * owner stage status q range from to sort dir page`). `callers`: the Caller interviews tab, whose bar shows Owner and
 * Caller instead of User and Profile.
 */
export function useInterviewFilters(callers = false): InterviewFilterState {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const firstMember = useFirstTeamMember(isAdmin);
  // Self interviews: admins start on the first team member A–Z (every user when there is no team); everyone else on
  // their own. An explicit pick (All users, anyone) stays in the URL. Caller interviews has its own `owner` (all users).
  const userId = defaultInterviewUser({ isAdmin, userId: user?.id, firstMember: firstMember.id });
  const d = useMemo(() => ({ userId }), [userId]);
  const [values, patch] = useUrlFilters<InterviewUrlValues>(interviewUrlDefaults(d));
  const [params] = useSearchParams();
  const pending = isAdmin && !callers && firstMember.loading && !params.get('user');

  const filters = useMemo(() => parseInterviewValues(values, d), [values, d]);
  const update = useCallback((changes: Partial<InterviewFilters>) => patch(patchToUrl(changes)), [patch]);
  const sharedQs = useMemo(() => viewSwitchQuery(params), [params]);

  const canClear = barDiffers(filters, d, callers);
  const clear = useCallback(() => {
    patch(Object.fromEntries(barKeys(callers).map((k) => [k, undefined])) as Partial<InterviewUrlValues>);
  }, [patch, callers]);

  return { filters, update, sharedQs, canClear, clear, pending };
}
