import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
import InviteDialog, { formatInviteDate } from '../components/bidders/InviteDialog';
import BiddersOverview from '../components/bidders/BiddersOverview';
import BidderAlerts from '../components/bidders/BidderAlerts';
import SelfBidsPanel, { type SelfScope } from '../components/bidders/SelfBidsPanel';
import MyBidsTab from '../components/bidders/MyBidsTab';
import { canManageBidders, isReviewedDataKey } from '../lib/bidderInsights';
import { shownWeeksOf } from '../lib/bidderFilters';
import {
  ownerOptions as ownerOptionsFor, ownerScope, ownerSelectValue, sectionFromUrl, sectionPatch, type BidsSection,
} from '../lib/bidsUrl';
import { useReportClock } from '../lib/useReportClock';
import { BiddersFilterBar, useBidderFilters } from '../components/bidders/biddersFilters';
import ConfirmDialog from '../components/ConfirmDialog';
import { notify } from '../lib/notify';
import WeekNav from '../components/bidders/WeekNav';
import { dateInZone } from '../components/bidders/weekDates';

/** URL state. The list's filters (range, date, from, to, q, archived, owner) are the bar's, see lib/bidderFilters.ts
 * (the old `week` / `period` keys still open that period). The tab is `section` (absent = Bidders, `mine`; the old
 * `show=self` opens My bids and is rewritten), and `owner` is absent (an admin's own team), a user id or `all`, see
 * lib/bidsUrl.ts. The rest: week (a bidder's pay week), bidder, day, tab (history), mode (focus), bid; `view` is from
 * the old tabs. */
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
  if (status === 'archived') return 'Archived';
  if (status === 'active') return b?.username ? `Active · @${b.username}` : 'Active';
  // Another owner's bidder (admin view): no invite details to show.
  if (!b) return 'Invited';
  if (!b.inviteExpiresAt) return 'Invited · no code yet';
  const expired = new Date(b.inviteExpiresAt).getTime() < Date.now();
  return <span className={expired ? 'text-red-600' : undefined}>Invited · expires {formatInviteDate(b.inviteExpiresAt)}</span>;
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

  const setParam = useCallback(
    (patch: Partial<Record<Param, string | null>>) =>
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(patch)) {
          if (value) next.set(key, value);
          else next.delete(key);
        }
        return next;
      }),
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
  // A change to bidders (added, edited, archived, restored) shows in the list, the card and the banners too.
  const refresh = () => {
    board.mutate();
    active.mutate();
    archived.mutate();
    void mutateKeys((key) => Array.isArray(key) && ['bid-performance', 'bid-insights', 'bid-alerts'].includes(key[0] as string));
  };
  // The open day's list and the bidder's week list too (decisions made in the overlay).
  const refreshAll = () => {
    refresh();
    void mutateKeys(isReviewedDataKey);
  };

  // The banners: one owner's bidders (staff: their own; an admin: the picked owner), whatever the week or period.
  const alerts = useSWR(
    ready && !bidderId && (!isAdmin || ownerId) ? (['bid-alerts', ownerId] as const) : null,
    () => api.getBidAlerts({ ownerId: ownerId || undefined }),
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

  // Review overlay: a bid of the day panel opens at that bid and walks the panel's list (all bids of the day after a
  // reload, when that list is gone); the Review buttons walk the pay week's pending bids. The scope is fixed by the
  // URL, so the overlay never follows a later window.
  const [navIds, setNavIds] = useState<string[] | null>(null);
  const focusDay = params.get('day');
  const focusBid = params.get('bid');
  const focusWeek = week ?? weekKey;
  const focus: { scope: FocusScope; startAt?: string; ids?: string[]; set: 'pending' | 'all' } | null =
    params.get('mode') !== 'focus'
      ? null
      : focusBid && focusDay
        ? { scope: { day: focusDay }, startAt: focusBid, ids: navIds?.includes(focusBid) ? navIds : undefined, set: 'all' }
        : focusWeek
          // The list's review is the bar's owner's; a bidder's is that bidder's, whoever owns it (Ruling 4).
          ? { scope: { queue: {
            period: 'week', date: focusWeek, bidderId: bidderId ?? undefined, ownerId: bidderId ? undefined : ownerId || undefined,
          } }, set: 'pending' }
          : null;
  const exitFocus = () => setParam({ mode: null, bid: null });
  const reviewBid = (bidId: string, ids: string[]) => {
    setNavIds(ids);
    setParam({ mode: 'focus', bid: bidId, week: weekKey });
  };
  // Decisions in the overlay change the counts: reload them however it is left (Esc, its Close, the browser's Back).
  const wasFocus = useRef(false);
  const inFocus = !!focus;
  useEffect(() => {
    if (wasFocus.current && !inFocus) refreshAll();
    wasFocus.current = inFocus;
  });


  // My bids opens the read-only panel. It names the owner only when that isn't the viewer: an admin looking at another
  // owner, or at All owners.
  const openMine = (s: SelfScope) => {
    const named = isAdmin && (allOwners || s.ownerId !== user?.id);
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
        <BidderAlerts
          alerts={alerts.data}
          onOpenBidder={(id, day) => setParam({ bidder: id, week: day ?? weekKey, day: day ?? null, view: null, tab: null })}
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
          ownerId={ownerId}
          allOwners={allOwners}
          onOpenBidder={(id, wk, day) => setParam({ bidder: id, week: wk, day: day ?? null, view: null, tab: null })}
          onReview={(wk, id) => setParam({ mode: 'focus', bidder: id ?? null, bid: null, week: wk, view: null })}
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
              <BidderActions
                bidder={byId[row.id]}
                onChanged={refresh}
                onHistory={() => setParam({ bidder: row.id, tab: 'history', day: null })}
              />
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

  // A bidder's page: their pay week, whoever owns them (Ruling 4).
  const bidderPage = (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <WeekNav
          shown={data && data.week.days.length > 0
            ? { first: data.week.days[0].day, last: data.week.days[data.week.days.length - 1].day }
            : null}
          label={data?.week.label ?? null}
          isCurrent={isCurrent}
          onChange={(w) => setParam({ week: w })}
        />
      </div>
      {board.error ? (
        <div className="panel p-4 text-sm text-red-600 dark:text-red-400" role="alert">
          Couldn&apos;t load the week.{' '}
          <button type="button" className="underline" onClick={() => board.mutate()}>Retry</button>
        </div>
      ) : !data ? (
        <div className="space-y-3" aria-busy="true">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton h-24" />)}
          </div>
          <div className="panel space-y-2 p-4">
            {Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton h-8 w-full" />)}
          </div>
        </div>
      ) : row && weekKey ? (
        <BidderView
          row={row}
          board={data}
          weekKey={weekKey}
          bidder={byId[row.id]}
          day={params.get('day')}
          reviewing={!!focus}
          tab={params.get('tab')}
          isCurrent={isCurrent}
          onParam={(patch) => setParam({ week: weekKey, ...patch })}
          onReview={reviewBid}
          onChanged={refresh}
        />
      ) : (
        <div className="panel p-4 text-sm text-muted">
          Bidder not found.{' '}
          <button type="button" className="underline" onClick={() => setParam({ bidder: null, day: null, tab: null })}>Back to the team</button>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-5">
      {focus && (
        <FocusReview
          key={`${'day' in focus.scope ? focus.scope.day : JSON.stringify(focus.scope.queue)}|${bidderId ?? ''}|${focus.startAt ?? ''}`}
          scope={focus.scope}
          bidderId={bidderId ?? undefined}
          startAt={focus.startAt}
          ids={focus.ids}
          set={focus.set}
          onExit={exitFocus}
        />
      )}
      <PageHeader
        title="Bids"
        action={!bidderId && (
          <div className="flex items-center gap-2">
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
        title="Archive bidder?"
        body={<p>Archive {pendingArchive?.name}? They're signed out of the extension; you can restore them any time.</p>}
        confirmLabel="Archive"
        tone="default"
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
