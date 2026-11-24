import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import useSWR, { useSWRConfig } from 'swr';
import * as api from '../../api/endpoints';
import type { Caller } from '../../api/endpoints';
import ActionMenu, { type ActionItem } from '../../components/ActionMenu';
import ConfirmDialog from '../../components/ConfirmDialog';
import CallerEditPanel from '../../components/interview/CallerEditPanel';
import CallerTeamsPanel from './CallerTeamsPanel';
import { CALLER_DOT } from '../../lib/callerColors';
import { notify } from '../../lib/notify';
import { useCallers } from '../../lib/useCallers';

const OVERVIEW_KEY = ['caller-overview'];
const ZERO = { upcoming: 0, thisWeek: 0, passRate: null, rounds: 0 };

/** Manage callers tab: external callers with their load, pass rate, Slack ID and team; managers also get the teams admin. */
export default function CallersDirectory() {
  const navigate = useNavigate();
  const { mutate: mutateAll } = useSWRConfig();
  const { byId, canManage, isLoading, mutate: mutateCallers } = useCallers();
  const { data: overview, mutate: mutateOverview } = useSWR(OVERVIEW_KEY, api.getCallerOverview);
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Caller | 'new' | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Caller | null>(null);
  const [deleting, setDeleting] = useState(false);

  // byId holds every caller including archived ones.
  const all = useMemo(() => [...byId.values()], [byId]);
  const external = all.filter((c) => c.kind === 'external' && (showArchived || !c.archived));
  const archivedCount = all.filter((c) => c.kind === 'external' && c.archived).length;

  const changed = () => {
    void mutateCallers();
    void mutateOverview();
    // Names and colours show on interview rounds and the caller schedule.
    void mutateAll((key) => Array.isArray(key) && ['interviews-list', 'interview-rounds', 'caller-rounds-list'].includes(key[0]));
  };

  const setArchived = async (c: Caller, archived: boolean) => {
    try {
      await api.updateCaller(c._id, { archived });
      notify.success(archived ? `${c.name} archived` : `${c.name} unarchived`);
      changed();
    } catch (err) {
      notify.error(err, archived ? 'Failed to archive the caller' : 'Failed to unarchive the caller');
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteCaller(deleteTarget._id);
      notify.success(`${deleteTarget.name} deleted`);
      changed();
    } catch (err) {
      // A 409 carries the server's message ("This caller has rounds — archive them instead.").
      notify.error(err, 'Failed to delete the caller');
      changed();
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const schedule = (c: Caller) => `/interviews/callers?caller=${encodeURIComponent(c._id)}`;

  const menuItems = (c: Caller): ActionItem[] => {
    if (!canManage) return [];
    const items: ActionItem[] = [{ label: 'Edit', onSelect: () => setEditing(c) }];
    if (c.kind === 'external') {
      items.push({ label: c.archived ? 'Unarchive' : 'Archive', onSelect: () => void setArchived(c, !c.archived) });
      // Delete only for a caller who never had a round (needs the overview loaded to know).
      if (overview && (overview[c._id] ?? ZERO).rounds === 0) {
        items.push({ label: 'Delete', danger: true, onSelect: () => setDeleteTarget(c) });
      }
    }
    return items;
  };

  const row = (c: Caller) => {
    const o = overview?.[c._id] ?? ZERO;
    return (
      <tr key={c._id} className={`table-row cursor-pointer ${c.archived ? 'opacity-60' : ''}`} onClick={() => navigate(schedule(c))}>
        <td className="w-8 px-3 py-2.5">
          <span className={`block h-2.5 w-2.5 rounded-full ${CALLER_DOT[c.color] ?? 'bg-zinc-400'}`} aria-hidden />
        </td>
        <td className="px-3 py-2.5 text-left">
          <Link to={schedule(c)} className="font-medium text-strong hover:underline" onClick={(e) => e.stopPropagation()}>
            {c.name}
          </Link>
          {c.archived && <span className="badge badge-neutral ml-2">Archived</span>}
        </td>
        <td className="px-3 py-2.5 text-right">{overview ? o.upcoming : '—'}</td>
        <td className="px-3 py-2.5 text-right">{overview ? o.thisWeek : '—'}</td>
        <td className="px-3 py-2.5 text-right">
          {!overview || o.passRate == null ? (
            <span className="text-faint">—</span>
          ) : (
<span className="tabular-nums">{Math.round(o.passRate * 100)}%</span>
          )}
        </td>
        {canManage && (
          <td className="px-3 py-2.5 text-left text-xs">
            {c.slackUserId ? <span className="font-mono">{c.slackUserId}</span>
              : c.teamId ? <span className="badge badge-warning">No Slack ID: shown by name, not tagged</span>
              : <span className="text-faint">—</span>}
          </td>
        )}
        {canManage && (
          <td className="px-3 py-2.5 text-left">{c.teamName || <span className="text-faint">—</span>}</td>
        )}
        {canManage && (
          <td className="w-12 px-3 py-1.5 text-right">
            <ActionMenu label={`Actions for ${c.name}`} items={menuItems(c)} />
          </td>
        )}
      </tr>
    );
  };

  const cols = canManage ? 8 : 5;
  const section = (title: string, rows: Caller[], empty: string) => (
    <>
      <tr className="bg-zinc-50 dark:bg-zinc-900/60">
        <th colSpan={cols} scope="colgroup" className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">{title}</th>
      </tr>
      {rows.length === 0 ? (
        <tr><td colSpan={cols} className="px-3 py-3 text-sm text-muted">{empty}</td></tr>
      ) : rows.map(row)}
    </>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-strong">Callers</h2>
        {canManage && (
          <button type="button" className="btn btn-sm" onClick={() => setEditing('new')}>
            <Plus size={14} aria-hidden /> Add external caller
          </button>
        )}
      </div>

      <div className="panel overflow-hidden">
        <div className="table-wrap rounded-none border-0">
          <table className="min-w-full text-sm tabular-nums">
            <caption className="sr-only">Callers with their upcoming rounds, rounds this week and pass rate</caption>
            <thead className="table-head">
              <tr>
                <th scope="col" className="w-8 px-3 py-2.5"><span className="sr-only">Colour</span></th>
                <th scope="col" className="px-3 py-2.5 text-left">Name</th>
                <th scope="col" className="px-3 py-2.5 text-right">Upcoming</th>
                <th scope="col" className="px-3 py-2.5 text-right">This week</th>
                <th scope="col" className="px-3 py-2.5 text-right">Pass rate</th>
                {canManage && <th scope="col" className="px-3 py-2.5 text-left">Slack ID</th>}
                {canManage && <th scope="col" className="px-3 py-2.5 text-left">Team</th>}
                {canManage && <th scope="col" className="w-12 px-3 py-2.5"><span className="sr-only">Actions</span></th>}
              </tr>
            </thead>
            <tbody>
              {isLoading && all.length === 0 ? (
                <tr><td colSpan={cols} className="px-3 py-6 text-sm text-muted" role="status">Loading…</td></tr>
              ) : (
                section('External callers', external, 'No external callers yet.')
              )}
            </tbody>
          </table>
        </div>
      </div>

      <label className="flex w-fit items-center gap-2 text-sm">
        <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
        Show archived{archivedCount > 0 ? ` (${archivedCount})` : ''}
      </label>

      {editing && (
        <CallerEditPanel
          caller={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={changed}
        />
      )}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete caller?"
        body={`Deletes ${deleteTarget?.name ?? 'this caller'}. They have never had a round, so no history is lost.`}
        busy={deleting}
        onConfirm={remove}
        onCancel={() => setDeleteTarget(null)}
      />
      {canManage && <CallerTeamsPanel onChanged={changed} />}
    </div>
  );
}
