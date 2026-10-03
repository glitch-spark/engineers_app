import { useEffect, useId, useMemo, useState } from 'react';
import useSWR from 'swr';
import { Link } from 'react-router-dom';
import { ArrowRight, Loader2 } from 'lucide-react';
import * as api from '../../api/endpoints';
import type { JobApplyScreenBucket, JobApplyScreening } from '../../api/endpoints';
import { countryFlag } from '../../lib/countries';
import { notify } from '../../lib/notify';
import BucketJobs from './BucketJobs';
import { ResumeChecklist, selectionFor, toProfile, usable, type ProfileOption } from './ProfilePicker';
import { BUCKET_COLOR, BUCKET_LABEL, BUCKET_ORDER, locationLabel } from './format';

const PREFS_KEY = 'jobApplies.newRun';
const AGE_OPTIONS = [7, 14, 30, 60, 90];
const SCORE_MIN = 50;
const SCORE_MAX = 95;

function readThreshold(): number {
  try {
    const t = Number(JSON.parse(window.localStorage.getItem(PREFS_KEY) ?? '{}').threshold);
    return t >= SCORE_MIN && t <= SCORE_MAX ? t : 75;
  } catch {
    return 75;
  }
}

function savePrefs(patch: Record<string, number>): void {
  try {
    const prev = JSON.parse(window.localStorage.getItem(PREFS_KEY) ?? '{}');
    window.localStorage.setItem(PREFS_KEY, JSON.stringify({ ...prev, ...patch }));
  } catch {
    /* storage unavailable: just don't remember */
  }
}

/** Fitting, usable profiles per group: the starting picks. */
function initialPicks(report: JobApplyScreening, usableIds: Set<string>): Record<string, Set<string>> {
  return Object.fromEntries(report.groups.map((g) => [g.key, new Set(g.fits.filter((id) => usableIds.has(id)))]));
}

/**
 * Layout A (spec 2026-10-02 §5): how many jobs are worth applying to, why the rest were dropped, and the worthwhile
 * jobs by location with the profiles that fit each group ticked. "Score & continue" scores only the picked pairs.
 */
export default function ScreeningReport({
  runId,
  readOnly,
  assignments,
  onStarted,
}: {
  runId: string;
  readOnly?: boolean;
  /** Read-only view of a started run: what was picked. */
  assignments?: Record<string, string[]>;
  onStarted?: () => void;
}) {
  const ids = { age: useId(), threshold: useId() };
  const { data: report, mutate } = useSWR(['job-apply-screening', runId], () => api.getJobApplyScreening(runId));
  const { data: accounts } = useSWR(readOnly ? null : 'job-applies-profiles', () => api.listAccounts({ limit: 200 }));
  const options = useMemo(() => new Map((accounts?.accounts ?? []).map((a) => [String(a._id), toProfile(a)])), [accounts]);

  const [picks, setPicks] = useState<Record<string, Set<string>>>({});
  const [unchecked, setUnchecked] = useState<Set<string>>(new Set());
  const [threshold, setThreshold] = useState(readThreshold);
  const [open, setOpen] = useState<JobApplyScreenBucket | null>(null);
  const [starting, setStarting] = useState(false);
  const [savingAge, setSavingAge] = useState(false);

  // Start from the fitting profiles; keep the user's picks for groups that still exist after a refresh.
  const groupKeys = report?.groups.map((g) => g.key).join('|') ?? '';
  useEffect(() => {
    if (!report || readOnly || !options.size) return;
    const usableIds = new Set([...options.values()].filter(usable).map((p) => p._id));
    const fresh = initialPicks(report, usableIds);
    setPicks((prev) => Object.fromEntries(Object.entries(fresh).map(([k, v]) => [k, prev[k] ?? v])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupKeys, options, readOnly]);

  if (!report) {
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-muted">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading the screening report…
      </p>
    );
  }

  const profiles = report.profiles;
  const picked = (key: string): Set<string> =>
    readOnly ? new Set([...(assignments?.[key] ?? []), ...(assignments?.['*'] ?? [])]) : picks[key] ?? new Set();
  const jobsFor = (profileId: string) =>
    report.groups.reduce((n, g) => n + (picked(g.key).has(profileId) ? g.jobs : 0), 0);
  const used: ProfileOption[] = profiles
    .filter((p) => jobsFor(p.id) > 0)
    .map((p) => options.get(p.id))
    .filter((p): p is ProfileOption => !!p);
  const nonZero = BUCKET_ORDER.filter((b) => report.buckets[b] > 0);
  const blocker =
    report.worth === 0
      ? 'No jobs worth applying to'
      : used.length === 0
        ? 'Pick at least one profile for a group'
        : null;

  const toggle = (key: string, profileId: string) =>
    setPicks((prev) => {
      const next = new Set(prev[key] ?? []);
      if (next.has(profileId)) next.delete(profileId);
      else next.add(profileId);
      return { ...prev, [key]: next };
    });

  const changeAge = async (days: number) => {
    setSavingAge(true);
    try {
      await api.updateJobApplyRun(runId, { maxAgeDays: days });
      savePrefs({ maxAgeDays: days });
      await mutate();
    } catch (err) {
      notify.error(err, 'Could not change the max age');
    } finally {
      setSavingAge(false);
    }
  };

  const start = async () => {
    if (blocker || starting) return;
    setStarting(true);
    try {
      const chosen = Object.fromEntries(
        Object.entries(picks)
          .map(([k, v]) => [k, [...v].filter((id) => used.some((p) => p._id === id))] as const)
          .filter(([, v]) => v.length > 0),
      );
      await api.startJobApplyRun(runId, { assignments: chosen, selection: selectionFor(used, unchecked), threshold });
      savePrefs({ threshold });
      notify.success('Scoring started');
      onStarted?.();
    } catch (err) {
      notify.error(err, 'Could not start scoring');
      setStarting(false);
    }
  };

  return (
    <section className="panel space-y-6 p-6" aria-label="Screening report">
      <div>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          <span className="text-3xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{report.worth}</span>{' '}
          of {report.total} jobs worth applying to
          {report.check > 0 && <span className="ml-2 text-amber-700 dark:text-amber-400">· {report.check} need a check</span>}
        </p>
        <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800" aria-hidden>
          {nonZero.map((b) => (
            <div
              key={b}
              className={BUCKET_COLOR[b]}
              style={{ width: `${(report.buckets[b] / Math.max(1, report.total)) * 100}%` }}
              title={`${BUCKET_LABEL[b]}: ${report.buckets[b]}`}
            />
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {nonZero.map((b) => (
            <button
              key={b}
              type="button"
              aria-pressed={open === b}
              onClick={() => setOpen(open === b ? null : b)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${
                open === b
                  ? 'border-sky-500 bg-sky-50 text-sky-800 dark:bg-sky-950/30 dark:text-sky-200'
                  : 'border-zinc-200 text-zinc-700 hover:border-zinc-300 dark:border-zinc-700 dark:text-zinc-300'
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${BUCKET_COLOR[b]}`} aria-hidden />
              {BUCKET_LABEL[b]} {report.buckets[b]}
            </button>
          ))}
          {!readOnly && (
            <label htmlFor={ids.age} className="ml-auto inline-flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
              Posted within
              <select
                id={ids.age}
                className="input w-auto py-1 text-xs"
                value={report.maxAgeDays}
                disabled={savingAge}
                onChange={(e) => changeAge(Number(e.target.value))}
              >
                {[...new Set([...AGE_OPTIONS, report.maxAgeDays])].sort((a, b) => a - b).map((d) => (
                  <option key={d} value={d}>
                    {d} days
                  </option>
                ))}
              </select>
              {savingAge && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
            </label>
          )}
        </div>
        {open && (
          <div className="mt-3">
            <BucketJobs runId={runId} bucket={open} readOnly={readOnly} onChanged={() => void mutate()} />
          </div>
        )}
      </div>

      <div>
        <h3 className="form-label">Apply with — by location</h3>
        {report.groups.length === 0 ? (
          <p className="hint">No jobs worth applying to. Open the buckets above to see why, or include jobs anyway.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {report.groups.map((g) => (
              <li key={g.key} className="rounded-xl border border-zinc-200 px-4 py-3 dark:border-zinc-700">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <p className="min-w-[12rem] text-sm">
                    <span className="font-semibold text-zinc-900 dark:text-zinc-50">{locationLabel(g.key)}</span>
                    <span className="text-zinc-600 dark:text-zinc-400"> · {g.jobs} job{g.jobs === 1 ? '' : 's'}</span>
                    {g.check > 0 && <span className="ml-1 text-xs text-amber-700 dark:text-amber-400">({g.check} need a check)</span>}
                  </p>
                  {profiles.length === 0 ? (
                    <span className="hint">No profiles</span>
                  ) : (
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {profiles.map((p) => {
                        const fits = g.fits.includes(p.id);
                        const option = options.get(p.id);
                        const disabled = readOnly || (option ? !usable(option) : true);
                        return (
                          <label key={p.id} className={`inline-flex items-center gap-1.5 text-sm ${disabled ? 'opacity-60' : 'cursor-pointer'}`}>
                            <input type="checkbox" checked={picked(g.key).has(p.id)} disabled={disabled} onChange={() => toggle(g.key, p.id)} />
                            <span className={fits ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-500'}>
                              {p.country ? `${countryFlag(p.country)} ` : ''}
                              {p.name}
                            </span>
                            {!fits && <span className="text-xs italic text-zinc-500">doesn’t fit</span>}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {profiles.length === 0 && !readOnly && (
          <p className="hint mt-2">
            No profiles yet.{' '}
            <Link to="/accounts/new" className="font-medium text-sky-700 hover:underline dark:text-sky-400">
              Add a profile
            </Link>{' '}
            with a resume or an HTML template.
          </p>
        )}
        {profiles.some((p) => !p.country && !p.region) && !readOnly && (
          <p className="hint mt-2">
            Profiles without a country fit every group. Set {profiles.filter((p) => !p.country && !p.region).map((p) => p.name).join(', ')}’s
            country for better suggestions.
          </p>
        )}
      </div>

      {!readOnly && (
        <div className="space-y-4 border-t border-zinc-200 pt-5 dark:border-zinc-800">
          {used.length > 0 && (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {used.map((p) => (
                <li key={p._id} className="rounded-xl border border-zinc-200 p-3 text-sm dark:border-zinc-700">
                  <p className="mb-2 font-medium text-zinc-900 dark:text-zinc-50">
                    {p.name} <span className="font-normal text-zinc-500">· {jobsFor(p._id)} jobs</span>
                  </p>
                  <ResumeChecklist
                    profile={p}
                    enabled
                    unchecked={unchecked}
                    onToggle={(id) =>
                      setUnchecked((prev) => {
                        const next = new Set(prev);
                        if (next.has(id)) next.delete(id);
                        else next.add(id);
                        return next;
                      })
                    }
                  />
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-end justify-between gap-4">
            <label htmlFor={ids.threshold} className="form-label w-64">
              Minimum match score <span className="font-semibold tabular-nums">{threshold}</span>
              <input
                id={ids.threshold}
                type="range"
                min={SCORE_MIN}
                max={SCORE_MAX}
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                className="mt-1 w-full accent-sky-600"
              />
            </label>
            <div className="flex items-center gap-3">
              <p className="text-sm text-zinc-600 dark:text-zinc-400" aria-live="polite">
                {blocker ?? used.map((p) => `${p.name}: ${jobsFor(p._id)}`).join(' · ')}
              </p>
              <button type="button" className="btn" onClick={start} disabled={!!blocker || starting}>
                {starting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                Score &amp; continue
                {!starting && <ArrowRight className="h-4 w-4" aria-hidden />}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
