import type { KeyboardEvent } from 'react';
import useSWR from 'swr';
import * as api from '../../api/endpoints';
import type { InterviewRoundRow } from '../../api/endpoints';
import NameWithAvatar from '../../components/NameWithAvatar';
import type { Interview } from '../../components/interview/types';
import { CALLER_METHOD_OPTIONS } from '../../components/interview/types';
import { callerRoundsQuery, summaryQuery, type InterviewFilters } from '../../lib/interviewFilters';
import { MessageSquareText } from 'lucide-react';
import {
  interviewStatusBadgeClass, interviewStatusLabel, normalizeInterviewStatus, stageBadgeClass, stageLabel, statusWhy,
} from '../../lib/stageBadge';
import { useInterviewTimezone } from '../../lib/useInterviewTimezone';
import { formatInZone, zoneAbbrev } from '../../lib/interviewTimezone';
import Pagination from '../../components/Pagination';
import { useCallers } from '../../lib/useCallers';
import { CALLER_DOT, UNASSIGNED_CHIP, callerLabel, isUnassigned } from '../../lib/callerColors';
import RoundTrail from './RoundTrail';
import InterviewTotals from './InterviewTotals';
import { ResumeScoreCell } from '../../components/interview/LinkedResumeCard';

/** Caller interviews tab, List: every user's caller rounds, one row per round; click a row to open its interview in the side pane,
 * scrolled to that round, where admins and interview managers assign the caller. */
export default function CallerRoundsList({
  filters,
  update,
  onOpenRound,
}: {
  filters: InterviewFilters;
  update: (patch: Partial<InterviewFilters>) => void;
  onOpenRound: (iv: Interview, roundId: string) => void;
}) {
  const { tz } = useInterviewTimezone();
  const { byId } = useCallers();
  const query = callerRoundsQuery(filters, filters.size, new Date(), tz);
  // No query while the Custom range is invalid (the bar says why): nothing to load, so no endless spinner.
  const { data, isLoading } = useSWR(query ? ['caller-rounds-list', JSON.stringify(query)] : null, () => api.listCallerRounds(query!), {
    keepPreviousData: true,
  });
  // SWR keeps the last page of rows when the key goes null; an invalid range shows none.
  const rows = (query ? data?.rounds : undefined) ?? [];
  const pagination = query ? data?.pagination : undefined;
  const emptyText = query ? 'No caller rounds match these filters.' : 'Pick a valid date range to see caller rounds.';

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
    const iv = data?.interviews?.[row.interviewId] as unknown as Interview | undefined;
    // Someone else's interview: how the caller joins isn't sent.
    if (iv?.summaryOnly) return { label: '—', value: '' };
    const caller = iv?.stageHistory?.find((e) => e.id === row.roundId)?.caller;
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
  const scoreCell = (row: InterviewRoundRow) => {
    const iv = data?.interviews?.[row.interviewId] as unknown as Interview | undefined;
    return iv?.summaryOnly ? <span className="text-faint">—</span> : <ResumeScoreCell link={iv?.resumeLink} />;
  };
  const stageCell = (row: InterviewRoundRow) => <span className={`badge ${stageBadgeClass(row.stage)}`}>{stageLabel(row.stage)}</span>;
  const statusCell = (row: InterviewRoundRow) => {
    const s = normalizeInterviewStatus(row.status);
    const why = statusWhy(s, row.statusReason, row.statusNote);
    const note = why && `${why.label}: ${why.text}`;
    return (
      <span className={`badge ${interviewStatusBadgeClass(s)}`} title={note || undefined}>
        {interviewStatusLabel(s)}
        {note && <><MessageSquareText size={11} className="ml-1 inline" aria-hidden /><span className="sr-only">. {note}</span></>}
      </span>
    );
  };
  const sortWhen = () => update({ dir: filters.dir === 'desc' ? 'asc' : 'desc', page: 1 });
  // A period or filter not fetched yet: the previous rows stay, dimmed, under a loading note.
  const refetching = isLoading && !!data;

  return (
    <div className="space-y-3">
      <InterviewTotals query={summaryQuery(query, { callers: true })} status={filters.status} onStatus={(status) => update({ status })} />
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
                <th scope="col" className="px-3 py-2.5 text-left">Score</th>
                <th scope="col" className="px-3 py-2.5 text-left">Rounds</th>
                <th scope="col" className="px-3 py-2.5 text-left">Caller</th>
                <th scope="col" className="px-3 py-2.5 text-left">Method</th>
                <th scope="col" className="px-3 py-2.5 text-left">Owner</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && !data ? (
                <tr><td colSpan={9} className="px-3 py-10 text-center text-muted">
                  <span className="inline-flex items-center gap-2" role="status"><span className="spinner spinner-sm" aria-hidden /> Loading caller rounds…</span>
                </td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={9} className="px-3 py-8 text-center text-muted">{emptyText}</td></tr>
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
                    <td className="px-3 py-2.5">{scoreCell(row)}</td>
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
          {!isLoading && rows.length === 0 && <li className="panel p-4 text-center text-sm text-muted">{emptyText}</li>}
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
                <div className="flex flex-wrap items-center gap-2 text-sm">{stageCell(row)}{statusCell(row)}
                  {(data?.interviews?.[row.interviewId] as unknown as Interview | undefined)?.resumeLink?.score && scoreCell(row)}
                  {roundsCell(row)}</div>
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

      <Pagination
        info={pagination}
        onPage={(page) => update({ page })}
        pageSize={filters.size}
        onPageSize={(size) => update({ size })}
        label="Caller rounds pages"
      />
    </div>
  );
}
