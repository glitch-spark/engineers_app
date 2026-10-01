import { Check, Download, Loader2, RotateCcw, Sparkles } from 'lucide-react';
import type { JobApplyOtherResume, JobApplyRow, JobApplySuggestion } from '../../api/endpoints';
import { bandClass, formatDate } from './format';

/** The file applied with: an uploaded resume or the job's tailored resume. */
export type AppliedFile = { accountId: string; resumeId?: string; tailoredJobId?: string };

export interface ProfileChoice {
  accountId: string;
  name: string;
  /** Best score of this profile's resumes on this job (null when none was scored). */
  best: number | null;
}

/**
 * Everything you can apply to one job with: suggested uploaded resumes (numbered 1–9 for the shortcuts), the
 * job's tailored resume (generated from a profile's HTML template + this job description), and any other
 * scored resume. Each file has its own "applied" toggle.
 */
export default function Suggestions({
  row,
  threshold,
  profileNames,
  profiles,
  hasFile,
  onToggle,
  onDownload,
  onTailor,
  onDownloadTailored,
}: {
  row: JobApplyRow;
  threshold: number;
  profileNames: Record<string, string>;
  /** Run profiles, best-scoring for this job first; the first is the default for Tailor. */
  profiles: ProfileChoice[];
  hasFile: (resumeId: string) => boolean;
  onToggle: (file: AppliedFile, applied: boolean, label: string) => void;
  onDownload: (s: JobApplySuggestion | JobApplyOtherResume) => void;
  onTailor: (accountId?: string) => void;
  onDownloadTailored: () => void;
}) {
  const appliedResumes = new Set(row.appliedResumes.map((m) => m.resumeId).filter(Boolean));
  const t = row.tailored;
  const tailoredApplied = !!t && row.appliedResumes.some((m) => m.tailoredJobId === t.jobId);
  const previous = row.previouslyApplied[0];
  const tailorProfileName = t ? profileNames[t.accountId] ?? 'Profile' : '';
  const others = row.otherResumes.filter((o) => !appliedResumes.has(o.resumeId));
  const appliedOthers = row.otherResumes.filter((o) => appliedResumes.has(o.resumeId));

  const profileSelect = (label: string) =>
    profiles.length > 1 && (
      <select
        className="rounded-md border border-zinc-200 bg-white py-0.5 pl-1 pr-5 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
        value=""
        onChange={(e) => e.target.value && onTailor(e.target.value)}
        aria-label={label}
      >
        <option value="">▾</option>
        {profiles.map((p) => (
          <option key={p.accountId} value={p.accountId}>
            {p.name}
            {p.best !== null ? ` (${p.best})` : ''}
          </option>
        ))}
      </select>
    );

  return (
    <div className="min-w-[16rem] space-y-1">
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
        <p className="hint">
          {row.status === 'scored' && row.topScore !== null ? `No resume above ${threshold} (best ${row.topScore})` : 'No matching resume'}
        </p>
      ) : (
        <ol className="flex flex-col gap-1">
          {row.suggestions.map((s, i) => {
            const isApplied = appliedResumes.has(s.resumeId);
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
                    onChange={(e) => onToggle({ accountId: s.accountId, resumeId: s.resumeId }, e.target.checked, `${name} · ${s.filename}`)}
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

      {appliedOthers.map((o) => (
        <label key={o.resumeId} className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-emerald-50 px-1 py-0.5 dark:bg-emerald-950/40">
          <input
            type="checkbox"
            checked
            onChange={() => onToggle({ accountId: o.accountId, resumeId: o.resumeId }, false, o.filename)}
            aria-label={`Applied with ${profileNames[o.accountId] ?? 'Profile'} · ${o.filename}`}
          />
          <span className="badge-neutral">{o.total}</span>
          <span className="truncate">
            <span className="font-medium">{profileNames[o.accountId] ?? 'Profile'}</span>
            <span className="text-zinc-500"> · {o.filename}</span>
          </span>
          <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-label="Applied" />
        </label>
      ))}

      {/* Tailored resume: one per job, from one profile's template. */}
      <div className="flex flex-wrap items-center gap-1.5 border-t border-dashed border-zinc-200 pt-1 dark:border-zinc-700">
        {!t ? (
          <>
            <button type="button" className="btn-outline btn-sm py-0.5" onClick={() => onTailor()} title="Generate a resume tailored to this job (t)">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              Tailor{profiles[0] ? ` · ${profiles[0].name}` : ''}
            </button>
            {profileSelect('Tailor with another profile')}
          </>
        ) : t.status === 'queued' || t.status === 'in_progress' ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            {t.status === 'queued' ? 'Queued' : 'Tailoring'} · {tailorProfileName}
          </span>
        ) : t.status === 'completed' ? (
          <>
            <label
              className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-1 py-0.5 ${
                tailoredApplied ? 'bg-emerald-50 dark:bg-emerald-950/40' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'
              }`}
            >
              <input
                type="checkbox"
                checked={tailoredApplied}
                onChange={(e) =>
                  onToggle({ accountId: t.accountId, tailoredJobId: t.jobId }, e.target.checked, `Tailored · ${tailorProfileName}`)
                }
                aria-label={`Applied with the tailored resume (${tailorProfileName})`}
              />
              <Sparkles className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" aria-hidden />
              <span className="font-medium">Tailored</span>
              <span className="text-zinc-500">· {tailorProfileName}</span>
              {tailoredApplied && <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-label="Applied" />}
            </label>
            <button type="button" className="btn-icon" onClick={onDownloadTailored} title="Download tailored PDF" aria-label="Download tailored PDF">
              <Download className="h-3.5 w-3.5" aria-hidden />
            </button>
            {!tailoredApplied && profileSelect('Re-tailor with a profile')}
          </>
        ) : (
          <>
            <span className="text-xs text-red-700 dark:text-red-400" title={t.error ?? undefined}>
              Tailoring failed
            </span>
            <button type="button" className="btn-outline btn-sm py-0.5" onClick={() => onTailor(t.accountId)}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              Retry
            </button>
            {profileSelect('Tailor with another profile')}
          </>
        )}

        {others.length > 0 && (
          <select
            className="ml-auto rounded-md border border-zinc-200 bg-white py-0.5 pl-1.5 pr-5 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
            value=""
            onChange={(e) => {
              const o = others.find((x) => x.resumeId === e.target.value);
              if (o) onToggle({ accountId: o.accountId, resumeId: o.resumeId }, true, `${profileNames[o.accountId] ?? 'Profile'} · ${o.filename}`);
            }}
            aria-label="Mark applied with another resume"
          >
            <option value="">Other resume…</option>
            {others.map((o) => (
              <option key={o.resumeId} value={o.resumeId}>
                {profileNames[o.accountId] ?? 'Profile'} · {o.filename} ({o.total})
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}
