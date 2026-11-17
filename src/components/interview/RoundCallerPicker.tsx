import { useEffect, useRef, useState } from 'react';
import * as api from '../../api/endpoints';
import Select from '../Select';
import { useAuth } from '../../auth/useAuth';
import { notify } from '../../lib/notify';
import { useCallers, callerPickerOptions } from '../../lib/useCallers';
import { CALLER_DOT, UNASSIGNED_CHIP, isUnassigned } from '../../lib/callerColors';
import { stageLabel } from '../../lib/stageBadge';
import type { Interview } from './types';

/** A caller round's caller: the dot and name, and for admins / interview managers a Change caller button that
 * swaps in a select. Picking a caller saves at once. Everyone else sees the name only. */
export default function RoundCallerPicker({
  interview,
  roundId,
  onSaved,
}: {
  interview: Interview;
  roundId: string;
  onSaved: (saved: Interview) => void;
}) {
  const { user } = useAuth();
  const { people, external, byId, canManage } = useCallers();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const changeRef = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);

  const entry = interview.stageHistory?.find((e) => e.id === roundId);
  const caller = entry?.caller;
  const savedId = caller?.callerId || '';
  const typedName = caller?.callerName && caller.callerName !== 'TBD' ? caller.callerName : '';
  const unassigned = isUnassigned({ callerId: caller?.callerId, callerName: caller?.callerName });
  const known = savedId ? byId.get(savedId) : undefined;
  const label = `Caller for ${stageLabel(entry?.stage)}`;

  // Keyboard: focus the select when it opens, and the Change caller button when it closes.
  useEffect(() => {
    if (editing) wrapRef.current?.querySelector('select')?.focus();
    else if (wasEditing.current) changeRef.current?.focus();
    wasEditing.current = editing;
  }, [editing]);

  if (!entry) return null;

  const ownerId = typeof interview.createdBy === 'object' ? interview.createdBy?._id : interview.createdBy;
  // The current caller stays listed when it isn't on the list (typed before it, removed, or the owner).
  const options = callerPickerOptions({
    people, external, ownerId, currentUserId: user?.id, savedId, savedName: typedName,
  });

  const pick = async (value: string) => {
    if (saving) return;
    if (value === savedId) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const saved = await api.assignRoundCaller(interview._id, roundId, value);
      notify.success(value ? 'Caller assigned' : 'Caller removed');
      onSaved(saved as unknown as Interview);
      setEditing(false);
    } catch (err) {
      notify.error(err, 'Failed to assign the caller');
    } finally {
      setSaving(false);
    }
  };

  return (
    <span ref={wrapRef} className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="inline-flex items-center gap-1.5">
        <span
          className={`h-2.5 w-2.5 shrink-0 rounded-full ${unassigned ? `border ${UNASSIGNED_CHIP}` : known ? CALLER_DOT[known.color] : 'bg-zinc-400'}`}
          aria-hidden
        />
        <span className={unassigned ? 'text-muted' : 'font-medium'}>
          {unassigned ? 'No caller yet' : caller?.callerName}
        </span>
      </span>
      {canManage && (editing ? (
        <span className="inline-flex items-center gap-2">
          <span className="w-44">
            <Select
              label={label}
              labelClassName="sr-only"
              value={savedId}
              onChange={(v) => void pick(v)}
              options={options}
              disabled={saving}
            />
          </span>
          <button type="button" className="btn-outline btn-sm" onClick={() => setEditing(false)} disabled={saving}>
            Cancel
          </button>
        </span>
      ) : (
        <button ref={changeRef} type="button" className="btn-outline btn-sm" onClick={() => setEditing(true)}>
          {unassigned ? 'Assign caller' : 'Change caller'}
        </button>
      ))}
    </span>
  );
}
