import { useState } from 'react';
import { Link } from 'react-router-dom';
import useSWR, { mutate as globalMutate } from 'swr';
import * as api from '../api/endpoints';
import { messageOf, notify } from '../lib/notify';
import { countryFlag } from '../lib/countries';
import { usd } from '../lib/money';
import ActionMenu from '../components/ActionMenu';
import ConfirmDialog from '../components/ConfirmDialog';
import LoadingSpinner from '../components/LoadingSpinner';
import PageHeader from '../components/PageHeader';
import Switch from '../components/Switch';
import BidderFormModal from '../components/bidders/BidderFormModal';
import BidderHistoryPanel from '../components/bidders/BidderHistoryPanel';
import InviteDialog, { formatInviteDate } from '../components/bidders/InviteDialog';

export default function BiddersPage() {
  const [showArchived, setShowArchived] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<api.Bidder | null>(null);
  const [pendingArchive, setPendingArchive] = useState<api.Bidder | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [historyFor, setHistoryFor] = useState<api.Bidder | null>(null);
  const [inviteShown, setInviteShown] = useState<{ name: string; invite: api.BidderInvite } | null>(null);
  const [pendingReset, setPendingReset] = useState<api.Bidder | null>(null);
  const [resetting, setResetting] = useState(false);

  const { data, mutate, isLoading } = useSWR(['bidders', showArchived] as const, () => api.listBidders(showArchived));
  const { data: counts, error: countsError } = useSWR('bidder-live-counts', () => api.bidderLiveCounts(), { refreshInterval: 300_000 });
  const bidders = data?.bidders ?? [];

  // A new, edited or archived bidder changes the live-count map too.
  const refresh = () => {
    mutate();
    globalMutate('bidder-live-counts');
  };

  const openForm = (b: api.Bidder | null) => {
    setEditing(b);
    setFormOpen(true);
  };

  const archive = async () => {
    const b = pendingArchive;
    if (!b) return;
    setArchiving(true);
    try {
      await api.archiveBidder(b._id);
      notify.success(`${b.name} archived`);
      setPendingArchive(null);
      refresh();
    } catch (err) {
      notify.error(err, 'Failed to archive bidder');
    } finally {
      setArchiving(false);
    }
  };

  const newInvite = async (b: api.Bidder) => {
    try {
      const invite = await api.newBidderInvite(b._id);
      setInviteShown({ name: b.name, invite });
      refresh();
    } catch (err) {
      notify.error(err, 'Failed to create invite code');
    }
  };

  const resetLogin = async () => {
    const b = pendingReset;
    if (!b) return;
    setResetting(true);
    try {
      const invite = await api.resetBidderLogin(b._id);
      setPendingReset(null);
      setInviteShown({ name: b.name, invite });
      refresh();
    } catch (err) {
      notify.error(err, 'Failed to reset login');
    } finally {
      setResetting(false);
    }
  };

  const statusCell = (b: api.Bidder) => {
    if (b.status === 'archived') return 'Archived';
    if (b.status === 'active') return `Active · @${b.username ?? ''}`;
    if (!b.inviteExpiresAt) return 'Invited · no code yet';
    const expired = new Date(b.inviteExpiresAt).getTime() < Date.now();
    return (
      <span className={expired ? 'text-red-600' : undefined}>
        Invited · expires {formatInviteDate(b.inviteExpiresAt)}
      </span>
    );
  };

  const countCell = (b: api.Bidder, key: 'today' | 'week') => {
    if (!counts) {
      if (countsError) return <span title={messageOf(countsError, 'Failed to load live counts')}>⚠️</span>;
      return <LoadingSpinner size="sm" />;
    }
    const c = counts[b._id];
    if (!c) return <span className="text-muted">—</span>;
    if (c.error) return <span title={c.error}>⚠️</span>;
    return <span>{c[key] ?? '—'}</span>;
  };

  const payCell = (b: api.Bidder) => {
    const week = counts?.[b._id]?.week;
    return week == null ? '—' : usd(week * b.rate);
  };

  const rowActions = (b: api.Bidder) => {
    const history = { label: 'History', onSelect: () => setHistoryFor(b) };
    if (b.archivedAt) return [history];
    return [
      { label: 'Edit', onSelect: () => openForm(b) },
      ...(b.status === 'invited' ? [{ label: 'New invite code', onSelect: () => newInvite(b) }] : []),
      ...(b.status === 'active' ? [{ label: 'Reset login', onSelect: () => setPendingReset(b) }] : []),
      history,
      { label: 'Archive', danger: true, onSelect: () => setPendingArchive(b) },
    ];
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bidders"
        action={(
          <>
            <Link to="/bids/review" className="btn-outline">Review bids</Link>
            <button type="button" className="btn" onClick={() => openForm(null)}>Add bidder</button>
          </>
        )}
      />

      <Switch checked={showArchived} onChange={setShowArchived} label="Show archived" />

      <div className="table-wrap">
        <table className="min-w-full text-sm">
          <thead className="table-head">
            <tr>
              <th className="px-4 py-2.5">Name</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5">Country</th>
              <th className="px-4 py-2.5">Profile</th>
              <th className="px-4 py-2.5">Rate</th>
              <th className="px-4 py-2.5">Today</th>
              <th className="px-4 py-2.5">This week</th>
              <th className="px-4 py-2.5">Est. pay this week</th>
              <th className="px-4 py-2.5 w-20">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-muted">
                  <div role="status" className="flex items-center justify-center">
                    <div className="spinner spinner-md mr-3" aria-hidden></div>
                    Loading bidders...
                  </div>
                </td>
              </tr>
            ) : bidders.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-muted">
                  {showArchived ? 'No archived bidders.' : 'No bidders yet — add one to start tracking bids.'}
                </td>
              </tr>
            ) : bidders.map((b) => (
              <tr key={b._id} className={`table-row ${b.archivedAt ? 'text-muted opacity-60' : ''}`}>
                <td className="px-4 py-2.5">{b.name}</td>
                <td className="px-4 py-2.5">{statusCell(b)}</td>
                <td className="px-4 py-2.5">
                  {b.country ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span aria-hidden>{countryFlag(b.country)}</span>
                      <span>{b.country}</span>
                    </span>
                  ) : <span className="text-muted">—</span>}
                </td>
                <td className="px-4 py-2.5">{b.profileName || <span className="text-muted">—</span>}</td>
                <td className="px-4 py-2.5">{usd(b.rate)}</td>
                <td className="px-4 py-2.5">{countCell(b, 'today')}</td>
                <td className="px-4 py-2.5">{countCell(b, 'week')}</td>
                <td className="px-4 py-2.5">{payCell(b)}</td>
                <td className="px-4 py-2.5"><ActionMenu label={`Actions for ${b.name}`} items={rowActions(b)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <BidderFormModal
        open={formOpen}
        bidder={editing}
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

      <BidderHistoryPanel bidder={historyFor} onClose={() => setHistoryFor(null)} />

      <ConfirmDialog
        open={!!pendingReset}
        title="Reset login"
        body={`Reset ${pendingReset?.name}'s login? Their extension stops uploading until they register again with the new code. Their folder and bid history stay.`}
        confirmLabel="Reset login"
        tone="danger"
        busy={resetting}
        onConfirm={resetLogin}
        onCancel={() => setPendingReset(null)}
      />

      <ConfirmDialog
        open={!!pendingArchive}
        title="Archive bidder"
        body={`Archive ${pendingArchive?.name}? They'll stop appearing in reports. History is kept.`}
        confirmLabel="Archive"
        tone="danger"
        busy={archiving}
        onConfirm={archive}
        onCancel={() => setPendingArchive(null)}
      />
    </div>
  );
}
