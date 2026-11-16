import { useEffect, useId, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Select from '../Select';
import {
  canStep,
  customError,
  isValidDate,
  matchPreset,
  rangeFor as presetRange,
  rangeLabel,
  stepRange,
  type DatePreset,
  type DateRange,
} from '../../lib/dateRange';

/** What the URL holds for a date range: a preset, plus `from`/`to` when it is `custom`. */
export interface DateRangeValue<P extends string = DatePreset> {
  preset: P;
  from?: string;
  to?: string;
}

/** Today as a local calendar date, `YYYY-MM-DD`. */
function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * The dates a value stands for, or null when it has none: `all_time`, an unknown preset, or a custom range that is
 * missing, impossible (`2026-02-31`), reversed or longer than a year. Safe to call with values read from the URL.
 */
export function resolveRange(
  value: DateRangeValue,
  today: string,
  allowFuture: boolean,
): DateRange | null {
  if (value.preset === 'custom') {
    const from = value.from ?? '';
    const to = value.to ?? '';
    return customError(from, to) === null ? { from, to } : null;
  }
  return presetRange(value.preset, today, { allowFuture }) ?? null;
}

/**
 * Preset dropdown, ‹ label › stepper and, for Custom, From / To inputs with the range's validation message.
 *
 * It is generic over the preset string so a page with its own presets (Bidders' pay weeks) can use it: give it
 * `rangeFor` to say what each preset covers, and `onStep` / `canStepForward` / `labelFor` to take over stepping and
 * the label. For `DatePreset` values it works on its own.
 *
 * It never emits a bad date, and values read from the URL may be anything: an invalid custom range shows
 * `Pick both dates.` (or the matching message) and an unknown preset shows an empty dropdown. The page should treat
 * both as "no valid range" (see `resolveRange`) and fall back to its default for an unknown preset.
 */
export default function DateRangeFilter<P extends string = DatePreset>({
  value,
  onChange,
  presets,
  allowFuture,
  today,
  labelFor,
  onStep,
  canStepForward,
  rangeFor,
  label = 'Date range',
}: {
  value: DateRangeValue<P>;
  onChange: (value: DateRangeValue<P>) => void;
  presets: { value: P; label: string }[];
  /** Whether the range may reach past today (Interviews) or not (everything else). */
  allowFuture: boolean;
  /** `YYYY-MM-DD`; defaults to today in the browser's time zone. */
  today?: string;
  /** The text between ‹ and ›. Receives null when there are no dates (a preset `rangeFor` doesn't cover). */
  labelFor?: (range: DateRange | null) => string;
  /** Replaces the built-in stepping; the page then changes `value` itself. */
  onStep?: (dir: -1 | 1) => void;
  /** Replaces the built-in "can step forward" check. */
  canStepForward?: boolean;
  /** Replaces the built-in date math for presets (for presets that aren't `DatePreset`s). */
  rangeFor?: (preset: P) => DateRange | null;
  /** The label above the dropdown. */
  label?: string;
}) {
  const id = useId();
  const now = today ?? localToday();
  const preset: string = value.preset;
  const inList = presets.some((p) => p.value === preset);
  const isCustom = preset === 'custom';
  const isAllTime = preset === 'all_time';

  // The preset the user stepped from. Stepping can turn the range into Custom; it then keeps stepping by that unit.
  const [unit, setUnit] = useState<string | null>(null);
  useEffect(() => {
    if (!isCustom) setUnit(null);
  }, [isCustom]);

  const from = value.from ?? '';
  const to = value.to ?? '';
  const error = isCustom ? customError(from, to) : null;

  const rangeOf = (p: P): DateRange | null =>
    (rangeFor ? rangeFor(p) : presetRange(p as DatePreset, now, { allowFuture })) ?? null;

  let range: DateRange | null = null;
  if (isCustom) range = error === null ? { from, to } : null;
  else if (inList && !isAllTime) range = rangeOf(preset as P);

  const text = labelFor ? labelFor(range) : range ? rangeLabel(range) : isAllTime ? rangeLabel(null) : '';
  const showStepper = !isAllTime && (isCustom ? error === null : inList);
  const canGoBack = onStep !== undefined || range !== null;
  const canGoForward = canStepForward ?? (range !== null && canStep(range, 1, now, allowFuture));

  const pick = (next: string) => {
    if (next === 'custom') {
      onChange({ preset: next as P, from: range?.from, to: range?.to });
    } else {
      onChange({ preset: next as P });
    }
    setUnit(null);
  };

  const step = (dir: -1 | 1) => {
    if (onStep) {
      onStep(dir);
      return;
    }
    if (!range) return;
    const by = (isCustom ? unit : preset) ?? 'custom';
    let next = stepRange(range, dir, by as DatePreset);
    if (!allowFuture && next.to > now) next = { from: next.from, to: now };

    const offered = presets.map((p) => p.value);
    let matched: string;
    if (rangeFor) {
      matched =
        offered.find((p) => {
          if (p === 'custom' || p === 'all_time') return false;
          const r = rangeFor(p);
          return r !== null && r.from === next.from && r.to === next.to;
        }) ?? 'custom';
    } else {
      matched = matchPreset(next, now, offered as string[] as DatePreset[], { allowFuture });
    }

    if (matched === 'custom') {
      setUnit(by === 'custom' ? null : by);
      onChange({ preset: 'custom' as P, from: next.from, to: next.to });
    } else {
      setUnit(null);
      onChange({ preset: matched as P });
    }
  };

  // A bad date from the URL (2026-02-31) is never passed on: it counts as not picked.
  const validFrom = isValidDate(from) ? from : '';
  const validTo = isValidDate(to) ? to : '';
  const edit = (patch: { from?: string; to?: string }) => {
    setUnit(null);
    onChange({ preset: 'custom' as P, from: patch.from ?? validFrom, to: patch.to ?? validTo });
  };

  const dateMax = allowFuture ? undefined : now;
  const fromMax = validTo && dateMax ? (validTo < dateMax ? validTo : dateMax) : validTo || dateMax;

  return (
    <>
      <div className="w-44">
        <label htmlFor={`${id}-range`} className="mb-1 block text-xs text-muted">
          {label}
        </label>
        <Select
          id={`${id}-range`}
          value={inList ? preset : ''}
          onChange={pick}
          options={presets}
          placeholder={inList ? undefined : 'Pick a range'}
        />
      </div>
      {showStepper && (
        <div className="flex h-[38px] items-center gap-1">
          <button
            type="button"
            className="btn-icon"
            onClick={() => step(-1)}
            disabled={!canGoBack}
            aria-label="Previous period"
            title="Previous period"
          >
            <ChevronLeft size={16} aria-hidden />
          </button>
          <span className="min-w-[9.5rem] text-center text-sm font-medium tabular-nums" aria-live="polite">
            {text}
          </span>
          <button
            type="button"
            className="btn-icon"
            onClick={() => step(1)}
            disabled={!canGoForward}
            aria-label="Next period"
            title="Next period"
          >
            <ChevronRight size={16} aria-hidden />
          </button>
        </div>
      )}
      {isCustom && (
        <>
          <div className="w-40">
            <label htmlFor={`${id}-from`} className="mb-1 block text-xs text-muted">
              From
            </label>
            <input
              id={`${id}-from`}
              type="date"
              className="input text-sm"
              value={validFrom}
              max={fromMax}
              onChange={(e) => edit({ from: e.target.value })}
            />
          </div>
          <div className="w-40">
            <label htmlFor={`${id}-to`} className="mb-1 block text-xs text-muted">
              To
            </label>
            <input
              id={`${id}-to`}
              type="date"
              className="input text-sm"
              value={validTo}
              min={validFrom || undefined}
              max={dateMax}
              onChange={(e) => edit({ to: e.target.value })}
            />
          </div>
          {error && (
            <p className="flex h-[38px] items-center text-xs text-red-700 dark:text-red-400" role="alert">
              {error}
            </p>
          )}
        </>
      )}
    </>
  );
}
