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
/** Days in the window before a profile's bid volume is judged (a few days' pace is noise). */
const MIN_DAYS = 7;
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

/** Better ('up'), worse ('down') or not clearly different (null) from a comparison value. */
export type Verdict = 'up' | 'down' | null;

/** Interviews per bid, 25% off either way, once the profile has 30+ bids. */
export function conversionVerdict(me: CompareStats, other: number): Verdict {
  if (me.bids < MIN_BIDS || me.interviewsPerBid == null || !(other > 0)) return null;
  const ratio = me.interviewsPerBid / other;
  if (ratio <= 0.75 + EPS) return 'down';
  return ratio >= 1.25 - EPS ? 'up' : null;
}

/** Pass rate 15+ whole points apart, once 5+ rounds are decided. */
export function passVerdict(me: CompareStats, other: number): Verdict {
  if (me.decided < MIN_DECIDED || me.passRate == null) return null;
  const gap = points(me.passRate) - points(other);
  if (Math.abs(gap) < 15) return null;
  return gap > 0 ? 'up' : 'down';
}

/** Tailor score 5+ whole points apart, once 5+ resumes are scored. */
export function tailorVerdict(me: CompareStats, other: number): Verdict {
  if (me.tailorScore.n < MIN_SCORED || me.tailorScore.avg == null) return null;
  const gap = Math.round(me.tailorScore.avg) - Math.round(other);
  if (Math.abs(gap) < 5) return null;
  return gap > 0 ? 'up' : 'down';
}

export function attentionLines(
  rounds: RoundsSummary | undefined,
  compare: ProfileCompare | undefined,
  all: CompareStats | null,
): AttentionLine[] {
  // A range that ends before the launch day has no compared window: nothing in it is comparable, so no verdict.
  if (compare && !compare.this) return [];
  const downs: string[] = [];
  const ups: string[] = [];
  const push = (up: boolean, text: string) => (up ? ups : downs).push(text);

  const weak = rounds ? weakestRound(rounds) : null;
  if (weak) downs.push(weak);

  const me = compare?.this ?? null;
  const peers = compare?.peers ?? null;
  if (me) {
    const conversion = target((s) => s.interviewsPerBid, all, peers);
    const conversionDir = conversion ? conversionVerdict(me, conversion.value) : null;
    if (conversion && conversionDir && me.interviewsPerBid != null) {
      push(conversionDir === 'up',
        `${rate1(me.interviewsPerBid)} interviews per bid vs ${rate1(conversion.value)} ${conversion.suffix}`);
    }
    const pass = target((s) => s.passRate, all, peers);
    const passDir = pass ? passVerdict(me, pass.value) : null;
    if (pass && passDir && me.passRate != null) {
      push(passDir === 'up', `${pct(me.passRate)} of rounds passed vs ${pct(pass.value)} ${pass.suffix}`);
    }
    const tailor = target((s) => s.tailorScore.avg, all, peers);
    const tailorDir = tailor ? tailorVerdict(me, tailor.value) : null;
    if (tailor && tailorDir && me.tailorScore.avg != null) {
      const mine = Math.round(me.tailorScore.avg);
      const theirs = Math.round(tailor.value);
      push(tailorDir === 'up', `Tailor score ${mine}, ${tailorDir === 'up' ? 'above' : 'below'} ${tailor.who} (${theirs})`);
    }
    // Bid volume: half the owner's other profiles or less (owners run different numbers of bidders, so never "all").
    if (me.days >= MIN_DAYS && peers?.bidsPerWeek && me.bidsPerWeek != null && me.bidsPerWeek <= 0.5 * peers.bidsPerWeek + EPS) {
      downs.push(`${perWeek(me.bidsPerWeek)} bids / week vs ${perWeek(peers.bidsPerWeek)} on your other profiles`);
    }
  }

  return [
    ...downs.map((text): AttentionLine => ({ dir: 'down', text })),
    ...ups.map((text): AttentionLine => ({ dir: 'up', text })),
  ].slice(0, 3);
}
