import { useMemo } from 'react';
import useSWR from 'swr';
import * as api from '../api/endpoints';
import type { Caller } from '../api/endpoints';

export const CALLERS_KEY = ['callers'];

/**
 * Fetches every caller including archived (so a round whose caller was archived still resolves in `byId`).
 * `callers` is the active ones, both kinds (for pickers), `people` the platform users, `external` the rest.
 * Also whether this user may manage the list, and a lookup by id.
 */
export function useCallers() {
  const { data, isLoading, mutate } = useSWR(CALLERS_KEY, () => api.listCallers(true));
  const callers = useMemo(() => (data?.callers ?? []).filter((c) => !c.archived), [data]);
  const people = useMemo(() => callers.filter((c) => c.kind === 'user'), [callers]);
  const external = useMemo(() => callers.filter((c) => c.kind === 'external'), [callers]);
  const byId = useMemo(() => new Map<string, Caller>((data?.callers ?? []).map((c) => [c._id, c])), [data]);
  return { callers, people, external, byId, canManage: !!data?.canManage, isLoading, mutate };
}
