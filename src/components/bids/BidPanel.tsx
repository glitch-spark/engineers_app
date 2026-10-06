import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import * as api from '../../api/endpoints';
import SidePanel from '../SidePanel';
import BidEvidence from './BidEvidence';
import Kbd from './Kbd';
import ReviewActions from './ReviewActions';
import StepViewer, { defaultStep } from './StepViewer';
import { fmtTime, isTypingTarget } from './util';

/**
 * One bid of a day in a side panel: screenshots, evidence, Approve / Reject with a reason, and previous / next through
 * the day's bids. A decision keeps the bid open with its new status.
 */
export default function BidPanel({
  bids,
  bidId,
  busy,
  onClose,
  onSelect,
  onDecide,
}: {
  /** The day's bids in display order. */
  bids: api.BidReviewItem[];
  bidId: string | null;
  busy: boolean;
  onClose: () => void;
  onSelect: (bidId: string) => void;
  onDecide: (bid: api.BidReviewItem, status: api.BidStatus, reason?: api.RejectReason, note?: string | null) => Promise<void>;
}) {
  const pos = bids.findIndex((b) => b.id === bidId);
  const bid = pos >= 0 ? bids[pos] : null;

  // Same key and data as the focus viewer, so the two share the cache. Signed links live 5 minutes.
  const shotsSWR = useSWR(bid ? (['bid-screenshots', bid.id] as const) : null, ([, id]) => api.bidScreenshots(id), {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
    refreshInterval: 240_000,
  });
  const shots = shotsSWR.data;
  const [step, setStep] = useState<{ bidId: string; index: number } | null>(null);
  const stepIndex = !shots?.length ? 0 : step && step.bidId === bid?.id ? Math.min(step.index, shots.length - 1) : defaultStep(shots);

  const [rejectOpen, setRejectOpen] = useState(false);
  const [otherChosen, setOtherChosen] = useState(false);
  const [note, setNote] = useState('');
  const noteRef = useRef<HTMLInputElement>(null);

  // A different bid starts with the reject form closed.
  useEffect(() => {
    setRejectOpen(false);
    setOtherChosen(false);
    setNote('');
  }, [bidId]);

  const go = (delta: 1 | -1) => {
    const next = bids[pos + delta];
    if (next) onSelect(next.id);
  };
  const approve = () => bid && void onDecide(bid, 'approved');
  const reject = (reason: api.RejectReason) => {
    if (!bid) return;
    if (reason === 'other') {
      setOtherChosen(true);
      noteRef.current?.focus();
      return;
    }
    void onDecide(bid, 'rejected', reason, note.trim() || null).then(() => setRejectOpen(false));
  };
  const submitOther = (e: React.FormEvent) => {
    e.preventDefault();
    if (bid && otherChosen && note.trim()) void onDecide(bid, 'rejected', 'other', note.trim()).then(() => setRejectOpen(false));
  };

  // Keys while the panel is open: J/K bids, ←/→ steps, F full size, A approve, R reject then 1–6 reason.
  const onKeyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  onKeyRef.current = (e) => {
    if (!bid || busy || e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const reason = api.REJECT_REASONS.find((r) => r.key === key);
    if (key === 'j') go(1);
    else if (key === 'k') go(-1);
    else if ((key === 'ArrowRight' || key === 'ArrowLeft') && shots?.length)
      setStep({ bidId: bid.id, index: Math.max(0, Math.min(stepIndex + (key === 'ArrowRight' ? 1 : -1), shots.length - 1)) });
    else if (key === 'f' && shots?.[stepIndex]?.url) window.open(shots[stepIndex].url!, '_blank', 'noopener,noreferrer');
    else if (key === 'a') approve();
    else if (key === 'r') setRejectOpen((o) => !o);
    else if (reason && rejectOpen) reject(reason.value);
    else return;
    e.preventDefault();
  };
  useEffect(() => {
    if (!bidId) return;
    const onKey = (e: KeyboardEvent) => onKeyRef.current(e);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [bidId]);

  return (
    <SidePanel
      open={!!bid}
      wide
      title={bid?.jobTitle || bid?.jobDomain || 'Untitled job'}
      subtitle={bid && <>{bid.bidderName} · {fmtTime(bid.firstAt)}{bid.jobDomain ? ` · ${bid.jobDomain}` : ''}</>}
      onClose={onClose}
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <span className="text-xs text-muted">Bid {pos + 1} of {bids.length} this day</span>
          <div className="flex gap-2">
            <button type="button" className="btn-outline btn-sm" disabled={pos <= 0} onClick={() => go(-1)} aria-label="Previous bid">
              <ChevronLeft size={14} aria-hidden /> <Kbd>K</Kbd>
            </button>
            <button type="button" className="btn-outline btn-sm" disabled={pos < 0 || pos >= bids.length - 1} onClick={() => go(1)} aria-label="Next bid">
              <Kbd>J</Kbd> <ChevronRight size={14} aria-hidden />
            </button>
          </div>
        </div>
      }
    >
      {bid && (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(16rem,2fr)]">
          <div className="min-w-0">
            <StepViewer
              bidId={bid.id}
              shots={shots}
              error={shotsSWR.error}
              index={stepIndex}
              onSelect={(index) => setStep({ bidId: bid.id, index })}
              onRetry={() => void shotsSWR.mutate()}
            />
          </div>
          <div className="space-y-4">
            <BidEvidence bid={bid} />
            <ReviewActions
              busy={busy}
              rejectOpen={rejectOpen}
              otherChosen={otherChosen}
              note={note}
              noteRef={noteRef}
              onNote={setNote}
              onApprove={approve}
              onToggleReject={() => setRejectOpen((o) => !o)}
              onReason={reject}
              onSubmitOther={submitOther}
            />
          </div>
        </div>
      )}
    </SidePanel>
  );
}
