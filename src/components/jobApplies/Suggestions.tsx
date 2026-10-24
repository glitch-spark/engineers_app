import { Download, FileCheck2, Loader2, MessageSquareText, RotateCcw, Sparkles } from 'lucide-react';
import type { JobApplyProfile, JobApplyRow, JobApplyTailored, JobApplyTailoredMatch } from '../../api/endpoints';
import { bandClass } from './format';
import { PromptCell, effectiveUnitId } from './PromptCell';

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

/** A profile's best sample resume is below the minimum score (or it has none): it needs a tailored resume. */
export function needsTailoring(row: JobApplyRow, acc: string, threshold: number): boolean {
  const best = row.suggestions.find((s) => s.accountId === acc);
  return !best || best.total < threshold;
}

/** Profiles that need tailoring and have no tailored resume yet (or a failed one): what "Tailor all" tailors. */
export function profilesToTailor(row: JobApplyRow, threshold: number): string[] {
  return orderedProfiles(row).filter((acc) => {
    const t = row.tailored.find((x) => x.accountId === acc);
    return (!t || t.status === 'failed') && needsTailoring(row, acc, threshold);
  });
}

/** A finished tailored resume. With `onPick`, clicking it selects it for the bulk download (highlighted). */
function TailoredChip({
  picked,
  onPick,
  label,
  children,
}: {
  picked: boolean;
  onPick?: (on: boolean) => void;
  label: string;
  children: React.ReactNode;
}) {
  if (!onPick) return <span className="flex min-w-0 items-center gap-1.5 px-1 py-0.5">{children}</span>;
  return (
    <button
      type="button"
      aria-pressed={picked}
      onClick={() => onPick(!picked)}
      title={picked ? 'Selected for download · click to unselect' : 'Click to select for download'}
      aria-label={`${picked ? 'Unselect' : 'Select'} ${label} for download`}
      className={`flex min-w-0 items-center gap-1.5 rounded-lg px-1.5 py-0.5 ring-1 transition-colors focus-ring ${
        picked
          ? 'bg-sky-50 ring-sky-400 dark:bg-sky-950/40 dark:ring-sky-600'
          : 'ring-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800'
      }`}
    >
      {children}
    </button>
  );
}

/**
 * A finished tailored resume's match score with this job, and how far it moved from the uploaded resume's. Also on
 * the Resume page, which leaves out `uploadedScore` (no comparison).
 */
export function TailoredScore({ m, uploadedScore }: { m: JobApplyTailoredMatch; uploadedScore?: number | null }) {
  const delta = uploadedScore != null ? m.total - uploadedScore : null;
  const title = [
    `Tailored resume vs this job: ${m.total} (${m.band})`,
    uploadedScore !== undefined &&
      (uploadedScore != null ? `Best uploaded resume: ${uploadedScore}` : 'No uploaded resume scored on this job'),
    m.missing.length ? `Not in the resume: ${m.missing.join(', ')}` : 'Every job term is in the resume',
    ...m.knockouts,
  ]
    .filter(Boolean)
    .join('\n');
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

const CELL = 'px-3 py-2 align-middle';

/**
 * One profile's cells on a job's row: Profile, Sample resumes (.pdf), HTML template, Prompt and Tailored. A job open
 * to several profiles has one table row per profile; the job's own cells span them.
 */
export function ProfileCells({
  row,
  acc,
  threshold,
  profile,
  profileName,
  hasFile,
  tailorModel,
  onDownload,
  onTailor,
  onDownloadTailored,
  isPicked,
  onPick,
  onPromptChange,
}: {
  row: JobApplyRow;
  acc: string;
  threshold: number;
  /** The run's profile: its HTML template (unknown until the run loads). */
  profile?: JobApplyProfile;
  profileName: string;
  hasFile: (resumeId: string) => boolean;
  /** Name of the model the Tailor buttons use, shown on hover. */
  tailorModel?: string;
  onDownload: (s: { accountId: string; resumeId: string }) => void;
  onTailor: (accountId: string) => void;
  onDownloadTailored: (t: JobApplyTailored) => void;
  /** Download selection by tailored job id: clicking a finished tailored resume picks it. */
  isPicked?: (tailoredJobId: string) => boolean;
  onPick?: (tailoredJobId: string, on: boolean) => void;
  /** Save the prompt this profile tailors the job with. */
  onPromptChange: (promptId: string) => Promise<void>;
}) {
  const withModel = tailorModel ? `Tailor with ${tailorModel}` : undefined;
  const best = row.suggestions.find((x) => x.accountId === acc);
  const n = best ? row.suggestions.indexOf(best) + 1 : 0;
  const t = row.tailored.find((x) => x.accountId === acc);
  // Every sample resume of this profile, best first (a profile can have several).
  const own = row.resumeScores?.filter((r) => r.accountId === acc) ?? [];
  const resumes = own.length ? own : best ? [best] : [];
  // The selected resume unit decides whether this profile can be tailored for the job (its template is shown in the
  // Prompt cell).
  const units = profile?.prompts ?? [];
  const promptState = row.prompt?.[acc];
  const unit = units.find(
    (u) => u.id === effectiveUnitId(units, profile?.defaultPromptId, promptState?.suggestedId, promptState?.chosenId),
  );
  const unitHasTemplate = unit?.hasTemplate ?? profile?.hasTemplate;
  const noTemplate = unitHasTemplate === false;
  const toTailor = needsTailoring(row, acc, threshold) && (!t || t.status === 'failed');

  return (
    <>
      <td className={CELL}>
        <span className="block max-w-[10rem] truncate font-medium text-zinc-800 dark:text-zinc-100" title={profileName}>
          {profileName}
        </span>
        {toTailor && (
          <span className="block text-[11px] text-violet-700 dark:text-violet-300">
            {best ? `below ${threshold} · tailor` : 'tailor'}
          </span>
        )}
        {row.exportedProfiles.includes(acc) && (
          <span className="block text-[10px] font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-400" title="In the exported Google Sheet">
            Exported
          </span>
        )}
      </td>

      <td className={CELL}>
        {resumes.length ? (
          <ul className="space-y-0.5">
            {resumes.map((r) => {
              const below = r.total < threshold;
              const isBest = r.resumeId === best?.resumeId;
              const knockouts = isBest ? best?.knockouts ?? [] : [];
              return (
                <li key={r.resumeId} className="flex items-center gap-1.5">
                  <kbd className="hidden w-3 text-center text-[10px] text-zinc-400 sm:inline" aria-hidden>
                    {isBest && n > 0 && n <= 9 ? n : ''}
                  </kbd>
                  <span
                    className={`inline-flex w-9 justify-center ${below ? 'badge-neutral tabular-nums opacity-70' : bandClass(r.band)}`}
                    title={
                      [below ? `Below the minimum score (${threshold}): tailor a resume` : '', ...knockouts].filter(Boolean).join('\n') ||
                      undefined
                    }
                  >
                    {r.total}
                  </span>
                  <span
                    className={`min-w-0 max-w-[14rem] flex-1 truncate ${below ? 'text-zinc-400 dark:text-zinc-500' : 'text-zinc-700 dark:text-zinc-300'}`}
                    title={r.filename}
                  >
                    {r.filename}
                  </span>
                  <button
                    type="button"
                    className="btn-icon"
                    onClick={() => onDownload(r)}
                    disabled={!hasFile(r.resumeId)}
                    title={hasFile(r.resumeId) ? 'Download resume PDF' : 'Original file not stored'}
                    aria-label={`Download ${r.filename}`}
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <span className="text-xs text-zinc-400">{row.tailorOnly.includes(acc) ? 'No sample resumes' : 'Not scored for this job'}</span>
        )}
      </td>

      <td className={CELL}>
        <PromptCell
          options={profile?.prompts ?? []}
          defaultId={profile?.defaultPromptId}
          suggestedId={row.prompt?.[acc]?.suggestedId ?? null}
          chosenId={row.prompt?.[acc]?.chosenId ?? null}
          onChange={onPromptChange}
        />
      </td>

      <td className={CELL}>
        <div className="flex items-center gap-1">
          {!t ? (
            <button
              type="button"
              className="btn-outline btn-sm whitespace-nowrap py-0.5 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => onTailor(acc)}
              disabled={noTemplate}
              title={noTemplate ? 'This resume unit has no HTML template: add one on the profile page' : withModel}
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              Tailor
            </button>
          ) : t.status === 'queued' || t.status === 'in_progress' ? (
            <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-zinc-600 dark:text-zinc-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              {t.status === 'queued' ? 'Queued' : 'Generating…'}
            </span>
          ) : t.status === 'completed' ? (
            <div className="flex flex-col items-start gap-0.5">
              <TailoredChip
                picked={isPicked?.(t.jobId) ?? false}
                onPick={onPick ? (on) => onPick(t.jobId, on) : undefined}
                label={`${profileName}'s ${t.fixedFrom ? 'fixed' : 'tailored'} resume`}
              >
                {t.fixedFrom ? (
                  <FileCheck2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden />
                ) : (
                  <Sparkles className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" aria-hidden />
                )}
                <span
                  className="text-sm font-medium"
                  title={t.fixedFrom
                    ? 'The best uploaded resume, at or above the minimum score, copied for this job'
                    : t.promptName ? `Tailored with ${t.promptName}` : undefined}
                >
                  {t.fixedFrom ? 'Fixed' : 'Tailored'}
                </span>
                {t.match && <TailoredScore m={t.match} uploadedScore={t.uploadedScore ?? null} />}
              </TailoredChip>
              {/* The tailored resume's actions, under it */}
              <div className="flex items-center gap-0.5 pl-1">
              <button
                type="button"
                className="btn-icon"
                onClick={() => onDownloadTailored(t)}
                title={`Download ${t.fixedFrom ? 'fixed' : 'tailored'} PDF`}
                aria-label={`Download ${t.fixedFrom ? 'fixed' : 'tailored'} PDF (${profileName})`}
              >
                <Download className="h-3.5 w-3.5" aria-hidden />
              </button>
              <a
                href={`/resume/generated?job=${t.jobId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-icon"
                title="Screening Q&A, job description and cover letter (Generated Resumes)"
                aria-label={`Screening Q&A for ${profileName}'s tailored resume (opens in a new tab)`}
              >
                <MessageSquareText className="h-3.5 w-3.5" aria-hidden />
              </a>
              <button
                type="button"
                className="btn-icon"
                onClick={() => onTailor(acc)}
                title={t.fixedFrom
                  ? `Tailor a resume instead${tailorModel ? ` with ${tailorModel}` : ''}`
                  : tailorModel ? `Generate again with ${tailorModel}` : 'Generate again'}
                aria-label={t.fixedFrom ? `Tailor a resume instead for ${profileName}` : `Re-tailor for ${profileName}`}
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              </button>
              </div>
            </div>
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
          <p className="mt-0.5 line-clamp-2 max-w-[16rem] break-words text-xs text-red-700 dark:text-red-400" title={t.error ?? undefined}>
            {t.error || 'Generation failed (no details recorded).'}
          </p>
        )}
      </td>
    </>
  );
}
