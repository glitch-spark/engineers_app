import type { ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import type { BidReviewItem, BidStatus } from '../../api/endpoints';
import { fmtDuration, fmtTime, reasonLabel } from './util';

const STATUS_BADGE: Record<BidStatus, string> = {
  pending: 'badge-neutral',
  approved: 'badge-success',
  rejected: 'badge-danger',
};

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

/** What the reviewer checks a bid against: who bid, which profile/resume the form should show, and the job. */
export default function BidEvidence({ bid }: { bid: BidReviewItem }) {
  const flags = [
    !bid.submittedAt && 'Not marked submitted',
    bid.missingUploads > 0 && `Missing upload${bid.missingUploads > 1 ? ` (${bid.missingUploads})` : ''}`,
  ].filter((f): f is string => !!f);
  const reason = bid.status === 'rejected' ? reasonLabel(bid.rejectReason) : null;

  return (
    <div className="space-y-4 text-sm">
      <dl className="space-y-1.5">
        <Row label="Bidder"><span className="font-medium">{bid.bidderName}</span></Row>
      </dl>

      <section
        aria-label="Profile and resume"
        className="rounded-lg border border-sky-200 bg-sky-50/60 p-3 dark:border-sky-900/50 dark:bg-sky-950/30"
      >
        <p className="mb-1.5 text-xs font-medium text-muted">The form should use</p>
        {bid.profileName ? (
          <dl className="space-y-1.5">
            <Row label="Profile"><span className="font-semibold">{bid.profileName}</span></Row>
            <Row label={bid.resumeNames.length === 1 ? 'Resume' : 'Resumes'}>
              {bid.resumeNames.length === 0 ? (
                <span className="text-muted">None uploaded</span>
              ) : (
                <ul className="space-y-0.5">
                  {bid.resumeNames.map((name, i) => <li key={`${i}:${name}`} className="font-medium">{name}</li>)}
                </ul>
              )}
            </Row>
            {bid.tailoredResumeName && (
              <Row label="Tailored"><span className="font-medium">{bid.tailoredResumeName}</span></Row>
            )}
          </dl>
        ) : (
          <span className="badge-warning">No profile assigned</span>
        )}
      </section>

      <dl className="space-y-1.5">
        <Row label="Job">{bid.jobTitle || <span className="text-muted">Untitled job</span>}</Row>
        <Row label="Site">
          {bid.jobUrl ? (
            <a
              href={bid.jobUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex max-w-full items-center gap-1 text-sky-700 underline-offset-2 hover:underline dark:text-sky-400"
            >
              <span className="truncate">{bid.jobDomain || bid.jobUrl}</span>
              <ExternalLink size={12} aria-hidden className="shrink-0" />
            </a>
          ) : (
            <span className="text-muted">No job URL</span>
          )}
        </Row>
        <Row label="Steps">{bid.screenshotCount}</Row>
        <Row label="Duration">{fmtDuration(bid.durationSec)}</Row>
        <Row label="First shot">{fmtTime(bid.firstAt)}</Row>
      </dl>

      {(flags.length > 0 || bid.changedSinceReview) && (
        <div className="flex flex-wrap gap-1.5">
          {flags.map((f) => <span key={f} className="badge-warning">{f}</span>)}
          {bid.changedSinceReview && <span className="badge-info">New screenshots since review</span>}
        </div>
      )}

      <dl className="space-y-1.5">
        <Row label="Status">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className={STATUS_BADGE[bid.status]}>{bid.status}</span>
            {reason && <span className="badge-danger">{reason}</span>}
          </span>
        </Row>
        {bid.status !== 'pending' && bid.reviewedByName && (
          <Row label="Reviewer">
            {bid.reviewedByName}
            {bid.reviewedAt ? <span className="text-muted"> · {fmtTime(bid.reviewedAt)}</span> : null}
          </Row>
        )}
        {bid.note && <Row label="Note">&ldquo;{bid.note}&rdquo;</Row>}
      </dl>
    </div>
  );
}
