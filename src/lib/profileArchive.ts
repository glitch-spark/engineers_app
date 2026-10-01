/** Archived profiles: hidden from pickers for new work, still listed (last) in filters. */

export type ProfileStatus = 'active' | 'archived' | 'all';

export const PROFILE_STATUS_OPTIONS: { value: ProfileStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
  { value: 'all', label: 'All' },
];

type Archivable = { _id: string; archived?: boolean };

/** Profiles a user can pick for new work; `keepId` keeps a record's current (archived) profile. */
export function pickerProfiles<T extends Archivable>(rows: T[], keepId?: string): T[] {
  return rows.filter((a) => !a.archived || (keepId && a._id === keepId));
}

/** Filter dropdowns list every profile, archived ones after the active ones. */
export function filterProfiles<T extends Archivable>(rows: T[]): T[] {
  return [...rows.filter((a) => !a.archived), ...rows.filter((a) => a.archived)];
}

export function archivedLabel(label: string, archived?: boolean): string {
  return archived ? `${label} (archived)` : label;
}
