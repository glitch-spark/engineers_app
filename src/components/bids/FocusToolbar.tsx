import { ArrowLeft, ChevronLeft, ChevronRight, Undo2 } from 'lucide-react';
import Kbd from './Kbd';
import Segmented from '../Segmented';
import { REVIEW_SWITCH_OPTIONS, type ReviewSwitch } from '../../lib/bidsUrl';

/** Close, the progress line, the scope (and its Review switch when given), previous/next and Undo. */
export default function FocusToolbar({
  progress,
  approved,
  rejected,
  scope,
  canPrev,
  canNext,
  canUndo,
  onExit,
  onMove,
  onUndo,
  scopeSwitch,
}: {
  progress: string;
  approved: number;
  rejected: number;
  scope: string;
  canPrev: boolean;
  canNext: boolean;
  canUndo: boolean;
  onExit: () => void;
  onMove: (delta: 1 | -1) => void;
  onUndo: () => void;
  /** `value` null checks no option (the scope is another day or pay week). */
  scopeSwitch?: { value: ReviewSwitch | null; onChange: (v: ReviewSwitch) => void };
}) {
  return (
    <div className="panel flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2">
      <button type="button" className="btn-outline btn-sm" onClick={onExit}>
        <ArrowLeft size={14} aria-hidden /> Close <Kbd>Esc</Kbd>
      </button>
      <p className="text-sm" aria-live="polite">
        <span className="font-medium">{progress}</span>
        <span className="text-muted"> · {approved} approved · {rejected} rejected</span>
      </p>
      <p className="text-xs text-muted">{scope}</p>
      {scopeSwitch && (
        <Segmented label="Review" value={scopeSwitch.value} options={REVIEW_SWITCH_OPTIONS} onChange={scopeSwitch.onChange} />
      )}
      <div className="ml-auto flex gap-2">
        <button type="button" className="btn-outline btn-sm" disabled={!canPrev} onClick={() => onMove(-1)} aria-label="Previous bid">
          <ChevronLeft size={14} aria-hidden /> <Kbd>←</Kbd>
        </button>
        <button type="button" className="btn-outline btn-sm" disabled={!canNext} onClick={() => onMove(1)} aria-label="Next bid">
          <Kbd>→</Kbd> <ChevronRight size={14} aria-hidden />
        </button>
        <button type="button" className="btn-outline btn-sm" disabled={!canUndo} onClick={onUndo}>
          <Undo2 size={14} aria-hidden /> Undo <Kbd>U</Kbd>
        </button>
      </div>
    </div>
  );
}
