import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import useSWR from 'swr';
import * as api from '../api/endpoints';
import { usd } from '../lib/money';
import PageHeader from '../components/PageHeader';
import Switch from '../components/Switch';
import BidderActions from '../components/bidders/BidderActions';
import BidderFormModal from '../components/bidders/BidderFormModal';
import InviteDialog, { formatInviteDate } from '../components/bidders/InviteDialog';
import SummaryTiles, { type Tile } from '../components/bidders/SummaryTiles';
import TeamWeekTable from '../components/bidders/TeamWeekTable';
import WeekNav from '../components/bidders/WeekNav';
import { dateInZone } from '../components/bidders/weekDates';

/** URL state: week, bidder, day, tab (history), mode (focus), bid. */
type Param = 'week' | 'bidder' | 'day' | 'tab' | 'mode' | 'bid';

function statusText(b: api.Bidder | undefined, row: api.BidWeekRow) {
  if (row.status === 'archived') return 'Archived';
  if (row.status === 'active') return b?.username ? `Active · @${b.username}` : 'Active';
  if (!b?.inviteExpiresAt) return 'Invited · no code yet';
  const expired = new Date(b.inviteExpiresAt).getTime() < Date.now();
  return <span className={expired ? 'text-red-600' : undefined}>Invited · expires {formatInviteDate(b.inviteExpiresAt)}</span>;
}

export default function BiddersPage() {
  const [params, setParams] = useSearchParams();
  const week = params.get('week');
  const bidderId = params.get('bidder');
  const [showArchived, setShowArchived] = useState(false);
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

  const board = useSWR(['bids-week', week, showArchived] as const, () =>
    api.bidsWeek({ week: week ?? undefined, includeArchived: showArchived || undefined }),
  );
  // Full bidder records (own bidders) for the status details and the ⋯ menu; an admin's view of other owners'
  // bidders has none, so those rows get no management menu.
  const active = useSWR(['bidders', false] as const, () => api.listBidders(false));
  const archived = useSWR(showArchived ? (['bidders', true] as const) : null, () => api.listBidders(true));
  const byId = useMemo(() => {
    const all = [...(active.data?.bidders ?? []), ...(archived.data?.bidders ?? [])];
    return Object.fromEntries(all.map((b) => [b._id, b])) as Record<string, api.Bidder>;
  }, [active.data, archived.data]);

  const refresh = () => {
    board.mutate();
    active.mutate();
    archived.mutate();
  };

  const data = board.data;
  const now = Date.now();
  const isCurrent = !!data && new Date(data.week.start).getTime() <= now && now < new Date(data.week.end).getTime();
  const weekKey = data ? dateInZone(data.week.end, data.week.timezone) : null;

  const openBidder = (id: string, day?: string) => setParam({ bidder: id, day: day ?? null, tab: null, week: weekKey });
  const review = (id?: string) => setParam({ mode: 'focus', bidder: id ?? null, bid: null, week: weekKey });

  const tiles = (): Tile[] => {
    if (!data) return [];
    const t = data.totals;
    const todayIdx = data.week.days.findIndex((d) => d.isToday);
    const today = isCurrent && todayIdx >= 0 ? t.days[todayIdx] : null;
    return [
      { label: 'Approved this week', value: t.approved ?? '—', hint: t.pay == null ? undefined : `${usd(t.pay)} pay`, tone: 'success' },
      {
        label: 'To review',
        value: t.toReview ?? '—',
        hint: t.toReview ? 'pending bids this week' : 'nothing pending',
        tone: t.toReview ? 'warning' : 'default',
        action: t.toReview ? { label: 'Review all', onClick: () => review() } : undefined,
      },
      { label: 'Rejected', value: t.rejected ?? '—', tone: t.rejected ? 'danger' : 'default' },
      ...(today
        ? [{ label: 'Today', value: today.approved ?? '—', hint: today.pending ? `${today.pending} pending` : 'approved so far' } as Tile]
        : []),
    ];
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Bidders"
        action={!bidderId && <button type="button" className="btn" onClick={() => setFormOpen(true)}>Add bidder</button>}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <WeekNav week={weekKey} label={data?.week.label ?? null} isCurrent={isCurrent} onChange={(w) => setParam({ week: w })} />
        <Switch checked={showArchived} onChange={setShowArchived} label="Show archived" />
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
      ) : bidderId ? (
        <div className="panel p-4 text-sm">
          <button type="button" className="underline" onClick={() => setParam({ bidder: null, day: null, tab: null })}>← Team</button>
        </div>
      ) : data.bidders.length === 0 ? (
        <div className="empty-state">
          <p className="font-medium text-strong">{showArchived ? 'No bidders this week.' : 'No bidders yet'}</p>
          <p className="mt-1 text-sm text-muted">Add a bidder to start tracking and reviewing their bids.</p>
          <button type="button" className="btn mt-4" onClick={() => setFormOpen(true)}>Add bidder</button>
        </div>
      ) : (
        <>
          <SummaryTiles tiles={tiles()} />
          <TeamWeekTable
            data={data}
            onOpenBidder={openBidder}
            onReview={review}
            renderStatus={(row) => statusText(byId[row.id], row)}
            renderActions={(row) =>
              byId[row.id] ? (
                <BidderActions
                  bidder={byId[row.id]}
                  onChanged={refresh}
                  onHistory={() => setParam({ bidder: row.id, tab: 'history', day: null, week: weekKey })}
                />
              ) : null
            }
          />
        </>
      )}

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
