import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { FileDown } from 'lucide-react';
import * as api from '../../api/endpoints';
import type { CallerRoundGroup, CallerStats, CallerStatsCaller, CallerStatsRound, CallerStatsTotals } from '../../api/endpoints';
import { notify } from '../../lib/notify';
import { exportCallerStatsPdf } from '../../lib/callerStatsPdf';
import { interviewStatusBadgeClass, stageLabel } from '../../lib/stageBadge';
import Segmented from '../Segmented';
import Select from '../Select';
import FramedTab from '../stats/FramedTab';
import { pct } from './rateShared';
import { regionLabel, useStatsFilters } from './statsFilters';

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
 * Statistics → Callers: the you-vs-callers frame (from /stats/callers), then the round types and the rounds held
 * behind the numbers (from /metrics/caller-stats), for one caller or all.
 */
export default function CallersTab({ initialCaller }: {
  /** Caller id to show first (falls back to All callers when they have no rounds in the period). */
  initialCaller?: string;
}) {
  return (
    <div className="space-y-4">
      <FramedTab tab="callers" />
      <CallersExtras initialCaller={initialCaller} />
    </div>
  );
}

function CallersExtras({ initialCaller }: { initialCaller?: string }) {
  const params = useStatsFilters().params;
  const { data, error, mutate } = useSWR(
    params ? ['caller-stats', params.region, params.period, params.date, params.to] : null,
    () => api.getCallerStats(params!),
    { keepPreviousData: true },
  );
  const shown = params ? data : undefined; // keepPreviousData would otherwise show the last range under an invalid one
  const [picked, setPicked] = useState<string>(initialCaller || ALL);
  // The frame above already shows loading / error / idle states; the extras just wait for their data.
  // An older server's response has no team totals: the frame shows the update note.
  if (!shown && error) {
    return (
      <p className="panel flex items-center gap-3 p-6 text-sm text-red-700 dark:text-red-400">
        Couldn’t load the round list. Try again.
        <button type="button" className="btn-outline px-3 py-1 text-sm" onClick={() => mutate()}>Retry</button>
      </p>
    );
  }
  if (!shown?.team || shown.team.done + shown.team.counts.canceled === 0) return null;
  return <CallersView data={shown} picked={picked} onPick={setPicked} />;
}

function CallersView({ data, picked, onPick }: { data: CallerStats; picked: string; onPick: (key: string) => void }) {
  const all = useMemo(() => allRow(data.team), [data]);
  const active = data.callers.filter((c) => c.done + c.counts.canceled > 0);
  const current = active.find((c) => keyOf(c) === picked) ?? all;
  const isAll = current === all;

  return (
    <>
      <TypeGrid callers={active.filter((c) => c.done > 0)} team={data.team} self={data.self} />
      <Select label="Caller" id="cs-caller" className="max-w-xs" value={isAll ? ALL : keyOf(current)} onChange={onPick}
        options={[{ value: ALL, label: 'All callers' }, ...active.map((c) => ({ value: keyOf(c), label: c.name }))]} />
      <RoundsHeld data={data} caller={current} isAll={isAll} callers={active} />
    </>
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
        regionLabel: regionLabel(data.region),
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
