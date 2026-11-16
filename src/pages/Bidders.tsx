import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import useSWR, { useSWRConfig } from 'swr';
import * as api from '../api/endpoints';
import { BASE_URL } from '../api/client';
import { useAuth } from '../auth/useAuth';
import PageHeader from '../components/PageHeader';
import BidderActions from '../components/bidders/BidderActions';
import BidderView from '../components/bidders/BidderView';
import FocusReview, { type FocusScope } from '../components/bids/FocusReview';
import BidderFormModal from '../components/bidders/BidderFormModal';
import InviteDialog, { formatInviteDate } from '../components/bidders/InviteDialog';
import BiddersOverview from '../components/bidders/BiddersOverview';
import BidderAlerts from '../components/bidders/BidderAlerts';
import SelfBidsPanel, { type SelfScope } from '../components/bidders/SelfBidsPanel';
import { canManageBidders, isReviewedDataKey } from '../lib/bidderInsights';
import { shownWeeksOf } from '../lib/bidderFilters';
import { useReportClock } from '../lib/useReportClock';
import { BiddersFilterBar, useBidderFilters } from '../components/bidders/biddersFilters';
import ConfirmDialog from '../components/ConfirmDialog';
import { notify } from '../lib/notify';
import WeekNav from '../components/bidders/WeekNav';
import { dateInZone } from '../components/bidders/weekDates';

/** URL state. The list's filters (range, date, from, to, q, archived, owner) are the bar's, see lib/bidderFilters.ts
 * (the old `week` / `period` keys still open that period). The rest: week (a bidder's pay week), bidder, day, tab
 * (history), mode (focus), bid, owner (the admin's empty-state link); `view` is from the old tabs. */
type Param = 'week' | 'bidder' | 'day' | 'tab' | 'mode' | 'bid' | 'owner' | 'view';

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
  // The server's report clock: the list's periods mean nothing until it loads (the bidder view doesn't need it).
  const reportClock = useReportClock();
  const filterState = useBidderFilters(isAdmin, reportClock.clock);
  const filters = filterState?.filters;
  const request = filterState?.request ?? null;
  const ownerId = isAdmin ? (filters?.owner ?? '') : '';
  const showArchived = filters?.archived ?? false;
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
    !bidderId && request
      ? (['bid-performance', request.period, request.date ?? '', request.to ?? '', request.weeks ?? 1, showArchived, ownerId] as const)
      : null,
    () => api.getBidPerformance({ ...request!, includeArchived: showArchived, ownerId: ownerId || undefined }),
  );
  const users = useSWR(isAdmin ? (['users-lookup'] as const) : null, () => api.lookupUsers());
  const ownerOptions = useMemo(
    () => [
      { value: '', label: 'All users' },
      ...(users.data?.users ?? []).map((u) => ({
        value: u._id,
        label: `${u.name || u.email || u._id}${u._id === user?.id ? ' (you)' : ''}`,
      })),
    ],
    [users.data, user?.id],
  );
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
    !bidderId && (!isAdmin || ownerId) ? (['bid-alerts', ownerId] as const) : null,
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
          ? { scope: { queue: { period: 'week', date: focusWeek, bidderId: bidderId ?? undefined } }, set: 'pending' }
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


  const main = (
    <div className="space-y-5">
      {bidderId ? (
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
      ) : filterState ? (
        <BiddersFilterBar
          f={filterState}
          isAdmin={isAdmin}
          ownerOptions={ownerOptions}
          ownerId={ownerId}
          serverLabel={request ? perf.data?.label : undefined}
          failed={!!perf.error}
          shown={(request && perf.data && shownWeeksOf(perf.data)) || undefined}
        />
      ) : null}

      {!bidderId && reportClock.error && !filterState ? (
        <div className="panel p-4 text-sm text-red-600 dark:text-red-400" role="alert">
          Couldn&apos;t load the pay week.{' '}
          <button type="button" className="underline" onClick={reportClock.retry}>Retry</button>
        </div>
      ) : !bidderId && !filterState ? (
        <div className="space-y-3" aria-busy="true">
          <div className="panel space-y-2 p-4">
            {Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton h-8 w-full" />)}
          </div>
        </div>
      ) : !bidderId && filters ? (
        <BiddersOverview
          ownerId={ownerId}
          onOpenBidder={(id, wk, day) => setParam({ bidder: id, week: wk, day: day ?? null, view: null, tab: null })}
          onReview={(wk, id) => setParam({ mode: 'focus', bidder: id ?? null, bid: null, week: wk, view: null })}
          renderStatus={(row) => statusText(byId[row.id], row.bidderStatus ?? row.status)}
          request={request}
          data={request ? perf.data : undefined}
          error={request ? perf.error : undefined}
          onRetry={() => void perf.mutate()}
          search={filters.q}
          onClearSearch={() => filterState?.patch({ q: '' })}
          show={filters.show}
          onOpenSelf={(id, name, scope) => setSelfScope({ ownerId: id, ownerName: isAdmin ? name : undefined, ...scope })}
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
          empty={ownerId ? (
            <div className="empty-state">
              <p className="font-medium text-strong">{showArchived ? 'This user has no bidders.' : 'This user has no active bidders.'}</p>
              <button type="button" className="btn mt-4" onClick={() => setParam({ owner: null })}>Show all users</button>
            </div>
          ) : (
            <div className="empty-state">
              <p className="font-medium text-strong">{showArchived ? 'No bidders in this period.' : 'No bidders yet'}</p>
              <p className="mt-1 text-sm text-muted">Add a bidder to start tracking and reviewing their bids.</p>
              <button type="button" className="btn mt-4" onClick={() => setFormOpen(true)}>Add bidder</button>
            </div>
          )}
        />
      ) : board.error ? (
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
        title="Bidders"
        action={!bidderId && (
          <div className="flex items-center gap-2">
            {/* The Bid Track package the server ships (always the latest); install steps on hover. */}
            <a
              className="btn-outline"
              href={`${BASE_URL}/ext/download`}
              title={'Unzip it, open chrome://extensions, turn on Developer mode and click "Load unpacked" on the folder. To update: unzip over the folder, then Reload.'}
            >
              Download Bid Track
            </a>
            <button type="button" className="btn" onClick={() => setFormOpen(true)}>Add bidder</button>
          </div>
        )}
      />

      {!bidderId && alerts.data && (
        <BidderAlerts
          alerts={alerts.data}
          onOpenBidder={(id, day) => setParam({ bidder: id, week: day ?? weekKey, day: day ?? null, view: null, tab: null })}
          onOpenProfile={(id) => navigate(`/accounts/${id}`)}
          onArchive={(id, name) => setPendingArchive({ id, name })}
          canArchive={canManageBidders({ isAdmin, ownerId, userId: user?.id })}
        />
      )}

      {main}

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
