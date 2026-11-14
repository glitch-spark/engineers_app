// Profiles list helpers: who applied, the "your profiles vs all profiles" band, the ▲/▼ on rows and the Setup column
// (spec 2026-11-14-profiles-list-compare-design.md). Value imports carry `.ts`, so Node's test runner loads this
// file as is (tests/profileList.test.mjs).
import type {
  BenchRegionTops, CompareStats, ProfileAlert, ProfileAlerts, RegionTops, ResumePrompt, SetupUnit, TopRegion,
} from '../api/endpoints';
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

/** The band's heading: every listed profile of the owner, the days compared, and which profiles the averages use
 *  (only those with bids, on both sides). */
export function bandHeading(o: {
  whose: 'Your' | 'These'; total: number; withBids: number; allWithBids: number; rangeLabel: string; from: string; to: string;
}): { title: string; dates: string; note: string } {
  const days = o.from === o.to ? shortDay(o.from) : `${shortDay(o.from)} – ${shortDay(o.to)}`;
  return {
    title: `${o.whose} ${plural(o.total, 'profile', 'profiles')} vs the platform average`,
    dates: o.rangeLabel ? `${o.rangeLabel} · ${days}` : days,
    note: `Averages count only profiles with bids: ${count(o.withBids)} of ${o.whose === 'Your' ? 'yours' : 'these'}, `
      + `${count(o.allWithBids)} on the platform (${o.whose === 'Your' ? 'yours' : 'these'} included).`,
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

const MIN_FLAG_BIDS = 30;

/** The red banner's suggestion for a profile with no interview in 2 weeks: the first rule that matches (spec
 *  2026-11-14-profiles-flags-and-top-design.md). `setupWarnings`: the Setup column's, [] when the account isn't loaded;
 *  `allTailorScore`: the platform's 2-week tailor average, null while the server warms it up. */
export function flagSuggestion(a: ProfileAlert, allTailorScore: number | null, setupWarnings: string[]): string {
  if (a.bids < MIN_FLAG_BIDS) return 'Too few bids to get interviews: add bids or a bidder.';
  if (setupWarnings.length) return `Fix the setup: ${setupWarnings[0]}.`;
  if (a.tailored === 0) return 'Set up tailoring so resumes match each job.';
  const mine = a.tailorScore.avg;
  if (mine != null && allTailorScore != null && Math.round(mine * 10) <= Math.round((allTailorScore - 5) * 10)) {
    return `Resume score ${score(mine)} is below the platform average ${score(allTailorScore)}: update the tailoring prompt or template.`;
  }
  return "Bids aren't turning into interviews: update the resume and check the target roles.";
}

/** The red banner's numbers for a flagged profile: `379 bids · resume score 64 (platform average 71)`. */
export function flagNumbers(a: ProfileAlert, allTailorScore: number | null): string {
  const parts = [`${count(a.bids)} ${a.bids === 1 ? 'bid' : 'bids'}`];
  if (a.tailored === 0) parts.push('no tailored resumes');
  else if (a.tailorScore.avg != null) {
    parts.push(`resume score ${score(a.tailorScore.avg)}${allTailorScore != null ? ` (platform average ${score(allTailorScore)})` : ''}`);
  }
  return parts.join(' · ');
}

const REGION_ORDER: [TopRegion, string][] = [['US', 'US'], ['EU', 'EU'], ['Latam', 'LATAM']];

export type RegionTopLine = {
  region: TopRegion; label: string;
  most: { accountId: string; name: string; text: string } | null; mostAll: string;
  best: { accountId: string; name: string; text: string } | null; bestAll: string;
};

/** `Best on the platform: Eric (User A) – 9`; `yours` when the owner's number is at least the top (the top is cached
 *  for minutes, the owner's numbers are live); '' when unknown. */
const vsAll = (mine: number | null | undefined, top: { name: string; ownerName: string } | null | undefined,
  value: number | undefined, fmt: (n: number) => string) => {
  if (!top || value == null) return '';
  if (mine != null && mine >= value) return 'Best on the platform: yours';
  return `Best on the platform: ${top.name || 'Unnamed'}${top.ownerName ? ` (${top.ownerName})` : ''} – ${fmt(value)}`;
};

/** The card's top profiles: one line per region the owner has profiles in (US, EU, LATAM), each side next to the top
 *  single profile in the platform there (any user). */
export function regionTopLines(mine: RegionTops, all: BenchRegionTops | undefined): RegionTopLine[] {
  return REGION_ORDER.filter(([r]) => mine[r]).map(([r, label]) => {
    const m = mine[r]!;
    const a = all?.[r];
    return {
      region: r, label,
      most: m.mostInterviews && { accountId: m.mostInterviews.accountId, name: m.mostInterviews.name,
        text: count(m.mostInterviews.interviews) },
      mostAll: vsAll(m.mostInterviews?.interviews, a?.mostInterviews, a?.mostInterviews?.interviews, count),
      best: m.bestRate && { accountId: m.bestRate.accountId, name: m.bestRate.name, text: fmtListRate(m.bestRate.interviewsPerBid) },
      bestAll: vsAll(m.bestRate?.interviewsPerBid, a?.bestRate, a?.bestRate?.interviewsPerBid, fmtListRate),
    };
  });
}

type Kept = { owner: string; alerts: ProfileAlerts | null };

/** The banners to show: the fresh ones once the metrics loaded (`fresh` null = none for this list), else the last ones
 *  while the same owner's next date range loads (the banners ignore the date filter), never another owner's. */
export function keptAlerts(prev: Kept | null, owner: string, fresh: ProfileAlerts | null | undefined): Kept | null {
  if (fresh !== undefined) return { owner, alerts: fresh };
  return prev && prev.owner === owner ? prev : null;
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
    text = `${value} · platform average ${fmtListRate(all.interviewsPerBid)}`;
  } else if (kind === 'pass' && all.passRate != null && compare.passRate != null) {
    dir = passVerdict(compare, all.passRate);
    value = pct(compare.passRate);
    text = `${value} · platform average ${pct(all.passRate)}`;
  } else if (kind === 'tailor' && all.tailorScore.avg != null && compare.tailorScore.avg != null) {
    dir = tailorVerdict(compare, all.tailorScore.avg);
    value = score(compare.tailorScore.avg);
    text = `tailor score ${value} · platform average ${score(all.tailorScore.avg)}`;
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
