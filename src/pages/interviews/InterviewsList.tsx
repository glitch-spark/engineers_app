import { useState, type KeyboardEvent } from 'react';
import useSWR from 'swr';
import { MoreHorizontal, PhoneCall } from 'lucide-react';
import * as api from '../../api/endpoints';
import { useAuth } from '../../auth/useAuth';
import NameWithAvatar from '../../components/NameWithAvatar';
import type { Interview } from '../../components/interview/types';
import type { PanelMode } from '../../components/interview/InterviewPanel';
import { formatProfileLabel } from '../../lib/countries';
import { listQuery, type InterviewFilters, type ListSort } from '../../lib/interviewFilters';
import { notify } from '../../lib/notify';
import {
  INTERVIEW_STATUSES,
  interviewStatusBadgeClass,
  interviewStatusLabel,
  normalizeInterviewStatus,
  stageBadgeClass,
  stageLabel,
} from '../../lib/stageBadge';
import RoundTrail from './RoundTrail';
import { useInterviewTimezone } from '../../lib/useInterviewTimezone';
import { formatInZone, zoneAbbrev } from '../../lib/interviewTimezone';

export type OpenPanel = (iv: Interview, mode?: PanelMode, roundId?: string) => void;

const PAGE_SIZES = [10, 20, 50];

function whenText(iso: string | null | undefined, tz: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return formatInZone(d, tz, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function profileText(iv: Interview): string {
  const a = typeof iv.accountId === 'object' ? iv.accountId : null;
  return formatProfileLabel(a?.name || a?.email, a?.country, '—', a?.region);
}

/** Server-paginated table, one row per interview (the latest round sets stage/status). */
export default function InterviewsList({
  filters,
  update,
  onOpen,
  onDelete,
}: {
  filters: InterviewFilters;
  update: (patch: Partial<InterviewFilters>) => void;
  onOpen: OpenPanel;
  onDelete: (iv: Interview) => void;
}) {
  const { user } = useAuth();
  const [pageSize, setPageSize] = useState(20);
  const { tz } = useInterviewTimezone();
  const query = listQuery(filters, pageSize, new Date(), tz);
  const { data, isLoading, mutate } = useSWR(['interviews-list', JSON.stringify(query)], () => api.listInterviews(query), {
    keepPreviousData: true,
  });
  const rows = (data?.interviews as Interview[] | undefined) ?? [];
  const pagination = data?.pagination;

  const canEdit = (iv: Interview) => {
    const owner = typeof iv.createdBy === 'object' ? iv.createdBy._id : iv.createdBy;
    return user?.role === 'admin' || owner === user?.id;
  };

  const setTipStatus = async (iv: Interview, status: string) => {
    const tip = iv.stageHistory?.[iv.stageHistory.length - 1];
    if (!tip) return;
    try {
      await api.updateInterviewStage(iv._id, tip.id, { status });
      notify.success('Status updated');
      mutate();
    } catch (err) {
      notify.error(err, 'Failed to update status');
    }
  };

  const sortHeader = (key: ListSort, label: string) => {
    const active = filters.sort === key;
    const ariaSort = active ? (filters.dir === 'asc' ? 'ascending' : 'descending') : 'none';
    return (
      <th scope="col" aria-sort={ariaSort} className="px-3 py-2.5 text-left">
        <button
          type="button"
          className="inline-flex items-center gap-1 font-medium hover:text-strong"
          onClick={() => update({ sort: key, dir: active && filters.dir === 'desc' ? 'asc' : 'desc' })}
        >
          {label}
          <span aria-hidden className="text-[10px] text-muted">{active ? (filters.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
        </button>
      </th>
    );
  };

  const rowMenu = (iv: Interview) => (
    <details className="relative" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <summary className="btn-icon list-none cursor-pointer" aria-label={`Actions for ${iv.companyName || 'interview'}`}>
        <MoreHorizontal size={16} aria-hidden />
      </summary>
      <div className="absolute right-0 z-20 mt-1 w-44 rounded-xl border border-zinc-200 bg-white py-1 text-sm shadow-strong dark:border-zinc-700 dark:bg-zinc-900">
        {canEdit(iv) && (
          <button type="button" className="block w-full px-3 py-1.5 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800"
            onClick={(e) => { (e.currentTarget.closest('details') as HTMLDetailsElement).open = false; onOpen(iv, 'addRound'); }}>
            Add next round
          </button>
        )}
        {canEdit(iv) && (
          <button type="button" className="block w-full px-3 py-1.5 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800"
            onClick={(e) => {
              (e.currentTarget.closest('details') as HTMLDetailsElement).open = false;
              const tip = iv.stageHistory?.[iv.stageHistory.length - 1];
              onOpen(iv, tip ? 'editRound' : 'editDetails', tip?.id);
            }}>
            Edit
          </button>
        )}
        {canEdit(iv) && (
          <button type="button" className="block w-full px-3 py-1.5 text-left text-red-700 hover:bg-zinc-100 dark:text-red-400 dark:hover:bg-zinc-800"
            onClick={(e) => { (e.currentTarget.closest('details') as HTMLDetailsElement).open = false; onDelete(iv); }}>
            Delete
          </button>
        )}
      </div>
    </details>
  );

  const statusCell = (iv: Interview) => {
    const status = normalizeInterviewStatus(iv.status);
    if (!canEdit(iv) || !iv.stageHistory?.length) {
      return <span className={`badge ${interviewStatusBadgeClass(status)}`}>{interviewStatusLabel(status)}</span>;
    }
    return (
      <select
        aria-label={`Status of ${iv.companyName || 'interview'}`}
        className={`select focus-ring !h-8 !w-auto !py-0 !text-xs ${interviewStatusBadgeClass(status)}`}
        value={status}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        onChange={(e) => setTipStatus(iv, e.target.value)}
      >
        {INTERVIEW_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
      </select>
    );
  };

  const stageCell = (iv: Interview) => (
    iv.stage ? <span className={`badge ${stageBadgeClass(iv.stage)}`}>{stageLabel(iv.stage)}</span> : <span className="text-muted">—</span>
  );

  /** Latest round's caller: name, "TBD" when requested but unassigned, "—" when none. */
  const callerCell = (iv: Interview) => {
    if (!iv.caller?.enabled) return <span className="text-muted">—</span>;
    const name = (iv.caller.callerName || '').trim();
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
        <PhoneCall size={13} className="shrink-0 text-sky-600" aria-hidden />
        <span className={!name || name === 'TBD' ? 'text-muted' : ''}>{name && name !== 'TBD' ? name : 'TBD'}</span>
      </span>
    );
  };

  const openOnKey = (iv: Interview) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen(iv);
    }
  };

  return (
    <div className="space-y-3">
      <div className="table-wrap hidden sm:block">
        <table className="min-w-full text-sm">
          <caption className="sr-only">Interviews</caption>
          <thead className="table-head">
            <tr>
              {sortHeader('company', 'Company')}
              <th scope="col" className="px-3 py-2.5 text-left">Profile</th>
              {sortHeader('stage', 'Stage')}
              <th scope="col" className="px-3 py-2.5 text-left">Caller</th>
              {sortHeader('latest', `Latest round (${zoneAbbrev(new Date(), tz)})`)}
              {sortHeader('status', 'Status')}
              <th scope="col" className="px-3 py-2.5 text-left">Rounds</th>
              <th scope="col" className="px-3 py-2.5 text-left">Owner</th>
              <th scope="col" className="w-10 px-3 py-2.5"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && !data ? (
              <tr><td colSpan={9} className="px-3 py-8 text-center text-muted">Loading interviews…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={9} className="px-3 py-8 text-center text-muted">No interviews match these filters.</td></tr>
            ) : rows.map((iv) => (
              <tr
                key={iv._id}
                className="table-row cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600"
                tabIndex={0}
                onClick={() => onOpen(iv)}
                onKeyDown={openOnKey(iv)}
              >
                <td className="px-3 py-2.5">
                  <div className="font-medium text-strong">{iv.companyName || 'Untitled company'}</div>
                  {iv.appliedPosition && <div className="text-xs text-muted">{iv.appliedPosition}</div>}
                </td>
                <td className="px-3 py-2.5">{profileText(iv)}</td>
                <td className="px-3 py-2.5">{stageCell(iv)}</td>
                <td className="px-3 py-2.5">{callerCell(iv)}</td>
                <td className="px-3 py-2.5 tabular-nums whitespace-nowrap">{whenText(iv.scheduledAt, tz)}</td>
                <td className="px-3 py-2.5">{statusCell(iv)}</td>
                <td className="px-3 py-2.5"><RoundTrail rounds={iv.stageHistory ?? []} tz={tz} /></td>
                <td className="px-3 py-2.5"><NameWithAvatar name={iv.ownerName || iv.ownerEmail} size="sm" /></td>
                <td className="px-3 py-2.5 text-right">{rowMenu(iv)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="space-y-2 sm:hidden" aria-label="Interviews">
        {rows.length === 0 && !isLoading && <li className="panel p-4 text-center text-sm text-muted">No interviews match these filters.</li>}
        {rows.map((iv) => (
          <li key={iv._id}>
            <div role="button" tabIndex={0} onClick={() => onOpen(iv)} onKeyDown={openOnKey(iv)} className="panel block w-full space-y-2 p-3 text-left">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-medium text-strong">{iv.companyName || 'Untitled company'}</div>
                  <div className="truncate text-xs text-muted">{profileText(iv)}{iv.appliedPosition ? ` · ${iv.appliedPosition}` : ''}</div>
                </div>
                {rowMenu(iv)}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {stageCell(iv)}
                {iv.caller?.enabled && callerCell(iv)}
                <span className="tabular-nums text-muted">{whenText(iv.scheduledAt, tz)}</span>
                {statusCell(iv)}
                <RoundTrail rounds={iv.stageHistory ?? []} tz={tz} />
              </div>
            </div>
          </li>
        ))}
      </ul>

      {pagination && (
        <nav aria-label="Interviews pagination" className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <div className="text-muted">
            {pagination.total === 0 ? 'No results' : `Showing ${(pagination.page - 1) * pagination.limit + 1}–${Math.min(pagination.page * pagination.limit, pagination.total)} of ${pagination.total}`}
          </div>
          <div className="flex shrink-0 items-center gap-2 whitespace-nowrap">
            <label htmlFor="iv-page-size" className="text-muted">Per page</label>
            <select id="iv-page-size" className="select focus-ring !w-auto !pr-9" value={pageSize}
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
