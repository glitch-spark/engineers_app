import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import useSWR, { useSWRConfig } from 'swr';
import * as api from '../api/endpoints';
import { BASE_URL } from '../api/client';
import { useAuth } from '../auth/useAuth';
import PageHeader from '../components/PageHeader';
import Tabs from '../components/Tabs';
import ActionMenu from '../components/ActionMenu';
import BidderActions from '../components/bidders/BidderActions';
import BidderView from '../components/bidders/BidderView';
import FocusReview, { type FocusScope } from '../components/bids/FocusReview';
import BidderFormModal from '../components/bidders/BidderFormModal';
import InviteDialog from '../components/bidders/InviteDialog';
import BidsHelp from '../components/bidders/BidsHelp';
import BiddersOverview from '../components/bidders/BiddersOverview';
import NeedsAttention from '../components/bidders/NeedsAttention';
import ToReviewBlock from '../components/bidders/ToReviewBlock';
import SelfBidsPanel, { type SelfScope } from '../components/bidders/SelfBidsPanel';
import MyBidsTab from '../components/bidders/MyBidsTab';
import { canManageBidders, isReviewedDataKey } from '../lib/bidderInsights';
import { isWholePayWeeks, shownWeeksOf } from '../lib/bidderFilters';
import {
  lensFromUrl, lensPatch, ownerOptions as ownerOptionsFor, ownerScope, ownerSelectValue, pendingQuery, REVIEW_EXIT, reviewFromUrl, reviewPatch,
  reviewSwitchScope, reviewSwitchValue, sectionFromUrl, sectionPatch, type BidsSection, type ReviewScope, type ReviewSwitch,
} from '../lib/bidsUrl';
import { useReportClock } from '../lib/useReportClock';
import { BiddersFilterBar, useBidderFilters } from '../components/bidders/biddersFilters';
import ConfirmDialog from '../components/ConfirmDialog';
import { ARCHIVE_CONFIRM, statusWords } from '../lib/bidsWords';
import { notify } from '../lib/notify';
import WeekNav from '../components/bidders/WeekNav';
import { dateInZone } from '../components/bidders/weekDates';

/** URL state. The list's filters (range, date, from, to, q, archived, owner) are the bar's, see lib/bidderFilters.ts
 * (the old `week` / `period` keys still open that period). The tab is `section` (absent = Bidders, `mine`; the old
 * `show=self` opens My bids and is rewritten), and `owner` is absent (an admin's own team), a user id or `all`, see
 * lib/bidsUrl.ts; `lens` is the Bidders table's view (absent = Week, `performance`). The review overlay is mode=focus
 * with review / at / reviewBidder (lib/bidsUrl.ts; `bid` + `day` is the day panel's walk). The rest: week (a bidder's pay week), bidder, day, tab (history); `view` is from the old tabs. */
type Param =
  | 'week' | 'bidder' | 'day' | 'tab' | 'mode' | 'bid' | 'owner' | 'view'
  | 'section' | 'show' | 'q' | 'archived' | 'lens' | 'review' | 'at' | 'reviewBidder';

const TABS = [
  { key: 'bidders', label: 'Bidders' },
  { key: 'mine', label: 'My bids' },
  // Task 15 shows it.
  { key: 'pay', label: 'Pay', hidden: true },
];

function statusText(b: api.Bidder | undefined, status: string | undefined) {
  const known = status === 'active' || status === 'archived' ? status : 'invited';
  const { text, expired } = statusWords(known, b, Date.now());
  return expired ? <span className="text-red-600">{text}</span> : text;
}

export default function BiddersPage() {
  const [params, setParams] = useSearchParams();
  const week = params.get('week');
  const bidderId = params.get('bidder');
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  // Owner-scoped requests wait for the signed-in user: without it an admin's default owner (themselves) is unknown,
  // and no ownerId would ask the server for every owner.
  const ready = !!user?.id;
  // The Pay tab ships later (Task 15): until then section=pay is the Bidders tab.
  const urlSection = sectionFromUrl((k) => params.get(k));
  const section: BidsSection = urlSection === 'pay' ? 'bidders' : urlSection;
  // The server's report clock: the list's periods mean nothing until it loads (the bidder view doesn't need it).
  const reportClock = useReportClock();
  const filterState = useBidderFilters(isAdmin, reportClock.clock);
  const filters = filterState?.filters;
  const request = filterState?.request ?? null;
  // Admins open on their own team (`owner` absent); `all` is every owner (no ownerId); staff always see their own.
  const scope = ownerScope(filters?.owner ?? '', isAdmin, user?.id);
  const ownerId = scope.ownerId ?? '';
  const allOwners = scope.all;
  // Show archived is the Bidders tab's (a tab change drops it).
  const showArchived = section === 'bidders' && (filters?.archived ?? false);
  const [pendingArchive, setPendingArchive] = useState<{ id: string; name: string } | null>(null);
  const [selfScope, setSelfScope] = useState<SelfScope | null>(null);
  const [archiving, setArchiving] = useState(false);
  const navigate = useNavigate();
  const [formOpen, setFormOpen] = useState(false);
  const [inviteShown, setInviteShown] = useState<{ name: string; invite: api.BidderInvite } | null>(null);

  // The review overlay was opened by a click on this page (a new history entry above its origin), not by a link or a
  // reload: Close then steps back to that origin instead of pushing a copy of it (Back would reopen the review).
  const openedInApp = useRef(false);
  const setParam = useCallback(
    (patch: Partial<Record<Param, string | null>>, opts?: { replace?: boolean }) => {
      if (patch.mode === 'focus' && !opts?.replace) openedInApp.current = true;
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(patch)) {
          if (value) next.set(key, value);
          else next.delete(key);
        }
        return next;
      }, opts);
    },
    [setParams],
  );

  // An old `show` link: `show=self` becomes section=mine, the others the Bidders tab (replaced, not a new entry).
  const oldShow = params.get('show');
  useEffect(() => {
    if (oldShow === null) return;
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('show');
      if (oldShow === 'self' && !next.get('section')) next.set('section', 'mine');
      return next;
    }, { replace: true });
  }, [oldShow, setParams]);

  // A bidder view always finds its bidder, archived or not.
  const includeArchived = showArchived || !!bidderId;
  // The owner filter narrows the team table only, so a bidder link opens whatever the filter.
  const boardOwner = bidderId ? '' : ownerId;
  // The pay-week board feeds the single-bidder view only; the list is one /bids/performance request.
  const board = useSWR(bidderId ? (['bids-week', week, includeArchived, boardOwner] as const) : null, () =>
    api.bidsWeek({ week: week ?? undefined, includeArchived: includeArchived || undefined, ownerId: boardOwner || undefined }),
  );
  // The list: one /bids/performance request for the bar's period (its label is the bar's too).
  const perf = useSWR(
    !bidderId && request && ready
      ? (['bid-performance', request.period, request.date ?? '', request.to ?? '', request.weeks ?? 1, showArchived, ownerId] as const)
      : null,
    () => api.getBidPerformance({ ...request!, includeArchived: showArchived, ownerId: ownerId || undefined }),
  );
  const users = useSWR(isAdmin ? (['users-lookup'] as const) : null, () => api.lookupUsers());
  const ownerOptions = useMemo(() => ownerOptionsFor(users.data?.users ?? [], user?.id), [users.data, user?.id]);
  // Full bidder records (own bidders) for the status details and the ⋯ menu; an admin's view of other owners'
  // bidders has none, so those rows get no management menu.
  const active = useSWR(['bidders', false] as const, () => api.listBidders(false));
  const archived = useSWR(showArchived ? (['bidders', true] as const) : null, () => api.listBidders(true));
  const byId = useMemo(() => {
    const all = [...(active.data?.bidders ?? []), ...(archived.data?.bidders ?? [])];
    return Object.fromEntries(all.map((b) => [b._id, b])) as Record<string, api.Bidder>;
  }, [active.data, archived.data]);

  const { mutate: mutateKeys } = useSWRConfig();
  // A change to bidders (added, edited, archived, restored) or a review decision shows everywhere the counts do: the
  // list, the card, the banners, To review, the open day's and week's lists (one key list, isReviewedDataKey).
  const refresh = () => {
    board.mutate();
    active.mutate();
    archived.mutate();
    void mutateKeys(isReviewedDataKey);
  };

  // The banners: one owner's bidders (staff: their own; an admin: the picked owner), whatever the week or period.
  const alerts = useSWR(
    ready && !bidderId && (!isAdmin || ownerId) ? (['bid-alerts', ownerId] as const) : null,
    () => api.getBidAlerts({ ownerId: ownerId || undefined }),
    { revalidateOnFocus: false },
  );
  // The To review block: every pending bid of the owner's bidders, of any age (every owner's under All owners). It waits
  // for the user like every owner-scoped request.
  const backlog = useSWR(
    ready && !bidderId && section === 'bidders' ? (['bid-backlog', ownerId] as const) : null,
    () => api.getBidBacklog({ ownerId: ownerId || undefined }),
    { revalidateOnFocus: false },
  );
  const archiveSuggested = async () => {
    const p = pendingArchive;
    if (!p) return;
    setArchiving(true);
    try {
      await api.archiveBidder(p.id);
      notify.success(`${p.name} archived`);
      setPendingArchive(null);
      refresh();
      void alerts.mutate();
      void mutateKeys((key) => Array.isArray(key) && (key[0] === 'bid-performance' || key[0] === 'bid-insights'));
    } catch (err) {
      notify.error(err, 'Failed to archive bidder');
    } finally {
      setArchiving(false);
    }
  };

  const data = board.data;
  const now = Date.now();
  const isCurrent = !!data && new Date(data.week.start).getTime() <= now && now < new Date(data.week.end).getTime();
  const weekKey = data ? dateInZone(data.week.end, data.week.timezone) : null;


  const row = bidderId ? data?.bidders.find((b) => b.id === bidderId) : undefined;

  // Review overlay, one way in and one way out. A bid of the day panel opens at that bid and walks the panel's list (all
  // bids of the day after a reload, when that list is gone). Every other entry (the To review block, a row's Pending
  // badge, the bidder page's tile, old `mode=focus` links) writes the review keys, and the overlay walks that server
  // queue. Close removes only the review keys, so it lands where the review was opened (the list never gets `bidder`).
  const [navIds, setNavIds] = useState<string[] | null>(null);
  const focusDay = params.get('day');
  const focusBid = params.get('bid');
  const clock = reportClock.clock;
  const target = reviewFromUrl((k) => params.get(k), clock?.today ?? '');
  // The list's review waits for the user, like every owner-scoped request, and is the bar's owner's. A bidder page's is
  // that bidder's, whoever owns it (Ruling 4), so it sends no owner. A dateless day review waits for the clock's today.
  const queue = target && (target.scope.kind !== 'day' || target.scope.day) && (bidderId || ready)
    ? pendingQuery(target, request, bidderId ? undefined : ownerId || undefined)
    : null;
  const focus: { scope: FocusScope; startAt?: string; ids?: string[]; set: 'pending' | 'all' } | null =
    params.get('mode') !== 'focus'
      ? null
      : focusBid && focusDay
        ? { scope: { day: focusDay }, startAt: focusBid, ids: navIds?.includes(focusBid) ? navIds : undefined, set: 'all' }
        : queue
          ? { scope: { queue }, set: 'pending' }
          : null;
  // Close (and Esc): back to the origin entry when opened here; a deep link's review is replaced by its origin.
  const exitFocus = () => {
    if (openedInApp.current) {
      openedInApp.current = false;
      navigate(-1);
    } else {
      setParam(REVIEW_EXIT, { replace: true });
    }
  };
  const openReview = (scope: ReviewScope, id?: string | null) => setParam(reviewPatch(scope, id));
  const scopeSwitch = target && clock && focus && 'queue' in focus.scope
    ? {
      value: reviewSwitchValue(target.scope, clock),
      onChange: (v: ReviewSwitch) => setParam(reviewPatch(reviewSwitchScope(v, clock), target.bidderId), { replace: true }),
    }
    : undefined;
  const reviewBid = (bidId: string, ids: string[]) => {
    setNavIds(ids);
    setParam({ mode: 'focus', bid: bidId, week: weekKey });
  };
  // Decisions in the overlay change the counts: reload them however it is left (Esc, its Close, the browser's Back).
  const wasFocus = useRef(false);
  const inFocus = !!focus;
  useEffect(() => {
    if (wasFocus.current && !inFocus) refresh();
    wasFocus.current = inFocus;
    // Left by Back or a link: a later Close of a review reached with Forward must not step back past it.
    if (params.get('mode') !== 'focus') openedInApp.current = false;
  });


  // My bids opens the read-only panel. It names the owner only when that isn't the viewer (an admin looking at another
  // owner's bids, alone or under All owners); the viewer's own bids are "Your own bids".
  const openMine = (s: SelfScope) => {
    const named = isAdmin && s.ownerId !== user?.id;
    setSelfScope(named ? s : { ...s, ownerName: undefined });
  };
  // An admin looking at someone else's team (not their own, not All owners).
  const otherOwner = isAdmin && !allOwners && !!ownerId && ownerId !== user?.id;

  const loading = (
    <div className="space-y-3" aria-busy="true">
      <div className="panel space-y-2 p-4">
        {Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton h-8 w-full" />)}
      </div>
    </div>
  );

  const myBids = !request ? (
    <div className="panel p-4 text-sm text-muted">Pick a valid date range to see your bids.</div>
  ) : perf.error ? (
    <div className="panel p-4 text-sm text-red-600 dark:text-red-400" role="alert">
      Couldn&apos;t load your bids.{' '}
      <button type="button" className="underline" onClick={() => void perf.mutate()}>Retry</button>
    </div>
  ) : !perf.data ? loading : (
    <MyBidsTab data={perf.data} allOwners={allOwners} onOpen={openMine} />
  );

  const list = (
    <div className="space-y-5">
      {/* To review: the one place the backlog shows (all pending, any age), above the bar and the banners. */}
      {section === 'bidders' && ready && (backlog.data ? (
        <ToReviewBlock backlog={backlog.data} allOwners={allOwners} onReview={openReview} />
      ) : backlog.error ? (
        <p className="text-sm text-muted" role="status">
          Couldn&apos;t load To review.{' '}
          <button type="button" className="underline" onClick={() => void backlog.mutate()}>Retry</button>
        </p>
      ) : null)}

      {filterState && filters ? (
        <BiddersFilterBar
          f={filterState}
          isAdmin={isAdmin}
          section={section}
          ownerOptions={ownerOptions}
          ownerValue={ownerSelectValue(filters.owner, user?.id)}
          serverLabel={request ? perf.data?.label : undefined}
          failed={!!perf.error}
          shown={(request && perf.data && shownWeeksOf(perf.data)) || undefined}
        />
      ) : null}

      {section === 'bidders' && ready && alerts.data && (
        <NeedsAttention
          alerts={alerts.data}
          onOpenBidder={(id) => setParam({ bidder: id, week: null, day: null, view: null, tab: null })}
          onOpenProfile={(id) => navigate(`/accounts/${id}`)}
          onArchive={(id, name) => setPendingArchive({ id, name })}
          canArchive={canManageBidders({ isAdmin, ownerId, userId: user?.id })}
        />
      )}

      {reportClock.error && !filterState ? (
        <div className="panel p-4 text-sm text-red-600 dark:text-red-400" role="alert">
          Couldn&apos;t load the pay week.{' '}
          <button type="button" className="underline" onClick={reportClock.retry}>Retry</button>
        </div>
      ) : !filterState || !filters || !ready ? loading : section === 'mine' ? myBids : (
        <BiddersOverview
          lens={lensFromUrl((k) => params.get(k))}
          onLensChange={(l) => setParam(lensPatch(l))}
          wholePayWeeks={isWholePayWeeks(filters.range)}
          ownerId={ownerId}
          allOwners={allOwners}
          onOpenBidder={(id, wk, day) => setParam({ bidder: id, week: wk, day: day ?? null, view: null, tab: null })}
          // The row's own Pending: the shown period, filtered to the row (never `bidder`: Close returns to the list).
          onReview={(id) => openReview({ kind: 'range' }, id)}
          renderStatus={(row) => statusText(byId[row.id], row.bidderStatus ?? row.status)}
          request={request}
          data={request ? perf.data : undefined}
          error={request ? perf.error : undefined}
          onRetry={() => void perf.mutate()}
          search={filters.q}
          onClearSearch={() => filterState.patch({ q: '' })}
          // /bidders lists only the viewer's own bidders, so other owners' rows get no menu.
          renderActions={(row) =>
            byId[row.id] ? (
              <BidderActions bidder={byId[row.id]} onChanged={refresh} />
            ) : null
          }
          empty={otherOwner ? (
            <div className="empty-state">
              <p className="font-medium text-strong">{showArchived ? 'This owner has no bidders.' : 'This owner has no active bidders.'}</p>
              <button type="button" className="btn mt-4" onClick={() => filterState.patch({ owner: 'all' })}>Show all owners</button>
            </div>
          ) : (
            <div className="empty-state">
              <p className="font-medium text-strong">No bidders yet</p>
              <p className="mt-1 text-sm text-muted">Add a bidder, then send them the invite code and the Bid Track download.</p>
              <button type="button" className="btn mt-4" onClick={() => setFormOpen(true)}>Add bidder</button>
            </div>
          )}
        />
      )}
    </div>
  );

  // A bidder's page: their pay week, whoever owns them (Ruling 4). The header (← Bidders, the actions, the week nav)
  // is the view's; while the board loads or fails, a bare ← Bidders (and the week nav, once a week is known) stays.
  // ← Bidders drops the browsed `week` too, so it doesn't leak into the list's period (F24).
  const backToList = () => setParam({ bidder: null, day: null, tab: null, week: null });
  const shownWeek = data && data.week.days.length > 0
    ? { first: data.week.days[0].day, last: data.week.days[data.week.days.length - 1].day }
    : null;
  const changeWeek = (w: string | null) => setParam({ week: w, day: null });
  const bareHeader = (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" className="btn-outline btn-sm" onClick={backToList}>
        <ArrowLeft size={14} aria-hidden /> Bidders
      </button>
      {shownWeek && data && (
        <WeekNav shown={shownWeek} label={data.week.label} isCurrent={isCurrent} onChange={changeWeek} />
      )}
    </div>
  );
  const bidderPage = board.error ? (
    <div className="space-y-5">
      {bareHeader}
      <div className="panel p-4 text-sm text-red-600 dark:text-red-400" role="alert">
        Couldn&apos;t load the week.{' '}
        <button type="button" className="underline" onClick={() => board.mutate()}>Retry</button>
      </div>
    </div>
  ) : !data ? (
    <div className="space-y-5">
      {bareHeader}
      <div className="space-y-3" aria-busy="true">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton h-24" />)}
        </div>
        <div className="panel space-y-2 p-4">
          {Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton h-8 w-full" />)}
        </div>
      </div>
    </div>
  ) : row && weekKey && shownWeek ? (
    <BidderView
      row={row}
      board={data}
      weekKey={weekKey}
      bidder={byId[row.id]}
      day={params.get('day')}
      reviewing={!!focus}
      tab={params.get('tab')}
      isCurrent={isCurrent}
      week={{ shown: shownWeek, label: data.week.label, isCurrent, onChange: changeWeek }}
      onBack={backToList}
      onParam={(patch) => setParam({ week: weekKey, ...patch })}
      onReview={reviewBid}
      onChanged={refresh}
    />
  ) : (
    <div className="space-y-5">
      {bareHeader}
      <div className="panel p-4 text-sm text-muted">Bidder not found.</div>
    </div>
  );

  return (
    <div className="space-y-5">
      {focus && (
        <FocusReview
          key={`${JSON.stringify(focus.scope)}${focus.startAt ?? ''}`}
          scope={focus.scope}
          bidderId={bidderId ?? undefined}
          startAt={focus.startAt}
          ids={focus.ids}
          set={focus.set}
          onExit={exitFocus}
          scopeSwitch={scopeSwitch}
        />
      )}
      {/* On a bidder's page the title (and the tab's) is the bidder's name; its header has the help and the actions. */}
      <PageHeader
        title={bidderId ? row?.name ?? 'Bids' : 'Bids'}
        action={bidderId ? undefined : (
          <div className="flex items-center gap-2">
            {/* The Bidders tab has it beside its View switch. */}
            {section !== 'bidders' && <BidsHelp />}
            <button type="button" className="btn" onClick={() => setFormOpen(true)}>Add bidder</button>
            {/* The Bid Track package the server ships (always the latest). */}
            <ActionMenu
              label="More actions"
              items={[{ label: 'Download Bid Track', onSelect: () => window.location.assign(`${BASE_URL}/ext/download`) }]}
            />
          </div>
        )}
      />

      {bidderId ? bidderPage : (
        <Tabs tabs={TABS} value={section} onChange={(k) => setParam(sectionPatch(k as BidsSection))} ariaLabel="Bids sections">
          {list}
        </Tabs>
      )}

      <SelfBidsPanel scope={selfScope} onClose={() => setSelfScope(null)} />

      <ConfirmDialog
        open={!!pendingArchive}
        title={ARCHIVE_CONFIRM.title}
        body={<p>{ARCHIVE_CONFIRM.body(pendingArchive?.name ?? '')}</p>}
        confirmLabel={ARCHIVE_CONFIRM.confirmLabel}
        tone={ARCHIVE_CONFIRM.tone}
        busy={archiving}
        onConfirm={archiveSuggested}
        onCancel={() => setPendingArchive(null)}
      />

      <BidderFormModal
        open={formOpen}
        bidder={null}
        onClose={() => setFormOpen(false)}
        onSaved={(invite, saved) => {
          setFormOpen(false);
          if (invite) setInviteShown({ name: saved.name, invite });
          refresh();
        }}
      />

      <InviteDialog
        open={!!inviteShown}
        bidderName={inviteShown?.name ?? ''}
        invite={inviteShown?.invite ?? null}
        onClose={() => setInviteShown(null)}
      />
    </div>
  );
}
