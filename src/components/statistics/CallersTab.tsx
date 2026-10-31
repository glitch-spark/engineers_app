import { useMemo, useState, type ReactNode } from 'react';
import useSWR from 'swr';
import * as api from '../../api/endpoints';
import type { CallerStats, CallerStatsCaller, CallerStatsRound } from '../../api/endpoints';
import ConfirmDialog from '../ConfirmDialog';
import { CALLER_DOT } from '../../lib/callerColors';
import { notify } from '../../lib/notify';
import { interviewStatusBadgeClass, stageLabel } from '../../lib/stageBadge';
import { FilterBar, Segmented, filterParams, filtersError, type StatsFilters } from './controls';

type Sort = 'date' | 'company';
const SORTS: { value: Sort; label: string }[] = [
  { value: 'date', label: 'Date' },
  { value: 'company', label: 'Company' },
];

const RESULT_LABEL: Record<CallerStatsRound['result'], string> = {
  passed: 'Passed', rejected: 'Rejected', canceled: 'Canceled', awaiting: 'Awaiting result', scheduled: 'Scheduled',
};

const keyOf = (c: { callerId: string | null }) => c.callerId ?? 'unassigned';
const ALL = 'all';

/** Every caller's counts added up, for the All callers card (pass rate over the sums). */
function allCallers(callers: CallerStatsCaller[]): CallerStatsCaller {
  const counts = { passed: 0, rejected: 0, canceled: 0, awaiting: 0, outdated: 0, scheduled: 0 };
  for (const c of callers) for (const k of Object.keys(counts) as (keyof typeof counts)[]) counts[k] += c.counts[k];
  const decided = counts.passed + counts.rejected;
  return { callerId: ALL, name: 'All callers', color: null, counts, passRate: decided ? counts.passed / decided : null };
}

function day(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

const pct = (r: number | null) => (r == null ? '–' : `${Math.round(r * 100)}%`);
const waited = (n: number | null) => `${n ?? 0} day${n === 1 ? '' : 's'}`;

function sorted(rounds: CallerStatsRound[], sort: Sort): CallerStatsRound[] {
  const byDate = (a: CallerStatsRound, b: CallerStatsRound) => a.roundDate.localeCompare(b.roundDate);
  return [...rounds].sort(sort === 'date'
    ? byDate
    : (a, b) => a.company.localeCompare(b.company, undefined, { sensitivity: 'base' }) || byDate(a, b));
}

/** Rounds held in the period, not counting canceled ones. */
const heldCount = (c: CallerStatsCaller) => c.counts.passed + c.counts.rejected + c.counts.awaiting;

/**
 * Callers: what each caller is paid by. The first table is the caller rounds held in the period, with their result
 * now (awaiting ones included); rounds from earlier periods still awaiting a result and rounds still scheduled are
 * listed apart.
 */
export default function CallersTab({ filters, onFilters, canManage }: {
  filters: StatsFilters; onFilters: (f: StatsFilters) => void; canManage: boolean;
}) {
  const params = filterParams(filters);
  const { data, error, isLoading, mutate } = useSWR(
    filtersError(filters) ? null : ['caller-stats', params.region, params.period, params.date, params.to],
    () => api.getCallerStats(params),
    { keepPreviousData: true },
  );
  const [picked, setPicked] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>('date');

  return (
    <div className="space-y-4">
      <FilterBar value={filters} onChange={onFilters}>
        {isLoading && data && <span className="spinner spinner-sm" role="status" aria-label="Loading" />}
      </FilterBar>
      <p className="text-xs text-muted">
        A round counts in the period it was held. Pass rate = passed ÷ (passed + rejected). Older rounds still awaiting
        a result and rounds still scheduled are listed apart. A region shows its profiles’ interviews.
      </p>

      {error ? (
        <p className="panel p-6 text-sm text-red-700 dark:text-red-400">Couldn’t load the callers. Try again.</p>
      ) : !data ? (
        <p className="panel flex items-center gap-2 p-6 text-sm text-muted" role="status">
          <span className="spinner spinner-sm" aria-hidden /> Loading…
        </p>
      ) : (
        <CallersView
          data={data} picked={picked} onPick={setPicked} sort={sort} onSort={setSort} canManage={canManage}
          onChanged={() => mutate()}
        />
      )}
    </div>
  );
}

function hasAny(c: CallerStatsCaller): boolean {
  return Object.values(c.counts).some((n) => n > 0);
}

function CallersView({ data, picked, onPick, sort, onSort, canManage, onChanged }: {
  data: CallerStats; picked: string | null; onPick: (key: string) => void;
  sort: Sort; onSort: (s: Sort) => void; canManage: boolean; onChanged: () => void;
}) {
  const [confirm, setConfirm] = useState<CallerStatsRound | null>(null);
  const all = useMemo(() => allCallers(data.callers), [data]);
  // All callers until one is picked.
  const current = data.callers.find((c) => keyOf(c) === picked) ?? all;
  const isAll = current === all;
  const mine = useMemo(
    () => (isAll ? data.rounds : data.rounds.filter((r) => keyOf(r) === keyOf(current))),
    [data, current, isAll],
  );
  const callerOf = useMemo(() => new Map(data.callers.map((c) => [keyOf(c), c])), [data]);
  const section = (s: CallerStatsRound['section']) => sorted(mine.filter((r) => r.section === s), sort);
  const { name, counts } = current;
  // With All callers, each table says whose round it is.
  const callerCol = isAll ? ['Caller'] : [];
  const callerCell = (r: CallerStatsRound): ReactNode[] => {
    if (!isAll) return [];
    const c = callerOf.get(keyOf(r));
    return [
      <span key="caller" className="flex items-center gap-1.5">
        <span className={`h-2 w-2 shrink-0 rounded-full ${c?.color ? CALLER_DOT[c.color] : 'border border-dashed border-zinc-400'}`} aria-hidden />
        {c?.name ?? 'Unassigned'}
      </span>,
    ];
  };
  // Only caller managers close a round; others see the report.
  const rejectButton = (r: CallerStatsRound) => canManage && (
    <button key="reject" type="button" className="btn-outline whitespace-nowrap px-2 py-1 text-xs" onClick={() => setConfirm(r)}>
      Mark rejected
    </button>
  );

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" role="group" aria-label="Callers">
        <CallerCard c={all} active={isAll} onPick={() => onPick(ALL)} />
        {data.callers.map((c) => <CallerCard key={keyOf(c)} c={c} active={c === current} onPick={() => onPick(keyOf(c))} />)}
      </div>

      <section className="panel overflow-hidden" aria-labelledby="cs-period-title">
        <div className="flex flex-wrap items-center gap-3 px-4 pt-4">
          <h2 id="cs-period-title" className="card-title mr-auto">{name} · {data.label}</h2>
          <Segmented label="Sort rounds" options={SORTS} value={sort} onChange={onSort} />
        </div>
        <p className="px-4 pb-3 text-xs text-muted">Caller rounds held in this period, with their result now.</p>
        <RoundsTable
          caption={`${name}'s rounds held in ${data.label}`}
          rounds={section('period')}
          empty="No caller rounds held in this period."
          columns={['Date', ...callerCol, 'Company', 'Round', 'Engineer', 'Result', '']}
          cells={(r) => [
            day(r.roundDate), ...callerCell(r), r.company || 'Untitled company', stageLabel(r.stage), r.engineer,
            <ResultBadge key="result" r={r} />,
            r.result === 'awaiting' ? rejectButton(r) : '',
          ]}
        />
        <p className="border-t border-zinc-200 px-4 py-3 text-sm tabular-nums dark:border-zinc-800">
          <span className="font-medium text-strong">Interviews {heldCount(current)} ({counts.canceled} canceled)</span>
          {' · '}Passed {counts.passed} · Rejected {counts.rejected} · Awaiting {counts.awaiting}
          {' · '}<span className="font-medium text-strong">Pass rate {pct(current.passRate)}</span>
        </p>
      </section>

      <section className="panel overflow-hidden" aria-labelledby="cs-outdated-title">
        <h2 id="cs-outdated-title" className="card-title px-4 pt-4">Outdated pending · {counts.outdated}</h2>
        <p className="px-4 pb-3 text-xs text-muted">
          Held before this period and still awaiting the result. When the recruiter never answers, mark the round
          rejected.
        </p>
        <RoundsTable
          caption={`${name}'s older rounds awaiting a result`}
          rounds={section('outdated')}
          empty="No older rounds awaiting a result."
          columns={['Date', ...callerCol, 'Company', 'Round', 'Engineer', 'Waiting', '']}
          cells={(r) => [
            day(r.roundDate), ...callerCell(r), r.company || 'Untitled company', stageLabel(r.stage), r.engineer,
            waited(r.daysWaiting),
            rejectButton(r),
          ]}
        />
      </section>

      <section className="panel overflow-hidden" aria-labelledby="cs-scheduled-title">
        <h2 id="cs-scheduled-title" className="card-title px-4 pt-4">Scheduled · {counts.scheduled}</h2>
        <p className="px-4 pb-3 text-xs text-muted">Not held yet. Rounds whose time has passed still need their status updated.</p>
        <RoundsTable
          caption={`${name}'s scheduled rounds`}
          rounds={section('scheduled')}
          empty="Nothing scheduled."
          columns={['Date', ...callerCol, 'Company', 'Round', 'Engineer', '']}
          cells={(r) => [
            day(r.roundDate), ...callerCell(r), r.company || 'Untitled company', stageLabel(r.stage), r.engineer,
            r.stale ? <span key="stale" className="badge badge-warning">Date passed, status not updated</span> : '',
          ]}
        />
      </section>

      <RejectDialog round={confirm} onClose={() => setConfirm(null)} onDone={onChanged} />
    </>
  );
}

function CallerCard({ c, active, onPick }: { c: CallerStatsCaller; active: boolean; onPick: () => void }) {
  const dot = c.color ? CALLER_DOT[c.color] : 'border border-dashed border-zinc-400 bg-transparent';
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onPick}
      className={`panel p-4 text-left transition ${active ? 'ring-2 ring-sky-500' : 'hover:border-zinc-300 dark:hover:border-zinc-700'} ${hasAny(c) ? '' : 'opacity-60'}`}
    >
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} aria-hidden />
        <span className="truncate font-medium text-strong">{c.name}</span>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums text-strong">{heldCount(c)}</span>
        <span className="text-sm tabular-nums text-muted">({c.counts.canceled} canceled)</span>
        <span className="text-xs text-muted">interviews · pass rate {pct(c.passRate)}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 text-xs tabular-nums [&>span]:whitespace-nowrap">
        <span className="text-emerald-700 dark:text-emerald-400">✓ {c.counts.passed} passed</span>
        <span className="text-red-700 dark:text-red-400">✗ {c.counts.rejected} rejected</span>
        <span className="text-muted">{c.counts.awaiting} awaiting</span>
      </div>
      <div className="mt-1 text-xs text-muted tabular-nums">
        {c.counts.outdated} outdated pending · {c.counts.scheduled} scheduled
      </div>
    </button>
  );
}

function ResultBadge({ r }: { r: CallerStatsRound }) {
  const status = r.result === 'awaiting' ? 'completed' : r.result;
  return (
    <span className={`badge border ${interviewStatusBadgeClass(status)}`}>
      {RESULT_LABEL[r.result]}{r.result === 'awaiting' ? ` · ${waited(r.daysWaiting)}` : ''}
    </span>
  );
}

function RejectDialog({ round, onClose, onDone }: { round: CallerStatsRound | null; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const reject = async () => {
    if (!round) return;
    setBusy(true);
    try {
      await api.rejectAwaitingRound(round.interviewId, round.roundId);
      notify.success(`${round.company || 'The round'} · ${stageLabel(round.stage)} marked rejected`);
      onClose();
      onDone();
    } catch (e) {
      notify.error(e, 'Couldn’t mark the round rejected');
    } finally {
      setBusy(false);
    }
  };
  return (
    <ConfirmDialog
      open={round !== null}
      title="Mark rejected"
      body={round ? `Mark ${round.company || 'this round'} · ${stageLabel(round.stage)} (${day(round.roundDate)}) as rejected? The #caller thread is told.` : ''}
      confirmLabel="Mark rejected"
      busy={busy}
      onConfirm={reject}
      onCancel={onClose}
    />
  );
}

function RoundsTable({ caption, rounds, empty, columns, cells }: {
  caption: string; rounds: CallerStatsRound[]; empty: string; columns: string[];
  cells: (r: CallerStatsRound) => ReactNode[];
}) {
  return (
    <div className="table-wrap rounded-none border-0">
      <table className="min-w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="table-head">
          <tr>
            {columns.map((c, i) => (
              <th key={i} scope="col" className="whitespace-nowrap px-3 py-2.5 text-left">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rounds.length === 0 ? (
            <tr><td colSpan={columns.length} className="px-3 py-8 text-center text-muted">{empty}</td></tr>
          ) : rounds.map((r) => (
            <tr key={r.roundId} className="table-row">
              {cells(r).map((v, i) => (
                <td key={i} className="whitespace-nowrap px-3 py-2.5">{v}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
