import { useState } from 'react';
import { Download, ExternalLink, FileText, Loader2 } from 'lucide-react';
import * as api from '../../api/endpoints';
import type { InterviewResumeLink } from '../../api/endpoints';
import { NO_MATCH_REASONS } from '../../lib/interviewForm';
import { notify } from '../../lib/notify';
import { safeHref } from '../../lib/safeHref';
import { TailoredScore } from '../jobApplies/Suggestions';
import { KIND_LABEL, shortDay } from './CompanyMatchField';

export function reasonLabel(reason?: string | null): string {
  return NO_MATCH_REASONS.find((r) => r.value === reason)?.label ?? 'No reason given';
}

/** Save the linked resume: a tailored one's PDF, or an uploaded one's original file (from the profile). */
export async function downloadLinkedResume(link: InterviewResumeLink, accountId: string): Promise<void> {
  try {
    if ((link.kind === 'tailored' || link.kind === 'fixed') && link.resumeJobId) {
      await api.downloadTailoredResume(link.resumeJobId, link.filename || 'Resume.pdf');
    } else if (link.kind === 'uploaded' && link.resumeId) {
      const { url } = await api.getAccountResumeFileUrl(accountId, link.resumeId);
      window.open(url, '_blank', 'noopener');
    }
  } catch (err) {
    notify.error(err, 'Download failed');
  }
}

/** A table cell's view of an interview's resume score: the badge, else why there's none. */
export function ResumeScoreCell({ link }: { link?: InterviewResumeLink | null }) {
  if (link?.score) {
    return (
      <span title={`${link.reason === 'fixed_resume' ? 'Fixed resume' : KIND_LABEL[link.kind as 'tailored' | 'fixed' | 'uploaded']}${link.filename ? ` · ${link.filename}` : ''}`}>
        <TailoredScore m={link.score} />
      </span>
    );
  }
  if (!link) return <span className="text-faint" title="No resume linked yet">—</span>;
  if (link.kind === 'none') return <span className="text-faint" title={`No company found · ${reasonLabel(link.reason)}`}>—</span>;
  return <span className="text-xs text-faint" title={link.filename || undefined}>Not scored</span>;
}

/** Download button for a linked resume; nothing for a link with no resume. */
export function LinkedResumeDownload({ link, accountId, compact }: { link: InterviewResumeLink; accountId: string; compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  const hasFile = ((link.kind === 'tailored' || link.kind === 'fixed') && link.resumeJobId) || (link.kind === 'uploaded' && link.resumeId);
  if (!hasFile || !accountId) return null;
  const label = `Download ${link.filename || 'resume'}`;
  return (
    <button
      type="button"
      className={compact ? 'btn-icon' : 'btn-outline btn-sm'}
      disabled={busy}
      title={label}
      aria-label={label}
      onClick={async () => {
        setBusy(true);
        await downloadLinkedResume(link, accountId);
        setBusy(false);
      }}
    >
      {busy ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Download size={13} aria-hidden />}
      {!compact && ' Download'}
    </button>
  );
}

/**
 * The resume and job an interview is linked to (or why none was found), with Change. List feeds leave out the job
 * description: with `interviewId`, it's loaded on demand.
 */
export default function LinkedResumeCard({
  link,
  accountId,
  loading,
  error,
  interviewId,
  onChange,
}: {
  link?: InterviewResumeLink | null;
  /** The interview's profile: an uploaded resume's file is downloaded from it. */
  accountId: string;
  loading?: boolean;
  error?: boolean;
  interviewId?: string;
  /** Omitted when the choice is made elsewhere (the fixed-resume dropdown). */
  onChange?: () => void;
}) {
  const [jd, setJd] = useState<string | null>(null);
  const [loadingJd, setLoadingJd] = useState(false);
  const description = link?.jobDescription ?? jd;

  async function loadJd() {
    if (!interviewId) return;
    setLoadingJd(true);
    try {
      const iv = (await api.getInterview(interviewId)) as { resumeLink?: InterviewResumeLink | null };
      setJd(iv.resumeLink?.jobDescription || '');
    } catch {
      setJd('');
    } finally {
      setLoadingJd(false);
    }
  }

  const change = onChange && (
    <button type="button" className="text-sm text-sky-700 hover:underline dark:text-sky-400" onClick={onChange}>
      Change
    </button>
  );
  const title = link?.kind === 'none'
    ? 'No company found'
    : link?.kind === 'fixed' || link?.reason === 'fixed_resume' ? 'Fixed resume' : 'Linked resume';

  return (
    <section
      aria-label="Linked resume"
      className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900/40"
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
          <FileText size={13} aria-hidden /> {title}
        </h4>
        <span className="flex items-center gap-3">
          {link && !loading && <LinkedResumeDownload link={link} accountId={accountId} />}
          {change}
        </span>
      </div>
      {loading ? (
        <p className="flex items-center gap-1.5 text-muted"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Loading…</p>
      ) : error || !link ? (
        <p className="text-red-700 dark:text-red-400">Couldn’t load this resume. Change it, or tick No company found.</p>
      ) : link.kind === 'none' ? (
        <p>
          {reasonLabel(link.reason)}
          {link.reasonNote && <span className="text-muted"> · {link.reasonNote}</span>}
        </p>
      ) : (
        <div className="space-y-1.5">
          <p className="text-body">
            {[KIND_LABEL[link.kind], link.filename, shortDay(link.appliedAt), link.promptName && `prompt “${link.promptName}”`]
              .filter(Boolean)
              .join(' · ')}
            {link.linkedBy === 'auto' && <span className="badge badge-neutral ml-2" title="Linked automatically by company name">auto</span>}
          </p>
          <p className="flex flex-wrap items-center gap-2">
            {link.score ? (
              <>
                <TailoredScore m={link.score} />
                <span className="text-xs text-muted">
                  {link.score.missing.length ? `Missing: ${link.score.missing.join(', ')}` : 'Every job term is in the resume'}
                </span>
              </>
            ) : (
              <span className="text-xs text-muted">Not scored</span>
            )}
          </p>
          {safeHref(link.jobUrl) && (
            <a href={safeHref(link.jobUrl)} target="_blank" rel="noreferrer"
              className="inline-flex max-w-full items-center gap-1 text-sky-700 hover:underline dark:text-sky-400">
              <span className="truncate">{link.jobUrl}</span>
              <ExternalLink size={12} className="shrink-0" aria-hidden />
            </a>
          )}
          {description ? (
            <details>
              <summary className="cursor-pointer text-sky-700 dark:text-sky-400">Job description</summary>
              <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-white p-2 font-sans text-xs text-body dark:bg-zinc-950">
                {description}
              </pre>
            </details>
          ) : interviewId && jd === null ? (
            <button type="button" className="text-sky-700 hover:underline dark:text-sky-400" onClick={loadJd} disabled={loadingJd}>
              {loadingJd ? 'Loading job description…' : 'Show job description'}
            </button>
          ) : (
            <p className="text-xs text-muted">
              {link.reason === 'fixed_resume'
                ? 'The app hasn’t read the job at the Job URL, so there’s no job description or score.'
                : 'No job description saved'}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
