import type { BidderInvite } from '../../api/endpoints';
import { notify } from '../../lib/notify';
import Modal from '../Modal';

/** `MMM d` in the viewer's local time zone. */
export function formatInviteDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const INSTRUCTIONS =
  'Install Bid Track → click the icon → Register → enter this code and choose a username and password.' +
  ' Remove any older "Bid Track Local" extension first.';

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    notify.success('Copied');
  } catch (err) {
    notify.error(err, 'Failed to copy');
  }
}

/** Shows a freshly issued invite code once; the server never returns it again. */
export default function InviteDialog({
  open,
  bidderName,
  invite,
  onClose,
}: {
  open: boolean;
  bidderName: string;
  invite: BidderInvite | null;
  onClose: () => void;
}) {
  const until = invite ? formatInviteDate(invite.expiresAt) : '';
  return (
    <Modal open={open && !!invite} onClose={onClose} title={`Invite code for ${bidderName}`}>
      {invite && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <code className="flex-1 rounded-xl border border-zinc-200 bg-zinc-50/80 dark:border-zinc-800 dark:bg-zinc-900/80 px-3 py-2 font-mono text-base tracking-wider select-all">
              {invite.code}
            </code>
            <button type="button" className="btn text-sm" onClick={() => copy(invite.code)}>Copy</button>
          </div>
          <p className="text-sm text-body">
            Valid once, until {until}. You won&apos;t be able to see this code again.
          </p>
          <p className="text-sm text-muted">{INSTRUCTIONS}</p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="btn-outline text-sm"
              onClick={() => copy(`Bid Track invite for ${bidderName}: ${invite.code} (valid until ${until}). ${INSTRUCTIONS}`)}
            >
              Copy instructions + code
            </button>
            <button type="button" className="btn-outline text-sm" onClick={onClose}>Done</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
