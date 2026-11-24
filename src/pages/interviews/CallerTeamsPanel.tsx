import { useState } from 'react';
import useSWR from 'swr';
import * as api from '../../api/endpoints';
import type { CallerTeam, TeamTestResult } from '../../api/endpoints';
import { notify } from '../../lib/notify';
import { useCallers } from '../../lib/useCallers';

const TEAMS_KEY = ['caller-teams'];

function TeamCard({ team, onChanged }: { team: CallerTeam | null; onChanged: () => void }) {
  const { external, byId } = useCallers();
  const [name, setName] = useState(team?.name ?? '');
  const [managerCallerId, setManager] = useState(team?.managerCallerId ?? '');
  const [channelId, setChannel] = useState(team?.channelId ?? '');
  const [reminderChannelId, setReminder] = useState(team?.reminderChannelId ?? '');
  const [dailyTime, setTime] = useState(team?.dailyTime ?? '06:00');
  const [busy, setBusy] = useState(false);
  const [test, setTest] = useState<{ channel: TeamTestResult; reminderChannel: TeamTestResult } | null>(null);
  const id = team ? team._id : 'new';
  const body = { name: name.trim(), managerCallerId, channelId: channelId.trim(), reminderChannelId: reminderChannelId.trim(), dailyTime };

  const run = async (fn: () => Promise<unknown>, ok: string, fail: string, reset = false) => {
    setBusy(true);
    try {
      await fn();
      notify.success(ok);
      if (reset) { setName(''); setManager(''); setChannel(''); setReminder(''); setTime('06:00'); }
      onChanged();
    } catch (err) {
      notify.error(err, fail);
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    setBusy(true);
    try {
      setTest(await api.testCallerTeam(id));
    } catch (err) {
      notify.error(err, 'Failed to send the test post');
    } finally {
      setBusy(false);
    }
  };

  const field = (label: string, el: React.ReactNode) => (
    <label className="block text-xs text-muted">{label}{el}</label>
  );
  const result = (label: string, r: TeamTestResult) => (
    <li>{label}: {r.ok ? 'Posted ✓' : `Failed: ${r.error ?? 'unknown error'}`}</li>
  );
  // An archived team's manager may be archived too, so keep the saved one selectable.
  const managers = external;
  const savedManager = team && !managers.some((c) => c._id === team.managerCallerId) ? byId.get(team.managerCallerId) : undefined;

  return (
    <div className={`panel space-y-3 p-4 ${team?.archived ? 'opacity-60' : ''}`} aria-label={team ? `Team ${team.name}` : 'New team'}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {field('Team name', <input className="input mt-1 w-full text-sm" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />)}
        {field('Manager', (
          <select className="input mt-1 w-full text-sm" value={managerCallerId} onChange={(e) => setManager(e.target.value)}>
            <option value="">Pick a manager</option>
            {savedManager && <option value={savedManager._id}>{savedManager.name}</option>}
            {managers.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
          </select>
        ))}
        {field('Team channel ID', <input className="input mt-1 w-full text-sm" value={channelId} placeholder="C0123ABCD" onChange={(e) => setChannel(e.target.value)} />)}
        {field('Reminder channel ID', <input className="input mt-1 w-full text-sm" value={reminderChannelId} placeholder="C0123ABCD" onChange={(e) => setReminder(e.target.value)} />)}
        {field('Daily time', <input type="time" className="input mt-1 w-full text-sm" value={dailyTime} onChange={(e) => setTime(e.target.value)} />)}
      </div>
      {team && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-muted">Members:</span>
          {team.memberIds.length === 0 && <span className="text-faint">none yet (set a caller's team in Edit)</span>}
          {team.memberIds.map((m) => <span key={m} className="badge badge-neutral">{byId.get(m)?.name ?? 'Caller'}</span>)}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {team ? (
          <>
            <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void run(() => api.updateCallerTeam(id, body), 'Team saved', 'Failed to save the team')}>Save</button>
            <button type="button" className="btn-outline text-sm" disabled={busy} onClick={() => void run(() => api.updateCallerTeam(id, { archived: !team.archived }), team.archived ? 'Team unarchived' : 'Team archived', 'Failed to update the team')}>
              {team.archived ? 'Unarchive' : 'Archive'}
            </button>
            <button type="button" className="btn-outline text-sm" disabled={busy} onClick={() => void sendTest()}>Send test post</button>
          </>
        ) : (
          <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void run(() => api.createCallerTeam(body), 'Team created', 'Failed to create the team', true)}>Create team</button>
        )}
      </div>
      {test && (
        <ul className="text-xs" role="status">
          {result('Team channel', test.channel)}
          {result('Reminder channel', test.reminderChannel)}
        </ul>
      )}
    </div>
  );
}

/** Admin / interview manager: the teams that rounds are posted for, and whether Slack is connected. */
export default function CallerTeamsPanel({ onChanged }: { onChanged?: () => void }) {
  const { data: teams, mutate } = useSWR(TEAMS_KEY, api.listCallerTeams);
  const { data: conn } = useSWR(['caller-teams-connection'], api.getCallerTeamsConnection);
  const changed = () => { void mutate(); onChanged?.(); };

  return (
    <section className="space-y-3 pt-4" aria-label="Teams">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-strong">Teams</h2>
        {conn && (
          <span className={`text-xs ${conn.connected ? 'text-muted' : 'text-amber-600'}`}>
            {conn.connected ? `Connected: ${conn.workspace} ✓` : 'Not connected — set SLACK_CALLERS_BOT_TOKEN'}
          </span>
        )}
      </div>
      {(teams ?? []).map((t) => <TeamCard key={t._id} team={t} onChanged={changed} />)}
      <TeamCard team={null} onChanged={changed} />
    </section>
  );
}
