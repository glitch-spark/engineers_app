// Profile → Metrics "Needs attention": up to three plain lines on what stands out, by fixed rules (spec
// 2026-11-13-profile-metrics-ux-design.md). Type-only imports, so Node's test runner can load this file as is.
import type { CompareStats, ProfileCompare, RoundsSummary, RoundType } from '../api/endpoints';

export type AttentionLine = { dir: 'up' | 'down'; text: string };

const ROUND_NAMES: [RoundType, string][] = [
  ['intro', 'Intro'], ['tech', 'Tech'], ['hiring', 'Hiring'], ['panel', 'Panel'], ['final', 'Final'],
];
const MIN_DECIDED_PER_TYPE = 3;
const MIN_BIDS = 30;
const MIN_DECIDED = 5;
const MIN_SCORED = 5;
const EPS = 1e-9;

/** Whole points (0.714 → 71), so thresholds match what the page shows. */
const points = (x: number) => Math.round(x * 100);
const pct = (x: number) => `${points(x)}%`;
const rate1 = (x: number) => `${(x * 100).toFixed(1)}%`;
const perWeek = (x: number) => (x < 10 ? x.toFixed(1).replace(/\.0$/, '') : String(Math.round(x)));

type Target = { value: number; suffix: string; who: string };

/** The value to compare with: every owner's profiles when known, else the owner's other profiles. */
function target(get: (s: CompareStats) => number | null, all: CompareStats | null, peers: CompareStats | null): Target | null {
  const a = all ? get(all) : null;
  if (a != null) return { value: a, suffix: 'across all profiles', who: 'all profiles' };
  const p = peers ? get(peers) : null;
  if (p != null) return { value: p, suffix: 'on your other profiles', who: 'your other profiles' };
  return null;
}

/** The weakest round type (3+ decided) when it passes 15+ points under the overall rate, with the best type named. */
function weakestRound(rounds: RoundsSummary): string | null {
  if (rounds.passRate == null) return null;
  const decided = ROUND_NAMES
    .map(([key, name]) => ({ name, s: rounds.byType[key] }))
    .filter(({ s }) => s && s.passRate != null && s.passed + s.rejected >= MIN_DECIDED_PER_TYPE)
    .map(({ name, s }) => ({ name, rate: s.passRate as number }));
  if (decided.length === 0) return null;
  const weakest = decided.reduce((w, d) => (d.rate < w.rate ? d : w));
  if (points(rounds.passRate) - points(weakest.rate) < 15) return null;
  const others = decided.filter((d) => d !== weakest);
  const best = others.length ? others.reduce((b, d) => (d.rate > b.rate ? d : b)) : null;
  return `${weakest.name} rounds pass ${pct(weakest.rate)}${best ? ` (${best.name} ${pct(best.rate)})` : ''}`;
}

export function attentionLines(
  rounds: RoundsSummary | undefined,
  compare: ProfileCompare | undefined,
  all: CompareStats | null,
): AttentionLine[] {
  const downs: string[] = [];
  const ups: string[] = [];
  const push = (up: boolean, text: string) => (up ? ups : downs).push(text);

  const weak = rounds ? weakestRound(rounds) : null;
  if (weak) downs.push(weak);

  const me = compare?.this ?? null;
  const peers = compare?.peers ?? null;
  if (me) {
    // Conversion: interviews per bid, 25% off either way.
    if (me.bids >= MIN_BIDS && me.interviewsPerBid != null) {
      const t = target((s) => s.interviewsPerBid, all, peers);
      if (t && t.value > 0) {
        const ratio = me.interviewsPerBid / t.value;
        const text = `${rate1(me.interviewsPerBid)} interviews per bid vs ${rate1(t.value)} ${t.suffix}`;
        if (ratio <= 0.75 + EPS) push(false, text);
        else if (ratio >= 1.25 - EPS) push(true, text);
      }
    }
    // Pass rate: 15 points apart.
    if (me.decided >= MIN_DECIDED && me.passRate != null) {
      const t = target((s) => s.passRate, all, peers);
      if (t) {
        const gap = points(me.passRate) - points(t.value);
        if (Math.abs(gap) >= 15) push(gap > 0, `${pct(me.passRate)} of rounds passed vs ${pct(t.value)} ${t.suffix}`);
      }
    }
    // Tailor score: 5 points apart.
    if (me.tailorScore.n >= MIN_SCORED && me.tailorScore.avg != null) {
      const t = target((s) => s.tailorScore.avg, all, peers);
      if (t) {
        const mine = Math.round(me.tailorScore.avg);
        const theirs = Math.round(t.value);
        if (Math.abs(mine - theirs) >= 5) {
          push(mine > theirs, `Tailor score ${mine}, ${mine > theirs ? 'above' : 'below'} ${t.who} (${theirs})`);
        }
      }
    }
    // Bid volume: half the owner's other profiles or less (owners run different numbers of bidders, so never "all").
    if (peers?.bidsPerWeek && me.bidsPerWeek != null && me.bidsPerWeek <= 0.5 * peers.bidsPerWeek + EPS) {
      downs.push(`${perWeek(me.bidsPerWeek)} bids / week vs ${perWeek(peers.bidsPerWeek)} on your other profiles`);
    }
  }

  return [
    ...downs.map((text): AttentionLine => ({ dir: 'down', text })),
    ...ups.map((text): AttentionLine => ({ dir: 'up', text })),
  ].slice(0, 3);
}
