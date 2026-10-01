import { Check, Download } from 'lucide-react';
import type { JobApplyRow, JobApplySuggestion } from '../../api/endpoints';
import { bandClass, formatDate } from './format';

/**
 * Suggested resumes for one job, numbered 1–9 for the keyboard shortcuts. Each has its own "applied" toggle
 * and, when the original file is stored, a download button for attaching it to the application.
 */
export default function Suggestions({
  row,
  threshold,
  profileNames,
  hasFile,
  onToggle,
  onDownload,
}: {
  row: JobApplyRow;
  threshold: number;
  profileNames: Record<string, string>;
  hasFile: (resumeId: string) => boolean;
  onToggle: (s: JobApplySuggestion, applied: boolean) => void;
  onDownload: (s: JobApplySuggestion) => void;
}) {
  const applied = new Set(row.appliedResumes.map((m) => m.resumeId));
  const previous = row.previouslyApplied[0];

  return (
    <div className="space-y-1">
      {previous && (
        <p
          className="badge-info"
          title={row.previouslyApplied.map((p) => `${formatDate(p.appliedAt)} · ${p.profileName} · ${p.filename}`).join('\n')}
        >
          Already applied {formatDate(previous.appliedAt)} · {previous.profileName}
          {row.previouslyApplied.length > 1 ? ` +${row.previouslyApplied.length - 1}` : ''}
        </p>
      )}
      {row.suggestions.length === 0 ? (
        <span className="hint">
          {row.status === 'scored' && row.topScore !== null ? `Best ${row.topScore} (below ${threshold})` : '—'}
        </span>
      ) : (
        <ol className="flex flex-col gap-1">
          {row.suggestions.map((s, i) => {
            const isApplied = applied.has(s.resumeId);
            const name = profileNames[s.accountId] ?? 'Profile';
            return (
              <li key={s.resumeId} className="flex items-center gap-1.5">
                <label
                  className={`flex min-w-0 cursor-pointer items-center gap-1.5 rounded-lg px-1 py-0.5 ${
                    isApplied ? 'bg-emerald-50 dark:bg-emerald-950/40' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  }`}
                  title={s.knockouts.join('\n') || undefined}
                >
                  <input
                    type="checkbox"
                    checked={isApplied}
                    onChange={(e) => onToggle(s, e.target.checked)}
                    aria-label={`Applied with ${name} · ${s.filename}`}
                  />
                  {i < 9 && (
                    <kbd className="hidden w-4 text-center text-[10px] text-zinc-400 sm:inline" aria-hidden>
                      {i + 1}
                    </kbd>
                  )}
                  <span className={bandClass(s.band)}>{s.total}</span>
                  <span className="truncate">
                    <span className="font-medium">{name}</span>
                    <span className="text-zinc-500"> · {s.filename}</span>
                  </span>
                  {isApplied && <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-label="Applied" />}
                  {s.knockouts.length > 0 && (
                    <span className="text-amber-700 dark:text-amber-400" aria-label="Has knockout risks">
                      !
                    </span>
                  )}
                </label>
                <button
                  type="button"
                  className="btn-icon"
                  onClick={() => onDownload(s)}
                  disabled={!hasFile(s.resumeId)}
                  title={hasFile(s.resumeId) ? 'Download resume PDF' : 'Original file not stored'}
                  aria-label={`Download ${s.filename}`}
                >
                  <Download className="h-3.5 w-3.5" aria-hidden />
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
