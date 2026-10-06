import { Check, Download, ExternalLink, Loader2, MessageSquareText, RotateCcw, Sparkles } from 'lucide-react';
import type { JobApplyRow, JobApplySuggestion, JobApplyTailored } from '../../api/endpoints';
import { bandClass, formatDate } from './format';

/** The file applied with: an uploaded resume or one of the job's tailored resumes. */
export type AppliedFile = { accountId: string; resumeId?: string; tailoredJobId?: string };

/** Profiles this job is open to, in display order: by uploaded-resume score, then tailor-only, then the rest. */
export function orderedProfiles(row: JobApplyRow): string[] {
  const score = new Map(row.suggestions.map((s) => [s.accountId, s.total]));
  const rank = (acc: string) => score.get(acc) ?? (row.tailorOnly.includes(acc) ? -1 : -2);
  return [...row.openProfiles].sort((a, b) => rank(b) - rank(a));
}

/** The first tailored resume that's ready, in profile order (used by `d` / `a`). */
export function firstReadyTailored(row: JobApplyRow): JobApplyTailored | undefined {
  const order = orderedProfiles(row);
  return row.tailored
    .filter((t) => t.status === 'completed')
    .sort((a, b) => order.indexOf(a.accountId) - order.indexOf(b.accountId))[0];
}

function AppliedToggle({
  checked,
  onChange,
  label,
  children,
}: {
  checked: boolean;
  onChange: (on: boolean) => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label
      className={`flex min-w-0 cursor-pointer items-center gap-1.5 rounded-lg px-1 py-0.5 ${
        checked ? 'bg-emerald-50 dark:bg-emerald-950/40' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'
      }`}
    >
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
      {children}
      {checked && <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-label="Applied" />}
    </label>
  );
}

/** A finished tailored resume's match score with this job, and how far it moved from the uploaded resume's. */
function TailoredScore({ t }: { t: JobApplyTailored }) {
  const m = t.match;
  if (!m) return null;
  const delta = t.uploadedScore != null ? m.total - t.uploadedScore : null;
  const title = [
    `Tailored resume vs this job: ${m.total} (${m.band})`,
    t.uploadedScore != null ? `Best uploaded resume: ${t.uploadedScore}` : 'No uploaded resume scored on this job',
    m.missing.length ? `Not in the resume: ${m.missing.join(', ')}` : 'Every job term is in the resume',
    ...m.knockouts,
  ].join('\n');
  return (
    <span className="inline-flex items-center gap-1" title={title}>
      <span className={bandClass(m.band)} aria-label={`Match score ${m.total}`}>
        {m.total}
      </span>
      {delta != null && delta !== 0 && (
        <span
          className={`text-xs font-medium tabular-nums ${delta > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-zinc-500 dark:text-zinc-400'}`}
          aria-label={`${delta > 0 ? 'up' : 'down'} ${Math.abs(delta)} from the uploaded resume`}
        >
          {delta > 0 ? '+' : '−'}
          {Math.abs(delta)}
        </span>
      )}
    </span>
  );
}

/**
 * "Apply with" for one job: one line per profile the job is open to. Each line has that profile's best uploaded
 * resume (when it scores at or above the threshold) and its own tailored resume (Tailor → Generating → Tailored).
 */
export default function Suggestions({
  row,
  threshold,
  profileNames,
  hasFile,
  tailorModel,
  onToggle,
  onDownload,
  onTailor,
  onTailorAll,
  onDownloadTailored,
}: {
  row: JobApplyRow;
  threshold: number;
  profileNames: Record<string, string>;
  hasFile: (resumeId: string) => boolean;
  /** Name of the model the Tailor buttons use, shown on hover. */
  tailorModel?: string;
  onToggle: (file: AppliedFile, applied: boolean, label: string) => void;
  onDownload: (s: JobApplySuggestion) => void;
  onTailor: (accountId: string) => void;
  onTailorAll: () => void;
  onDownloadTailored: (t: JobApplyTailored) => void;
}) {
  const marked = (f: AppliedFile) =>
    row.appliedResumes.some((m) => (f.tailoredJobId ? m.tailoredJobId === f.tailoredJobId : m.resumeId === f.resumeId));
  const withModel = tailorModel ? `Tailor with ${tailorModel}` : undefined;
  const profiles = orderedProfiles(row);
  const untailored = profiles.filter((acc) => {
    const t = row.tailored.find((x) => x.accountId === acc);
    return !t || t.status === 'failed';
  });
  const previous = row.previouslyApplied[0];
  const appliedCount = row.applications.filter((a) => a.state === 'applied').length;

  if (profiles.length === 0) {
    return <p className="hint">No profile can take this job (see Flags).</p>;
  }

  return (
    <div className="min-w-[20rem] space-y-1">
      {row.url && (
        <a
          href={row.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium text-sky-700 hover:underline dark:text-sky-400"
        >
          <ExternalLink className="h-3 w-3" aria-hidden /> Open posting
        </a>
      )}
      {previous && (
        <p
          className="badge-info"
          title={row.previouslyApplied.map((p) => `${formatDate(p.appliedAt)} · ${p.profileName} · ${p.filename}`).join('\n')}
        >
          Already applied {formatDate(previous.appliedAt)} · {previous.profileName}
          {row.previouslyApplied.length > 1 ? ` +${row.previouslyApplied.length - 1}` : ''}
        </p>
      )}

      {row.applications.length > 1 && appliedCount > 0 && (
        <p className={appliedCount === row.applications.length ? 'text-xs font-medium text-emerald-700 dark:text-emerald-400' : 'text-xs text-zinc-500'}>
          {appliedCount} of {row.applications.length} profiles applied
        </p>
      )}

      <ul className="divide-y divide-dashed divide-zinc-200 dark:divide-zinc-700">
        {profiles.map((acc) => {
          const name = profileNames[acc] ?? 'Profile';
          const s = row.suggestions.find((x) => x.accountId === acc);
          const n = s ? row.suggestions.indexOf(s) + 1 : 0;
          const t = row.tailored.find((x) => x.accountId === acc);
          return (
            <li key={acc} className="grid grid-cols-[7rem_1fr_auto] items-center gap-x-2 py-1">
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-100" title={name}>
                  {name}
                </span>
                {row.exportedProfiles.includes(acc) && (
                  <span className="text-[10px] font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-400" title="In the exported Google Sheet">
                    Exported
                  </span>
                )}
              </span>

              {/* Uploaded resume: a resume line keeps room for its checkbox, score and download; a note can wrap */}
              <div className={`flex items-center gap-1 ${s ? 'min-w-[7.5rem]' : ''}`}>
                {s ? (
                  <>
                    <AppliedToggle
                      checked={marked({ accountId: acc, resumeId: s.resumeId })}
                      onChange={(on) => onToggle({ accountId: acc, resumeId: s.resumeId }, on, `${name} · ${s.filename}`)}
                      label={`Applied with ${name} · ${s.filename}`}
                    >
                      {n > 0 && n <= 9 && (
                        <kbd className="hidden w-3 text-center text-[10px] text-zinc-400 sm:inline" aria-hidden>
                          {n}
                        </kbd>
                      )}
                      <span className={bandClass(s.band)} title={s.knockouts.join('\n') || undefined}>
                        {s.total}
                      </span>
                      <span className="truncate text-sm text-zinc-600 dark:text-zinc-400">{s.filename}</span>
                    </AppliedToggle>
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
                  </>
                ) : (
                  <span className="text-xs text-zinc-400">
                    {row.tailorOnly.includes(acc) ? 'No uploaded resume' : `No resume ≥ ${threshold}`}
                  </span>
                )}
              </div>

              {/* Tailored resume for this profile; once done, its actions get their own line under the uploaded one */}
              <div
                className={`flex items-center gap-1 ${t?.status === 'completed' ? 'col-span-2 col-start-2 justify-start' : 'justify-end'}`}
              >
                {!t ? (
                  <button type="button" className="btn-outline btn-sm whitespace-nowrap py-0.5" onClick={() => onTailor(acc)} title={withModel}>
                    <Sparkles className="h-3.5 w-3.5" aria-hidden />
                    Tailor
                  </button>
                ) : t.status === 'queued' || t.status === 'in_progress' ? (
                  <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-zinc-600 dark:text-zinc-400">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    {t.status === 'queued' ? 'Queued' : 'Generating…'}
                  </span>
                ) : t.status === 'completed' ? (
                  <>
                    <AppliedToggle
                      checked={marked({ accountId: acc, tailoredJobId: t.jobId })}
                      onChange={(on) => onToggle({ accountId: acc, tailoredJobId: t.jobId }, on, `Tailored · ${name}`)}
                      label={`Applied with the tailored resume (${name})`}
                    >
                      <Sparkles className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" aria-hidden />
                      <span className="text-sm font-medium">Tailored</span>
                      <TailoredScore t={t} />
                    </AppliedToggle>
                    <button type="button" className="btn-icon" onClick={() => onDownloadTailored(t)} title="Download tailored PDF" aria-label={`Download tailored PDF (${name})`}>
                      <Download className="h-3.5 w-3.5" aria-hidden />
                    </button>
                    <a
                      href={`/resume/generated?job=${t.jobId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-icon"
                      title="Screening Q&A, job description and cover letter (Generated Resumes)"
                      aria-label={`Screening Q&A for ${name}'s tailored resume (opens in a new tab)`}
                    >
                      <MessageSquareText className="h-3.5 w-3.5" aria-hidden />
                    </a>
                    {!marked({ accountId: acc, tailoredJobId: t.jobId }) && (
                      <button type="button" className="btn-icon" onClick={() => onTailor(acc)} title={tailorModel ? `Generate again with ${tailorModel}` : 'Generate again'} aria-label={`Re-tailor for ${name}`}>
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    )}
                  </>
                ) : (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-red-700 hover:underline dark:text-red-400"
                    onClick={() => onTailor(acc)}
                    title={t.error ?? 'Generation failed'}
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                    Failed · Retry
                  </button>
                )}
              </div>
              {t?.status === 'failed' && (
                <p className="col-span-3 line-clamp-3 break-words pb-1 text-xs text-red-700 dark:text-red-400" title={t.error ?? undefined}>
                  {t.error || 'Generation failed (no details recorded).'}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {untailored.length > 1 && (
        <button type="button" className="text-xs font-medium text-violet-700 hover:underline dark:text-violet-300" onClick={onTailorAll} title={withModel}>
          <Sparkles className="mr-1 inline h-3 w-3" aria-hidden />
          Tailor all {untailored.length} profiles
        </button>
      )}
    </div>
  );
}
