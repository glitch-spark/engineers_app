import { useState, type KeyboardEvent } from 'react';
import useSWR from 'swr';
import * as api from '../../api/endpoints';
import type { InterviewRoundRow } from '../../api/endpoints';
import NameWithAvatar from '../../components/NameWithAvatar';
import type { Interview } from '../../components/interview/types';
import { CALLER_METHOD_OPTIONS } from '../../components/interview/types';
import { callerRoundsQuery, type InterviewFilters } from '../../lib/interviewFilters';
import { interviewStatusBadgeClass, interviewStatusLabel, normalizeInterviewStatus, stageBadgeClass, stageLabel } from '../../lib/stageBadge';
import { useInterviewTimezone } from '../../lib/useInterviewTimezone';
import { formatInZone, zoneAbbrev } from '../../lib/interviewTimezone';
import { useCallers } from '../../lib/useCallers';
import { CALLER_DOT, UNASSIGNED_CHIP, callerLabel, isUnassigned } from '../../lib/callerColors';
import RoundTrail from './RoundTrail';

const PAGE_SIZES = [10, 20, 50];

/** Callers tab, List: every user's caller rounds, one row per round; click a row to see or assign its caller. */
export default function CallerRoundsList({
  filters,
  update,
  onOpenRound,
}: {
  filters: InterviewFilters;
  update: (patch: Partial<InterviewFilters>) => void;
  onOpenRound: (iv: Interview, roundId: string) => void;
}) {
  const [pageSize, setPageSize] = useState(20);
  const { tz } = useInterviewTimezone();
  const { byId } = useCallers();
  const query = callerRoundsQuery(filters, pageSize, new Date(), tz);
  const { data, isLoading } = useSWR(['caller-rounds-list', JSON.stringify(query)], () => api.listCallerRounds(query), {
    keepPreviousData: true,
  });
  const rows = data?.rounds ?? [];
  const pagination = data?.pagination;

  const open = (row: InterviewRoundRow) => {
    const iv = data?.interviews?.[row.interviewId] as unknown as Interview | undefined;
    if (iv) onOpenRound(iv, row.roundId);
  };
  const openOnKey = (row: InterviewRoundRow) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      open(row);
    }
  };
  const when = (row: InterviewRoundRow) => formatInZone(new Date(row.scheduledAt), tz,
    { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const methodOf = (row: InterviewRoundRow) => {
    const caller = (data?.interviews?.[row.interviewId] as unknown as Interview | undefined)
      ?.stageHistory?.find((e) => e.id === row.roundId)?.caller;
    return {
      label: CALLER_METHOD_OPTIONS.find((o) => o.value === caller?.method)?.label ?? 'TBD',
      value: caller?.methodValue || '',
    };
  };

  const callerCell = (row: InterviewRoundRow) => {
    const known = row.callerId ? byId.get(row.callerId) : undefined;
    const none = isUnassigned(row);
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${none ? `border ${UNASSIGNED_CHIP}` : known ? CALLER_DOT[known.color] : 'bg-zinc-400'}`} aria-hidden />
        <span className={none ? 'text-muted' : 'font-medium'}>{callerLabel(row)}</span>
      </span>
    );
  };
  // Every round of the row's interview, as on the Interviews list.
  const roundsCell = (row: InterviewRoundRow) => (
    <RoundTrail rounds={(data?.interviews?.[row.interviewId] as unknown as Interview | undefined)?.stageHistory ?? []} tz={tz} />
  );
  const stageCell = (row: InterviewRoundRow) => <span className={`badge ${stageBadgeClass(row.stage)}`}>{stageLabel(row.stage)}</span>;
  const statusCell = (row: InterviewRoundRow) => {
    const s = normalizeInterviewStatus(row.status);
    return <span className={`badge ${interviewStatusBadgeClass(s)}`}>{interviewStatusLabel(s)}</span>;
  };
  const sortWhen = () => update({ dir: filters.dir === 'desc' ? 'asc' : 'desc', page: 1 });
  // A period or filter not fetched yet: the previous rows stay, dimmed, under a loading note.
  const refetching = isLoading && !!data;

  return (
    <div className="space-y-3">
      <div className="relative" aria-busy={isLoading}>
        <div className="table-wrap hidden sm:block">
          <table className="min-w-full text-sm">
            <caption className="sr-only">Caller rounds</caption>
            <thead className="table-head">
              <tr>
                <th scope="col" aria-sort={filters.dir === 'asc' ? 'ascending' : 'descending'} className="px-3 py-2.5 text-left">
                  <button type="button" className="inline-flex items-center gap-1 font-medium uppercase hover:text-strong" onClick={sortWhen}>
                    When ({zoneAbbrev(new Date(), tz)})
                    <span aria-hidden className="text-[10px] text-muted">{filters.dir === 'asc' ? '▲' : '▼'}</span>
                  </button>
                </th>
                <th scope="col" className="px-3 py-2.5 text-left">Company</th>
                <th scope="col" className="px-3 py-2.5 text-left">Stage</th>
                <th scope="col" className="px-3 py-2.5 text-left">Status</th>
                <th scope="col" className="px-3 py-2.5 text-left">Rounds</th>
                <th scope="col" className="px-3 py-2.5 text-left">Caller</th>
                <th scope="col" className="px-3 py-2.5 text-left">Method</th>
                <th scope="col" className="px-3 py-2.5 text-left">Owner</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && !data ? (
                <tr><td colSpan={8} className="px-3 py-10 text-center text-muted">
                  <span className="inline-flex items-center gap-2" role="status"><span className="spinner spinner-sm" aria-hidden /> Loading caller rounds…</span>
                </td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={8} className="px-3 py-8 text-center text-muted">No caller rounds match these filters.</td></tr>
              ) : rows.map((row) => {
                const method = methodOf(row);
                return (
                  <tr key={`${row.interviewId}:${row.roundId}`}
                    className="table-row cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600"
                    tabIndex={0} onClick={() => open(row)} onKeyDown={openOnKey(row)}>
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">{when(row)}</td>
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-strong">{row.companyName || 'Untitled company'}</div>
                      {row.profileLabel && <div className="text-xs text-muted">{row.profileLabel}</div>}
                    </td>
                    <td className="px-3 py-2.5">{stageCell(row)}</td>
                    <td className="px-3 py-2.5">{statusCell(row)}</td>
                    <td className="px-3 py-2.5">{roundsCell(row)}</td>
                    <td className="px-3 py-2.5">{callerCell(row)}</td>
                    <td className="px-3 py-2.5">
                      <div>{method.label}</div>
                      {method.value && <div className="max-w-[16rem] truncate text-xs text-muted" title={method.value}>{method.value}</div>}
                    </td>
                    <td className="px-3 py-2.5"><NameWithAvatar name={row.ownerName} size="sm" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <ul className="space-y-2 sm:hidden" aria-label="Caller rounds">
          {isLoading && !data && <li className="panel p-4 text-center text-sm text-muted" role="status">Loading caller rounds…</li>}
          {!isLoading && rows.length === 0 && <li className="panel p-4 text-center text-sm text-muted">No caller rounds match these filters.</li>}
          {rows.map((row) => (
            <li key={`${row.interviewId}:${row.roundId}`}>
              <div role="button" tabIndex={0} onClick={() => open(row)} onKeyDown={openOnKey(row)} className="panel block w-full space-y-2 p-3 text-left">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-strong">{row.companyName || 'Untitled company'}</div>
                    <div className="truncate text-xs text-muted tabular-nums">{when(row)} · {row.ownerName || '—'}</div>
                  </div>
                  {callerCell(row)}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm">{stageCell(row)}{statusCell(row)}{roundsCell(row)}</div>
              </div>
            </li>
          ))}
        </ul>

        {refetching && (
          <div className="absolute inset-0 z-10 flex items-start justify-center rounded-xl bg-white/70 pt-16 dark:bg-zinc-950/70">
            <div className="flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-900" role="status">
              <span className="spinner spinner-sm" aria-hidden /> Loading caller rounds…
            </div>
          </div>
        )}
      </div>

      {pagination && (
        <nav aria-label="Caller rounds pagination" className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <div className="text-muted">
            {pagination.total === 0 ? 'No results' : `Showing ${(pagination.page - 1) * pagination.limit + 1}–${Math.min(pagination.page * pagination.limit, pagination.total)} of ${pagination.total}`}
          </div>
          <div className="flex shrink-0 items-center gap-2 whitespace-nowrap">
            <label htmlFor="cr-page-size" className="text-muted">Per page</label>
            <select id="cr-page-size" className="select focus-ring !w-auto !pr-9" value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); update({ page: 1 }); }}>
              {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <button type="button" className="btn-outline btn-sm" disabled={!pagination.hasPrev} onClick={() => update({ page: pagination.page - 1 })}>
              Previous
            </button>
            <span className="tabular-nums text-muted">Page {pagination.page} of {Math.max(pagination.totalPages, 1)}</span>
            <button type="button" className="btn-outline btn-sm" disabled={!pagination.hasNext} onClick={() => update({ page: pagination.page + 1 })}>
              Next
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}
