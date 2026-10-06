import { Check, ExternalLink, Image as ImageIcon, X } from 'lucide-react';
import * as api from '../../api/endpoints';
import { NOT_SUBMITTED_TIP, fmtTime, reasonLabel } from './util';

const STATUS_BADGE: Record<api.BidStatus, string> = {
  pending: 'badge-neutral',
  approved: 'badge-success',
  rejected: 'badge-danger',
};

/** Green "Submitted" when a Submit screenshot exists, else amber "Not marked submitted". */
export function SubmittedBadge({ bid }: { bid: api.BidReviewItem }) {
  return bid.submittedAt ? (
    <span className="badge-success" title={`Submit screenshot at ${fmtTime(bid.submittedAt)}`}>Submitted</span>
  ) : (
    <span className="badge-warning" title={NOT_SUBMITTED_TIP}>Not marked submitted</span>
  );
}

const time = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

/**
 * One bid in a day list. Clicking the row opens it in the focus viewer; the job link and the quick Approve / Reject
 * buttons act on their own. `onDecide(bid, 'rejected')` without a reason asks the parent to open the reject dialog.
 */
export default function BidRow({
  bid,
  busy = false,
  onOpen,
  onDecide,
}: {
  bid: api.BidReviewItem;
  busy?: boolean;
  onOpen: (bidId: string) => void;
  onDecide: (bid: api.BidReviewItem, status: api.BidStatus, reason?: api.RejectReason, note?: string | null) => void;
}) {
  const reason = bid.status === 'rejected' ? reasonLabel(bid.rejectReason) : null;
  return (
    <li
      role="button"
      tabIndex={0}
      aria-label={`Review ${bid.jobTitle || bid.jobUrl || 'bid'} (${bid.status})`}
      onClick={() => onOpen(bid.id)}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onOpen(bid.id);
        }
      }}
      className="group flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 hover:bg-zinc-50 focus-ring dark:hover:bg-zinc-900/60"
    >
      <span className="w-16 shrink-0 text-xs tabular-nums text-muted">{time(bid.firstAt)}</span>
      <div className="min-w-0 flex-1 basis-60">
        <div className="flex min-w-0 items-center gap-2">
          {bid.jobUrl ? (
            <a
              href={bid.jobUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex min-w-0 items-center gap-1 font-medium text-strong underline-offset-2 hover:underline"
            >
              <span className="truncate">{bid.jobTitle || bid.jobUrl}</span>
              <ExternalLink size={12} aria-hidden className="shrink-0 opacity-60" />
            </a>
          ) : (
            <span className="truncate font-medium text-strong">{bid.jobTitle || 'Untitled job'}</span>
          )}
        </div>
        <p className="mt-0.5 flex items-center gap-2 text-xs text-muted">
          {bid.jobDomain && <span className="truncate">{bid.jobDomain}</span>}
          <span className="inline-flex items-center gap-1">
            <ImageIcon size={12} aria-hidden />
            {bid.screenshotCount}
            <span className="sr-only"> screenshots</span>
          </span>
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <SubmittedBadge bid={bid} />
        {bid.missingUploads > 0 && (
          <span className="badge-warning">Missing upload{bid.missingUploads > 1 ? ` (${bid.missingUploads})` : ''}</span>
        )}
        {bid.changedSinceReview && <span className="badge-info">New screenshots</span>}
        <span className={STATUS_BADGE[bid.status]}>{bid.status}</span>
        {reason && <span className="badge-danger" title={bid.note ?? undefined}>{reason}</span>}
      </div>
      <div className="ml-auto flex shrink-0 gap-1.5" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="btn-success btn-sm"
          disabled={busy || bid.status === 'approved'}
          aria-label={`Approve ${bid.jobTitle || 'bid'}`}
          onClick={() => onDecide(bid, 'approved')}
        >
          <Check size={14} aria-hidden /> Approve
        </button>
        <button
          type="button"
          className="btn-outline btn-sm"
          disabled={busy}
          aria-label={`Reject ${bid.jobTitle || 'bid'}`}
          onClick={() => onDecide(bid, 'rejected')}
        >
          <X size={14} aria-hidden /> Reject
        </button>
      </div>
    </li>
  );
}
