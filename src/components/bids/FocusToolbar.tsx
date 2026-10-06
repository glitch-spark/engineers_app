import { ArrowLeft, ChevronLeft, ChevronRight, Undo2 } from 'lucide-react';
import Kbd from './Kbd';

/** Back to the list, the progress line, previous/next and Undo. */
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
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <button type="button" className="btn-outline btn-sm" onClick={onExit}>
        <ArrowLeft size={14} aria-hidden /> Back to list
      </button>
      <p className="text-sm" aria-live="polite">
        <span className="font-medium">{progress}</span>
        <span className="text-muted"> · {approved} approved · {rejected} rejected</span>
      </p>
      <p className="text-xs text-muted">{scope}</p>
      <div className="ml-auto flex gap-2">
        <button type="button" className="btn-outline btn-sm" disabled={!canPrev} onClick={() => onMove(-1)} aria-label="Previous bid">
          <ChevronLeft size={14} aria-hidden /> <Kbd>K</Kbd>
        </button>
        <button type="button" className="btn-outline btn-sm" disabled={!canNext} onClick={() => onMove(1)} aria-label="Next bid">
          <Kbd>J</Kbd> <ChevronRight size={14} aria-hidden />
        </button>
        <button type="button" className="btn-outline btn-sm" disabled={!canUndo} onClick={onUndo}>
          <Undo2 size={14} aria-hidden /> Undo <Kbd>U</Kbd>
        </button>
      </div>
    </div>
  );
}
