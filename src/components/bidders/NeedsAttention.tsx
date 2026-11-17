// The Needs attention block (Bidders tab, under To review): bidders that need a person, in amber (a to-do, not an
// error: never role="alert") and collapsible. One sentence per flag with one action, then the unused bidders as one
// "Looks unused:" line with an Archive chip each. The review backlog is the To review block's, not a line here
// (attentionFlags drops it). The count is flags plus unused bidders. The fold is remembered per browser.
import { useState } from 'react';
import * as api from '../../api/endpoints';
import type { BidAlerts } from '../../api/endpoints';
import { archiveText, attentionFlags, flagText } from '../../lib/bidderInsights';

const OPEN_KEY = 'bids.attention.open';
const reasonLabel = (code: string) => api.REJECT_REASONS.find((r) => r.value === code)?.label ?? code;

const readOpen = (): boolean => {
  try {
    return localStorage.getItem(OPEN_KEY) !== 'closed';
  } catch {
    return true;
  }
};

type Props = {
  alerts: BidAlerts;
  onOpenBidder: (id: string) => void;
  onOpenProfile: (id: string) => void;
  onArchive: (id: string, name: string) => void;
  /** False for an admin viewing another owner's bidders: the server refuses the archive, so no button. */
  canArchive: boolean;
};

export default function NeedsAttention({ alerts, onOpenBidder, onOpenProfile, onArchive, canArchive }: Props) {
  const [open, setOpen] = useState(readOpen);
  const flags = attentionFlags(alerts);
  const unused = alerts.archive ?? [];
  const total = flags.length + unused.length;
  if (total === 0) return null;

  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      localStorage.setItem(OPEN_KEY, next ? 'open' : 'closed');
    } catch {
      /* localStorage unavailable: the fold just won't be remembered. */
    }
  };

  return (
    <section
      role="region"
      aria-label="Needs attention"
      className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100"
    >
      <button
        type="button"
        className="flex min-h-[44px] w-full items-center gap-2 text-left font-medium sm:min-h-0"
        aria-expanded={open}
        onClick={toggle}
      >
        <span aria-hidden="true">{open ? '▾' : '▸'}</span>
        {`Needs attention · ${total}`}
      </button>
      {open && (
        <ul className="mt-2 space-y-2">
          {flags.map((f) => (
            <li key={`${f.kind}-${f.bidderId}`} className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-medium">{f.name || 'Unnamed'}</span>
              <span>{flagText(f, reasonLabel)}</span>
              <button
                type="button"
                className="btn-outline btn-sm ml-auto"
                onClick={() => (f.kind === 'no_interviews' && f.detail.profileId ? onOpenProfile(f.detail.profileId) : onOpenBidder(f.bidderId))}
              >
                Open
              </button>
            </li>
          ))}
          {unused.length > 0 && (
            <li className="flex flex-wrap items-center gap-x-2 gap-y-2">
              <span className="font-medium">Looks unused:</span>
              <ul className="flex flex-wrap gap-2">
                {unused.map((a) => (
                  <li
                    key={a.bidderId}
                    className="inline-flex items-center gap-2 rounded border border-amber-300 bg-white/60 px-2 py-1 dark:border-amber-800 dark:bg-transparent"
                  >
                    <span>{`${a.name || 'Unnamed'} · ${archiveText(a)}`}</span>
                    {canArchive && (
                      <button type="button" className="btn-outline btn-sm" onClick={() => onArchive(a.bidderId, a.name)}>
                        Archive
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
