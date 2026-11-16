import { useId } from 'react';
import { rangeLabel } from '../../lib/dateRange';
import {
  BIDDER_CLEAR_KEYS,
  BIDDER_URL_DEFAULTS,
  bidderCanClear,
  bidderCanStepForward,
  bidderDays,
  bidderLabel,
  bidderPresetOptions,
  bidderPeriodRequest,
  parseBidderValues,
  pickBidderPreset,
  reportClock,
  stepBidderPeriod,
  type BidderFilters,
  type BidderKey,
  type BidderPeriodRequest,
  type BidderPreset,
  type ReportClock,
} from '../../lib/bidderFilters';
import { useUrlFilters } from '../../lib/useUrlFilters';
import DateRangeFilter from '../filters/DateRangeFilter';
import FilterBar, { FilterField } from '../filters/FilterBar';
import SearchFilter from '../filters/SearchFilter';
import Select from '../Select';
import Switch from '../Switch';

export type BidderFilterState = {
  filters: BidderFilters;
  /** The performance request for the period, or null while a Custom range is incomplete or invalid. */
  request: BidderPeriodRequest | null;
  clock: ReportClock;
  canClear: boolean;
  patch: (changes: Partial<Record<BidderKey, string>>) => void;
  clear: () => void;
};

/**
 * The Bidders list filters, read from and written to the URL (see lib/bidderFilters.ts for the keys). Other keys on the
 * page (`bidder`, `day`, `tab`, `mode`, `bid`) are never touched, so a bidder link survives every filter change.
 */
export function useBidderFilters(isAdmin: boolean): BidderFilterState {
  const [values, patch] = useUrlFilters(BIDDER_URL_DEFAULTS);
  const clock = reportClock();
  const filters = parseBidderValues(values, clock);
  return {
    filters,
    request: bidderPeriodRequest(filters, clock),
    clock,
    canClear: bidderCanClear(filters, isAdmin),
    patch,
    clear: () => patch(Object.fromEntries(BIDDER_CLEAR_KEYS.map((k) => [k, undefined])) as Partial<Record<BidderKey, string>>),
  };
}

/**
 * The Bidders filter bar: Owner (admin), Show archived, search, the date range, Clear. The pay-week presets are
 * stepped by the page's own logic and labelled with the server's pay-week label (`serverLabel`, undefined while it
 * loads; `failed` falls back to the dates).
 */
export function BiddersFilterBar({
  f, isAdmin, ownerOptions, ownerId, serverLabel, failed = false,
}: {
  f: BidderFilterState;
  isAdmin: boolean;
  ownerOptions: { value: string; label: string }[];
  ownerId: string;
  serverLabel?: string;
  failed?: boolean;
}) {
  const ownerFieldId = useId();
  const { filters, clock, patch } = f;
  return (
    <FilterBar canClear={f.canClear} onClear={f.clear}>
      {isAdmin && (
        <FilterField label="Owner" htmlFor={ownerFieldId} width="w-52">
          <Select
            id={ownerFieldId}
            value={ownerId}
            onChange={(owner) => patch({ owner })}
            options={ownerOptions}
            className="w-full text-sm"
          />
        </FilterField>
      )}
      <div className="flex h-[38px] items-center">
        <Switch checked={filters.archived} onChange={(on) => patch({ archived: on ? '1' : '' })} label="Show archived" />
      </div>
      <SearchFilter value={filters.q} onChange={(q) => patch({ q })} placeholder="Search bidders…" />
      <DateRangeFilter<BidderPreset>
        value={{ preset: filters.range, from: filters.from, to: filters.to }}
        onChange={(v) => patch(pickBidderPreset(v.preset, v.from, v.to, clock))}
        presets={bidderPresetOptions(filters.range)}
        allowFuture={false}
        today={clock.today}
        rangeFor={(preset) => bidderDays(preset === filters.range ? filters : { ...filters, range: preset, date: '' }, clock)}
        labelFor={(range) => bidderLabel(filters, range, serverLabel ?? (failed && range ? rangeLabel(range) : undefined))}
        onStep={(dir) => {
          const change = stepBidderPeriod(filters, dir, clock);
          if (change) patch(change);
        }}
        canStepForward={bidderCanStepForward(filters, clock)}
      />
    </FilterBar>
  );
}
