import { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import * as api from '../../api/endpoints';
import type { Caller, CallerTeam } from '../../api/endpoints';
import SidePanel from '../../components/SidePanel';
import { notify } from '../../lib/notify';

/**
 * Slide-over to create (`team` null) or edit a caller team: name, manager, members, Slack channels, daily time.
 * Saving writes the team first, then moves each caller whose membership changed (a caller's team lives on the caller).
 */
export default function CallerTeamPanel({
  team, teams, callers, byId, onClose, onSaved,
}: {
  team: CallerTeam | null;
  /** All teams: a caller on an archived team counts as individual. */
  teams: CallerTeam[];
  /** Non-archived external callers. */
  callers: Caller[];
  byId: Map<string, Caller>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(team?.name ?? '');
  const [managerCallerId, setManager] = useState(team?.managerCallerId ?? '');
  const [channelId, setChannel] = useState(team?.channelId ?? '');
  const [reminderChannelId, setReminder] = useState(team?.reminderChannelId ?? '');
  const [dailyTime, setTime] = useState(team?.dailyTime ?? '06:00');
  const initialMembers = useMemo(
    () => new Set(team ? callers.filter((c) => c.teamId === team._id).map((c) => c._id) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [members, setMembers] = useState<Set<string>>(initialMembers);
  const [busy, setBusy] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const teamName = (c: Caller) => c.teamName || 'another team';
  const savedManager = team && !callers.some((c) => c._id === team.managerCallerId) ? byId.get(team.managerCallerId) : undefined;
  const valid = !!name.trim();
  const activeTeamIds = new Set(teams.filter((t) => !t.archived).map((t) => t._id));
  const dirty = name !== (team?.name ?? '') || managerCallerId !== (team?.managerCallerId ?? '')
    || channelId !== (team?.channelId ?? '') || reminderChannelId !== (team?.reminderChannelId ?? '')
    || dailyTime !== (team?.dailyTime ?? '06:00')
    || members.size !== initialMembers.size || [...members].some((id) => !initialMembers.has(id));

  const toggle = (id: string) => setMembers((prev) => {
    const next = new Set(prev);
    if (!next.delete(id)) next.add(id);
    return next;
  });

  const save = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    let saved: CallerTeam;
    try {
      const body = { name: name.trim(), managerCallerId, channelId: channelId.trim(), reminderChannelId: reminderChannelId.trim(), dailyTime };
      saved = team ? await api.updateCallerTeam(team._id, body) : await api.createCallerTeam(body);
    } catch (err) {
      notify.error(err, team ? 'Failed to save the team' : 'Failed to create the team');
      setBusy(false);
      return;
    }
    // Sequential: the server moves a caller out of their old team as part of each update.
    let failed = 0;
    for (const c of callers) {
      const inTeam = c.teamId === saved._id;
      if (members.has(c._id) === inTeam) continue;
      try {
        await api.updateCaller(c._id, { teamId: members.has(c._id) ? saved._id : '' });
      } catch (err) {
        failed += 1;
        notify.error(err, `Failed to update ${c.name}`);
      }
    }
    if (failed === 0) notify.success(team ? 'Team saved' : 'Team created');
    onSaved();
    onClose();
  };

  const archive = async () => {
    if (!team) return;
    setBusy(true);
    try {
      await api.updateCallerTeam(team._id, { archived: true });
      notify.success('Team archived');
      onSaved();
      onClose();
    } catch (err) {
      notify.error(err, 'Failed to archive the team');
      setBusy(false);
      setConfirmArchive(false);
    }
  };

  const label = 'mb-1 block text-xs text-muted';
  return (
    <SidePanel
      open
      title={team ? `Edit ${team.name}` : 'New caller team'}
      // Closing mid-save would drop the result; the panel closes itself when done.
      onClose={() => { if (!busy) onClose(); }}
      dirty={dirty && !busy}
      footer={confirmArchive ? (
        <>
          <span className="mr-auto text-sm text-strong" role="alert">Archive {team?.name}? Its callers become individual callers.</span>
          <button type="button" className="btn-outline text-sm" onClick={() => setConfirmArchive(false)} disabled={busy}>Keep team</button>
          <button type="button" className="btn-danger text-sm" onClick={() => void archive()} disabled={busy}>Confirm archive</button>
        </>
      ) : (
        <>
          {team && (
            <button type="button" className="btn-outline mr-auto text-sm text-red-600 dark:text-red-400" onClick={() => setConfirmArchive(true)} disabled={busy}>Archive team</button>
          )}
          <button type="button" className="btn-outline text-sm" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" form="caller-team-form" className="btn text-sm" disabled={busy || !valid}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} {team ? 'Save' : 'Create team'}
          </button>
        </>
      )}
    >
      <form id="caller-team-form" onSubmit={save} className="space-y-4">
        <div>
          <label htmlFor="team-name" className={label}>Team name</label>
          <input id="team-name" className="input w-full text-sm" value={name} maxLength={60} autoFocus onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label htmlFor="team-manager" className={label}>Manager</label>
          <select id="team-manager" className="input w-full text-sm" value={managerCallerId} onChange={(e) => setManager(e.target.value)}>
            <option value="">Pick an external caller</option>
            {savedManager && <option value={savedManager._id}>{savedManager.name}</option>}
            {callers.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
          </select>
          <p className="mt-1 text-xs text-muted">Tagged on every team post and reminder.</p>
        </div>
        <fieldset>
          <legend className={label}>Members</legend>
          <div className="divide-y divide-zinc-200 overflow-hidden rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {callers.length === 0 && <p className="px-3 py-2 text-sm text-muted">No external callers yet.</p>}
            {callers.map((c) => {
              const other = c.teamId && c.teamId !== team?._id && activeTeamIds.has(c.teamId);
              return (
                <label key={c._id} className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm">
                  <input type="checkbox" checked={members.has(c._id)} onChange={() => toggle(c._id)} />
                  {c.name}
                  <span className="ml-auto">
                    {other ? <span className="badge badge-neutral">in {teamName(c)}</span>
                      : c.slackUserId ? <span className="badge badge-success">✓ Slack</span>
                      : <span className="badge badge-warning">no Slack ID</span>}
                  </span>
                </label>
              );
            })}
          </div>
          <p className="mt-1 text-xs text-muted">A caller can be in one team. Moving one here takes them out of their other team.</p>
        </fieldset>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="team-channel" className={label}>Team channel ID</label>
            <input id="team-channel" className="input w-full font-mono text-sm" value={channelId} placeholder="C0123ABCD" onChange={(e) => setChannel(e.target.value)} />
          </div>
          <div>
            <label htmlFor="team-reminder" className={label}>Reminder channel ID</label>
            <input id="team-reminder" className="input w-full font-mono text-sm" value={reminderChannelId} placeholder="C0123ABCD" onChange={(e) => setReminder(e.target.value)} />
          </div>
        </div>
        <p className="-mt-2 text-xs text-muted">In Slack: open the channel, then its name, About, Channel ID. Invite the bot to both.</p>
        <div className="max-w-[12rem]">
          <label htmlFor="team-time" className={label}>Daily list at (Chicago time)</label>
          <input id="team-time" type="time" className="input w-full text-sm" value={dailyTime} onChange={(e) => setTime(e.target.value)} />
        </div>
      </form>
    </SidePanel>
  );
}
