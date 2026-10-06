import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR, { mutate as globalMutate } from 'swr';
import { useSearchParams } from 'react-router-dom';
import { Check, ChevronRight, ExternalLink, X } from 'lucide-react';
import * as api from '../api/endpoints';
import { messageOf, notify } from '../lib/notify';
import ConfirmDialog from '../components/ConfirmDialog';
import LoadingSpinner from '../components/LoadingSpinner';
import Modal from '../components/Modal';
import PageHeader from '../components/PageHeader';
import Select from '../components/Select';

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'all', label: 'All' },
];

// Viewer-local, like the other pages.
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

const STATUS_BADGE: Record<api.BidStatus, string> = {
  pending: 'badge-neutral',
  approved: 'badge-success',
  rejected: 'badge-danger',
};

const NOTE_MAX = 500;
/** POST /bids/review accepts 1..500 ids. */
const BULK_MAX = 500;

/** Keys must not fire while the user is typing or choosing in a form control. */
function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName);
}

function Screenshots({ bidId }: { bidId: string }) {
  // Signed links live 5 minutes, so don't revalidate on focus.
  const { data, error, isLoading } = useSWR(['bid-screenshots', bidId] as const, () => api.bidScreenshots(bidId), {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });

  if (isLoading) return <div className="flex justify-center py-4"><LoadingSpinner size="sm" /></div>;
  if (error) return <p className="py-2 text-sm text-red-600">{messageOf(error, "Couldn't load screenshots.")}</p>;
  if (!data || data.length === 0) return <p className="py-2 text-sm text-muted">No screenshots.</p>;

  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {data.map((s) => {
        const caption = [s.step != null ? `Step ${s.step}` : null, s.trigger].filter(Boolean).join(' · ');
        return (
          <li key={s.key} className="space-y-1">
            {s.url ? (
              <a href={s.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${caption || 'screenshot'} full size in a new tab`}>
                <img
                  src={s.url}
                  alt={caption || 'Screenshot'}
                  loading="lazy"
                  className="aspect-video w-full rounded-lg border border-zinc-200 bg-zinc-100 object-cover object-top dark:border-zinc-700 dark:bg-zinc-800"
                />
              </a>
            ) : (
              <div className="flex aspect-video w-full items-center justify-center rounded-lg border border-dashed border-amber-300 bg-amber-50 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
                Missing upload
              </div>
            )}
            <p className="text-xs text-muted">{caption || '—'} · {fmtTime(s.capturedAt)}</p>
          </li>
        );
      })}
    </ul>
  );
}

export default function BidReviewPage() {
  const [params, setParams] = useSearchParams();
  const day = params.get('day') ?? '';
  const bidder = params.get('bidder') ?? '';
  const status = params.get('status') ?? 'pending';

  const setParam = (key: string, value: string) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    }, { replace: true });

  const filterKey = `${day}|${bidder}|${status}`;
  const { data, error, mutate } = useSWR(
    ['bids', day, bidder, status] as const,
    async () => ({
      ...(await api.listBids({
        day: day || undefined,
        bidderId: bidder || undefined,
        status: status === 'all' ? undefined : (status as api.BidStatus),
      })),
      filterKey,
    }),
    { keepPreviousData: true },
  );

  // keepPreviousData keeps the last filters' response around while the new key loads or after it fails. Its rows
  // must not be shown or acted on (Approve all, per-row buttons, a/r keys), so `view` is empty until the response
  // is for the current filters.
  const view = data && data.filterKey === filterKey ? data : undefined;
  const bids = useMemo(() => view?.bids ?? [], [view]);
  const summary = view?.summary ?? {};

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [cursor, setCursor] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<api.BidReviewItem | null>(null);
  const [note, setNote] = useState('');
  const [confirmAll, setConfirmAll] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const rowRefs = useRef<Record<string, HTMLLIElement | null>>({});

  // Rows disappear after a decision (status filter), so keep the cursor in range.
  const current = bids.length === 0 ? -1 : Math.max(0, Math.min(cursor, bids.length - 1));
  const currentId = current >= 0 ? bids[current].id : null;

  useEffect(() => {
    if (currentId) rowRefs.current[currentId]?.scrollIntoView({ block: 'nearest' });
  }, [currentId]);

  const refresh = useCallback(async () => {
    await mutate();
    globalMutate('bidder-live-counts');
  }, [mutate]);

  const decide = useCallback(async (bid: api.BidReviewItem, next: api.BidStatus, reason: string | null = null) => {
    if (busyId) return false;
    setBusyId(bid.id);
    try {
      await api.reviewBid(bid.id, { status: next, note: reason });
      notify.success(next === 'approved' ? 'Bid approved' : 'Bid rejected');
      await refresh();
      return true;
    } catch (err) {
      notify.error(err, `Failed to ${next === 'approved' ? 'approve' : 'reject'} bid`);
      return false;
    } finally {
      setBusyId(null);
    }
  }, [busyId, refresh]);

  const openReject = useCallback((bid: api.BidReviewItem) => {
    setNote(bid.status === 'rejected' ? bid.note ?? '' : '');
    setRejecting(bid);
  }, []);

  const submitReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejecting) return;
    if (await decide(rejecting, 'rejected', note.trim() || null)) setRejecting(null);
  };

  const approvable = bids.filter((b) => b.status !== 'approved');
  const approveAll = async () => {
    setBulkBusy(true);
    const ids = approvable.map((b) => b.id);
    const total = { updated: 0, skipped: 0 };
    try {
      for (let i = 0; i < ids.length; i += BULK_MAX) {
        const res = await api.reviewBids({ ids: ids.slice(i, i + BULK_MAX), status: 'approved' });
        total.updated += res.updated;
        total.skipped += res.skipped;
      }
      notify.success(
        total.skipped > 0 ? `Approved ${total.updated} bids (${total.skipped} skipped)` : `Approved ${total.updated} bids`,
      );
      setConfirmAll(false);
      await refresh();
    } catch (err) {
      notify.error(err, total.updated > 0 ? `Approved ${total.updated} bids, then failed` : 'Failed to approve bids');
      await refresh();
    } finally {
      setBulkBusy(false);
    }
  };

  const dialogOpen = !!rejecting || confirmAll;

  // Keyboard: j/k move, a approves, r rejects the current row.
  useEffect(() => {
    if (dialogOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || isTypingTarget(e.target)) return;
      const key = e.key.toLowerCase();
      if (key === 'j') setCursor(Math.max(0, Math.min(current + 1, bids.length - 1)));
      else if (key === 'k') setCursor(Math.max(current - 1, 0));
      else if ((key === 'a' || key === 'r') && current >= 0) {
        if (key === 'a') void decide(bids[current], 'approved');
        else openReject(bids[current]);
      } else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialogOpen, current, bids, decide, openReject]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const summaryEntries = Object.entries(summary).sort(([, a], [, b]) => a.name.localeCompare(b.name));
  const totals = summaryEntries.reduce(
    (t, [, s]) => ({ approved: t.approved + s.approved, pending: t.pending + s.pending, rejected: t.rejected + s.rejected }),
    { approved: 0, pending: 0, rejected: 0 },
  );
  // The selected bidder may not be in the summary yet (first load, shared link).
  const bidderOptions = [
    { value: '', label: 'All bidders' },
    ...summaryEntries.map(([id, s]) => ({ value: id, label: s.name })),
    ...(bidder && !summary[bidder] ? [{ value: bidder, label: 'Selected bidder' }] : []),
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Bid review" backTo="/bidders" />

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="bid-day" className="mb-1 block text-xs font-medium text-muted">Report day</label>
          <input
            id="bid-day"
            type="date"
            className="input text-sm"
            value={day || data?.day || ''}
            onChange={(e) => setParam('day', e.target.value)}
          />
        </div>
        {day && (
          <button type="button" className="btn-outline btn-sm" onClick={() => setParam('day', '')}>
            Current window
          </button>
        )}
        <div className="w-48">
          <Select
            label="Bidder"
            labelClassName="mb-1 block text-xs font-medium text-muted"
            value={bidder}
            onChange={(v) => setParam('bidder', v)}
            options={bidderOptions}
          />
        </div>
        <div className="w-40">
          <Select
            label="Status"
            labelClassName="mb-1 block text-xs font-medium text-muted"
            value={status}
            onChange={(v) => setParam('status', v === 'pending' ? '' : v)}
            options={STATUS_FILTERS}
          />
        </div>
        <button
          type="button"
          className="btn ml-auto"
          disabled={approvable.length === 0 || bulkBusy}
          onClick={() => setConfirmAll(true)}
        >
          Approve all shown{approvable.length > 0 ? ` (${approvable.length})` : ''}
        </button>
      </div>

      {error && <p role="alert" className="text-sm text-red-600">{messageOf(error, 'Failed to load bids')}</p>}
      {(view || !error) && (
        <>
          {view && (
            <section aria-label="Summary" className="panel space-y-3 p-4 text-sm">
              <p className="text-muted">
                Window for <strong className="text-body">{view.day}</strong>: {fmtTime(view.start)} → {fmtTime(view.end)}
              </p>
              <p>
                <strong>Total</strong> · Approved {totals.approved} · Pending {totals.pending} · Rejected {totals.rejected}
              </p>
              {summaryEntries.length > 0 && (
                <ul className="space-y-1">
                  {summaryEntries.map(([id, s]) => (
                    <li key={id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-medium">{s.name}</span>
                      <span className="text-muted">Approved {s.approved} · Pending {s.pending} · Rejected {s.rejected}</span>
                      {s.foldersWithoutRecord != null && s.foldersWithoutRecord > 0 && (
                        <span
                          className="badge-warning"
                          title="Job folders in Backblaze with no bid record, usually a bidder still on the old extension. They count 0."
                        >
                          {s.foldersWithoutRecord} {s.foldersWithoutRecord === 1 ? 'folder' : 'folders'} without a record
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {!view ? (
            <div role="status" className="flex items-center justify-center py-10 text-muted">
              <div className="spinner spinner-md mr-3" aria-hidden></div>
              Loading bids...
            </div>
          ) : bids.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">No bids match these filters.</p>
          ) : (
            <>
              <p className="text-xs text-muted">
                Keys: <kbd>j</kbd>/<kbd>k</kbd> move, <kbd>a</kbd> approve, <kbd>r</kbd> reject.
              </p>
              <ul className="space-y-2">
                {bids.map((b, i) => {
                  const open = expanded.has(b.id);
                  const busy = busyId === b.id;
                  const isCurrent = i === current;
                  const panelId = `bid-shots-${b.id}`;
                  return (
                    <li
                      key={b.id}
                      ref={(el) => { rowRefs.current[b.id] = el; }}
                      aria-current={isCurrent ? 'true' : undefined}
                      onClick={() => setCursor(i)}
                      className={`panel p-3 ${isCurrent ? 'ring-2 ring-sky-600 dark:ring-sky-400' : ''}`}
                    >
                      <div className="flex flex-wrap items-start gap-3">
                        <button
                          type="button"
                          className="btn-icon"
                          aria-expanded={open}
                          aria-controls={panelId}
                          aria-label={open ? 'Hide screenshots' : 'Show screenshots'}
                          onClick={() => toggle(b.id)}
                        >
                          <ChevronRight size={16} aria-hidden className={`transition-transform ${open ? 'rotate-90' : ''}`} />
                        </button>
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            {b.jobUrl ? (
                              <a
                                href={b.jobUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex min-w-0 items-center gap-1 font-medium underline-offset-2 hover:underline"
                              >
                                <span className="truncate">{b.jobTitle || b.jobUrl}</span>
                                <ExternalLink size={12} aria-hidden className="shrink-0" />
                              </a>
                            ) : (
                              <span className="font-medium">{b.jobTitle || 'Untitled job'}</span>
                            )}
                            <span className={STATUS_BADGE[b.status]}>{b.status}</span>
                          </div>
                          <p className="text-xs text-muted">
                            {b.bidderName} · {fmtTime(b.firstAt)} · {b.screenshotCount} {b.screenshotCount === 1 ? 'screenshot' : 'screenshots'}
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {!b.submittedAt && <span className="badge-warning">No submit screenshot</span>}
                            {b.missingUploads > 0 && <span className="badge-warning">Missing upload{b.missingUploads > 1 ? ` (${b.missingUploads})` : ''}</span>}
                            {b.changedSinceReview && <span className="badge-info">New screenshots since review</span>}
                          </div>
                          {b.status !== 'pending' && b.reviewedByName && (
                            <p className="text-xs text-muted">
                              {b.status === 'approved' ? 'Approved' : 'Rejected'} by {b.reviewedByName}
                              {b.reviewedAt ? ` · ${fmtTime(b.reviewedAt)}` : ''}
                              {b.note ? ` · "${b.note}"` : ''}
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <button
                            type="button"
                            className="btn-success btn-sm"
                            disabled={busy}
                            onClick={() => void decide(b, 'approved')}
                          >
                            <Check size={14} aria-hidden /> Approve
                          </button>
                          <button
                            type="button"
                            className="btn-outline btn-sm"
                            disabled={busy}
                            onClick={() => openReject(b)}
                          >
                            <X size={14} aria-hidden /> Reject
                          </button>
                        </div>
                      </div>
                      {open && (
                        <div id={panelId} className="mt-3 border-t border-zinc-200 pt-3 dark:border-zinc-700">
                          <Screenshots bidId={b.id} />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </>
      )}

      <Modal open={!!rejecting} onClose={() => setRejecting(null)} title="Reject bid" size="sm">
        <form onSubmit={submitReject} className="space-y-4">
          <p className="text-sm text-body">
            {rejecting?.jobTitle || rejecting?.jobUrl || 'This bid'} · {rejecting?.bidderName}
          </p>
          <div>
            <label htmlFor="bid-reject-note" className="mb-1 block text-xs font-medium text-muted">Reason (optional)</label>
            <textarea
              id="bid-reject-note"
              className="input w-full resize-y text-sm"
              rows={3}
              maxLength={NOTE_MAX}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-outline text-sm" onClick={() => setRejecting(null)} disabled={!!busyId}>Cancel</button>
            <button type="submit" className="btn-danger text-sm" disabled={!!busyId}>{busyId ? 'Working…' : 'Reject'}</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={confirmAll}
        title="Approve all shown"
        body={`Approve ${approvable.length} ${approvable.length === 1 ? 'bid' : 'bids'} shown? Any notes on them are cleared.`}
        confirmLabel="Approve all"
        tone="default"
        busy={bulkBusy}
        onConfirm={approveAll}
        onCancel={() => setConfirmAll(false)}
      />
    </div>
  );
}
