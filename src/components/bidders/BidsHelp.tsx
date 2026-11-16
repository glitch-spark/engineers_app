import { useEffect, useId, useRef, useState } from 'react';
import { CircleHelp } from 'lucide-react';
import { BID_TRACK_STEPS, GLOSSARY, OVERLAP_NOTE } from '../../lib/bidsWords';

/** "What do these numbers mean?": the glossary in a popover that opens on click (never on hover). */
export default function BidsHelp() {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      btnRef.current?.focus();
    };
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={btnRef}
        type="button"
        className="btn-outline inline-flex items-center gap-1.5 text-sm"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <CircleHelp className="h-4 w-4" aria-hidden />
        What do these numbers mean?
      </button>
      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="What these numbers mean"
          className="panel absolute right-0 z-30 mt-2 w-[min(28rem,calc(100vw-2rem))] space-y-3 p-4 text-sm shadow-lg"
        >
          <dl className="space-y-2">
            {GLOSSARY.map((g) => (
              <div key={g.word}>
                <dt className="font-medium text-strong">{g.word}</dt>
                <dd className="text-body">{g.means}</dd>
              </div>
            ))}
          </dl>
          <p className="text-muted">{OVERLAP_NOTE}</p>
          <p className="text-muted">
            <span className="font-medium text-strong">Bid Track</span>{' '}
            Download it from More actions › Download Bid Track. {BID_TRACK_STEPS}
          </p>
        </div>
      )}
    </div>
  );
}
