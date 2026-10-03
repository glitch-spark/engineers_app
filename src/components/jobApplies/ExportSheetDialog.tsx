import { useEffect, useId, useState } from 'react';
import toast from 'react-hot-toast';
import { AlertCircle, Copy, ExternalLink, ListChecks, Loader2, Sheet } from 'lucide-react';
import * as api from '../../api/endpoints';
import { ApiError } from '../../api/client';
import Modal from '../Modal';
import { notify } from '../../lib/notify';

const GSHEET_RE = /^https:\/\/docs\.google\.com\/spreadsheets\/(?:u\/\d+\/)?d\/[\w-]{10,}/;

/** What a dry run says the export will write: the run's Checks tab, plus application rows in "apply" mode. */
type Preview = {
  sheetUrl: string;
  sheetTitle: string;
  serviceAccount: string | null;
  checksTab: string;
  checksJobs: number;
  apply?: api.JobApplyExportResult;
};

type Check =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'ok'; result: Preview }
  | { state: 'error'; message: string };

const s = (n: number) => (n === 1 ? '' : 's');

async function preview(mode: 'apply' | 'checks', runId: string, sheetUrl?: string): Promise<Preview> {
  if (mode === 'checks') {
    const r = await api.exportJobApplyChecks(runId, { sheetUrl, dryRun: true });
    return { sheetUrl: r.sheetUrl, sheetTitle: r.sheetTitle, serviceAccount: r.serviceAccount, checksTab: r.tab, checksJobs: r.jobs };
  }
  const r = await api.exportJobApplySheet(runId, { sheetUrl, dryRun: true });
  return {
    sheetUrl: r.sheetUrl,
    sheetTitle: r.sheetTitle,
    serviceAccount: r.serviceAccount,
    checksTab: r.checksTab ?? '',
    checksJobs: r.checksJobs ?? 0,
    apply: r,
  };
}

function exportedToast(message: string, sheetUrl: string) {
  toast(
    (t) => (
      <span className="flex items-center gap-3">
        <span>{message}</span>
        <a
          href={sheetUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-sky-700 underline dark:text-sky-400"
          onClick={() => toast.dismiss(t.id)}
        >
          Open sheet
        </a>
      </span>
    ),
    { duration: 8000, style: { fontSize: '0.875rem' } },
  );
}

/**
 * Export to the shared Google Sheet. "apply" (step ③): one row per job × profile still to apply to, with check
 * columns, to today's tab — and the run's Checks tab is refreshed. "checks" (step ② onward): only the Checks tab,
 * every job with what the checks found, for validating them. The Checks tab is replaced on each export.
 */
export default function ExportSheetDialog({
  open,
  runId,
  onClose,
  onExported,
  mode = 'apply',
}: {
  open: boolean;
  runId: string;
  onClose: () => void;
  onExported: () => void;
  mode?: 'apply' | 'checks';
}) {
  const inputId = useId();
  const [sheetUrl, setSheetUrl] = useState('');
  const [check, setCheck] = useState<Check>({ state: 'idle' });
  const [saving, setSaving] = useState(false);
  // Rows without a resume are exported now; also queue their tailored resumes so the links actually fill in.
  const [tailorMissing, setTailorMissing] = useState(true);

  // On open: dry run with the saved link (if any) to prefill it and show the counts.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setCheck({ state: 'checking' });
    preview(mode, runId)
      .then((result) => {
        if (cancelled) return;
        setSheetUrl(result.sheetUrl);
        setCheck({ state: 'ok', result });
      })
      .catch((err) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Could not check the sheet';
        setCheck(message.startsWith('Paste the Google Sheet link') ? { state: 'idle' } : { state: 'error', message });
      });
    return () => {
      cancelled = true;
    };
  }, [open, runId, mode]);

  // Re-check when the link changes (debounced).
  const trimmed = sheetUrl.trim();
  useEffect(() => {
    if (!open || !trimmed || (check.state === 'ok' && check.result.sheetUrl === trimmed)) return;
    if (!GSHEET_RE.test(trimmed)) {
      setCheck({ state: 'error', message: 'Paste a Google Sheets link (https://docs.google.com/spreadsheets/d/…).' });
      return;
    }
    let cancelled = false;
    setCheck({ state: 'checking' });
    const timer = window.setTimeout(() => {
      preview(mode, runId, trimmed)
        .then((result) => !cancelled && setCheck({ state: 'ok', result }))
        .catch((err) => !cancelled && setCheck({ state: 'error', message: err instanceof Error ? err.message : 'Could not check the sheet' }));
    }, 600);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // check is read only to skip a re-check of the link we just verified
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, trimmed, runId, mode]);

  const exportNow = async () => {
    setSaving(true);
    try {
      if (mode === 'checks') {
        const res = await api.exportJobApplyChecks(runId, { sheetUrl: trimmed });
        exportedToast(`Wrote ${res.jobs} job${s(res.jobs)} to “${res.tab}”`, res.sheetUrl);
      } else {
        const res = await api.exportJobApplySheet(runId, { sheetUrl: trimmed, tailorMissing });
        exportedToast(
          (res.added ? `Added ${res.added} row${s(res.added)} to “${res.tab}”` : 'No new rows') +
            (res.tailorQueued ? ` · tailoring ${res.tailorQueued}` : '') +
            (res.overLimit ? ` · ${res.overLimit} over today's tailoring limit` : '') +
            (res.checksError ? ` · checks tab not updated: ${res.checksError}` : ` · checks tab updated`),
          res.sheetUrl,
        );
      }
      onExported();
      onClose();
    } catch (err) {
      notify.error(err instanceof ApiError ? err.message : err, 'Export failed');
    } finally {
      setSaving(false);
    }
  };

  const ok = check.state === 'ok' ? check.result : null;
  const shareEmail = ok ? ok.serviceAccount : check.state === 'error' ? check.message.match(/[\w.+-]+@[\w-]+\.iam\.gserviceaccount\.com/)?.[0] : null;
  const ready = ok?.apply?.ready ?? 0;
  const sheetLink = ok && (
    <a href={ok.sheetUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-sky-700 hover:underline dark:text-sky-400">
      {ok.sheetTitle || 'your sheet'} <ExternalLink className="inline h-3 w-3" aria-hidden />
    </a>
  );
  const buttonLabel =
    mode === 'checks'
      ? ok
        ? `Write ${ok.checksJobs} job${s(ok.checksJobs)} to the checks tab`
        : 'Write the checks tab'
      : !ok
        ? 'Add rows'
        : ready
          ? `Add ${ready} row${s(ready)}`
          : 'Update checks tab';

  return (
    <Modal open={open} onClose={onClose} title={mode === 'checks' ? 'Export checks to Google Sheet' : 'Export to Google Sheet'}>
      <div className="space-y-4 text-sm">
        <p className="text-zinc-600 dark:text-zinc-400">
          {mode === 'checks' ? (
            <>
              Writes every job in this run to its own tab with what the checks found: result and reason, posted date and where it
              came from, location, market, work mode, clearance and each check. Exporting again replaces that tab.
            </>
          ) : (
            <>
              Adds one row per job and profile still to apply to, with a download link to the resume to send (the tailored one when
              it’s ready, otherwise the matching uploaded one) and the job’s location, work mode, clearance and checks, to today’s
              tab of your shared sheet. It also refreshes this run’s checks tab.
            </>
          )}
        </p>

        <div className="space-y-1.5">
          <label htmlFor={inputId} className="form-label">
            Shared Google Sheet
          </label>
          <input
            id={inputId}
            className="input"
            type="url"
            placeholder="https://docs.google.com/spreadsheets/d/…"
            value={sheetUrl}
            onChange={(e) => setSheetUrl(e.target.value)}
          />
          {shareEmail && (
            <p className="hint flex flex-wrap items-center gap-1">
              Share it with <span className="font-mono text-zinc-700 dark:text-zinc-300">{shareEmail}</span> as Editor.
              <button
                type="button"
                className="btn-icon"
                onClick={() => {
                  void navigator.clipboard?.writeText(shareEmail);
                  notify.success('Email copied');
                }}
                aria-label="Copy the email to share the sheet with"
              >
                <Copy className="h-3.5 w-3.5" aria-hidden />
              </button>
            </p>
          )}
        </div>

        <div role="status" className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-700">
          {check.state === 'checking' && (
            <p className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Checking the sheet…
            </p>
          )}
          {check.state === 'idle' && <p className="hint">Paste the link of the sheet to export to. It’s remembered for next time.</p>}
          {check.state === 'error' && (
            <p className="flex items-start gap-2 text-red-700 dark:text-red-400">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {check.message}
            </p>
          )}
          {ok && (
            <div className="space-y-1">
              {ok.apply && (
                <>
                  <p className="flex items-center gap-2">
                    <Sheet className="h-4 w-4 text-emerald-600" aria-hidden />
                    <span>
                      <span className="font-semibold">{ok.apply.ready}</span> row{s(ok.apply.ready)} to add to tab{' '}
                      <span className="font-medium">“{ok.apply.tab}”</span> in {sheetLink}
                    </span>
                  </p>
                  <ul className="hint list-disc space-y-0.5 pl-9">
                    {(ok.apply.pendingLinks ?? 0) > 0 && (
                      <li>
                        {ok.apply.pendingLinks} without a resume yet: added now as “To tailor” / “Tailoring…”, and the link fills in
                        when the tailored PDF is ready
                      </li>
                    )}
                    {ok.apply.alreadyExported > 0 && <li>{ok.apply.alreadyExported} already exported (skipped)</li>}
                    {ok.apply.noFile > 0 && <li>{ok.apply.noFile} uploaded resumes have no stored PDF to link to</li>}
                  </ul>
                </>
              )}
              <p className="flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-sky-600" aria-hidden />
                <span>
                  <span className="font-semibold">{ok.checksJobs}</span> job{s(ok.checksJobs)} with their checks to tab{' '}
                  <span className="font-medium">“{ok.checksTab}”</span>
                  {mode === 'checks' && <> in {sheetLink}</>} (replaced each export)
                </span>
              </p>
            </div>
          )}
        </div>

        {mode === 'apply' && ok?.apply && ok.apply.needsResume > 0 && (
          <label className="flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input type="checkbox" className="mt-0.5" checked={tailorMissing} onChange={(e) => setTailorMissing(e.target.checked)} />
            <span>
              Tailor the {ok.apply.needsResume} job{s(ok.apply.needsResume)} without a resume now
              <span className="hint block">Their sheet rows get the download link as each tailored PDF is ready.</span>
            </span>
          </label>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" className="btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => void exportNow()}
            disabled={saving || !ok || (mode === 'checks' && ok.checksJobs === 0)}
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {buttonLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
