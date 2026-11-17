// The owner's own bids recorded by Bid Track (My bids) for a day or pay week, read-only: the day panel without review
// parts (no status chips, Status or Checks), and a click opens that bid's screenshots.
import { useState } from 'react';
import useSWR from 'swr';
import * as api from '../../api/endpoints';
import { safeHref } from '../../lib/safeHref';
import Modal from '../Modal';
import StepViewer from '../bids/StepViewer';
import DayPanel from './DayPanel';

export type SelfScope = { ownerId: string; ownerName?: string; day?: string; week?: string; accountId?: string; profileName?: string };

// "Tue Nov 24" (no comma), from a report day.
function dayLabel(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  const part = (o: Intl.DateTimeFormatOptions) => d.toLocaleDateString('en-US', { ...o, timeZone: 'UTC' });
  return `${part({ weekday: 'short' })} ${part({ month: 'short', day: 'numeric' })}`;
}

/** The title's last part: the day, or the pay week by the listing's `week` key ("…" until it arrives). */
function whenLabel(s: SelfScope, weekKey: string | null | undefined): string {
  if (s.day) return dayLabel(s.day);
  return `Week ending ${weekKey ? dayLabel(weekKey) : '…'}`;
}

export default function SelfBidsPanel({ scope, onClose }: { scope: SelfScope | null; onClose: () => void }) {
  const list = useSWR(
    scope ? (['self-bids', scope.ownerId, scope.day ?? '', scope.week ?? '', scope.accountId ?? ''] as const) : null,
    () => api.listBids({
      self: true, ownerId: scope!.ownerId || undefined, accountId: scope!.accountId || undefined,
      ...(scope!.day ? { day: scope!.day } : { week: scope!.week }),
    }),
  );
  const [open, setOpen] = useState<api.BidReviewItem | null>(null);
  const [step, setStep] = useState(0);
  const shots = useSWR(open ? (['bid-shots', open.id] as const) : null, () => api.bidScreenshots(open!.id));
  const bids = list.data ? [...list.data.bids].reverse() : undefined;  // oldest first, as the day panel shows

  return (
    <>
      <DayPanel
        open={!!scope}
        title={scope ? ['My bids', scope.ownerName, scope.profileName, whenLabel(scope, list.data?.week)].filter(Boolean).join(' · ') : ''}
        subtitle={scope?.ownerName ? `${scope.ownerName}'s own bids from Bid Track` : 'Your own bids from Bid Track'}
        bids={bids}
        error={list.error}
        busy={false}
        readOnly
        onClose={onClose}
        onReview={(bidId) => {
          setOpen(bids?.find((b) => b.id === bidId) ?? null);
          setStep(0);
        }}
        onDecide={() => undefined}
        onBulk={async () => undefined}
        onApproveAllComplete={() => undefined}
      />
      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.jobTitle || 'Bid'} size="lg">
        {open && (
          <div className="space-y-2">
            <p className="text-xs text-muted">
              {[open.profileName, new Date(open.firstAt).toLocaleString()].filter(Boolean).join(' · ')}
            </p>
            {open.jobUrl && (
              <p className="break-all text-xs">
                {safeHref(open.jobUrl) ? (
                  <a href={safeHref(open.jobUrl)} target="_blank" rel="noopener noreferrer"
                    className="text-sky-700 underline underline-offset-2 dark:text-sky-400">
                    {open.jobUrl}
                  </a>
                ) : (
                  <span className="text-muted">{open.jobUrl}</span>
                )}
              </p>
            )}
            <StepViewer
              bidId={open.id}
              shots={shots.data}
              error={shots.error}
              index={step}
              onSelect={setStep}
              onRetry={() => void shots.mutate()}
            />
          </div>
        )}
      </Modal>
    </>
  );
}
