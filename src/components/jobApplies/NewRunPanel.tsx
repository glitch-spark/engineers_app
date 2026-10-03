import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, CheckCircle2, FileSpreadsheet, Loader2, ScanSearch } from 'lucide-react';
import * as api from '../../api/endpoints';
import { notify } from '../../lib/notify';
import Segmented from './Segmented';

const PREFS_KEY = 'jobApplies.newRun';
const LAST_SHEET_KEY = 'jobApplies.lastSheetUrl';
// Edit/view links, published links (/d/e/…) and links pasted without https:// (the backend accepts all three).
const GSHEET_RE = /^(?:https:\/\/)?docs\.google\.com\/spreadsheets\/(?:u\/\d+\/)?d\/(?:e\/)?[\w-]{10,}/;
const DEFAULT_MAX_AGE = 30;

type SourceKind = 'gsheet' | 'file';

type Preview =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'ok'; data: api.JobSheetPreview }
  | { state: 'error'; message: string };

/** The max posting age last used in a screening report (shared with it through localStorage). */
function rememberedMaxAge(): number {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    const age = raw ? Number(JSON.parse(raw).maxAgeDays) : NaN;
    return age >= 1 && age <= 365 ? age : DEFAULT_MAX_AGE;
  } catch {
    return DEFAULT_MAX_AGE;
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

/**
 * Step 1 of a run: the job sheet. "Check jobs" fetches and screens every job; profiles are picked afterwards in the
 * screening report, per location group, once it's known which jobs are worth applying to.
 */
export default function NewRunPanel() {
  const navigate = useNavigate();
  const ids = { sheet: useId(), file: useId() };

  const [sourceKind, setSourceKind] = useState<SourceKind>('gsheet');
  const [sheetUrl, setSheetUrl] = useState(readLastSheet);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview>({ state: 'idle' });
  const [submitting, setSubmitting] = useState(false);

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

  const blocker =
    preview.state === 'checking' ? 'Reading the sheet…' : preview.state !== 'ok' ? 'Add a job sheet to start' : null;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const current = sourceRef.current;
    if (blocker || !current) return;
    setSubmitting(true);
    try {
      const res = await api.createJobApplyRun(current, { maxAgeDays: rememberedMaxAge() });
      if (sourceKind === 'gsheet') store(LAST_SHEET_KEY, trimmedUrl);
      notify.success(`Checking ${res.total} jobs`);
      navigate(`/job-applies/${res.runId}`);
    } catch (err) {
      notify.error(err, 'Could not start checking the jobs');
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
                <span className="text-zinc-600 dark:text-zinc-400">Reading the sheet…</span>
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
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 bg-zinc-50/70 px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900/40">
        <p className="text-sm text-zinc-600 dark:text-zinc-400" aria-live="polite">
          {blocker ?? 'Next: we open every link, drop closed, old and on-site jobs, and group the rest by location.'}
        </p>
        <button type="submit" className="btn" disabled={!!blocker || submitting}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ScanSearch className="h-4 w-4" aria-hidden />}
          Check jobs
        </button>
      </div>
    </form>
  );
}
