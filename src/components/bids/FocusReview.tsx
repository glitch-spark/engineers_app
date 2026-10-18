import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR, { mutate as globalMutate, preload } from 'swr';
import toast from 'react-hot-toast';
import { CheckCircle2 } from 'lucide-react';
import * as api from '../../api/endpoints';
import { messageOf, notify } from '../../lib/notify';
import LoadingSpinner from '../LoadingSpinner';
import BidEvidence from './BidEvidence';
import FocusToolbar from './FocusToolbar';
import Kbd from './Kbd';
import ReviewActions from './ReviewActions';
import StepViewer, { defaultStep } from './StepViewer';
import { dayParts } from '../bidders/weekDates';
import { byFirstAt, dialogIsOpen, isTypingTarget, reasonLabel } from './util';
import { safeHref } from '../../lib/safeHref';

type Bid = api.BidReviewItem;

/** What a decision replaced; Undo puts exactly this back. */
interface UndoEntry {
  bidId: string;
  title: string;
  /** The status this session set; Undo only applies while the bid still has it. */
  status: api.BidStatus;
  prev: { status: api.BidStatus; reason: api.RejectReason | null; note: string | null };
  toastId: string;
}

const UNDO_MAX = 50;
/** A press this soon after a "Changed by" notice appeared doesn't count as having seen it. */
const NOTICE_GRACE_MS = 600;

// Same key and data as the list's screenshot panel, so the two share the cache.
const shotsKey = (id: string) => ['bid-screenshots', id] as const;
const fetchShots = ([, id]: readonly [string, string]) => api.bidScreenshots(id);

const titleOf = (b: Bid) => b.jobTitle || b.jobDomain || 'Untitled job';
const changedText = (b: Bid) => `Changed by ${b.reviewedByName || 'another reviewer'} to ${b.status}`;

/** After a decision in a given list: the next bid in it, else the first one still pending (`from` excluded). */
function nextInList(ids: string[], bids: Bid[], from: Bid): string | null {
  const after = ids[ids.indexOf(from.id) + 1];
  if (after) return after;
  const pending = new Set(bids.filter((b) => b.status === 'pending').map((b) => b.id));
  return ids.find((id) => id !== from.id && pending.has(id)) ?? null;
}

/** The pending bid to show after `from`: the next one in order, else the oldest left (`from` itself excluded). */
function nextPending(bids: Bid[], from: Bid): string | null {
  const left = bids.filter((b) => b.status === 'pending' && b.id !== from.id).sort(byFirstAt);
  return (left.find((b) => byFirstAt(b, from) > 0) ?? left[0])?.id ?? null;
}

interface Notice {
  bidId: string;
  text: string;
  at: number;
}

export type FocusScope = { day: string } | { week: string };

/** "Sun Oct 4" for a day scope, "Week ending Sat Oct 10" for a week scope. */
const scopeLabel = (scope: FocusScope) => {
  const key = 'day' in scope ? scope.day : scope.week;
  const p = dayParts(key);
  return 'day' in scope ? `${p.weekday} ${p.date}` : `Week ending ${p.weekday} ${p.date}`;
};

/**
 * Full-screen review overlay over the bids of a fixed day or pay week (one bidder or all), decided from the keyboard.
 * `ids` (e.g. a filtered day table, in its order) is the list to walk, starting at `startAt`; without it
 * `set: 'pending'` walks the pending bids oldest first and `set: 'all'` every bid of the scope.
 */
export default function FocusReview({
  scope,
  bidderId,
  startAt,
  ids,
  set,
  onExit,
}: {
  scope: FocusScope;
  bidderId?: string;
  startAt?: string;
  ids?: string[];
  set: 'pending' | 'all';
  onExit: () => void;
}) {
  // A key per visit: a cached list from an earlier visit is out of date (bids decided in the list since), and pinning a
  // bid from it would start the viewer on one that is no longer pending.
  const [visit] = useState(() => Date.now());
  const scopeKey = 'day' in scope ? `day:${scope.day}` : `week:${scope.week}`;
  const { data, error, mutate } = useSWR(['bid-focus', scopeKey, bidderId ?? '', visit] as const, () =>
    api.listBids({ ...scope, bidderId: bidderId || undefined }),
  );

  const all = useMemo(() => [...(data?.bids ?? [])].sort(byFirstAt), [data]);
  const pending = useMemo(() => all.filter((b) => b.status === 'pending'), [all]);
  const approved = all.filter((b) => b.status === 'approved').length;
  const rejected = all.filter((b) => b.status === 'rejected').length;

  // The shown bid is pinned by id, so it stays on screen when it stops being pending (changed by someone else).
  const [currentId, setCurrentId] = useState<string | null>(null);
  // startAt only picks the first bid shown: once the reviewer moves on (or runs out of pending bids), it's spent.
  const seed = useRef(startAt);
  const current =
    (currentId ? all.find((b) => b.id === currentId) : undefined) ??
    (!currentId && seed.current ? all.find((b) => b.id === seed.current) : undefined) ??
    pending[0] ??
    null;
  // ←/→ move through the given list, every bid ('all'), or the pending bids plus the shown one if it no longer is.
  const nav = useMemo(() => {
    if (ids) {
      const byId = new Map(all.map((b) => [b.id, b]));
      return ids.map((id) => byId.get(id)).filter((b): b is Bid => !!b);
    }
    if (set === 'all') return all;
    return current && current.status !== 'pending' ? [...pending, current].sort(byFirstAt) : pending;
  }, [ids, set, all, pending, current]);
  const pos = current ? nav.findIndex((b) => b.id === current.id) : -1;
  const after = (bids: Bid[], from: Bid) => (ids ? nextInList(ids, bids, from) : nextPending(bids, from));
  const nextId = current ? after(all, current) : null;

  // The overlay covers the page: lock its scroll while open.
  useEffect(() => {
    const root = document.documentElement;
    const prev = root.style.overflow;
    root.style.overflow = 'hidden';
    return () => {
      root.style.overflow = prev;
    };
  }, []);

  const [notice, setNotice] = useState<Notice | null>(null);
  const noticeRef = useRef<Notice | null>(null);
  const [rejectFor, setRejectFor] = useState<string | null>(null);
  const [otherFor, setOtherFor] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [step, setStep] = useState<{ bidId: string; index: number } | null>(null);
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const noteRef = useRef<HTMLInputElement>(null);

  const rejectOpen = !!current && rejectFor === current.id;
  const otherChosen = rejectOpen && otherFor === current?.id;
  const shownNotice = current && notice?.bidId === current.id ? notice.text : null;

  // Pin the first bid shown, so a refresh that brings an older pending bid doesn't swap it underneath the reviewer.
  useEffect(() => {
    if (!currentId && current) setCurrentId(current.id);
  }, [currentId, current]);

  // The status the reviewer has seen for the shown bid; a decision is checked against this, not against whatever a
  // background refresh has put on screen since. Only a "Changed by" notice (or this viewer's own decision) moves it.
  const shownRef = useRef<{ bidId: string; status: api.BidStatus } | null>(null);
  const showChanged = useCallback((b: Bid) => {
    shownRef.current = { bidId: b.id, status: b.status };
    noticeRef.current = { bidId: b.id, text: changedText(b), at: Date.now() };
    setNotice(noticeRef.current);
  }, []);
  const expectStatus = (bidId: string, status: api.BidStatus) => {
    if (shownRef.current?.bidId === bidId) shownRef.current = { bidId, status };
  };
  useEffect(() => {
    if (!current) return;
    const shown = shownRef.current;
    if (!shown || shown.bidId !== current.id) shownRef.current = { bidId: current.id, status: current.status };
    else if (shown.status !== current.status) showChanged(current); // a refresh changed it: say so
  }, [current, showChanged]);

  // The viewer's own root: focus parks here when the shown bid changes (see go).
  const rootRef = useRef<HTMLDivElement>(null);
  const go = useCallback((id: string | null) => {
    // A button clicked with the mouse keeps focus across the move, and Enter/Space would then act on the next bid unseen.
    const active = document.activeElement;
    if (active instanceof HTMLElement && rootRef.current?.contains(active)) rootRef.current.focus({ preventScroll: true });
    seed.current = undefined;
    setCurrentId(id);
    noticeRef.current = null;
    setNotice(null);
    setRejectFor(null);
    setOtherFor(null);
    setNote('');
  }, []);

  const shotsSWR = useSWR(current ? shotsKey(current.id) : null, fetchShots, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
    refreshInterval: 240_000, // signed links live 5 minutes
  });
  const shots = shotsSWR.data;
  const stepIndex = !shots?.length
    ? 0
    : step && step.bidId === current?.id
      ? Math.min(step.index, shots.length - 1)
      : defaultStep(shots);

  // Prefetch the next bid's screenshots and its first-shown image.
  const prefetched = useRef(new Set<string>());
  useEffect(() => {
    if (!nextId || prefetched.current.has(nextId)) return;
    prefetched.current.add(nextId);
    preload(shotsKey(nextId), fetchShots).then(
      (list) => {
        const url = list[defaultStep(list)]?.url;
        if (url) new Image().src = url;
      },
      () => prefetched.current.delete(nextId),
    );
  }, [nextId]);

  // Awaited before moving on, so the decided bid has already left the pending list when the next one is picked.
  const putBid = useCallback(
    (bid: Bid) =>
      mutate((prev) => prev && { ...prev, bids: prev.bids.map((b) => (b.id === bid.id ? bid : b)) }, { revalidate: false }),
    [mutate],
  );

  const run = async (work: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await work();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  // The toast's Undo button outlives this render, so it calls the latest undo through a ref.
  const undoRef = useRef<(entry?: UndoEntry) => void>(() => {});

  const decide = (bid: Bid, next: api.BidStatus, rejection?: { reason: api.RejectReason; note: string | null }) => {
    const pressedAt = Date.now();
    return run(async () => {
      try {
        // Someone else may have decided it since it was shown: show that and wait for the action again.
        const seen = shownRef.current?.bidId === bid.id ? shownRef.current.status : bid.status;
        const fresh = await api.getBid(bid.id);
        const changed = fresh.status !== seen;
        if (changed) showChanged(fresh);
        await putBid(fresh);
        // A notice that appeared just before (or during) this press hasn't been read yet: the press doesn't count.
        const n = noticeRef.current;
        if (changed || (n && n.bidId === bid.id && n.at > pressedAt - NOTICE_GRACE_MS)) return;
        if (fresh.screenshotCount !== bid.screenshotCount) void globalMutate(shotsKey(bid.id));
        const updated = await api.reviewBid(bid.id, {
          status: next,
          note: rejection?.note ?? null,
          ...(rejection ? { reason: rejection.reason } : {}),
        });
        expectStatus(bid.id, updated.status);
        const latest = await putBid(updated);
        const entry: UndoEntry = {
          bidId: bid.id,
          title: titleOf(bid),
          status: next,
          prev: { status: fresh.status, reason: fresh.rejectReason, note: fresh.note },
          toastId: `bid-decision-${bid.id}-${Date.now()}`,
        };
        setUndoStack((s) => [...s.slice(1 - UNDO_MAX), entry]);
        const label = next === 'approved' ? 'Approved' : `Rejected · ${reasonLabel(rejection?.reason ?? null) ?? 'no reason'}`;
        toast(
          () => (
            <span className="flex items-center gap-3">
              <span className="min-w-0">
                {label} · <span className="inline-block max-w-[14rem] truncate align-bottom font-medium">{entry.title}</span>
              </span>
              <button
                type="button"
                className="font-semibold text-sky-700 underline dark:text-sky-400"
                // undo dismisses this toast once it runs (not while another decision is still saving).
                onClick={() => undoRef.current(entry)}
              >
                Undo
              </button>
            </span>
          ),
          { id: entry.toastId, duration: 6000, style: { fontSize: '0.875rem' } },
        );
        // From the latest data, so a bid decided elsewhere in the meantime is skipped.
        go(after(latest?.bids ?? [], bid));
      } catch (err) {
        notify.error(err, `Failed to ${next === 'approved' ? 'approve' : 'reject'} bid`);
      }
    });
  };

  const undo = (entry?: UndoEntry) => {
    const target = entry ?? undoStack[undoStack.length - 1];
    if (!target) return;
    return run(async () => {
      toast.dismiss(target.toastId);
      const drop = () => setUndoStack((s) => s.filter((e) => e !== target));
      try {
        const fresh = await api.getBid(target.bidId);
        await putBid(fresh);
        if (fresh.status !== target.status) {
          drop();
          notify.warn(`Not undone. ${changedText(fresh)}.`);
          return;
        }
        const { prev } = target;
        const restored = await api.reviewBid(target.bidId, {
          status: prev.status,
          note: prev.note,
          ...(prev.status === 'rejected' && prev.reason ? { reason: prev.reason } : {}),
        });
        expectStatus(target.bidId, restored.status);
        await putBid(restored);
        drop();
        go(target.bidId);
        notify.info(`Undone: back to ${prev.status}`);
      } catch (err) {
        notify.error(err, "Couldn't undo");
      }
    });
  };
  undoRef.current = (entry) => void undo(entry);

  const toggleReject = () => {
    if (!current) return;
    setRejectFor(rejectOpen ? null : current.id);
    setOtherFor(null);
    setNote('');
  };

  const chooseReason = (reason: api.RejectReason) => {
    if (!current || busyRef.current) return;
    if (reason === 'other') {
      setOtherFor(current.id);
      noteRef.current?.focus();
      return;
    }
    void decide(current, 'rejected', { reason, note: note.trim() || null });
  };

  const submitOther = (e: React.FormEvent) => {
    e.preventDefault();
    if (!current || !otherChosen || !note.trim()) return;
    void decide(current, 'rejected', { reason: 'other', note: note.trim() });
  };

  const move = (delta: 1 | -1) => {
    const target = pos < 0 || busyRef.current ? undefined : nav[pos + delta];
    if (target) go(target.id);
  };

  const showStep = (delta: 1 | -1) => {
    if (!current || !shots?.length) return;
    setStep({ bidId: current.id, index: Math.max(0, Math.min(stepIndex + delta, shots.length - 1)) });
  };

  const openFullSize = () => {
    const shot = shots?.[stepIndex];
    const href = safeHref(shot?.url);
    if (href) window.open(href, '_blank', 'noopener,noreferrer');
    else if (shot) notify.warn("This screenshot didn't upload");
  };

  // One listener; it reads this render's state through the ref.
  const onKeyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  onKeyRef.current = (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target) || dialogIsOpen()) return;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const stepKey = key === 'ArrowUp' || key === 'ArrowDown';
    if (e.repeat && !stepKey) return;
    const reason = api.REJECT_REASONS.find((r) => r.key === key);
    if (key === 'Escape') {
      if (rejectOpen) toggleReject();
      else onExit();
    } else if (key === 'u') void undo();
    else if (!current) return;
    else if (stepKey) showStep(key === 'ArrowDown' ? 1 : -1);
    else if (key === 'ArrowRight' || key === 'j') move(1);
    else if (key === 'ArrowLeft' || key === 'k') move(-1);
    else if (key === 'f') openFullSize();
    else if (key === 'a') void decide(current, 'approved');
    else if (key === 'r') toggleReject();
    else if (reason && rejectOpen) chooseReason(reason.value);
    else return;
    e.preventDefault();
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => onKeyRef.current(e);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const overlay = (body: React.ReactNode) => (
    <div
      role="region"
      aria-label="Bid review"
      className="fixed inset-0 z-[70] overflow-y-auto bg-zinc-950/90 p-3 backdrop-blur-sm sm:p-5"
    >
      <div className="mx-auto max-w-[1600px]">{body}</div>
    </div>
  );

  if (!data) {
    return overlay(error ? (
      <div role="alert" className="panel flex flex-col items-center gap-3 px-6 py-12 text-center text-sm">
        <p className="text-red-600">{messageOf(error, 'Failed to load bids')}</p>
        <div className="flex gap-2">
          <button type="button" className="btn-outline btn-sm" onClick={onExit}>Back</button>
          <button type="button" className="btn btn-sm" onClick={() => void mutate()}>Try again</button>
        </div>
      </div>
    ) : (
      <div role="status" className="panel flex items-center justify-center gap-3 py-10 text-muted">
        <LoadingSpinner size="md" /> Loading bids...
      </div>
    ));
  }

  const pendingPos = current ? pending.findIndex((b) => b.id === current.id) : -1;
  const bidderName = bidderId ? data.summary[bidderId]?.name : 'All bidders';
  const label = scopeLabel(scope);
  const progress =
    (ids || set === 'all') && pos >= 0
      ? `Bid ${pos + 1} of ${nav.length} · ${pending.length} pending`
      : pendingPos >= 0
        ? `Bid ${pendingPos + 1} of ${pending.length} pending`
        : `${pending.length} pending`;
  const toolbar = (
    <FocusToolbar
      progress={progress}
      approved={approved}
      rejected={rejected}
      scope={`${label}${bidderName ? ` · ${bidderName}` : ''}`}
      canPrev={!busy && pos > 0}
      canNext={!busy && pos >= 0 && pos < nav.length - 1}
      canUndo={!busy && undoStack.length > 0}
      onExit={onExit}
      onMove={move}
      onUndo={() => void undo()}
    />
  );

  if (!current) {
    return overlay(
      <div className="space-y-4">
        {toolbar}
        <div className="panel flex flex-col items-center gap-3 px-6 py-12 text-center">
          <CheckCircle2 size={32} aria-hidden className="text-emerald-600 dark:text-emerald-400" />
          <p className="text-lg font-semibold">All bids for {label} reviewed</p>
          <p className="text-sm text-muted">{approved} approved · {rejected} rejected</p>
          <button type="button" className="btn" onClick={onExit}>Back</button>
        </div>
      </div>,
    );
  }

  return overlay(
    <div ref={rootRef} tabIndex={-1} className="space-y-3 outline-none">
      {toolbar}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(18rem,3fr)]">
        <div className="panel min-w-0 p-3 sm:p-4">
          <StepViewer
            bidId={current.id}
            shots={shots}
            error={shotsSWR.error}
            index={stepIndex}
            onSelect={(index) => setStep({ bidId: current.id, index })}
            onRetry={() => void shotsSWR.mutate()}
          />
        </div>
        <aside aria-label="Bid details" className="panel space-y-4 p-4 lg:sticky lg:top-4">
          {shownNotice && (
            <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
              <strong>{shownNotice}.</strong> Press the action again to apply it anyway.
            </p>
          )}
          <BidEvidence bid={current} />
          <ReviewActions
            busy={busy}
            rejectOpen={rejectOpen}
            otherChosen={otherChosen}
            note={note}
            noteRef={noteRef}
            onNote={setNote}
            onApprove={() => void decide(current, 'approved')}
            onToggleReject={toggleReject}
            onReason={chooseReason}
            onSubmitOther={submitOther}
          />
        </aside>
      </div>
      <p className="hidden text-xs text-zinc-300 sm:block">
        Keys: <Kbd>A</Kbd> approve · <Kbd>R</Kbd> reject, then <Kbd>1</Kbd>–<Kbd>6</Kbd> reason · <Kbd>←</Kbd>/<Kbd>→</Kbd> previous/next bid ·{' '}
        <Kbd>↑</Kbd>/<Kbd>↓</Kbd> steps · <Kbd>F</Kbd> full size · <Kbd>U</Kbd> undo · <Kbd>Esc</Kbd> close
      </p>
    </div>,
  );
}
