import { useEffect, useMemo, useState } from 'react';
import { Check, ExternalLink, Image as ImageIcon, LayoutGrid, Table2, X } from 'lucide-react';
import * as api from '../../api/endpoints';
import { messageOf } from '../../lib/notify';
import Modal from '../Modal';
import SidePanel from '../SidePanel';
import SubmittedBadge from '../bids/SubmittedBadge';
import { isComplete, reasonLabel } from '../bids/util';

type Filter = 'pending' | 'approved' | 'rejected' | 'all';
type View = 'table' | 'shots';

const STATUS_BADGE: Record<api.BidStatus, string> = {
  pending: 'badge-neutral',
  approved: 'badge-success',
  rejected: 'badge-danger',
};

const VIEW_KEY = 'bidders.dayPanel.view';
const time = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

function Thumb({ bid, large = false }: { bid: api.BidReviewItem; large?: boolean }) {
  const box = large ? 'aspect-video w-full' : 'h-8 w-12';
  return bid.thumbUrl ? (
    <img
      src={bid.thumbUrl}
      alt=""
      loading="lazy"
      className={`${box} shrink-0 rounded border border-zinc-200 bg-zinc-100 object-cover object-top dark:border-zinc-700 dark:bg-zinc-800`}
    />
  ) : (
    <span
      className={`${box} flex shrink-0 items-center justify-center rounded border border-dashed border-zinc-300 text-muted dark:border-zinc-700`}
      title="No screenshot uploaded"
    >
      <ImageIcon size={large ? 20 : 12} aria-hidden />
    </span>
  );
}

/**
 * One day of a bidder's bids in a side panel: status filter, a table with small thumbnails (or a screenshots-only
 * gallery), bulk approve / reject and Approve all complete. A row or card opens the review overlay at that bid, over
 * the bids shown (in the shown order).
 */
export default function DayPanel({
  open,
  title,
  subtitle,
  bids,
  error,
  busy,
  onClose,
  onReview,
  onDecide,
  onBulk,
  onApproveAllComplete,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  /** Oldest first; undefined while loading. */
  bids?: api.BidReviewItem[];
  error?: unknown;
  busy: boolean;
  onClose: () => void;
  onReview: (bidId: string, ids: string[]) => void;
  onDecide: (bid: api.BidReviewItem, status: api.BidStatus) => void;
  onBulk: (ids: string[], status: api.BidStatus, reason?: api.RejectReason) => Promise<void>;
  onApproveAllComplete: (bids: api.BidReviewItem[]) => void;
}) {
  const all = useMemo(() => bids ?? [], [bids]);
  const counts = useMemo(() => {
    const c = { pending: 0, approved: 0, rejected: 0, all: all.length };
    for (const b of all) c[b.status] += 1;
    return c;
  }, [all]);

  const [filter, setFilter] = useState<Filter | null>(null);
  // Pending first when there is something to review; the choice sticks while the panel is open.
  const shownFilter: Filter = filter ?? (counts.pending ? 'pending' : 'all');
  const [view, setView] = useState<View>(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === 'shots' ? 'shots' : 'table';
    } catch {
      return 'table';
    }
  });
  const chooseView = (v: View) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* per-viewer convenience only */
    }
  };
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkReject, setBulkReject] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelected(new Set());
  }, [open, title]);
  useEffect(() => setFilter(null), [title]);

  const shown = useMemo(() => (shownFilter === 'all' ? all : all.filter((b) => b.status === shownFilter)), [all, shownFilter]);
  const shownIds = shown.map((b) => b.id);
  const picked = shown.filter((b) => selected.has(b.id));
  const allPicked = shown.length > 0 && picked.length === shown.length;
  const complete = all.filter(isComplete);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const bulk = async (status: api.BidStatus, reason?: api.RejectReason) => {
    await onBulk(picked.map((b) => b.id), status, reason);
    setSelected(new Set());
    setBulkReject(false);
  };

  const FILTERS: { key: Filter; label: string; tone: string }[] = [
    { key: 'pending', label: 'Pending', tone: 'badge-warning' },
    { key: 'approved', label: 'Approved', tone: 'badge-success' },
    { key: 'rejected', label: 'Rejected', tone: 'badge-danger' },
    { key: 'all', label: 'All', tone: 'badge-neutral' },
  ];

  return (
    <SidePanel open={open} wide title={title} subtitle={subtitle} onClose={onClose}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div role="group" aria-label="Status" className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                aria-pressed={shownFilter === f.key}
                onClick={() => {
                  setFilter(f.key);
                  setSelected(new Set());
                }}
                className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                  shownFilter === f.key
                    ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
                    : 'border-zinc-200 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800'
                }`}
              >
                {f.label} <span className="tabular-nums opacity-70">{counts[f.key]}</span>
              </button>
            ))}
          </div>
          <div role="group" aria-label="View" className="flex rounded-lg border border-zinc-200 p-0.5 dark:border-zinc-700">
            {([['table', 'Table', Table2], ['shots', 'Screenshots', LayoutGrid]] as const).map(([key, label, Icon]) => (
              <button
                key={key}
                type="button"
                aria-pressed={view === key}
                onClick={() => chooseView(key)}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium ${
                  view === key ? 'bg-zinc-100 text-strong dark:bg-zinc-800' : 'text-muted hover:text-body'
                }`}
              >
                <Icon size={14} aria-hidden /> {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {picked.length > 0 ? (
            <>
              <span className="font-medium text-strong">{picked.length} selected</span>
              <button type="button" className="btn-success btn-sm" disabled={busy} onClick={() => void bulk('approved')}>
                <Check size={14} aria-hidden /> Approve
              </button>
              <button type="button" className="btn-outline btn-sm" disabled={busy} onClick={() => setBulkReject(true)}>
                <X size={14} aria-hidden /> Reject…
              </button>
              <button type="button" className="text-muted underline" onClick={() => setSelected(new Set())}>Clear</button>
            </>
          ) : (
            <span className="text-muted">Click a bid to review it full screen · tick rows to approve or reject several</span>
          )}
          {counts.pending > 0 && (
            <button
              type="button"
              className="btn btn-sm ml-auto"
              disabled={busy || complete.length === 0}
              title="Pending bids with a Submit screenshot and every upload confirmed"
              onClick={() => onApproveAllComplete(complete)}
            >
              Approve all complete ({complete.length})
            </button>
          )}
        </div>

        {error ? (
          <p role="alert" className="text-sm text-red-600">{messageOf(error, "Couldn't load bids")}</p>
        ) : !bids ? (
          <div className="space-y-2" aria-busy="true">
            {Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton h-10 w-full" />)}
          </div>
        ) : shown.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">
            {all.length === 0 ? 'No bid records this day.' : `No ${shownFilter} bids this day.`}
          </p>
        ) : view === 'table' ? (
          <div className="table-wrap">
            <table className="min-w-[720px] w-full text-sm">
              <thead className="table-head">
                <tr>
                  <th scope="col" className="w-8 px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label="Select all shown bids"
                      checked={allPicked}
                      onChange={() => setSelected(allPicked ? new Set() : new Set(shownIds))}
                    />
                  </th>
                  <th scope="col" className="px-2 py-2">Time</th>
                  <th scope="col" className="px-2 py-2"><span className="sr-only">Screenshot</span></th>
                  <th scope="col" className="px-2 py-2">Job</th>
                  <th scope="col" className="px-2 py-2">Checks</th>
                  <th scope="col" className="px-2 py-2">Status</th>
                  <th scope="col" className="px-2 py-2"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {shown.map((b) => (
                  <tr
                    key={b.id}
                    className={`table-row cursor-pointer ${selected.has(b.id) ? 'bg-sky-50/60 dark:bg-sky-950/30' : ''}`}
                    onClick={() => onReview(b.id, shownIds)}
                  >
                    <td className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Select ${b.jobTitle || 'bid'}`}
                        checked={selected.has(b.id)}
                        onChange={() => toggle(b.id)}
                      />
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-xs tabular-nums text-muted">{time(b.firstAt)}</td>
                    <td className="px-2 py-1.5"><Thumb bid={b} /></td>
                    <td className="max-w-[16rem] px-2 py-1.5">
                      <button
                        type="button"
                        className="block max-w-full truncate text-left font-medium text-strong underline-offset-2 hover:underline focus-ring"
                        onClick={(e) => { e.stopPropagation(); onReview(b.id, shownIds); }}
                      >
                        {b.jobTitle || 'Untitled job'}
                      </button>
                      {b.jobUrl ? (
                        <a
                          href={b.jobUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex max-w-full items-center gap-1 text-xs text-muted hover:underline"
                        >
                          <span className="truncate">{b.jobDomain || b.jobUrl}</span>
                          <ExternalLink size={10} aria-hidden className="shrink-0" />
                        </a>
                      ) : (
                        <span className="text-xs text-muted">{b.jobDomain}</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex flex-wrap gap-1 whitespace-nowrap">
                        <SubmittedBadge bid={b} />
                        {b.missingUploads > 0 && <span className="badge-warning">Missing upload</span>}
                      </div>
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex flex-wrap gap-1">
                        <span className={STATUS_BADGE[b.status]}>{b.status}</span>
                        {b.status === 'rejected' && b.rejectReason && (
                          <span className="badge-danger" title={b.note ?? undefined}>{reasonLabel(b.rejectReason)}</span>
                        )}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="btn-icon text-emerald-700 dark:text-emerald-400"
                        disabled={busy || b.status === 'approved'}
                        aria-label={`Approve ${b.jobTitle || 'bid'}`}
                        title="Approve"
                        onClick={() => onDecide(b, 'approved')}
                      >
                        <Check size={16} aria-hidden />
                      </button>
                      <button
                        type="button"
                        className="btn-icon text-red-700 dark:text-red-400"
                        disabled={busy}
                        aria-label={`Reject ${b.jobTitle || 'bid'}`}
                        title="Reject"
                        onClick={() => onDecide(b, 'rejected')}
                      >
                        <X size={16} aria-hidden />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {shown.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  className="panel block w-full overflow-hidden p-0 text-left transition hover:ring-2 hover:ring-sky-500 focus-ring"
                  onClick={() => onReview(b.id, shownIds)}
                >
                  <Thumb bid={b} large />
                  <span className="block space-y-1 p-2">
                    <span className="block truncate text-sm font-medium text-strong">{b.jobTitle || 'Untitled job'}</span>
                    <span className="flex flex-wrap items-center gap-1 text-xs">
                      <span className="text-muted">{time(b.firstAt)}</span>
                      <span className={STATUS_BADGE[b.status]}>{b.status}</span>
                      {!b.submittedAt && <span className="badge-warning">Not submitted</span>}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal open={bulkReject} onClose={() => setBulkReject(false)} title={`Reject ${picked.length} bids`} size="sm">
        <p className="mb-3 text-sm text-body">Choose the reason for all of them. (Other needs a note, so reject those one at a time.)</p>
        <div className="grid grid-cols-2 gap-2">
          {api.REJECT_REASONS.filter((r) => r.value !== 'other').map((r) => (
            <button key={r.value} type="button" className="btn-outline btn-sm" disabled={busy} onClick={() => void bulk('rejected', r.value)}>
              {r.label}
            </button>
          ))}
        </div>
      </Modal>
    </SidePanel>
  );
}
