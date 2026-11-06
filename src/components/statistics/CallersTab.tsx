import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { FileDown } from 'lucide-react';
import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import * as api from '../../api/endpoints';
import type { CallerRoundGroup, CallerStats, CallerStatsCaller, CallerStatsRound, CallerStatsTotals } from '../../api/endpoints';
import { CALLER_DOT } from '../../lib/callerColors';
import { notify } from '../../lib/notify';
import { exportCallerStatsPdf } from '../../lib/callerStatsPdf';
import { interviewStatusBadgeClass, stageLabel } from '../../lib/stageBadge';
import { useChartTheme } from '../../theme/useChartTheme';
import { FilterBar, REGIONS, Segmented, filterParams, filtersError, type StatsFilters } from './controls';
import { StatTiles, pct } from './rateShared';

type Sort = 'date' | 'company';
const SORTS: { value: Sort; label: string }[] = [
  { value: 'date', label: 'Date' },
  { value: 'company', label: 'Company' },
];

const GROUPS: { key: CallerRoundGroup; label: string }[] = [
  { key: 'intro', label: 'Intro' }, { key: 'tech', label: 'Tech' }, { key: 'hiring', label: 'Hiring' },
  { key: 'panel', label: 'Panel' }, { key: 'final', label: 'Final' },
];

const RESULT_LABEL: Record<CallerStatsRound['result'], string> = {
  passed: 'Passed', rejected: 'Rejected', canceled: 'Canceled', awaiting: 'Awaiting result', scheduled: 'Scheduled',
};

const ALL = 'all';
const keyOf = (c: { callerId: string | null }) => c.callerId ?? 'unassigned';

/** "+8.6 pts" / "−21.4 pts" (fractions in, percentage points out). */
function points(v: number | null): string {
  if (v == null) return '—';
  const n = Math.round(v * 1000) / 10;
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(1)} pts`;
}

function day(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function sorted(rounds: CallerStatsRound[], sort: Sort): CallerStatsRound[] {
  const byDate = (a: CallerStatsRound, b: CallerStatsRound) => a.roundDate.localeCompare(b.roundDate);
  return [...rounds].sort(sort === 'date'
    ? byDate
    : (a, b) => a.company.localeCompare(b.company, undefined, { sensitivity: 'base' }) || byDate(a, b));
}

/** The All callers row: every caller round, as one caller. */
function allRow(team: CallerStatsTotals): CallerStatsCaller {
  return { ...team, callerId: ALL, name: 'All callers', color: null, ranked: false, vsTeam: null };
}

/**
 * Statistics → Callers: how many interviews each caller did and how often they pass. Compared across callers, by
 * round type (with self-taken rounds for reference), week by week, and the rounds held behind the numbers.
 */
export default function CallersTab({ filters, onFilters }: { filters: StatsFilters; onFilters: (f: StatsFilters) => void }) {
  const params = filterParams(filters);
  const { data, error, isLoading } = useSWR(
    filtersError(filters) ? null : ['caller-stats', params.region, params.period, params.date, params.to],
    () => api.getCallerStats(params),
    { keepPreviousData: true },
  );
  const [picked, setPicked] = useState<string>(ALL);

  return (
    <div className="space-y-4">
      <FilterBar value={filters} onChange={onFilters}>
        {isLoading && data && <span className="spinner spinner-sm" role="status" aria-label="Loading" />}
      </FilterBar>
      <p className="text-xs text-muted">
        Interviews done = rounds held: passed, rejected or awaiting their result (canceled rounds aren’t counted). Pass
        rate = passed ÷ (passed + rejected); a caller is ranked from 5 decided rounds. A region shows its profiles’ interviews.
      </p>
      {error ? (
        <p className="panel p-6 text-sm text-red-700 dark:text-red-400">Couldn’t load the callers. Try again.</p>
      ) : !data ? (
        <p className="panel flex items-center gap-2 p-6 text-sm text-muted" role="status">
          <span className="spinner spinner-sm" aria-hidden /> Loading…
        </p>
      ) : (
        <CallersView data={data} picked={picked} onPick={setPicked} />
      )}
    </div>
  );
}

function CallersView({ data, picked, onPick }: { data: CallerStats; picked: string; onPick: (key: string) => void }) {
  const all = useMemo(() => allRow(data.team), [data]);
  const active = data.callers.filter((c) => c.done + c.counts.canceled > 0);
  const current = active.find((c) => keyOf(c) === picked) ?? all;
  const isAll = current === all;

  return (
    <>
      <StatTiles tiles={[
        { label: 'Interviews done', value: data.team.done.toLocaleString() },
        { label: 'Caller pass rate', value: pct(data.team.passRate) },
        { label: 'Self pass rate', value: pct(data.self.passRate) },
        { label: 'Awaiting result', value: data.team.counts.awaiting.toLocaleString() },
      ]} />
      {data.team.done + data.team.counts.canceled === 0 ? (
        <p className="panel p-6 text-center text-sm text-muted">No caller rounds in this period.</p>
      ) : (
        <>
          <CallersTable all={all} callers={active} picked={isAll ? ALL : keyOf(current)} onPick={onPick} />
          <TypeGrid callers={active.filter((c) => c.done > 0)} team={data.team} self={data.self} />
          <CallerTrend data={data} caller={current} isAll={isAll} />
          <RoundsHeld data={data} caller={current} isAll={isAll} callers={active} />
        </>
      )}
    </>
  );
}

type TableKey = 'name' | 'done' | 'passRate' | 'vsTeam' | 'passed' | 'rejected' | 'awaiting' | 'canceled';

function value(c: CallerStatsCaller, key: TableKey): number | string {
  if (key === 'name') return c.name.toLowerCase();
  if (key === 'done') return c.done;
  if (key === 'passRate') return c.passRate ?? -1;
  if (key === 'vsTeam') return c.vsTeam ?? -Infinity;
  return c.counts[key];
}

function CallersTable({ all, callers, picked, onPick }: {
  all: CallerStatsCaller; callers: CallerStatsCaller[]; picked: string; onPick: (key: string) => void;
}) {
  const [sort, setSort] = useState<{ key: TableKey | 'default'; desc: boolean }>({ key: 'default', desc: true });
  const rows = useMemo(() => [...callers].sort((a, b) => {
    if (sort.key === 'default') {  // ranked first, then pass rate, then interviews done
      return Number(b.ranked) - Number(a.ranked) || (b.passRate ?? -1) - (a.passRate ?? -1) || b.done - a.done;
    }
    const x = value(a, sort.key), y = value(b, sort.key);
    const cmp = x < y ? -1 : x > y ? 1 : 0;
    return sort.desc ? -cmp : cmp;
  }), [callers, sort]);
  const best = Math.max(0, ...callers.filter((c) => c.ranked).map((c) => c.passRate ?? 0));

  const header = (key: TableKey, label: string, align = 'text-right') => {
    const on = sort.key === key;
    return (
      <th scope="col" className={`whitespace-nowrap px-3 py-2.5 ${align}`} aria-sort={on ? (sort.desc ? 'descending' : 'ascending') : undefined}>
        <button type="button" className="inline-flex items-center gap-1 font-medium uppercase hover:text-strong"
          onClick={() => setSort({ key, desc: on ? !sort.desc : key !== 'name' })}>
          {label}
          {on && <span aria-hidden className="text-[10px] text-muted">{sort.desc ? '▼' : '▲'}</span>}
        </button>
      </th>
    );
  };

  const row = (c: CallerStatsCaller, isAllRow: boolean) => {
    const key = isAllRow ? ALL : keyOf(c);
    const on = picked === key;
    const faded = !isAllRow && !c.ranked;
    return (
      <tr key={key} className={`cursor-pointer ${on ? 'bg-sky-50 dark:bg-sky-950/30' : 'table-row'} ${isAllRow ? 'font-medium' : ''}`}
        onClick={() => onPick(key)}>
        <td className="px-3 py-2.5 text-left">
          <button type="button" aria-pressed={on} className="flex items-center gap-2 text-left font-medium text-strong"
            onClick={(e) => { e.stopPropagation(); onPick(key); }}>
            {!isAllRow && (
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${c.color ? CALLER_DOT[c.color] : 'border border-dashed border-zinc-400'}`} aria-hidden />
            )}
            {c.name}
          </button>
        </td>
        <td className="px-3 py-2.5 text-right font-medium text-strong">{c.done.toLocaleString()}</td>
        <td className="px-3 py-2.5" title={faded ? 'Under 5 decided rounds' : undefined}>
          <span className="flex items-center gap-2">
            <span className={`w-12 text-right ${faded ? 'text-faint' : 'font-medium text-strong'}`}>{pct(c.passRate)}</span>
            {!isAllRow && (
              <span className="h-1.5 w-20 rounded-full bg-zinc-100 dark:bg-zinc-800" aria-hidden>
                <span className="block h-1.5 rounded-full bg-emerald-500"
                  style={{ width: `${best ? Math.min(100, Math.round(((c.passRate ?? 0) / best) * 100)) : 0}%`, opacity: faded ? 0.4 : 1 }} />
              </span>
            )}
          </span>
        </td>
        <td className={`px-3 py-2.5 text-right ${c.vsTeam == null ? 'text-faint' : c.vsTeam >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>
          {isAllRow ? '' : points(c.vsTeam)}
        </td>
        <td className="px-3 py-2.5 text-right">{c.counts.passed}</td>
        <td className="px-3 py-2.5 text-right">{c.counts.rejected}</td>
        <td className="px-3 py-2.5 text-right">{c.counts.awaiting}</td>
        <td className="px-3 py-2.5 text-right text-muted">{c.counts.canceled}</td>
      </tr>
    );
  };

  return (
    <section className="panel overflow-hidden" aria-labelledby="cs-table-title">
      <h2 id="cs-table-title" className="card-title px-4 pt-4">Callers</h2>
      <p className="px-4 pb-3 text-xs text-muted">Click a caller to see their round types, trend and rounds below.</p>
      <div className="table-wrap rounded-none border-0">
        <table className="min-w-full text-sm tabular-nums">
          <caption className="sr-only">Interviews done and pass rate per caller</caption>
          <thead className="table-head">
            <tr>
              {header('name', 'Caller', 'text-left')}
              {header('done', 'Interviews done')}
              {header('passRate', 'Pass rate', 'text-left')}
              {header('vsTeam', 'vs team')}
              {header('passed', 'Passed')}
              {header('rejected', 'Rejected')}
              {header('awaiting', 'Awaiting')}
              {header('canceled', 'Canceled')}
            </tr>
          </thead>
          <tbody>
            {row(all, true)}
            {rows.map((c) => row(c, false))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TypeGrid({ callers, team, self }: { callers: CallerStatsCaller[]; team: CallerStatsTotals; self: CallerStatsTotals }) {
  const lines: { key: string; name: string; t: CallerStatsTotals; strong?: boolean }[] = [
    ...callers.map((c) => ({ key: keyOf(c), name: c.name, t: c as CallerStatsTotals })),
    { key: ALL, name: 'All callers', t: team, strong: true },
    { key: 'self', name: 'Self (no caller)', t: self, strong: true },
  ];
  return (
    <section className="panel overflow-hidden" aria-labelledby="cs-types-title">
      <h2 id="cs-types-title" className="card-title px-4 pt-4">Pass rate by round type</h2>
      <p className="px-4 pb-3 text-xs text-muted">
        Each cell: pass rate · interviews done. The Self row is rounds people took themselves, for comparison.
      </p>
      <div className="table-wrap rounded-none border-0">
        <table className="min-w-full text-sm tabular-nums">
          <caption className="sr-only">Pass rate and interviews done per caller and round type</caption>
          <thead className="table-head">
            <tr>
              <th scope="col" className="px-3 py-2.5 text-left">Caller</th>
              {GROUPS.map((g) => <th key={g.key} scope="col" className="px-3 py-2.5 text-center">{g.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.key} className={`border-t border-zinc-100 dark:border-zinc-800 ${l.strong ? 'font-medium' : ''}`}>
                <th scope="row" className="whitespace-nowrap px-3 py-2 text-left font-medium text-strong">{l.name}</th>
                {GROUPS.map((g) => {
                  const cell = l.t.byType[g.key];
                  return (
                    <td key={g.key} className="px-3 py-2 text-center"
                      style={cell.passRate != null ? { background: `rgba(16, 185, 129, ${(cell.passRate * 0.35).toFixed(3)})` } : undefined}>
                      {cell.done ? `${pct(cell.passRate)} · ${cell.done}` : <span className="text-faint">—</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CallerTrend({ data, caller, isAll }: { data: CallerStats; caller: CallerStatsCaller; isAll: boolean }) {
  const chart = useChartTheme();
  const key = keyOf(caller);
  const rows = data.weekly.buckets.map((b) => {
    const v = isAll ? b.all : b.callers[key] ?? { done: 0, passRate: null };
    return { label: b.label, done: v.done, rate: v.passRate == null ? null : Math.round(v.passRate * 1000) / 10 };
  });
  const team = data.team.passRate == null ? null : Math.round(data.team.passRate * 1000) / 10;
  return (
    <section className="panel p-4" aria-labelledby="cs-trend-title">
      <h2 id="cs-trend-title" className="card-title">{caller.name} · interviews done and pass rate by {data.weekly.unit}</h2>
      <p className="mb-3 text-xs text-muted">Bars: interviews done. Line: pass rate. Dashed: every caller’s pass rate for the period.</p>
      <div className="h-64" role="img" aria-label={`${caller.name}: interviews done and pass rate by ${data.weekly.unit}, ${data.label}.`}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
            <CartesianGrid stroke={chart.grid} vertical={false} />
            <XAxis dataKey="label" stroke={chart.axis} tick={{ fill: chart.axis, fontSize: 12 }} />
            <YAxis yAxisId="done" allowDecimals={false} stroke={chart.axis} tick={{ fill: chart.axis, fontSize: 12 }} width={36} />
            <YAxis yAxisId="rate" orientation="right" domain={[0, 100]} unit="%" stroke={chart.axis} tick={{ fill: chart.axis, fontSize: 12 }} width={44} />
            <Tooltip
              contentStyle={{ background: chart.tooltipBg, borderColor: chart.tooltipBorder, color: chart.tooltipText, fontSize: 12 }}
              formatter={(v, name) => (name === 'Pass rate' ? (v == null ? '—' : `${v}%`) : v)} />
            <Bar yAxisId="done" dataKey="done" name="Interviews done" fill="#2a78d6" radius={[4, 4, 0, 0]} isAnimationActive={false} />
            <Line yAxisId="rate" dataKey="rate" name="Pass rate" stroke="#1baf7a" strokeWidth={2} dot connectNulls isAnimationActive={false} />
            {team != null && <ReferenceLine yAxisId="rate" y={team} stroke={chart.axis} strokeDasharray="4 4" />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function RoundsHeld({ data, caller, isAll, callers }: {
  data: CallerStats; caller: CallerStatsCaller; isAll: boolean; callers: CallerStatsCaller[];
}) {
  const [sort, setSort] = useState<Sort>('date');
  const [exporting, setExporting] = useState(false);
  const callerOf = useMemo(() => new Map(data.callers.map((c) => [keyOf(c), c])), [data]);
  const rounds = sorted(isAll ? data.rounds : data.rounds.filter((r) => keyOf(r) === keyOf(caller)), sort);
  const exportPdf = async () => {
    setExporting(true);
    try {
      await exportCallerStatsPdf({
        name: caller.name, isAll, periodLabel: data.label,
        regionLabel: REGIONS.find((r) => r.value === data.region)?.label ?? data.region,
        callers: isAll ? callers : [caller], team: data.team, self: data.self, rows: rounds,
        callerName: (r) => callerOf.get(keyOf(r))?.name ?? 'Unassigned',
      });
    } catch (e) {
      notify.error(e, 'Couldn’t export the PDF');
    } finally {
      setExporting(false);
    }
  };
  const columns = ['Date', ...(isAll ? ['Caller'] : []), 'Company', 'Round', 'Engineer', 'Result'];
  return (
    <section className="panel overflow-hidden" aria-labelledby="cs-rounds-title">
      <div className="flex flex-wrap items-center gap-3 px-4 pt-4">
        <h2 id="cs-rounds-title" className="card-title mr-auto">Rounds held · {caller.name} · {data.label}</h2>
        <Segmented label="Sort rounds" options={SORTS} value={sort} onChange={setSort} />
        <button type="button" className="btn-outline flex items-center gap-1.5 whitespace-nowrap px-3 py-1.5 text-sm"
          onClick={exportPdf} disabled={exporting}
          title={isAll ? 'Every caller’s statistics for this period, as a PDF' : `${caller.name}’s statistics for this period, as a PDF`}>
          {exporting ? <span className="spinner spinner-sm" aria-hidden /> : <FileDown className="h-4 w-4" aria-hidden />}
          {isAll ? 'Export all callers (PDF)' : `Export ${caller.name} (PDF)`}
        </button>
      </div>
      <p className="px-4 pb-3 text-xs text-muted">Caller rounds held in this period, with their result now.</p>
      <div className="table-wrap rounded-none border-0">
        <table className="min-w-full text-sm">
          <caption className="sr-only">{caller.name}'s rounds held in {data.label}</caption>
          <thead className="table-head">
            <tr>{columns.map((c) => <th key={c} scope="col" className="whitespace-nowrap px-3 py-2.5 text-left">{c}</th>)}</tr>
          </thead>
          <tbody>
            {rounds.length === 0 ? (
              <tr><td colSpan={columns.length} className="px-3 py-8 text-center text-muted">No caller rounds held in this period.</td></tr>
            ) : rounds.map((r) => (
              <tr key={`${r.interviewId}-${r.roundId}`} className="table-row">
                <td className="whitespace-nowrap px-3 py-2.5">{day(r.roundDate)}</td>
                {isAll && <td className="whitespace-nowrap px-3 py-2.5">{callerOf.get(keyOf(r))?.name ?? 'Unassigned'}</td>}
                <td className="whitespace-nowrap px-3 py-2.5">{r.company || 'Untitled company'}</td>
                <td className="whitespace-nowrap px-3 py-2.5">{stageLabel(r.stage)}</td>
                <td className="whitespace-nowrap px-3 py-2.5">{r.engineer}</td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  <span className={`badge border ${interviewStatusBadgeClass(r.result === 'awaiting' ? 'completed' : r.result)}`}>
                    {RESULT_LABEL[r.result]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
