import type { ReactNode } from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import * as api from '../../api/endpoints';
import type { AttentionLine } from '../../lib/profileAttention';
import { fmtCount, fmtPerWeek, fmtRate, fmtScore } from '../../lib/profileMetrics';

/** The benchmark ("All profiles") as the parts see it: still loading, failed (left out) or loaded. */
export type Bench = { loading: boolean; data: api.MetricsBenchmark | null };

export const ROUND_LABELS: Record<api.RoundType, string> = {
  intro: 'Intro', tech: 'Tech', hiring: 'Hiring', panel: 'Panel', final: 'Final', home_assessment: 'Home assessment',
};

const scoreText = (n: number | null | undefined) => (n == null ? '—' : fmtScore({ avg: n, n: 0 }));

export function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="mb-1 text-xs font-medium text-muted">{title}</div>
      {children}
    </div>
  );
}

export const big = (text: string, muted = false) => (
  <div className={`text-lg font-semibold tabular-nums ${muted ? 'text-muted' : 'text-strong'}`}>{text}</div>
);

export const sub = (text: string) => <div className="text-[11px] text-muted">{text}</div>;

/** `Yours X · All Y` under a card, with ▲ / ▼ against `cueAgainst` (All when loaded, else Yours; Bids: Yours only).
 * Parts with no value are left out; All shows a skeleton while it loads. */
export function CompareLine({ mine, yours, all, bench, fmt, cueAgainst = 'all' }: {
  mine: number | null | undefined;
  yours: number | null | undefined;
  all: number | null | undefined;
  bench: Bench;
  fmt: (n: number) => string;
  cueAgainst?: 'all' | 'yours';
}) {
  const against = cueAgainst === 'all' && all != null ? all : yours;
  const Icon = mine == null || against == null ? null : mine > against ? TrendingUp : mine < against ? TrendingDown : null;
  const parts: ReactNode[] = [];
  if (yours != null) parts.push(<span key="y">Yours {fmt(yours)}</span>);
  if (bench.loading) parts.push(<span key="a" className="skeleton inline-block h-3 w-12 align-middle" aria-label="Loading all profiles" />);
  else if (all != null) parts.push(<span key="a">All {fmt(all)}</span>);
  if (parts.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-muted">
      {Icon && <Icon className="h-3 w-3 shrink-0" aria-hidden />}
      {parts.flatMap((p, i) => (i ? [<span key={`s${i}`} aria-hidden>·</span>, p] : [p]))}
    </div>
  );
}

/** Up to three lines on what stands out; nothing when none apply. */
export function AttentionList({ lines }: { lines: AttentionLine[] }) {
  if (lines.length === 0) return null;
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900/60 dark:bg-amber-950/20">
      <h3 className="form-label mb-1.5">Needs attention</h3>
      <ul className="space-y-1 text-sm" role="list">
        {lines.map((l) => {
          const Icon = l.dir === 'up' ? TrendingUp : TrendingDown;
          return (
            <li key={l.text} className="flex items-start gap-2">
              <Icon
                className={`mt-0.5 h-4 w-4 shrink-0 ${l.dir === 'up' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}
                aria-label={l.dir === 'up' ? 'Above' : 'Below'}
              />
              <span>{l.text}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Done (by who took them) / passed / rejected / pass rate per round type; home assessments below a divider. */
export function RoundsTable({ rounds, range, color }: { rounds: api.RoundsSummary; range: string; color: string }) {
  const notes = [
    rounds.awaiting > 0 && `${fmtCount(rounds.awaiting)} held with no result yet`,
    rounds.scheduled > 0 && `${fmtCount(rounds.scheduled)} still scheduled`,
  ].filter(Boolean);
  const th = 'px-3 py-1.5 text-right font-medium';
  return (
    <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <h3 className="form-label mb-2">Rounds <span className="font-normal text-muted">· {range}</span></h3>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-xs text-muted">
              <th className="py-1.5 pr-3 text-left font-medium">Round</th>
              <th className={th}>Done</th>
              <th className={th}>Self</th>
              <th className={th}>Caller</th>
              <th className={th}>Passed</th>
              <th className={th}>Rejected</th>
              <th className="py-1.5 pl-3 text-left font-medium">Pass rate</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {api.ROUND_TYPES.map((t) => {
              const s = rounds.byType[t];
              const none = s.done === 0;
              const home = t === 'home_assessment';
              const who = (n: number | undefined) => (home || n == null || none ? '–' : fmtCount(n));
              return (
                <tr key={t} className={home ? 'border-t border-zinc-200 dark:border-zinc-700' : ''}>
                  <td className="py-1.5 pr-3 whitespace-nowrap">{ROUND_LABELS[t]}</td>
                  <td className="px-3 py-1.5 text-right">{fmtCount(s.done)}</td>
                  <td className="px-3 py-1.5 text-right">{who(s.self)}</td>
                  <td className="px-3 py-1.5 text-right">{who(s.caller)}</td>
                  <td className="px-3 py-1.5 text-right">{none ? '–' : fmtCount(s.passed)}</td>
                  <td className="px-3 py-1.5 text-right">{none ? '–' : fmtCount(s.rejected)}</td>
                  <td className="py-1.5 pl-3">
                    {s.passRate == null ? <span className="text-muted">—</span> : (
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700" aria-hidden>
                          <div className="h-full rounded-full" style={{ width: `${s.passRate * 100}%`, background: color }} />
                        </div>
                        <span>{fmtRate(s.passRate)}</span>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {notes.length > 0 && <p className="mt-2 text-xs text-muted">{notes.join(' · ')}</p>}
    </div>
  );
}

const COMPARE_ROWS: { label: string; get: (s: api.CompareStats) => number | null; fmt: (n: number | null) => string }[] = [
  { label: 'Bids / week', get: (s) => s.bidsPerWeek, fmt: fmtPerWeek },
  { label: 'Interviews / week', get: (s) => s.interviewsPerWeek, fmt: fmtPerWeek },
  { label: 'Interviews / bid', get: (s) => s.interviewsPerBid, fmt: fmtRate },
  { label: 'Pass rate', get: (s) => s.passRate, fmt: fmtRate },
  { label: 'Tailor score', get: (s) => s.tailorScore.avg, fmt: scoreText },
  { label: 'Tailored resumes / week', get: (s) => s.tailoredResumesPerWeek, fmt: fmtPerWeek },
  { label: 'Match score', get: (s) => s.matchScore.avg, fmt: scoreText },
];

/** This profile next to the owner's other profiles (when there are any) and every owner's profiles. */
export function CompareTable({ compare, bench, range }: { compare: api.ProfileCompare; bench: Bench; range: string }) {
  const me = compare.this;
  if (!me) return null;
  const peers = compare.peers;
  const allCell = (get: (s: api.CompareStats) => number | null, fmt: (n: number | null) => string) => {
    if (bench.loading) return <div className="skeleton ml-auto h-4 w-10" aria-label="Loading" />;
    return bench.data && bench.data.profiles > 0 ? fmt(get(bench.data)) : '—';
  };
  const n = (s: api.CompareStats | null) => (s ? ` (${fmtCount(s.profiles)})` : '');
  return (
    <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <h3 className="form-label mb-2">How it compares <span className="font-normal text-muted">· {range}</span></h3>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-xs text-muted">
              <th className="py-1.5 pr-3 text-left font-medium" aria-label="Measure" />
              <th className="px-3 py-1.5 text-right font-medium">This profile</th>
              {peers && <th className="px-3 py-1.5 text-right font-medium">Your other profiles{n(peers)}</th>}
              <th className="py-1.5 pl-3 text-right font-medium">
                All profiles{bench.data && !bench.loading ? n(bench.data) : ''}
              </th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {COMPARE_ROWS.map((r) => (
              <tr key={r.label} className="border-t border-zinc-100 dark:border-zinc-800">
                <td className="py-1.5 pr-3 whitespace-nowrap">{r.label}</td>
                <td className="px-3 py-1.5 text-right font-medium text-strong">{r.fmt(r.get(me))}</td>
                {peers && <td className="px-3 py-1.5 text-right">{r.fmt(r.get(peers))}</td>}
                <td className="py-1.5 pl-3 text-right">{allCell(r.get, r.fmt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">
        Per week over the weeks each profile existed; averages include only profiles with bids. Rates and scores are
        pooled over all their bids, rounds and resumes.
      </p>
    </div>
  );
}
