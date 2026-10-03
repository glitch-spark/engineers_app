import { useEffect, useId, useState } from 'react';
import toast from 'react-hot-toast';
import { AlertCircle, Copy, ExternalLink, Loader2, Sheet } from 'lucide-react';
import * as api from '../../api/endpoints';
import { ApiError } from '../../api/client';
import Modal from '../Modal';
import { notify } from '../../lib/notify';

const GSHEET_RE = /^https:\/\/docs\.google\.com\/spreadsheets\/(?:u\/\d+\/)?d\/[\w-]{10,}/;

type Check =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'ok'; result: api.JobApplyExportResult }
  | { state: 'error'; message: string };

/** "Export to Google Sheet": pick/confirm the shared sheet, see what will be added, then append it. */
export default function ExportSheetDialog({
  open,
  runId,
  onClose,
  onExported,
}: {
  open: boolean;
  runId: string;
  onClose: () => void;
  onExported: () => void;
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
    api
      .exportJobApplySheet(runId, { dryRun: true })
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
  }, [open, runId]);

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
      api
        .exportJobApplySheet(runId, { sheetUrl: trimmed, dryRun: true })
        .then((result) => !cancelled && setCheck({ state: 'ok', result }))
        .catch((err) => !cancelled && setCheck({ state: 'error', message: err instanceof Error ? err.message : 'Could not check the sheet' }));
    }, 600);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // check is read only to skip a re-check of the link we just verified
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, trimmed, runId]);

  const exportNow = async () => {
    setSaving(true);
    try {
      const res = await api.exportJobApplySheet(runId, { sheetUrl: trimmed, tailorMissing });
      onExported();
      onClose();
      toast(
        (t) => (
          <span className="flex items-center gap-3">
            <span>
              Added {res.added} row{res.added === 1 ? '' : 's'} to “{res.tab}”
              {res.tailorQueued ? ` · tailoring ${res.tailorQueued}` : ''}
              {res.overLimit ? ` · ${res.overLimit} over today's tailoring limit` : ''}
            </span>
            <a
              href={res.sheetUrl}
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
    } catch (err) {
      notify.error(err instanceof ApiError ? err.message : err, 'Export failed');
    } finally {
      setSaving(false);
    }
  };

  const shareEmail =
    check.state === 'ok' ? check.result.serviceAccount : check.state === 'error' ? check.message.match(/[\w.+-]+@[\w-]+\.iam\.gserviceaccount\.com/)?.[0] : null;
  const ready = check.state === 'ok' ? check.result.ready : 0;

  return (
    <Modal open={open} onClose={onClose} title="Export to Google Sheet">
      <div className="space-y-4 text-sm">
        <p className="text-zinc-600 dark:text-zinc-400">
          Adds one row per job and profile still to apply to, with a download link to the resume to send (the tailored one when
          it’s ready, otherwise the matching uploaded one), to today’s tab of your shared sheet.
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
          {check.state === 'ok' && (
            <div className="space-y-1">
              <p className="flex items-center gap-2">
                <Sheet className="h-4 w-4 text-emerald-600" aria-hidden />
                <span>
                  <span className="font-semibold">{check.result.ready}</span> row{check.result.ready === 1 ? '' : 's'} to add to tab{' '}
                  <span className="font-medium">“{check.result.tab}”</span> in{' '}
                  <a href={check.result.sheetUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-sky-700 hover:underline dark:text-sky-400">
                    {check.result.sheetTitle || 'your sheet'} <ExternalLink className="inline h-3 w-3" aria-hidden />
                  </a>
                </span>
              </p>
              <ul className="hint list-disc space-y-0.5 pl-9">
                {(check.result.pendingLinks ?? 0) > 0 && (
                  <li>
                    {check.result.pendingLinks} without a resume yet: added now as “To tailor” / “Tailoring…”, and the link
                    fills in when the tailored PDF is ready
                  </li>
                )}
                {check.result.alreadyExported > 0 && <li>{check.result.alreadyExported} already exported (skipped)</li>}
                {check.result.noFile > 0 && <li>{check.result.noFile} uploaded resumes have no stored PDF to link to</li>}
              </ul>
            </div>
          )}
        </div>

        {check.state === 'ok' && check.result.needsResume > 0 && (
          <label className="flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input type="checkbox" className="mt-0.5" checked={tailorMissing} onChange={(e) => setTailorMissing(e.target.checked)} />
            <span>
              Tailor the {check.result.needsResume} job{check.result.needsResume === 1 ? '' : 's'} without a resume now
              <span className="hint block">Their sheet rows get the download link as each tailored PDF is ready.</span>
            </span>
          </label>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" className="btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn" onClick={() => void exportNow()} disabled={saving || check.state !== 'ok' || ready === 0}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {ready ? `Add ${ready} row${ready === 1 ? '' : 's'}` : 'Nothing to add'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
