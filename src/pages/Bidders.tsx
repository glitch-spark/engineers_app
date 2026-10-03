import { useState } from 'react';
import useSWR, { mutate as globalMutate } from 'swr';
import * as api from '../api/endpoints';
import { notify } from '../lib/notify';
import { countryFlag } from '../lib/countries';
import ActionMenu from '../components/ActionMenu';
import ConfirmDialog from '../components/ConfirmDialog';
import LoadingSpinner from '../components/LoadingSpinner';
import PageHeader from '../components/PageHeader';
import Switch from '../components/Switch';
import BidderFormModal from '../components/bidders/BidderFormModal';

const usd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function BiddersPage() {
  const [showArchived, setShowArchived] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<api.Bidder | null>(null);
  const [pendingArchive, setPendingArchive] = useState<api.Bidder | null>(null);
  const [archiving, setArchiving] = useState(false);
  // Opened by the History panel (added in a later task).
  const [, setHistoryFor] = useState<api.Bidder | null>(null);

  const { data, mutate, isLoading } = useSWR(['bidders', showArchived] as const, () => api.listBidders(showArchived));
  const { data: counts } = useSWR('bidder-live-counts', () => api.bidderLiveCounts(), { refreshInterval: 300_000 });
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

  const countCell = (b: api.Bidder, key: 'today' | 'week') => {
    if (!counts) return <LoadingSpinner size="sm" />;
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
      history,
      { label: 'Archive', danger: true, onSelect: () => setPendingArchive(b) },
    ];
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bidders"
        action={<button type="button" className="btn" onClick={() => openForm(null)}>Add bidder</button>}
      />

      <Switch checked={showArchived} onChange={setShowArchived} label="Show archived" />

      <div className="table-wrap">
        <table className="min-w-full text-sm">
          <thead className="table-head">
            <tr>
              <th className="px-4 py-2.5">Name</th>
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
                <td colSpan={8} className="px-4 py-8 text-center text-muted">
                  <div role="status" className="flex items-center justify-center">
                    <div className="spinner spinner-md mr-3" aria-hidden></div>
                    Loading bidders...
                  </div>
                </td>
              </tr>
            ) : bidders.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-muted">
                  {showArchived ? 'No archived bidders.' : 'No bidders yet — add one to start tracking bids.'}
                </td>
              </tr>
            ) : bidders.map((b) => (
              <tr key={b._id} className={`table-row ${b.archivedAt ? 'text-muted opacity-60' : ''}`}>
                <td className="px-4 py-2.5">{b.name}</td>
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
        onSaved={() => {
          setFormOpen(false);
          refresh();
        }}
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
