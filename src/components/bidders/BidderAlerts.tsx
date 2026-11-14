// Bidders page banners (spec 2026-11-14-bidders-insights-design.md): red for bidders that need action, one sentence
// each (not dismissible: it clears when the cause does); grey for archive suggestions, each with an Archive button.
// Sentences: lib/bidderInsights. Same look as the Profiles banners.
import { useState } from 'react';
import * as api from '../../api/endpoints';
import type { BidAlerts } from '../../api/endpoints';
import { archiveText, flagText } from '../../lib/bidderInsights';

const SHOWN = 8;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const reasonLabel = (code: string) => api.REJECT_REASONS.find((r) => r.value === code)?.label ?? code;

type Props = {
  alerts: BidAlerts;
  /** Open a bidder; `day` opens their review on that day (the oldest waiting bids). */
  onOpenBidder: (id: string, day?: string) => void;
  onOpenProfile: (id: string) => void;
  onArchive: (id: string, name: string) => void;
};

export default function BidderAlerts({ alerts, onOpenBidder, onOpenProfile, onArchive }: Props) {
  const [showAll, setShowAll] = useState(false);
  const red = alerts.flags ?? [];
  const grey = alerts.archive ?? [];
  if (!red.length && !grey.length) return null;
  const shown = showAll ? red : red.slice(0, SHOWN);
  return (
    <div className="space-y-3">
      {red.length > 0 && (
        <section
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100"
        >
          <h2 className="text-sm font-semibold">⛔ {plural(red.length, 'bidder needs', 'bidders need')} attention</h2>
          <ul className="mt-2 space-y-1.5">
            {shown.map((f) => (
              <li key={f.bidderId} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <button type="button" className="font-medium hover:underline"
                  onClick={() => onOpenBidder(f.bidderId, f.kind === 'review_backlog' ? f.detail.oldestDay : undefined)}>
                  {f.name || 'Unnamed'}
                </button>
                <span>→ {flagText(f, reasonLabel)}</span>
                {f.kind === 'no_interviews' && f.detail.profileId && (
                  <button type="button" className="text-xs font-medium underline" onClick={() => onOpenProfile(f.detail.profileId!)}>
                    Open profile
                  </button>
                )}
                {f.kind === 'review_backlog' && (
                  <button type="button" className="text-xs font-medium underline"
                    onClick={() => onOpenBidder(f.bidderId, f.detail.oldestDay)}>
                    Review
                  </button>
                )}
              </li>
            ))}
          </ul>
          {red.length > SHOWN && (
            <button type="button" className="mt-2 text-xs font-medium underline" onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Show fewer' : `Show all ${red.length}`}
            </button>
          )}
        </section>
      )}
      {grey.length > 0 && (
        <section className="panel p-4" aria-label="Bidders you could archive">
          <p className="text-sm">
            {plural(grey.length, 'bidder looks', 'bidders look')} unused.{' '}
            <span className="text-muted">Archive them to keep the list focused.</span>
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {grey.map((a) => (
              <li key={a.bidderId} className="inline-flex items-center gap-2 rounded border border-black/10 px-2 py-1 text-sm dark:border-white/15">
                <button type="button" className="hover:underline" onClick={() => onOpenBidder(a.bidderId)}>{a.name || 'Unnamed'}</button>
                <span className="text-xs text-muted">{archiveText(a)}</span>
                <button type="button" className="btn-outline btn-sm" onClick={() => onArchive(a.bidderId, a.name)}>Archive</button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
