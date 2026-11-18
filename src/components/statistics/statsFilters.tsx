import { useId, type ReactNode } from 'react';
import type { StatsRegion } from '../../api/endpoints';
import {
  customError,
  isoDay,
  presetOptions,
  toStatsParams,
  type DatePreset,
  type DateRange,
} from '../../lib/dateRange';
import { useAuth } from '../../auth/useAuth';
import { teamMembersAZ, useTeamLookup } from '../../lib/useFirstTeamMember';
import { regionOptions } from '../../lib/regions';
import { useUrlFilters } from '../../lib/useUrlFilters';
import DateRangeFilter, { resolveRange, type DateRangeValue } from '../filters/DateRangeFilter';
import FilterBar, { FilterField } from '../filters/FilterBar';
import SearchFilter from '../filters/SearchFilter';
import Select from '../Select';

/**
 * The Statistics filters, kept in the URL so they follow you from tab to tab (and survive a reload or a shared link):
 * `region` (the first four tabs), `range` / `from` / `to`, `q` (Resume compare's company search) and, on AI usage,
 * `users` / `features` / `models` (comma lists) and `user` (an admin's Viewing choice on Bids; never cleared by Clear). Defaults are left out of the URL.
 */
type StatsKey = 'region' | 'range' | 'from' | 'to' | 'q' | 'users' | 'features' | 'models' | 'user';

const STATS_DEFAULTS: Record<StatsKey, string> = {
  region: '', range: 'this_month', from: '', to: '', q: '', users: '', features: '', models: '', user: '',
};
const DEFAULT_PRESET: DatePreset = 'this_month';

/** Bids, Interviews, Callers and Resume compare: the standard presets. */
export const STATS_PRESETS = presetOptions();
/** AI usage adds Today and Yesterday (hourly). */
export const AI_USAGE_PRESETS = presetOptions({ after: ['today', 'yesterday'] });
/** The regions the Statistics endpoints take ('' = All, sent as `all`). */
export const STATS_REGIONS = regionOptions(['Latam', 'EU', 'US']);

/** The label of the region a report came back for (`all` is "All"). */
export function regionLabel(region: StatsRegion): string {
  return STATS_REGIONS.find((o) => o.value === (region === 'all' ? '' : region))?.label ?? region;
}

export type StatsTab = 'stats' | 'resume' | 'ai';

export interface StatsParams {
  period: 'week' | 'month' | 'custom';
  date: string;
  to?: string;
  region: StatsRegion;
}

export interface StatsFilterState {
  tab: StatsTab;
  /** Raw URL values (or the defaults). */
  values: Record<StatsKey, string>;
  patch: (changes: Partial<Record<StatsKey, string>>) => void;
  presets: { value: DatePreset; label: string }[];
  /** The range control's value: a preset this tab doesn't offer (`today` carried over from AI usage) shows the default. */
  value: DateRangeValue;
  /** `YYYY-MM-DD`, the page's local "today". */
  today: string;
  /** The dates `value` stands for; null for a partial or invalid custom range. */
  range: DateRange | null;
  /** Why the custom range can't be asked for, or null. */
  rangeError: string | null;
  /** The region as the endpoints take it (`all`, `Latam`, `EU`, `US`). */
  region: StatsRegion;
  /** The report request for the selection, or null while the range is invalid (nothing to fetch). */
  params: StatsParams | null;
  canClear: boolean;
  clear: () => void;
}

/** A comma list from the URL (`users=a,b`) as an array; empty when the key is absent. */
export const statsList = (s: string): string[] => (s ? s.split(',') : []);

/**
 * Reads the Statistics filters from the URL for one kind of tab. `clear` puts back only what that tab's bar shows
 * (other tabs' keys, like AI usage's multiselects, stay in the URL).
 */
export function useStatsFilters(tab: StatsTab = 'stats'): StatsFilterState {
  const [values, patch] = useUrlFilters(STATS_DEFAULTS);
  const presets = tab === 'ai' ? AI_USAGE_PRESETS : STATS_PRESETS;
  const today = isoDay(new Date());

  const known = presets.some((p) => p.value === values.range);
  const value: DateRangeValue = known
    ? { preset: values.range as DatePreset, from: values.from, to: values.to }
    : { preset: DEFAULT_PRESET, from: '', to: '' };
  const range = resolveRange(value, today, false);
  const rangeError = value.preset === 'custom' ? customError(value.from ?? '', value.to ?? '') : null;

  const region: StatsRegion =
    tab !== 'ai' && STATS_REGIONS.some((o) => o.value === values.region && o.value !== '')
      ? (values.region as StatsRegion)
      : 'all';
  const params: StatsParams | null =
    tab !== 'ai' && range ? { ...toStatsParams(value.preset as DatePreset, range), region } : null;

  const canClear =
    value.preset !== DEFAULT_PRESET ||
    (tab !== 'ai' && region !== 'all') ||
    (tab === 'resume' && values.q !== '') ||
    (tab === 'ai' && (values.users !== '' || values.features !== '' || values.models !== ''));

  const clear = () => {
    const keys: StatsKey[] =
      tab === 'ai' ? ['users', 'features', 'models', 'range', 'from', 'to']
        : tab === 'resume' ? ['region', 'q', 'range', 'from', 'to']
          : ['region', 'range', 'from', 'to'];
    patch(Object.fromEntries(keys.map((k) => [k, undefined])) as Partial<Record<StatsKey, string>>);
  };

  return { tab, values, patch, presets, value, today, range, rangeError, region, params, canClear, clear };
}

/**
 * The one sticky bar of every Statistics tab: Region (not on AI usage), `before` (AI usage's Users / Features /
 * Models), the company search (Resume compare), the date range, `children` (a loading spinner), then Clear.
 */
export function StatsFilterBar({ f, before, viewing, viewingSubject, children }: {
  f: StatsFilterState; before?: ReactNode; /** Offer admins the Viewing picker (tabs that show one person's view). */ viewing?: boolean; /** The loaded view's subject: keeps the Viewing picker showing someone the team lookup filters out. */ viewingSubject?: { userId: string; name: string }; children?: ReactNode;
}) {
  const regionId = useId();
  return (
    <FilterBar sticky canClear={f.canClear} onClear={f.clear}>
      {f.tab !== 'ai' && (
        <FilterField label="Region" htmlFor={regionId} width="w-36">
          <Select
            id={regionId}
            value={f.region === 'all' ? '' : f.region}
            onChange={(region) => f.patch({ region })}
            options={STATS_REGIONS}
          />
        </FilterField>
      )}
      {viewing && <ViewingField f={f} subject={viewingSubject} />}
      {before}
      {f.tab === 'resume' && (
        <SearchFilter value={f.values.q} onChange={(q) => f.patch({ q })} placeholder="Search companies…" />
      )}
      <DateRangeFilter
        value={f.value}
        onChange={(v) => f.patch({ range: v.preset, from: v.from, to: v.to })}
        presets={f.presets}
        allowFuture={false}
        today={f.today}
      />
      {children}
    </FilterBar>
  );
}

/** Admin-only "Viewing" picker: Me ('') or a team member; bound to the `user` URL key. */
function ViewingField({ f, subject }: { f: StatsFilterState; subject?: { userId: string; name: string } }) {
  const id = useId();
  const isAdmin = useAuth().user?.role === 'admin';
  const { data } = useTeamLookup(isAdmin);
  if (!isAdmin) return null;
  const options = [{ value: '', label: 'Me' }, ...teamMembersAZ(data?.users).map((u) => ({ value: u._id, label: u.name || u.email || u._id }))];
  if (f.values.user && !options.some((o) => o.value === f.values.user) && subject?.userId === f.values.user) {
    options.push({ value: subject.userId, label: subject.name });
  }
  return (
    <FilterField label="Viewing" htmlFor={id} width="w-44">
      <Select id={id} value={f.values.user} onChange={(user) => f.patch({ user })} options={options} />
    </FilterField>
  );
}
