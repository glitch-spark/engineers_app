// Bidders page insights helpers (spec 2026-11-14-bidders-insights-design.md): the card's cells (yours vs the platform),
// the top bidders vs the best on the platform, and the banner sentences. Value imports carry `.ts` so Node's test
// runner loads this file as is (tests/bidderInsights.test.mjs).
import type { BidAlert, BidArchiveSuggestion, BidderStats, BidTopMeasure, BidTops } from '../api/endpoints';
import { bars, shortDay, signed, type BandCell, type PlatformTop, type TopChip } from './profileList.ts';

export type BidderCell = Omit<BandCell, 'key'> & { key: 'avg' | 'hit' | 'approval' | 'per100' | 'cost' };

const DASH = '—';
const count = (n: number) => Math.round(n).toLocaleString('en-US');
const pct = (x: number | null) => (x == null ? DASH : `${Math.round(x * 100)}%`);
const one = (x: number | null) => (x == null ? DASH : String(Math.round(x * 10) / 10));
const per = (x: number | null) => (x == null ? DASH : x.toFixed(2));
const usd = (x: number | null) => (x == null ? DASH : `$${count(x)}`);
const plural = (n: number, a: string, b: string) => `${count(n)} ${n === 1 ? a : b}`;

// Minimum samples and how far apart counts as different (the Metrics tab's rules, adapted to bidders).
const MIN_WEEKDAYS = 10;
const MIN_REVIEWED = 30;
const MIN_BIDS = 100;
const MIN_INTERVIEWS = 3;

type Dir = 'up' | 'down' | null;
const ratioDir = (r: number): Dir => (r >= 1.25 - 1e-9 ? 'up' : r <= 0.75 + 1e-9 ? 'down' : null);
const ptsDir = (gap: number, apart: number): Dir => (Math.abs(gap) < apart ? null : gap > 0 ? 'up' : 'down');
const tone = (thin: boolean, dir: Dir, lowerIsBetter = false): BandCell['tone'] => {
  if (thin) return 'thin';
  if (!dir) return null;
  return (dir === 'up') !== lowerIsBetter ? 'good' : 'bad';
};
const withThin = (note: string | null, thin: boolean) =>
  thin ? (note ? `${note} · too few to judge` : 'too few to judge') : note;
const pts = (a: number, b: number) => Math.round(a * 100) - Math.round(b * 100);

/** The card's five cells. Bids per weekday is never judged (owners run different schedules). */
export function bidderCells(mine: BidderStats, all: BidderStats): BidderCell[] {
  const hitThin = mine.weekdays < MIN_WEEKDAYS;
  const hitGap = mine.hitRate != null && all.hitRate != null ? pts(mine.hitRate, all.hitRate) : null;
  const hitDir = hitThin || hitGap == null ? null : ptsDir(hitGap, 15);
  const apThin = mine.reviewed < MIN_REVIEWED;
  const apGap = mine.approvalRate != null && all.approvalRate != null ? pts(mine.approvalRate, all.approvalRate) : null;
  const apDir = apThin || apGap == null ? null : ptsDir(apGap, 10);
  const p100Thin = mine.bids < MIN_BIDS || mine.per100 == null;
  const p100Ratio = mine.per100 != null && all.per100 ? mine.per100 / all.per100 : null;
  const p100Dir = p100Thin || p100Ratio == null ? null : ratioDir(p100Ratio);
  const costThin = mine.interviews < MIN_INTERVIEWS || mine.costPerInterview == null;
  const costRatio = mine.costPerInterview != null && all.costPerInterview ? mine.costPerInterview / all.costPerInterview : null;
  const costDir = costThin || costRatio == null ? null : ratioDir(costRatio);
  return [
    {
      key: 'avg', label: 'Bids per weekday', mine: one(mine.avgPerWeekday), all: one(all.avgPerWeekday), note: null,
      dir: null, tone: null, gap: null, bar: bars(mine.avgPerWeekday, all.avgPerWeekday),
    },
    {
      key: 'hit', label: 'Days at 50+', mine: pct(mine.hitRate), all: pct(all.hitRate),
      note: withThin(`${count(mine.hitDays)} of ${count(mine.weekdays)} weekdays at 50+`, hitThin),
      dir: hitDir, tone: tone(hitThin, hitDir), gap: hitGap == null ? null : signed(hitGap, ' pts'),
      bar: bars(mine.hitRate, all.hitRate),
    },
    {
      key: 'approval', label: 'Approval rate', mine: pct(mine.approvalRate), all: pct(all.approvalRate),
      note: mine.reviewed ? withThin(`${count(mine.approved)} of ${count(mine.reviewed)} reviewed`, apThin) : 'nothing reviewed yet',
      dir: apDir, tone: tone(apThin, apDir), gap: apGap == null ? null : signed(apGap, ' pts'),
      bar: bars(mine.approvalRate, all.approvalRate),
    },
    {
      key: 'per100', label: 'Interviews per 100 bids', mine: per(mine.per100), all: per(all.per100),
      note: withThin(`${plural(mine.interviews, 'interview', 'interviews')} from ${plural(mine.bids, 'bid', 'bids')}`, p100Thin),
      dir: p100Dir, tone: tone(p100Thin, p100Dir),
      gap: p100Ratio == null ? null : signed(Math.round((p100Ratio - 1) * 100), '%'), bar: bars(mine.per100, all.per100),
    },
    {
      key: 'cost', label: 'Cost per interview', mine: usd(mine.costPerInterview), all: usd(all.costPerInterview),
      note: mine.interviews ? withThin(`${usd(mine.pay)} paid`, costThin) : 'no interviews yet',
      // A lower cost is better: the arrow points the way the number went, the colour says whether that is good.
      dir: costDir, tone: tone(costThin, costDir, true),
      gap: costRatio == null ? null : signed(Math.round((costRatio - 1) * 100), '%'),
      bar: bars(mine.costPerInterview, all.costPerInterview),
    },
  ];
}

export type BidderTopLine = {
  key: BidTopMeasure; label: string; mine: { id: string; name: string; text: string } | null; top: PlatformTop | null;
};

const TOPS: { key: BidTopMeasure; label: string; fmt: (v: number) => string; lower?: boolean; behind: (gap: number) => string }[] = [
  { key: 'bids', label: 'Most bids', fmt: count, behind: (g) => `${count(g)} behind` },
  { key: 'per100', label: 'Best conversion', fmt: (v) => `${v.toFixed(2)} / 100`, behind: (g) => `−${g.toFixed(2)} per 100` },
  { key: 'costPerInterview', label: 'Lowest cost per interview', fmt: (v) => usd(v), lower: true, behind: (g) => `+${usd(g)}` },
  { key: 'streak', label: 'Longest streak', fmt: (v) => plural(v, 'day', 'days'), behind: (g) => `${plural(g, 'day', 'days')} behind` },
  { key: 'interviews', label: 'Most interviews', fmt: count, behind: (g) => `${count(g)} behind` },
];

/** The card's top bidders: per measure, the owner's best next to the best on the platform (a chip for the standing:
 *  lead, near = within 25% of the leader, far; the leader to look up when the owner doesn't lead). */
export function bidderTopLines(tops: BidTops): BidderTopLine[] {
  return TOPS.filter(({ key }) => tops[key]).map(({ key, label, fmt, lower, behind }) => {
    const { mine, platform } = tops[key]!;  // an older server sends fewer measures
    let top: PlatformTop | null = null;
    if (platform) {
      const v = platform.value;
      const leads = mine != null && (lower ? mine.value <= v : mine.value >= v);
      const near = mine != null && (lower ? mine.value <= v / 0.75 : mine.value >= 0.75 * v);
      const chip: TopChip | null = mine == null ? null
        : leads ? { kind: 'lead', text: 'Best on the platform' }
          : { kind: near ? 'near' : 'far', text: behind(Math.abs(v - mine.value)) };
      top = { chip, leader: leads ? null : `${platform.name || 'Unnamed'}${platform.ownerName ? ` (${platform.ownerName})` : ''} ${fmt(v)}` };
    }
    return { key, label, mine: mine && { id: mine.id, name: mine.name, text: fmt(mine.value) }, top };
  });
}

/** The red banner's sentence for a bidder that needs action. `reasonLabel` turns a reject code into its label. */
export function flagText(f: BidAlert, reasonLabel: (code: string) => string): string {
  const d = f.detail;
  switch (f.kind) {
    case 'inactive':
      return `${d.lastBidDay ? `No bids since ${shortDay(d.lastBidDay)}` : 'No bids yet'}: check in with ${f.name}.`;
    case 'rejects':
      return `${count(d.rejected ?? 0)} of ${count(d.reviewed ?? 0)} rejected`
        + `${d.topReason ? `, mostly "${reasonLabel(d.topReason)}"` : ''}: coach on it.`;
    case 'no_interviews':
      return `${count(d.bids ?? 0)} bids, no interviews: check the profile ${d.profileName || 'Unnamed'} and its target roles.`;
    case 'review_backlog':
      return `${plural(d.pending ?? 0, 'bid', 'bids')} waiting for review since ${shortDay(d.oldestDay ?? '')}.`;
    default:
      return '';
  }
}

/** The grey banner's reason for suggesting an archive. */
export function archiveText(a: BidArchiveSuggestion): string {
  if (a.reason === 'invite_expired') return a.since ? `Invite expired ${shortDay(a.since)}, never used` : 'Invite expired, never used';
  return a.since ? `No bids in 2 weeks (last ${shortDay(a.since)})` : 'No bids in 2 weeks';
}

/** The arrow's colour: green when the cell's verdict is good, red when bad, whatever way the number went (a higher
 *  cost per interview points ▲ but is bad); null without a verdict. */
export function arrowGood(c: { tone: BandCell['tone'] }): boolean | null {
  return c.tone === 'good' ? true : c.tone === 'bad' ? false : null;
}

/** The viewer manages these bidders (archive, invite, edit): staff always (their own list); an admin only their own
 *  bidders (the server refuses changes to another owner's). */
export function canManageBidders(v: { isAdmin: boolean; ownerId: string; userId: string | undefined }): boolean {
  return !v.isAdmin || (!!v.userId && v.ownerId === v.userId);
}

/** The SWR keys a review decision changes: the open day's and week's bid lists, and the banners (the backlog). */
export function isReviewedDataKey(key: unknown): boolean {
  return Array.isArray(key) && ['bids-day', 'bids-week', 'bid-alerts'].includes(key[0] as string);
}

/** ▲ / ▼ on a row's interviews per 100 bids against the platform (100+ bids; ×1.25 / ×0.75). */
export function rowPer100Verdict(row: { total: number; per100: number | null }, platformPer100: number | null | undefined): Dir {
  if (row.total < MIN_BIDS || row.per100 == null || !platformPer100) return null;
  return ratioDir(row.per100 / platformPer100);
}
