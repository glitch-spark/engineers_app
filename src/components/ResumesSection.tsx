import { useEffect, useId, useState } from 'react';
import { Eye, FileText, Loader2, Trash2, Upload } from 'lucide-react';
import * as api from '../api/endpoints';
import ConfirmDialog from './ConfirmDialog';
import { notify } from '../lib/notify';
import { MAX_RESUME_BYTES, parseResume } from '../lib/resumeParser';
import { openResumeInNewTab } from '../lib/resumeViewer';

/** Mirrors the backend limits in app/routers/accounts.py. */
const MAX_RESUMES = 20;
const MAX_FILE_BYTES = 10_000_000;
const MIN_WORDS = 50;
const ACCEPT = '.pdf,.txt,.md';

interface StoredResume {
  id: string;
  filename: string;
  markdown: string;
  uploadedAt?: string;
}

function toResumes(raw: unknown): StoredResume[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
    .map((r) => ({
      id: String(r.id ?? ''),
      filename: String(r.filename ?? 'resume'),
      markdown: String(r.markdown ?? ''),
      uploadedAt: typeof r.uploadedAt === 'string' ? r.uploadedAt : undefined,
    }));
}

const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;

function formatUploaded(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso.endsWith('Z') || iso.includes('+') ? iso : `${iso}Z`);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * The profile's resumes (text extracted in the browser from PDF/TXT/MD). These are what Job Applies scores.
 * Saving sends the whole list; resumes that keep their id keep their upload date server-side.
 */
export default function ResumesSection({ accountId }: { accountId: string }) {
  const inputId = useId();
  const [resumes, setResumes] = useState<StoredResume[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [pendingDelete, setPendingDelete] = useState<StoredResume | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getAccount(accountId)
      .then((acc) => !cancelled && setResumes(toResumes(acc.resumes)))
      .catch((err) => {
        if (!cancelled) {
          setResumes([]);
          notify.error(err, 'Could not load resumes');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  async function save(next: StoredResume[]) {
    const saved = await api.updateAccount(accountId, {
      resumes: next.map((r) => ({ ...(r.id ? { id: r.id } : {}), filename: r.filename, markdown: r.markdown })),
    });
    setResumes(toResumes(saved.resumes));
  }

  async function onFiles(files: FileList | null) {
    if (!files?.length || !resumes) return;
    setBusy(true);
    const errors: string[] = [];
    const next = [...resumes];
    let added = 0;
    let replaced = 0;
    for (const file of Array.from(files)) {
      if (file.size > MAX_FILE_BYTES) {
        errors.push(`${file.name}: file is larger than 10 MB.`);
        continue;
      }
      try {
        const parsed = await parseResume(file);
        if (wordCount(parsed.markdown) < MIN_WORDS) {
          errors.push(`${file.name}: almost no text found. It looks scanned or image-only; export a text PDF instead.`);
          continue;
        }
        const existing = next.findIndex((r) => r.filename.toLowerCase() === parsed.filename.toLowerCase());
        if (existing >= 0) {
          next[existing] = { ...next[existing], markdown: parsed.markdown };
          replaced++;
        } else if (next.length >= MAX_RESUMES) {
          errors.push(`${file.name}: a profile can hold at most ${MAX_RESUMES} resumes.`);
        } else {
          next.push({ id: '', filename: parsed.filename, markdown: parsed.markdown });
          added++;
        }
      } catch (err) {
        errors.push(`${file.name}: ${err instanceof Error ? err.message : 'could not read this file'}`);
      }
    }
    if (added || replaced) {
      try {
        await save(next);
        notify.success(
          [added && `${added} resume${added === 1 ? '' : 's'} added`, replaced && `${replaced} replaced`].filter(Boolean).join(', '),
        );
      } catch (err) {
        errors.push(err instanceof Error ? err.message : 'Could not save resumes');
      }
    }
    setProblems(errors);
    setBusy(false);
  }

  async function confirmDelete() {
    if (!pendingDelete || !resumes) return;
    setBusy(true);
    try {
      await save(resumes.filter((r) => r.id !== pendingDelete.id));
      notify.success('Resume deleted');
      setPendingDelete(null);
    } catch (err) {
      notify.error(err, 'Could not delete the resume');
    } finally {
      setBusy(false);
    }
  }

  if (resumes === null) {
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-muted">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading resumes…
      </p>
    );
  }

  const full = resumes.length >= MAX_RESUMES;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <label
          htmlFor={inputId}
          className={`btn btn-sm ${busy || full ? 'pointer-events-none opacity-60' : 'cursor-pointer'}`}
          aria-disabled={busy || full}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Upload className="h-4 w-4" aria-hidden />}
          Upload resumes
        </label>
        <input
          id={inputId}
          type="file"
          accept={ACCEPT}
          multiple
          disabled={busy || full}
          className="sr-only"
          onChange={(e) => {
            void onFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <p className="hint">
          PDF (text, not scanned), TXT or MD · up to {MAX_RESUMES} per profile, {Math.round(MAX_RESUME_BYTES / 1000)} KB of text each.
          Uploading a file with an existing name replaces it.
        </p>
      </div>

      {problems.length > 0 && (
        <ul role="alert" className="space-y-1 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}

      {resumes.length === 0 ? (
        <p className="hint">No resumes yet. Upload one or more PDFs; Job Applies scores each job against them.</p>
      ) : (
        <ul className="row-divider rounded-xl border border-zinc-200/80 dark:border-zinc-700/30">
          {resumes.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
              <FileText className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-800 dark:text-zinc-100">{r.filename}</span>
              <span className="hint tabular-nums">{wordCount(r.markdown).toLocaleString()} words</span>
              {r.uploadedAt && <span className="hint">{formatUploaded(r.uploadedAt)}</span>}
              <button
                type="button"
                className="btn-icon"
                onClick={() => openResumeInNewTab(r.filename, r.markdown)}
                aria-label={`View text of ${r.filename}`}
                title="View extracted text"
              >
                <Eye className="h-4 w-4" aria-hidden />
              </button>
              <button
                type="button"
                className="btn-icon"
                onClick={() => setPendingDelete(r)}
                disabled={busy}
                aria-label={`Delete ${r.filename}`}
                title="Delete resume"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete resume?"
        body={<p>"{pendingDelete?.filename}" will be removed from this profile. Past Job Applies runs keep their scores.</p>}
        confirmLabel="Delete"
        tone="danger"
        busy={busy}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
