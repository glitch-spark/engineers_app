import { useEffect, useRef, useState, type FormEvent } from 'react';
import useSWR from 'swr';
import { Check, Loader2 } from 'lucide-react';
import * as api from '../../api/endpoints';
import type { Caller, CallerColor } from '../../api/endpoints';
import SidePanel from '../SidePanel';
import { notify } from '../../lib/notify';
import { CALLER_COLORS, CALLER_DOT } from '../../lib/callerColors';

function ColorPicker({ value, onChange }: { value: CallerColor; onChange: (c: CallerColor) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Colour">
      {CALLER_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={c}
          title={c}
          onClick={() => onChange(c)}
          className={`flex h-6 w-6 items-center justify-center rounded-full ${CALLER_DOT[c]} ${value === c ? 'ring-2 ring-offset-1 ring-zinc-700 dark:ring-zinc-200 dark:ring-offset-zinc-900' : 'opacity-70 hover:opacity-100'}`}
        >
          {value === c && <Check size={12} className="text-white" aria-hidden />}
        </button>
      ))}
    </div>
  );
}

/**
 * Side panel to add an external caller (`caller` null) or edit one: an external caller's name and colour,
 * a platform user's colour only (their name comes from the account).
 */
export default function CallerEditPanel({
  caller, focus, onClose, onSaved,
}: {
  caller: Caller | null;
  /** Field to focus on open (a Team / Slack chip in the table). */
  focus?: 'team' | 'slack';
  onClose: () => void;
  onSaved: () => void;
}) {
  const isUser = caller?.kind === 'user';
  const [name, setName] = useState(caller?.name ?? '');
  const [color, setColor] = useState<CallerColor>(caller?.color ?? CALLER_COLORS[0]);
  const [slackUserId, setSlackUserId] = useState(caller?.slackUserId ?? '');
  const [teamId, setTeamId] = useState(caller?.teamId ?? '');
  const [busy, setBusy] = useState(false);
  const slackRef = useRef<HTMLInputElement>(null);
  const teamRef = useRef<HTMLSelectElement>(null);
  // After the dialog's own focus-on-open (its effect runs first, as a child).
  useEffect(() => { (focus === 'slack' ? slackRef : focus === 'team' ? teamRef : null)?.current?.focus(); }, [focus]);
  const isExternalEdit = !!caller && !isUser;
  const { data: teams } = useSWR(isExternalEdit ? ['caller-teams'] : null, api.listCallerTeams);
  const trimmed = name.trim();
  const slack = slackUserId.trim();
  const dirty = caller
    ? (!isUser && trimmed !== caller.name) || color !== caller.color
      || (isExternalEdit && (slack !== (caller.slackUserId ?? '') || teamId !== (caller.teamId ?? '')))
    : !!trimmed;
  const valid = isUser || !!trimmed;

  const save = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    try {
      if (!caller) {
        await api.createCaller({ name: trimmed, color });
        notify.success('Caller added');
      } else {
        await api.updateCaller(caller._id, isUser ? { color } : {
          name: trimmed, color,
          // Only changed fields: an unchanged teamId that is now archived would fail "No such team."
          ...(slack !== (caller.slackUserId ?? '') && { slackUserId: slack }),
          ...(teamId !== (caller.teamId ?? '') && { teamId }),
        });
        notify.success('Caller saved');
      }
      onSaved();
      onClose();
    } catch (err) {
      notify.error(err, caller ? 'Failed to save the caller' : 'Failed to add the caller');
      setBusy(false);
    }
  };

  return (
    <SidePanel
      open
      title={caller ? `Edit ${caller.name}` : 'Add external caller'}
      onClose={onClose}
      dirty={dirty && !busy}
      footer={(
        <>
          <button type="button" className="btn-outline text-sm" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" form="caller-edit-form" className="btn text-sm" disabled={busy || !valid || !dirty}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} {caller ? 'Save' : 'Add caller'}
          </button>
        </>
      )}
    >
      <form id="caller-edit-form" onSubmit={save} className="space-y-4">
        <div>
          <label htmlFor="caller-edit-name" className="mb-1 block text-xs text-muted">Name</label>
          <input
            id="caller-edit-name"
            className="input w-full text-sm"
            value={name}
            maxLength={60}
            disabled={isUser}
            autoFocus={!isUser && !focus}
            onChange={(e) => setName(e.target.value)}
          />
          {isUser && <p className="mt-1 text-xs text-muted">The name comes from their account.</p>}
        </div>
        <div>
          <span className="mb-1 block text-xs text-muted">Colour</span>
          <ColorPicker value={color} onChange={setColor} />
        </div>
        {isExternalEdit && (
          <>
            <div>
              <label htmlFor="caller-edit-slack" className="mb-1 block text-xs text-muted">Slack member ID</label>
              <input
                id="caller-edit-slack"
                ref={slackRef}
                className="input w-full text-sm"
                value={slackUserId}
                placeholder="U0123ABCD"
                onChange={(e) => setSlackUserId(e.target.value)}
              />
              <p className="mt-1 text-xs text-muted">Tags them in their team's post. Profile, then More, then Copy member ID.</p>
            </div>
            <div>
              <label htmlFor="caller-edit-team" className="mb-1 block text-xs text-muted">Team</label>
              <select id="caller-edit-team" ref={teamRef} className="input w-full text-sm" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
                <option value="">No team</option>
                {(teams ?? []).filter((t) => !t.archived || t._id === teamId).map((t) => (
                  <option key={t._id} value={t._id}>{t.name}</option>
                ))}
              </select>
            </div>
          </>
        )}
        {!isUser && <p className="text-xs text-muted">Renaming updates the rounds already assigned.</p>}
      </form>
    </SidePanel>
  );
}
