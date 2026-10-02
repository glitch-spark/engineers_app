import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import useSWR from 'swr';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowRight, CheckCircle2, FileSpreadsheet, Loader2, Search, Sparkles } from 'lucide-react';
import * as api from '../../api/endpoints';
import { countryFlag } from '../../lib/countries';
import { notify } from '../../lib/notify';
import Segmented from './Segmented';

const PREFS_KEY = 'jobApplies.newRun';
const LAST_SHEET_KEY = 'jobApplies.lastSheetUrl';
const GSHEET_RE = /^https:\/\/docs\.google\.com\/spreadsheets\/(?:u\/\d+\/)?d\/[\w-]{10,}/;
const AGE_OPTIONS = [7, 14, 30, 60];
const SCORE_MIN = 50;
const SCORE_MAX = 95;
const SCORE_MARKS: [number, string][] = [
  [50, 'Fair'],
  [65, 'Good'],
  [80, 'Strong'],
];

type SourceKind = 'gsheet' | 'file';

interface ProfileOption {
  _id: string;
  name: string;
  country: string | null;
  region: string | null;
  hasTemplate: boolean;
  resumes: { id: string; filename: string }[];
}

interface Prefs {
  profileIds: string[];
  threshold: number;
  maxAgeDays: number;
}

type Preview =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'ok'; data: api.JobSheetPreview }
  | { state: 'error'; message: string };

function readPrefs(): Prefs {
  const fallback: Prefs = { profileIds: [], threshold: 75, maxAgeDays: 30 };
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function store(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: just don't remember */
  }
}

function readLastSheet(): string {
  try {
    return window.localStorage.getItem(LAST_SHEET_KEY) ?? '';
  } catch {
    return '';
  }
}

function toProfile(raw: Record<string, unknown>): ProfileOption {
  const resumes = Array.isArray(raw.resumes) ? (raw.resumes as Record<string, unknown>[]) : [];
  return {
    _id: String(raw._id),
    name: String(raw.name ?? ''),
    country: (raw.country as string | null | undefined) ?? null,
    region: (raw.region as string | null | undefined) ?? null,
    hasTemplate: typeof raw.styleTemplate === 'string' && raw.styleTemplate.trim().length > 0,
    resumes: resumes.filter((r) => r.id).map((r) => ({ id: String(r.id), filename: String(r.filename ?? 'resume') })),
  };
}

/** A profile can take part if it can be matched (uploaded resumes) or tailored (HTML template). */
const usable = (p: ProfileOption) => p.resumes.length > 0 || p.hasTemplate;

function Step({ n, title, hint, children }: { n: number; title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="grid gap-3 md:grid-cols-[12rem_minmax(0,1fr)] md:gap-6" aria-label={title}>
      <div className="flex items-start gap-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-xs font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900">
          {n}
        </span>
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{title}</h3>
          {hint && <p className="hint mt-0.5">{hint}</p>}
        </div>
      </div>
      <div className="min-w-0 space-y-3">{children}</div>
    </section>
  );
}

export default function NewRunPanel() {
  const navigate = useNavigate();
  const ids = { sheet: useId(), file: useId(), search: useId(), threshold: useId() };
  const prefs = useRef(readPrefs()).current;

  const [sourceKind, setSourceKind] = useState<SourceKind>('gsheet');
  const [sheetUrl, setSheetUrl] = useState(readLastSheet);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview>({ state: 'idle' });
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(() => new Set(prefs.profileIds));
  const [unchecked, setUnchecked] = useState<Set<string>>(new Set()); // resume ids switched off
  const [threshold, setThreshold] = useState(prefs.threshold);
  const [maxAgeDays, setMaxAgeDays] = useState(AGE_OPTIONS.includes(prefs.maxAgeDays) ? prefs.maxAgeDays : 30);
  const [submitting, setSubmitting] = useState(false);

  const { data, isLoading } = useSWR('job-applies-profiles', () => api.listAccounts({ limit: 200 }));
  const profiles = useMemo(() => (data?.accounts ?? []).map(toProfile), [data]);
  const needle = query.trim().toLowerCase();
  const visible = profiles.filter((p) => !needle || p.name.toLowerCase().includes(needle));

  // Forget remembered profiles that no longer exist or can't be used.
  useEffect(() => {
    if (!profiles.length) return;
    setSelected((prev) => new Set([...prev].filter((id) => profiles.some((p) => p._id === id && usable(p)))));
  }, [profiles]);

  // Check the sheet as soon as there is one: a pasted link (debounced) or a picked file.
  const trimmedUrl = sheetUrl.trim();
  const source: api.JobApplySource | null =
    sourceKind === 'gsheet' ? (GSHEET_RE.test(trimmedUrl) ? { sheetUrl: trimmedUrl } : null) : file ? { file } : null;
  const sourceKey = sourceKind === 'gsheet' ? trimmedUrl : file ? `${file.name}:${file.size}:${file.lastModified}` : '';
  const sourceRef = useRef(source);
  sourceRef.current = source;
  useEffect(() => {
    const current = sourceRef.current;
    if (!current) {
      setPreview(
        sourceKind === 'gsheet' && trimmedUrl
          ? { state: 'error', message: 'That isn’t a Google Sheets link (https://docs.google.com/spreadsheets/d/…).' }
          : { state: 'idle' },
      );
      return;
    }
    let cancelled = false;
    setPreview({ state: 'checking' });
    const timer = window.setTimeout(
      async () => {
        try {
          const res = await api.previewJobSheet(current);
          if (cancelled) return;
          setPreview(res.total ? { state: 'ok', data: res } : { state: 'error', message: 'No job rows with a URL were found.' });
        } catch (err) {
          if (!cancelled) setPreview({ state: 'error', message: err instanceof Error ? err.message : 'Could not read the sheet.' });
        }
      },
      sourceKind === 'gsheet' ? 600 : 0,
    );
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [sourceKey, sourceKind, trimmedUrl]);

  const toggleProfile = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleResume = (id: string) =>
    setUnchecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const chosen = profiles.filter((p) => selected.has(p._id));
  const withResumes = chosen.filter((p) => p.resumes.length > 0).length;
  const tailorOnly = chosen.length - withResumes;
  const blocker =
    preview.state === 'checking'
      ? 'Checking the sheet…'
      : preview.state !== 'ok'
        ? 'Add a job sheet to start'
        : chosen.length === 0
          ? 'Pick at least one profile'
          : null;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const current = sourceRef.current;
    if (blocker || !current) return;
    setSubmitting(true);
    try {
      // An empty resume list means "every resume on the profile" (and "tailor only" when it has none).
      const selection = chosen.map((p) => {
        const on = p.resumes.filter((r) => !unchecked.has(r.id)).map((r) => r.id);
        return { accountId: p._id, resumeIds: on.length === p.resumes.length ? [] : on };
      });
      const res = await api.createJobApplyRun(current, selection, threshold, maxAgeDays);
      store(PREFS_KEY, JSON.stringify({ profileIds: [...selected], threshold, maxAgeDays } satisfies Prefs));
      if (sourceKind === 'gsheet') store(LAST_SHEET_KEY, trimmedUrl);
      notify.success(`Started: ${res.total} jobs`);
      navigate(`/job-applies/${res.runId}`);
    } catch (err) {
      notify.error(err, 'Could not start the run');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="panel overflow-hidden" aria-label="New run">
      <div className="space-y-7 p-6">
        <h2 className="card-title">New run</h2>

        <Step n={1} title="Job sheet" hint="One job per row: a URL, plus the description if you have it.">
          <Segmented
            label="Source"
            value={sourceKind}
            onChange={setSourceKind}
            options={[
              { value: 'gsheet', label: 'Google Sheet link' },
              { value: 'file', label: 'Upload file' },
            ]}
          />
          {sourceKind === 'gsheet' ? (
            <>
              <label htmlFor={ids.sheet} className="sr-only">
                Google Sheets link
              </label>
              <input
                id={ids.sheet}
                type="url"
                inputMode="url"
                placeholder="https://docs.google.com/spreadsheets/d/…"
                value={sheetUrl}
                onChange={(e) => setSheetUrl(e.target.value)}
                aria-invalid={preview.state === 'error'}
                aria-describedby={`${ids.sheet}-status`}
                className="input"
              />
            </>
          ) : (
            <label
              htmlFor={ids.file}
              className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-zinc-300 px-4 py-3 text-sm text-zinc-600 hover:border-zinc-400 focus-within:ring-2 focus-within:ring-sky-600 dark:border-zinc-600 dark:text-zinc-300"
            >
              <FileSpreadsheet className="h-5 w-5 shrink-0 text-zinc-500" aria-hidden />
              <span className="truncate">{file ? file.name : 'Choose an .xlsx or .csv file'}</span>
              <input
                id={ids.file}
                type="file"
                accept=".xlsx,.csv"
                className="sr-only"
                aria-describedby={`${ids.sheet}-status`}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
          )}
          <p id={`${ids.sheet}-status`} role="status" className="flex items-start gap-1.5 text-sm">
            {preview.state === 'checking' && (
              <>
                <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-zinc-500" aria-hidden />
                <span className="text-zinc-600 dark:text-zinc-400">Checking the sheet…</span>
              </>
            )}
            {preview.state === 'ok' && (
              <>
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                <span className="text-zinc-700 dark:text-zinc-300">
                  <span className="font-medium">{preview.data.title}</span> · {preview.data.total} jobs ·{' '}
                  {preview.data.withDescription} with descriptions · {preview.data.urlOnly} links to fetch
                </span>
              </>
            )}
            {preview.state === 'error' && (
              <>
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden />
                <span className="text-red-700 dark:text-red-400">{preview.message}</span>
              </>
            )}
            {preview.state === 'idle' && (
              <span className="hint">
                {sourceKind === 'gsheet'
                  ? 'Share it as “Anyone with the link → Viewer”. The tab in the link is used.'
                  : 'A URL column is required; a job-description column is optional (URL-only rows are fetched).'}
              </span>
            )}
          </p>
        </Step>

        <Step n={2} title="Profiles" hint="With resumes: matched by score. Without: you apply with tailored resumes.">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {profiles.length > 6 && (
              <div className="relative w-56">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-400" aria-hidden />
                <label htmlFor={ids.search} className="sr-only">
                  Search profiles
                </label>
                <input
                  id={ids.search}
                  className="input pl-9"
                  placeholder="Search profiles"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
            )}
            <button
              type="button"
              className="text-sm font-medium text-sky-700 hover:underline dark:text-sky-400"
              onClick={() => setSelected(new Set([...selected, ...visible.filter(usable).map((p) => p._id)]))}
            >
              Select all
            </button>
            {selected.size > 0 && (
              <button type="button" className="text-sm text-zinc-500 hover:underline" onClick={() => setSelected(new Set())}>
                Clear ({selected.size})
              </button>
            )}
          </div>

          {isLoading ? (
            <p role="status" className="flex items-center gap-2 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading profiles…
            </p>
          ) : profiles.length === 0 ? (
            <p className="hint">
              No profiles yet.{' '}
              <Link to="/accounts/new" className="font-medium text-sky-700 hover:underline dark:text-sky-400">
                Create one
              </Link>{' '}
              with a resume or an HTML template.
            </p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {visible.map((p) => {
                const ok = usable(p);
                const on = selected.has(p._id);
                const checkedCount = p.resumes.filter((r) => !unchecked.has(r.id)).length;
                return (
                  <li
                    key={p._id}
                    className={`rounded-xl border p-3 transition ${
                      !ok
                        ? 'border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/40'
                        : on
                          ? 'border-sky-500 bg-sky-50/60 ring-1 ring-sky-500 dark:border-sky-400 dark:bg-sky-950/20 dark:ring-sky-400'
                          : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-700 dark:hover:border-zinc-600'
                    }`}
                  >
                    <label className={`flex items-center gap-2 ${ok ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'}`}>
                      <input type="checkbox" checked={on} disabled={!ok} onChange={() => toggleProfile(p._id)} />
                      <span className="truncate font-medium text-zinc-900 dark:text-zinc-50">{p.name}</span>
                      {(p.country || p.region) && (
                        <span className="ml-auto shrink-0 text-xs text-zinc-500">
                          {p.country ? `${countryFlag(p.country)} ${p.country}` : p.region}
                        </span>
                      )}
                    </label>
                    <div className="mt-2 pl-6 text-sm">
                      {!ok ? (
                        <p className="hint">
                          Can’t use yet: no resumes or HTML template.{' '}
                          <Link to={`/accounts/${p._id}`} className="font-medium text-sky-700 hover:underline dark:text-sky-400">
                            Set up
                          </Link>
                        </p>
                      ) : p.resumes.length === 0 ? (
                        <p className="inline-flex items-center gap-1.5 text-violet-700 dark:text-violet-300">
                          <Sparkles className="h-3.5 w-3.5" aria-hidden /> Tailored resumes only
                        </p>
                      ) : (
                        <ul className="space-y-1">
                          {p.resumes.map((r) => {
                            const isOn = !unchecked.has(r.id);
                            return (
                              <li key={r.id}>
                                <label className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300">
                                  <input
                                    type="checkbox"
                                    checked={on && isOn}
                                    // Keep at least one resume: a profile with resumes is matched by them.
                                    disabled={!on || (isOn && checkedCount === 1)}
                                    onChange={() => toggleResume(r.id)}
                                  />
                                  <span className="truncate">{r.filename}</span>
                                </label>
                              </li>
                            );
                          })}
                          <li className="hint">{p.hasTemplate ? 'Can also be tailored' : 'No HTML template, so no tailoring'}</li>
                        </ul>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Step>

        <Step n={3} title="Filters" hint="Jobs that don’t pass are listed under “Excluded”.">
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <label htmlFor={ids.threshold} className="form-label">
                Minimum match score{' '}
                <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{threshold}</span>
              </label>
              <input
                id={ids.threshold}
                type="range"
                min={SCORE_MIN}
                max={SCORE_MAX}
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                className="mt-1 w-full accent-sky-600"
              />
              <div className="relative h-4 text-[11px] text-zinc-500" aria-hidden>
                {SCORE_MARKS.map(([v, label]) => (
                  <span key={v} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${((v - SCORE_MIN) / (SCORE_MAX - SCORE_MIN)) * 100}%` }}>
                    {label} {v}
                  </span>
                ))}
              </div>
              <p className="hint mt-2">For uploaded resumes; tailor-only profiles aren’t scored.</p>
            </div>
            <div className="space-y-2">
              <Segmented
                label="Posted within"
                value={String(maxAgeDays)}
                onChange={(v) => setMaxAgeDays(Number(v))}
                options={AGE_OPTIONS.map((d) => ({ value: String(d), label: `${d} days` }))}
              />
              <p className="hint">Always applied: remote only · no security clearance · location fits the profile.</p>
            </div>
          </div>
        </Step>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 bg-zinc-50/70 px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900/40">
        <p className="text-sm text-zinc-600 dark:text-zinc-400" aria-live="polite">
          {blocker ?? (
            <>
              <span className="font-medium text-zinc-900 dark:text-zinc-50">
                {preview.state === 'ok' ? preview.data.total : 0} jobs
              </span>{' '}
              · {chosen.length} profile{chosen.length === 1 ? '' : 's'} ({withResumes} with resumes
              {tailorOnly ? `, ${tailorOnly} tailor-only` : ''})
            </>
          )}
        </p>
        <button type="submit" className="btn" disabled={!!blocker || submitting}>
          {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          Start run
          {!submitting && <ArrowRight className="h-4 w-4" aria-hidden />}
        </button>
      </div>
    </form>
  );
}
