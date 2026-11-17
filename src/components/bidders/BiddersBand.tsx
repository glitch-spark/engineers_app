// Bidders page card (spec 2026-11-14-bidders-insights-design.md; since the 2026-11-16 redesign it sits in the
// Performance view, folded to one line by default): the owner's bidders pooled vs the platform over the period, and
// each measure's best bidder vs the best on the platform. Numbers and verdicts come from lib/bidderInsights; the look
// is shared with the Profiles card (components/insights/compareParts).
import type { BidInsights } from '../../api/endpoints';
import { bidderCells, bidderTopLines } from '../../lib/bidderInsights';
import { CompareCell, Standing } from '../insights/compareParts';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

type Props = {
  insights: BidInsights;
  /** "Your" for the signed-in owner, "These" for an admin looking at one user's bidders. */
  whose: 'Your' | 'These';
  /** Active bidders listed for this owner (with bids or not). */
  total: number;
  onOpenBidder: (id: string) => void;
  /** Folded (the default): one summary line and a Show details button (remembered by the page). */
  open: boolean;
  onToggle: () => void;
};

export default function BiddersBand({ insights, whose, total, onOpenBidder, open, onToggle }: Props) {
  const { mine, platform, tops } = insights;
  if (!mine || !platform) return null;
  const cells = bidderCells(mine, platform);
  const lines = tops ? bidderTopLines(tops) : [];
  const cell = (key: (typeof cells)[number]['key']) => cells.find((c) => c.key === key)?.mine ?? '—';
  const heading = `${whose} ${plural(total, 'bidder', 'bidders')} vs the platform`;
  const toggle = (
    <button type="button" className="btn-outline btn-sm" onClick={onToggle} aria-expanded={open}>
      {open ? 'Hide details' : 'Show details'}
    </button>
  );
  if (!open) {
    // Folded (the default): one summary line of this owner's pooled numbers.
    return (
      <section className="panel flex flex-wrap items-center justify-between gap-2 px-4 py-2.5" aria-label="Your bidders compared with the platform average">
        <p className="text-sm">
          <span className="font-medium text-strong">{heading}</span>
          {` · Days at 50+ ${cell('hit')} · Approval ${cell('approval')} · Interviews ${cell('per100')} per 100 · Cost per interview ${cell('cost')}`}
        </p>
        {toggle}
      </section>
    );
  }
  return (
    <section className="panel p-4 space-y-4" aria-label="Your bidders compared with the platform average">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-medium">{heading} average</h2>
          <p className="text-xs text-muted">
            Averages count only bidders with bids: {mine.bidders} of {whose === 'Your' ? 'yours' : 'these'},{' '}
            {platform.bidders} on the platform ({whose === 'Your' ? 'yours' : 'these'} included).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-black/5 px-2.5 py-1 text-xs text-muted dark:bg-white/10">{insights.label}</span>
          {toggle}
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {cells.map((c) => <CompareCell key={c.key} c={c} />)}
      </dl>
      {lines.length > 0 && (
        <div className="border-t border-black/5 pt-3 dark:border-white/10">
          <h3 className="text-xs font-medium text-muted">Top bidders</h3>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-xs">
              <tbody>
                {lines.map((l) => (
                  <tr key={l.key} className="border-t border-black/5 first:border-t-0 dark:border-white/5">
                    <th scope="row" className="py-1.5 pr-3 text-left font-medium whitespace-nowrap">{l.label}</th>
                    <td className="py-1.5 pr-3 whitespace-nowrap">
                      {l.mine ? (
                        <>
                          <button type="button" className="text-strong hover:underline" onClick={() => onOpenBidder(l.mine!.id)}>
                            {l.mine.name || 'Unnamed'}
                          </button>{' '}
                          {l.mine.text}
                        </>
                      ) : <span className="text-muted">—</span>}
                    </td>
                    <td className="py-1.5"><Standing top={l.top} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
