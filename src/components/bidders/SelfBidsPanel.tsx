// The owner's own applies recorded by the Bid Track extension (self bids) for a day or pay week, read-only: the day
// panel without review controls, and a click opens that apply's screenshots.
import { useState } from 'react';
import useSWR from 'swr';
import * as api from '../../api/endpoints';
import Modal from '../Modal';
import StepViewer from '../bids/StepViewer';
import DayPanel from './DayPanel';

export type SelfScope = { ownerId: string; ownerName?: string; day?: string; week?: string };

function scopeLabel(s: SelfScope): string {
  const when = s.day
    ? new Date(`${s.day}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
    : 'this pay week';
  return `Self${s.ownerName ? ` · ${s.ownerName}` : ''} · ${when}`;
}

export default function SelfBidsPanel({ scope, onClose }: { scope: SelfScope | null; onClose: () => void }) {
  const list = useSWR(
    scope ? (['self-bids', scope.ownerId, scope.day ?? '', scope.week ?? ''] as const) : null,
    () => api.listBids({ self: true, ownerId: scope!.ownerId || undefined, ...(scope!.day ? { day: scope!.day } : { week: scope!.week }) }),
  );
  const [open, setOpen] = useState<api.BidReviewItem | null>(null);
  const [step, setStep] = useState(0);
  const shots = useSWR(open ? (['bid-shots', open.id] as const) : null, () => api.bidScreenshots(open!.id));
  const bids = list.data ? [...list.data.bids].reverse() : undefined;  // oldest first, as the day panel shows

  return (
    <>
      <DayPanel
        open={!!scope}
        title={scope ? scopeLabel(scope) : ''}
        subtitle="Your own applies from the Bid Track extension"
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
      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.jobTitle || 'Apply'} size="lg">
        {open && (
          <div className="space-y-2">
            <p className="text-xs text-muted">
              {[open.profileName, new Date(open.firstAt).toLocaleString()].filter(Boolean).join(' · ')}
              {open.jobUrl && (
                <>
                  {' · '}
                  <a href={open.jobUrl} target="_blank" rel="noopener noreferrer" className="underline">{open.jobDomain || 'job page'}</a>
                </>
              )}
            </p>
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
