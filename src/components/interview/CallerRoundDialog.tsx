import { useEffect, useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import * as api from '../../api/endpoints';
import Modal from '../Modal';
import Select from '../Select';
import { notify } from '../../lib/notify';
import { useCallers } from '../../lib/useCallers';
import { CALLER_DOT, UNASSIGNED_CHIP, isUnassigned } from '../../lib/callerColors';
import { formatInZone, parseServerTime } from '../../lib/interviewTimezone';
import { useInterviewTimezone } from '../../lib/useInterviewTimezone';
import { interviewStatusLabel, stageLabel } from '../../lib/stageBadge';
import { CALLER_METHOD_OPTIONS, type Interview } from './types';

/** A caller round from the Callers calendar: its details, and the caller (Admin / interview managers assign it). */
export default function CallerRoundDialog({
  interview,
  roundId,
  onClose,
  onAssigned,
  onOpenInterview,
}: {
  interview: Interview;
  roundId: string;
  onClose: () => void;
  onAssigned: (saved: Interview) => void;
  onOpenInterview: () => void;
}) {
  const { tz } = useInterviewTimezone();
  const { callers, byId, canManage } = useCallers();
  const entry = interview.stageHistory?.find((e) => e.id === roundId);
  const caller = entry?.caller;
  const savedId = caller?.callerId || '';
  const typedName = caller?.callerName && caller.callerName !== 'TBD' ? caller.callerName : '';
  const [pick, setPick] = useState(savedId);
  const [saving, setSaving] = useState(false);
  useEffect(() => setPick(savedId), [savedId]);

  const unassigned = isUnassigned({ callerId: caller?.callerId, callerName: caller?.callerName });
  const known = savedId ? byId.get(savedId) : undefined;
  const account = typeof interview.accountId === 'object' ? interview.accountId : null;
  const when = entry?.scheduledAt
    ? formatInZone(parseServerTime(entry.scheduledAt), tz, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
    : '—';
  const method = CALLER_METHOD_OPTIONS.find((o) => o.value === caller?.method)?.label ?? 'TBD';
  // The current caller stays listed when it isn't on the list (typed before it, or removed since).
  const options = [
    { value: '', label: 'Not assigned yet' },
    ...callers.map((c) => ({ value: c._id, label: c.name })),
    ...(savedId && !known ? [{ value: savedId, label: `${typedName || 'Caller'} (not on the list)` }] : []),
  ];

  const save = async () => {
    setSaving(true);
    try {
      const saved = await api.assignRoundCaller(interview._id, roundId, pick);
      notify.success(pick ? 'Caller assigned' : 'Caller removed');
      onAssigned(saved as unknown as Interview);
    } catch (err) {
      notify.error(err, 'Failed to assign the caller');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`${interview.companyName || 'Interview'} · ${stageLabel(entry?.stage)}`}>
      <div className="space-y-4 text-sm">
        <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1.5">
          <dt className="text-muted">When</dt>
          <dd className="tabular-nums">{when}</dd>
          <dt className="text-muted">Status</dt>
          <dd>{interviewStatusLabel(entry?.status) || '—'}</dd>
          <dt className="text-muted">Owner</dt>
          <dd>{interview.ownerName || interview.ownerEmail || '—'}{account?.name ? ` · ${account.name}` : ''}</dd>
          <dt className="text-muted">Method</dt>
          <dd>{method}</dd>
          {caller?.methodValue && (
            <>
              <dt className="text-muted">Link or number</dt>
              <dd className="break-all">{caller.methodValue}</dd>
            </>
          )}
          <dt className="text-muted">Caller</dt>
          <dd className="flex items-center gap-1.5 font-medium">
            <span
              className={`h-2.5 w-2.5 rounded-full ${unassigned ? `border ${UNASSIGNED_CHIP}` : known ? CALLER_DOT[known.color] : 'bg-zinc-400'}`}
              aria-hidden
            />
            {unassigned ? 'No caller yet' : caller?.callerName}
          </dd>
        </dl>

        {canManage ? (
          <div className="flex items-end gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
            <div className="flex-1">
              <Select id="caller-round-pick" label="Assign caller" labelClassName="mb-1 block text-sm font-medium"
                value={pick} onChange={setPick} options={options} />
            </div>
            <button type="button" className="btn" onClick={save} disabled={saving || pick === savedId}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Save
            </button>
          </div>
        ) : (
          <p className="border-t border-zinc-200 pt-3 text-xs text-muted dark:border-zinc-800">
            An admin or interview manager assigns the caller.
          </p>
        )}

        <div className="flex justify-end">
          <button type="button" className="btn-outline btn-sm" onClick={onOpenInterview}>
            <ExternalLink size={14} aria-hidden /> Open interview
          </button>
        </div>
      </div>
    </Modal>
  );
}
