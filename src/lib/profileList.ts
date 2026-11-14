// Profiles list helpers: who applied, the "your profiles vs all profiles" band, the ▲/▼ on rows and the Setup column
// (spec 2026-11-14-profiles-list-compare-design.md). Value imports carry `.ts`, so Node's test runner loads this
// file as is (tests/profileList.test.mjs).
import type { CompareStats, ProfileMetricsRow, ResumePrompt, SetupUnit } from '../api/endpoints';
import { conversionVerdict, passVerdict, tailorVerdict, type Verdict } from './profileAttention.ts';
import { setupStrip, tailoringSetUp } from './profileSetup.ts';

type AppliedByCounts = {
  selfAppliedInterviews?: number | null;
  bidderAppliedInterviews?: number | null;
  unsetAppliedInterviews?: number | null;
};

const count = (n: number | null | undefined) => (n ?? 0).toLocaleString('en-US');

/** The Interviews column's second line: who applied for the job (`2 self · 1 bidder`), plus `· N not set` only when
 *  some interviews have no "Applied by"; null with no interviews (nothing to split). */
export function interviewsAppliedBy(m: AppliedByCounts): string | null {
  if (!(m.selfAppliedInterviews ?? 0) && !(m.bidderAppliedInterviews ?? 0) && !(m.unsetAppliedInterviews ?? 0)) return null;
  const parts = [`${count(m.selfAppliedInterviews)} self`, `${count(m.bidderAppliedInterviews)} bidder`];
  if ((m.unsetAppliedInterviews ?? 0) > 0) parts.push(`${count(m.unsetAppliedInterviews)} not set`);
  return parts.join(' · ');
}

const joinParts = (parts: [string, number | null | undefined][]) => {
  const kept = parts.filter(([, n]) => (n ?? 0) > 0).map(([name, n]) => `${name}: ${count(n)}`);
  return kept.length ? kept.join(', ') : null;
};

/** The Bids column's second line: `Self: 10, Bo: 1, Kim: 3` (each bidder by name), zeros left out; null with no bids.
 *  An older server sends no names: `Self: 5, Bidders: 7`. */
export function bidsBreakdown(m: {
  selfBids: number; bidderBids: number; bidderBidsBy?: { name: string; bids: number }[];
}): string | null {
  return joinParts([
    ['Self', m.selfBids],
    ...(m.bidderBidsBy ? m.bidderBidsBy.map((b): [string, number] => [b.name, b.bids]) : [['Bidders', m.bidderBids] as [string, number]]),
  ]);
}

/** The Interviews column's second line: who took the rounds, `Self: 5, Kim: 4, Bo: 5` (each caller by name), zeros
 *  left out; null with no interviews. An older server sends no names: `Self: 1, Callers: 2`. */
export function interviewsBreakdown(m: {
  selfInterviews: number; callerInterviews: number; callerInterviewsBy?: { name: string; interviews: number }[];
}): string | null {
  return joinParts([
    ['Self', m.selfInterviews],
    ...(m.callerInterviewsBy
      ? m.callerInterviewsBy.map((c): [string, number] => [c.name, c.interviews])
      : [['Callers', m.callerInterviews] as [string, number]]),
  ]);
}

/** Interviews per bid on the list: two decimals under 1% (`0.62%`; most profiles sit there), else one (`1.1%`). */
export function fmtListRate(x: number): string {
  const pct = x * 100;
  return `${pct < 1 ? pct.toFixed(2) : pct.toFixed(1)}%`;
}

const DASH = '—';
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const perWeek = (x: number | null) => (x == null ? DASH : x < 10 ? x.toFixed(1).replace(/\.0$/, '') : String(Math.round(x)));
const pct = (x: number | null) => (x == null ? DASH : `${Math.round(x * 100)}%`);
const score = (x: number | null) => (x == null ? DASH : String(Math.round(x)));
const rate = (x: number | null) => (x == null ? DASH : fmtListRate(x));

export type BandCell = {
  key: 'bids' | 'rate' | 'pass' | 'tailor'; label: string; mine: string; all: string; note: string | null; dir: Verdict;
};

/** The band's four cells, mine vs all profiles. No verdict on bids / week: owners run different numbers of bidders. */
export function bandCells(mine: CompareStats, all: CompareStats): BandCell[] {
  const passed = mine.passRate == null ? 0 : Math.round(mine.passRate * mine.decided);
  return [
    { key: 'bids', label: 'Bids per profile, per week', mine: perWeek(mine.bidsPerWeek), all: perWeek(all.bidsPerWeek), note: null, dir: null },
    {
      key: 'rate', label: 'Bids that led to an interview', mine: rate(mine.interviewsPerBid), all: rate(all.interviewsPerBid), note: null,
      dir: all.interviewsPerBid == null ? null : conversionVerdict(mine, all.interviewsPerBid),
    },
    {
      key: 'pass', label: 'Interview rounds passed', mine: pct(mine.passRate), all: pct(all.passRate),
      note: mine.decided ? `${count(passed)} of ${count(mine.decided)} rounds` : 'no results yet',
      dir: all.passRate == null ? null : passVerdict(mine, all.passRate),
    },
    {
      key: 'tailor', label: 'Avg tailored resume score', mine: score(mine.tailorScore.avg), all: score(all.tailorScore.avg),
      note: mine.tailorScore.n ? `from ${count(mine.tailorScore.n)} resumes` : 'no scored resumes',
      dir: all.tailorScore.avg == null ? null : tailorVerdict(mine, all.tailorScore.avg),
    },
  ];
}

const MIN_BIDS = 30;
type Ranked = { accountId: string; name: string; interviewsPerBid: number };

/** The owner's best and worst interviews per bid over the compared window, among profiles with 30+ bids; null with
 *  fewer than two such profiles or when they all convert alike. */
export function strongestWeakest(
  rows: Pick<ProfileMetricsRow, 'accountId' | 'name' | 'compare'>[],
): { strongest: Ranked; weakest: Ranked } | null {
  const ranked: Ranked[] = rows
    .filter((r) => r.compare && r.compare.bids >= MIN_BIDS && r.compare.interviewsPerBid != null)
    .map((r) => ({ accountId: r.accountId, name: r.name ?? '', interviewsPerBid: r.compare!.interviewsPerBid as number }));
  if (ranked.length < 2) return null;
  const strongest = ranked.reduce((b, r) => (r.interviewsPerBid > b.interviewsPerBid ? r : b));
  const weakest = ranked.reduce((w, r) => (r.interviewsPerBid < w.interviewsPerBid ? r : w));
  return strongest.interviewsPerBid === weakest.interviewsPerBid ? null : { strongest, weakest };
}

/** The band's heading: every listed profile of the owner, the days compared, and which profiles the averages use
 *  (only those with bids, on both sides). */
export function bandHeading(o: {
  whose: 'Your' | 'These'; total: number; withBids: number; allWithBids: number; rangeLabel: string; from: string; to: string;
}): { title: string; dates: string; note: string } {
  const days = o.from === o.to ? shortDay(o.from) : `${shortDay(o.from)} – ${shortDay(o.to)}`;
  return {
    title: `${o.whose} ${plural(o.total, 'profile', 'profiles')} vs the average of all users' profiles`,
    dates: o.rangeLabel ? `${o.rangeLabel} · ${days}` : days,
    note: `Averages count only profiles with bids: ${count(o.withBids)} of ${o.whose === 'Your' ? 'yours' : 'these'}, `
      + `${count(o.allWithBids)} across all users (${o.whose === 'Your' ? 'yours' : 'these'} included).`,
  };
}

/** Interview rate's second line: `3 of 182 bids`. */
export const rateDetail = (interviews: number, bids: number) => `${count(interviews)} of ${count(bids)} bids`;

/** Rounds passed's second line: `0 of 1 passed`; `no results yet` when the profile has interviews but no round has a
 *  result; null otherwise. */
export function passDetail(
  rounds: { decided: number; passed: number } | null | undefined, interviews: number,
): string | null {
  if (!rounds) return null;
  if (rounds.decided) return `${count(rounds.passed)} of ${count(rounds.decided)} passed`;
  return interviews > 0 ? 'no results yet' : null;
}

/** The list and the benchmark measured the same days: only then do the row arrows and the band compare them. */
export function windowsMatch(
  list: { comparedFrom?: string | null; comparedTo?: string | null },
  bench: { comparedFrom: string | null; end: string } | undefined,
): boolean {
  return !!bench && !!list.comparedFrom && !!list.comparedTo
    && list.comparedFrom === bench.comparedFrom && list.comparedTo === bench.end;
}

/** `Nov 5` for an ISO day, read as UTC so it never shifts with the viewer's time zone. */
export const shortDay = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** ▲ / ▼ on a row's Intv/bid, Pass rate or Resume score against all profiles, by the Metrics tab's rules; null when
 *  not clearly different or nothing to compare. */
export function rowArrow(
  kind: 'rate' | 'pass' | 'tailor', compare: CompareStats | null | undefined, all: CompareStats | null, comparedFrom: string,
): { dir: 'up' | 'down'; title: string; value: string } | null {
  if (!compare || !all) return null;
  let dir: Verdict = null;
  let value = '';
  let text = '';
  if (kind === 'rate' && all.interviewsPerBid != null && compare.interviewsPerBid != null) {
    dir = conversionVerdict(compare, all.interviewsPerBid);
    value = fmtListRate(compare.interviewsPerBid);
    text = `${value} · all users' average ${fmtListRate(all.interviewsPerBid)}`;
  } else if (kind === 'pass' && all.passRate != null && compare.passRate != null) {
    dir = passVerdict(compare, all.passRate);
    value = pct(compare.passRate);
    text = `${value} · all users' average ${pct(all.passRate)}`;
  } else if (kind === 'tailor' && all.tailorScore.avg != null && compare.tailorScore.avg != null) {
    dir = tailorVerdict(compare, all.tailorScore.avg);
    value = score(compare.tailorScore.avg);
    text = `tailor score ${value} · all users' average ${score(all.tailorScore.avg)}`;
  }
  return dir ? { dir, value, title: `Since ${shortDay(comparedFrom)}: ${text}` } : null;
}

/** The compared window's first day when it starts after the range's (All time: always), so the page labels the
 *  compared numbers apart from the range's; null when both cover the same days or nothing was compared. */
export function sinceDay(rangeFrom: string | null, comparedFrom: string | null | undefined): string | null {
  if (!comparedFrom) return null;
  return !rangeFrom || comparedFrom > rangeFrom ? comparedFrom : null;
}

/** The Setup column: fixed resumes and tailoring units (only when tailoring is set up), with the Profile tab's
 *  warnings. An older server sends no `setupUnits`: units are counted, nothing is judged. */
export function setupText(acc: {
  resumes?: unknown[] | null; resumePrompts?: unknown[] | null; setupUnits?: SetupUnit[]; setupDefaultId?: string | null;
}): { text: string; warnings: string[] } {
  const parts: string[] = [];
  const fixed = acc.resumes?.length ?? 0;
  if (fixed) parts.push(`${fixed} fixed`);
  let warnings: string[] = [];
  if (acc.setupUnits) {
    const prompts = acc.setupUnits.map((u): ResumePrompt => ({
      id: u.id, name: u.name, roles: u.roles, body: u.hasPrompt ? 'x' : '', templateHtml: u.hasTemplate ? 'x' : '',
    }) as ResumePrompt);
    if (prompts.length && tailoringSetUp(prompts)) {
      parts.push(plural(prompts.length, 'unit', 'units'));
      const defaultId = prompts.some((p) => p.id === acc.setupDefaultId) ? (acc.setupDefaultId as string) : prompts[0].id;
      warnings = setupStrip({}, { prompts, defaultId, screeningPrompt: '', coverLetterPrompt: '' }).warnings;
    }
  } else if (acc.resumePrompts?.length) {
    parts.push(plural(acc.resumePrompts.length, 'unit', 'units'));
  }
  return { text: parts.length ? parts.join(' · ') : DASH, warnings };
}
