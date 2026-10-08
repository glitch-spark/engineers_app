import { useEffect, useId, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { Link } from 'react-router-dom';
import { ArrowRight, Download, ListChecks, Loader2 } from 'lucide-react';
import * as api from '../../api/endpoints';
import type { JobApplyScreenBucket, JobApplyScreening } from '../../api/endpoints';
import { notify } from '../../lib/notify';
import BucketJobs from './BucketJobs';
import ExportSheetDialog from './ExportSheetDialog';
import MarketRow from './MarketRow';
import { selectionFor, toProfile, type ProfileOption } from './ProfilePicker';
import { BUCKET_COLOR, BUCKET_LABEL, BUCKET_ORDER, locationLabel, marketLabel } from './format';

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

/**
 * What "Score N applications" will do, from the picks: each profile's jobs (a job in two of its markets counts once),
 * the markets it covers, and jobs nobody covers.
 */
export function scorePlan(report: JobApplyScreening, picked: (key: string) => Set<string>) {
  const per = new Map<string, { jobs: number; markets: Set<string> }>();
  const skipped = new Map<string, number>();
  for (const c of report.combos ?? []) {
    const who = new Set<string>();
    for (const m of c.markets) for (const id of picked(m)) who.add(id);
    if (who.size === 0) {
      for (const m of c.markets) skipped.set(m, (skipped.get(m) ?? 0) + c.jobs);
      continue;
    }
    for (const id of who) {
      const e = per.get(id) ?? { jobs: 0, markets: new Set<string>() };
      e.jobs += c.jobs;
      c.markets.filter((m) => picked(m).has(id)).forEach((m) => e.markets.add(m));
      per.set(id, e);
    }
  }
  const pairs = [...per.values()].reduce((n, e) => n + e.jobs, 0);
  return { per, pairs, skipped };
}

/**
 * Layout A (spec 2026-10-02 §5): how many jobs are worth applying to, why the rest were dropped, and the worthwhile
 * jobs by location. No profile starts picked: the user adds who applies in each location group. "Score & continue" scores only the picked pairs.
 */
export default function ScreeningReport({
  runId,
  readOnly,
  assignments,
  checksOnly,
  rescore,
  onStarted,
  onRunChanged,
}: {
  runId: string;
  readOnly?: boolean;
  /** Read-only view of a started run: what was picked. */
  assignments?: Record<string, string[]>;
  /** Step ①: only what the check found, no profile picks or scoring. */
  checksOnly?: boolean;
  /** Back at step ② after scoring: start from these picks; scoring again replaces the run's scores. */
  rescore?: { assignments: Record<string, string[]>; selection: { accountId: string; resumeIds: string[] }[]; threshold: number };
  onStarted?: () => void;
  /** The run's status changed from here (a retry): refresh it. */
  onRunChanged?: () => void;
}) {
  const ids = { age: useId(), threshold: useId() };
  const { data: report, mutate } = useSWR(['job-apply-screening', runId], () => api.getJobApplyScreening(runId));
  const { data: accounts } = useSWR(readOnly ? null : 'job-applies-profiles', () => api.listAccounts({ limit: 200 }));
  const options = useMemo(() => new Map((accounts?.accounts ?? []).map((a) => [String(a._id), toProfile(a)])), [accounts]);

  const [picks, setPicks] = useState<Record<string, Set<string>>>({});
  const [unchecked, setUnchecked] = useState<Set<string>>(new Set());
  const [threshold, setThreshold] = useState(() => rescore?.threshold ?? readThreshold());
  const [open, setOpen] = useState<JobApplyScreenBucket | null>(null);
  const [starting, setStarting] = useState(false);
  const [checksOpen, setChecksOpen] = useState(false);
  const [savingAge, setSavingAge] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Scoring again: start from the picks used last time (a pick for every group, "*", shows in each group).
  const seeded = useRef(false);
  useEffect(() => {
    if (!rescore || !report || !options.size || seeded.current) return;
    seeded.current = true;
    const every = rescore.assignments['*'] ?? [];
    setPicks(Object.fromEntries(report.groups.map((g) => [g.key, new Set([...(rescore.assignments[g.key] ?? []), ...every])])));
    const off = new Set<string>();
    for (const sel of rescore.selection) {
      if (!sel.resumeIds.length) continue; // empty = every resume
      for (const r of options.get(sel.accountId)?.resumes ?? []) if (!sel.resumeIds.includes(r.id)) off.add(r.id);
    }
    setUnchecked(off);
  }, [rescore, report, options]);

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
  const plan = scorePlan(report, picked);
  const jobsFor = (profileId: string) => plan.per.get(profileId)?.jobs ?? 0;
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

  const setPicked = (key: string, profileId: string, on: boolean) =>
    setPicks((prev) => {
      const next = new Set(prev[key] ?? []);
      if (on) next.add(profileId);
      else next.delete(profileId);
      return { ...prev, [key]: next };
    });
  const toggleResume = (id: string) =>
    setUnchecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
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

  /** The clean, de-duplicated links of the jobs worth applying to, as a CSV download. */
  const exportCsv = async () => {
    setExporting(true);
    try {
      const rows: api.JobApplyRow[] = [];
      for (let page = 1; ; page += 1) {
        const res = await api.listJobApplyRows(runId, { screen: 'valid', page, limit: 200 });
        rows.push(...res.rows);
        if (page >= (res.pagination.totalPages || 1)) break;
      }
      const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const lines = [
        ['url', 'title', 'company', 'candidate markets', 'status', 'posted'].map(cell).join(','),
        ...rows.map((r) =>
          [
            r.url,
            r.title,
            r.company,
            r.markets?.length ? r.markets.map(marketLabel).join(' / ') : locationLabel(r.groupKey),
            r.screen ? BUCKET_LABEL[r.screen] : '',
            r.postedDate ?? '',
          ]
            .map(cell)
            .join(','),
        ),
      ];
      // BOM so Excel opens it as UTF-8; CRLF line ends.
      const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `clean-job-links-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      notify.error(err, 'Could not export the links');
    } finally {
      setExporting(false);
    }
  };

  const start = async () => {
    if (blocker || starting || savingAge) return;
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
        <div className="float-right ml-3 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className="btn-outline btn-sm"
            onClick={() => setChecksOpen(true)}
            disabled={report.total === 0}
            title="Every job with its posting date, location, security clearance, work mode and status"
          >
            <ListChecks className="h-4 w-4" aria-hidden />
            Export checks to Google Sheet
          </button>
          <button
            type="button"
            className="btn-outline btn-sm"
            onClick={exportCsv}
            disabled={exporting || report.worth === 0}
            title="The clean, de-duplicated links of the jobs worth applying to"
          >
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Download className="h-4 w-4" aria-hidden />}
            Export clean links (CSV)
          </button>
        </div>
        <ExportSheetDialog mode="checks" open={checksOpen} runId={runId} onClose={() => setChecksOpen(false)} onExported={() => {}} />
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          <span className="text-3xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{report.worth}</span>{' '}
          of {report.total} jobs worth applying to
          {report.check > 0 && (
            <span className="ml-2 text-amber-700 dark:text-amber-400">
              · {report.check} need a check (not scored unless you approve them)
            </span>
          )}
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
          {!readOnly && !rescore && (
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
            <BucketJobs runId={runId} bucket={open} readOnly={readOnly || !!rescore} onChanged={() => void mutate()} onRetried={onRunChanged} />
          </div>
        )}
      </div>

      {!checksOnly && (
        <div>
          <h3 className="form-label">Apply with — by candidate location</h3>
          {report.worth === 0 && (
            <p className="hint">No jobs worth applying to. Open the buckets above to see why, or include jobs anyway.</p>
          )}
          <ul className="mt-2 space-y-2">
            {report.groups.map((g) => (
              <MarketRow
                key={g.key}
                group={g}
                profiles={profiles}
                options={options}
                picked={picked(g.key)}
                unchecked={unchecked}
                readOnly={readOnly}
                onAdd={(id) => setPicked(g.key, id, true)}
                onRemove={(id) => setPicked(g.key, id, false)}
                onToggleResume={toggleResume}
              />
            ))}
          </ul>
          {report.others.length > 0 && (
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              <span className="font-medium text-zinc-800 dark:text-zinc-200">Other locations</span> (not scored):{' '}
              {report.others.map((o) => `${locationLabel(o.key)} ${o.jobs}`).join(' · ')}
            </p>
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
      )}

      {!readOnly && !checksOnly && (
        <div className="space-y-4 border-t border-zinc-200 pt-5 dark:border-zinc-800">
          {used.length > 0 && (
            <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-4 text-sm dark:border-sky-800 dark:bg-sky-950/20">
              <p className="font-semibold text-zinc-900 dark:text-zinc-50">
                What “Score {plan.pairs} application{plan.pairs === 1 ? '' : 's'}{rescore ? ' again' : ''}” does
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-zinc-700 dark:text-zinc-300">
                {used.map((p) => {
                  const e = plan.per.get(p._id);
                  const where = [...(e?.markets ?? [])].map(marketLabel).join(' + ');
                  const k = p.resumes.filter((r) => !unchecked.has(r.id)).length;
                  return (
                    <li key={p._id}>
                      <span className="font-medium">{p.name}</span>:{' '}
                      {p.resumes.length === 0
                        ? `tailored resumes for ${e?.jobs ?? 0} ${where} job${e?.jobs === 1 ? '' : 's'}`
                        : `best of ${k} resume${k === 1 ? '' : 's'} on ${e?.jobs ?? 0} ${where} job${e?.jobs === 1 ? '' : 's'}` +
                          `; jobs where none scores ≥ ${threshold} aren't suggested` +
                          (p.hasTemplate ? ' (tailor them from “All”)' : '')}
                    </li>
                  );
                })}
                {rescore && (
                  <li>Replaces this run’s scores and suggestions. Your tailored resumes and sheet rows stay.</li>
                )}
                <li>Next: step ③ lists the suggested jobs with their best resume; export to your sheet, tailor, download.</li>
                {[...plan.skipped.entries()].map(([m, n]) => (
                  <li key={m} className="text-amber-800 dark:text-amber-300">
                    {n} {marketLabel(m)} job{n === 1 ? '' : 's'} {n === 1 ? 'has' : 'have'} no profile and will be skipped.
                  </li>
                ))}
              </ul>
            </div>
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
                {blocker ?? `${used.length} profile${used.length === 1 ? '' : 's'}`}
              </p>
              <button type="button" className="btn" onClick={start} disabled={!!blocker || starting || savingAge}>
                {starting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                Score {plan.pairs} application{plan.pairs === 1 ? '' : 's'}
                {rescore ? ' again' : ''}
                {!starting && <ArrowRight className="h-4 w-4" aria-hidden />}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
