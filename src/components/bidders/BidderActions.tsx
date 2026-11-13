import { useState } from 'react';
import * as api from '../../api/endpoints';
import { notify } from '../../lib/notify';
import ActionMenu from '../ActionMenu';
import ConfirmDialog from '../ConfirmDialog';
import BidderFormModal from './BidderFormModal';
import InviteDialog from './InviteDialog';

const FAILED = { reset: 'Failed to reset login', archive: 'Failed to archive bidder', restore: 'Failed to restore bidder' };

/**
 * The ⋯ menu of one bidder with its dialogs: Edit, New invite code, Reset login, Archive; an archived bidder offers
 * History (when `onHistory` is given) and Restore.
 */
export default function BidderActions({
  bidder,
  onChanged,
  onHistory,
}: {
  bidder: api.Bidder;
  onChanged: () => void;
  onHistory?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [invite, setInvite] = useState<api.BidderInvite | null>(null);
  const [confirm, setConfirm] = useState<'reset' | 'archive' | 'restore' | null>(null);
  const [busy, setBusy] = useState(false);

  const newInvite = async () => {
    try {
      setInvite(await api.newBidderInvite(bidder._id));
      onChanged();
    } catch (err) {
      notify.error(err, 'Failed to create invite code');
    }
  };

  const run = async () => {
    setBusy(true);
    try {
      if (confirm === 'reset') {
        const fresh = await api.resetBidderLogin(bidder._id);
        setConfirm(null);
        setInvite(fresh);
      } else if (confirm === 'restore') {
        await api.restoreBidder(bidder._id);
        notify.success(`${bidder.name} restored`);
        setConfirm(null);
      } else {
        await api.archiveBidder(bidder._id);
        notify.success(`${bidder.name} archived`);
        setConfirm(null);
      }
      onChanged();
    } catch (err) {
      notify.error(err, FAILED[confirm ?? 'archive']);
    } finally {
      setBusy(false);
    }
  };

  const history = onHistory ? [{ label: 'History', onSelect: onHistory }] : [];
  const items = bidder.archivedAt
    ? [...history, { label: 'Restore', onSelect: () => setConfirm('restore') }]
    : [
        { label: 'Edit', onSelect: () => setEditing(true) },
        ...(bidder.status === 'invited' ? [{ label: 'New invite code', onSelect: newInvite }] : []),
        ...(bidder.status === 'active' ? [{ label: 'Reset login', onSelect: () => setConfirm('reset') }] : []),
        ...history,
        { label: 'Archive', danger: true, onSelect: () => setConfirm('archive') },
      ];

  return (
    <>
      <ActionMenu label={`Actions for ${bidder.name}`} items={items} />

      <BidderFormModal
        open={editing}
        bidder={bidder}
        onClose={() => setEditing(false)}
        onSaved={(fresh) => {
          setEditing(false);
          if (fresh) setInvite(fresh);
          onChanged();
        }}
      />

      <InviteDialog open={!!invite} bidderName={bidder.name} invite={invite} onClose={() => setInvite(null)} />

      <ConfirmDialog
        open={confirm === 'reset'}
        title="Reset login"
        body={`Reset ${bidder.name}'s login? Their extension stops uploading until they register again with the new code. Their folder and bid history stay.`}
        confirmLabel="Reset login"
        tone="danger"
        busy={busy}
        onConfirm={run}
        onCancel={() => setConfirm(null)}
      />

      <ConfirmDialog
        open={confirm === 'archive'}
        title="Archive bidder"
        body={`Archive ${bidder.name}? They'll stop appearing in reports. History is kept.`}
        confirmLabel="Archive"
        tone="danger"
        busy={busy}
        onConfirm={run}
        onCancel={() => setConfirm(null)}
      />

      <ConfirmDialog
        open={confirm === 'restore'}
        title="Restore bidder"
        body={bidder.registeredAt
          ? `Restore ${bidder.name}? They're back in lists and reports, and sign in to the extension again with their username and password.`
          : `Restore ${bidder.name}? They're back in lists and reports. Use New invite code so they can register the extension.`}
        confirmLabel="Restore"
        tone="default"
        busy={busy}
        onConfirm={run}
        onCancel={() => setConfirm(null)}
      />
    </>
  );
}
