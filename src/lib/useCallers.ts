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

export interface CallerOption { value: string; label: string; disabled?: boolean }

/**
 * Options for a caller picker: Not assigned yet, then People (never the interview's owner; the current user
 * first unless they are the owner), then External callers. Group headers are disabled options. A saved caller
 * that isn't offered (archived, deactivated, removed, or the owner) stays selectable once, as "(not on the list)".
 */
export function callerPickerOptions({
  people, external, ownerId, currentUserId, savedId, savedName,
}: {
  people: Caller[];
  external: Caller[];
  ownerId?: string;
  currentUserId?: string;
  savedId?: string;
  savedName?: string;
}): CallerOption[] {
  const others = people.filter((c) => c._id !== ownerId);
  const me = currentUserId && currentUserId !== ownerId ? others.filter((c) => c._id === currentUserId) : [];
  const rest = others.filter((c) => !me.includes(c));
  const offered = [...me, ...rest, ...external];
  const options: CallerOption[] = [{ value: '', label: 'Not assigned yet' }];
  if (me.length || rest.length) {
    options.push({ value: '__group_people', label: 'People', disabled: true });
    options.push(...[...me, ...rest].map((c) => ({ value: c._id, label: c.name })));
  }
  if (external.length) {
    options.push({ value: '__group_external', label: 'External callers', disabled: true });
    options.push(...external.map((c) => ({ value: c._id, label: c.name })));
  }
  if (savedId && !offered.some((c) => c._id === savedId)) {
    options.push({ value: savedId, label: `${savedName || 'Caller'} (not on the list)` });
  }
  return options;
}
