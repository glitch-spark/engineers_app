import { useMemo } from 'react';
import useSWR from 'swr';
import * as api from '../api/endpoints';
import type { Caller } from '../api/endpoints';

export const CALLERS_KEY = ['callers'];

/** The caller list (everyone), whether this user may manage it, and a lookup by id. */
export function useCallers() {
  const { data, isLoading, mutate } = useSWR(CALLERS_KEY, () => api.listCallers());
  const callers = useMemo(() => data?.callers ?? [], [data]);
  const byId = useMemo(() => new Map<string, Caller>(callers.map((c) => [c._id, c])), [callers]);
  return { callers, byId, canManage: !!data?.canManage, isLoading, mutate };
}
