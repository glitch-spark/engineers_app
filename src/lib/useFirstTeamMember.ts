import useSWR from 'swr';
import * as api from '../api/endpoints';

/**
 * The SWR key of the team lookup (`/users/lookup?excludeRole=admin`): every page that lists the team (non-admin users)
 * shares it, so the list is fetched once.
 */
export const TEAM_LOOKUP_KEY = ['users-lookup', 'staff-only'] as const;

/** The team lookup (non-admin users), shared by every page. `enabled: false` asks for nothing. */
export function useTeamLookup(enabled = true) {
  return useSWR(enabled ? TEAM_LOOKUP_KEY : null, () => api.lookupUsers({ excludeRole: 'admin' }));
}

type LookupUser = { _id: string; name?: string | null; email?: string | null; role?: string; isActive?: boolean };

/** How a team member sorts: the name, else the email (case-insensitive), else the id. */
const sortLabel = (u: LookupUser): string => (u.name?.trim() || u.email?.trim() || u._id).toLowerCase();

/** The team A–Z: active non-admin users, sorted case-insensitively by name, else email (ties by id, so it is stable). */
export function teamMembersAZ<U extends LookupUser>(users: readonly U[] | undefined): U[] {
  return (users ?? [])
    .filter((u) => u.isActive !== false && u.role !== 'admin')
    .sort((a, b) => {
      const x = sortLabel(a);
      const y = sortLabel(b);
      return x < y ? -1 : x > y ? 1 : a._id < b._id ? -1 : a._id > b._id ? 1 : 0;
    });
}

/** The first team member A–Z (see `teamMembersAZ`), or undefined when there is none. */
export function firstTeamMember(users: readonly LookupUser[] | undefined): string | undefined {
  return teamMembersAZ(users)[0]?._id;
}

/**
 * The admin default for the user filters (Profiles, Bids, Prompt tests, Self interviews): the first team member's id.
 * `id` is undefined while the lookup loads (`loading`), when it failed, and when there are no team members; a page
 * waits while `loading` rather than show another user's data first. `enabled: false` (staff) asks for nothing.
 */
export function useFirstTeamMember(enabled = true): { id: string | undefined; loading: boolean } {
  const { data, isLoading } = useTeamLookup(enabled);
  return { id: enabled ? firstTeamMember(data?.users) : undefined, loading: enabled && isLoading };
}
