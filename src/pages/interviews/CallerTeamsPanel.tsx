import { useState } from 'react';
import { Plus } from 'lucide-react';
import useSWR from 'swr';
import * as api from '../../api/endpoints';
import type { CallerTeam, TeamTestResult } from '../../api/endpoints';
import { notify } from '../../lib/notify';
import { useCallers } from '../../lib/useCallers';
import CallerTeamPanel from './CallerTeamPanel';

export const TEAMS_KEY = ['caller-teams'];

type TestRun = { channel: TeamTestResult; reminderChannel: TeamTestResult; at: Date };

const fmtTime = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

function TestPill({ r }: { r?: TeamTestResult }) {
  if (!r) return <span className="badge badge-neutral">not tested</span>;
  return r.ok ? <span className="badge badge-success">✓ works</span> : <span className="badge badge-danger">✕ {r.error ?? 'unknown error'}</span>;
}

/** Admin / interview manager: summary cards for the teams rounds are posted for, and the slide-over to edit them. */
export default function CallerTeamsPanel({ onChanged }: { onChanged?: () => void }) {
  const { external, byId } = useCallers();
  const { data: teams, mutate } = useSWR(TEAMS_KEY, api.listCallerTeams);
  const { data: conn } = useSWR(['caller-teams-connection'], api.getCallerTeamsConnection);
  const [editing, setEditing] = useState<CallerTeam | 'new' | null>(null);
  // Last test result per team; not persisted by the server.
  const [tests, setTests] = useState<Record<string, TestRun>>({});
  const [testing, setTesting] = useState<string | null>(null);
  const changed = () => { void mutate(); onChanged?.(); };

  const sendTest = async (t: CallerTeam) => {
    setTesting(t._id);
    try {
      const r = await api.testCallerTeam(t._id);
      setTests((prev) => ({ ...prev, [t._id]: { ...r, at: new Date() } }));
    } catch (err) {
      notify.error(err, 'Failed to send the test post');
    } finally {
      setTesting(null);
    }
  };

  const card = (t: CallerTeam) => {
    const members = external.filter((c) => c.teamId === t._id);
    const manager = byId.get(t.managerCallerId);
    const missing = members.filter((c) => !c.slackUserId).length + (manager && !manager.slackUserId && !members.some((c) => c._id === manager._id) ? 1 : 0);
    const test = tests[t._id];
    return (
      <article key={t._id} className="panel space-y-3 p-4" aria-label={`Team ${t.name}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-semibold text-strong">{t.name}</h3>
            <p className="text-xs text-muted">{members.length} {members.length === 1 ? 'caller' : 'callers'} · daily list {fmtTime(t.dailyTime)} CT</p>
          </div>
          {missing > 0 ? <span className="badge badge-warning shrink-0">{missing} missing Slack ID</span> : <span className="badge badge-success shrink-0">All tagged</span>}
        </div>
        <dl className="grid grid-cols-[6rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2 text-sm">
          <dt className="text-xs text-muted">Manager</dt>
          <dd><span className="badge badge-info">{manager?.name ?? '—'}</span></dd>
          <dt className="text-xs text-muted">Members</dt>
          <dd className="flex flex-wrap gap-1.5">
            {members.length === 0 && <span className="text-xs text-muted">No members yet</span>}
            {members.map((c) => (
              <span key={c._id} className={c.slackUserId ? 'badge badge-neutral' : 'badge badge-warning'} title={c.slackUserId ? `Tagged as ${c.slackUserId}` : 'No Slack ID: shown by name, not tagged'}>
                {c.name}{c._id === t.managerCallerId ? ' · manager' : ''}{c.slackUserId ? '' : ' ⚠'}
              </span>
            ))}
          </dd>
          <dt className="text-xs text-muted">Team channel</dt>
          <dd className="flex flex-wrap items-center gap-1.5"><TestPill r={test?.channel} /><span className="font-mono text-xs text-muted">{t.channelId}</span></dd>
          <dt className="text-xs text-muted">Reminders</dt>
          <dd className="flex flex-wrap items-center gap-1.5"><TestPill r={test?.reminderChannel} /><span className="font-mono text-xs text-muted">{t.reminderChannelId}</span></dd>
        </dl>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
          <span className="mr-auto text-xs text-muted">{test ? `Tested ${test.at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}</span>
          <button type="button" className="btn-outline text-sm" disabled={testing === t._id} onClick={() => void sendTest(t)}>Send test post</button>
          <button type="button" className="btn text-sm" onClick={() => setEditing(t)}>Edit team</button>
        </div>
      </article>
    );
  };

  return (
    <section className="space-y-3" aria-labelledby="caller-teams-h">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="caller-teams-h" className="text-base font-semibold text-strong">Caller teams</h2>
        <div className="flex flex-wrap items-center gap-2.5">
          {conn && (
            <span className={conn.connected ? 'badge badge-success' : 'badge badge-warning'}>
              {conn.connected ? `Connected to ${conn.workspace}` : 'Not connected — set SLACK_CALLERS_BOT_TOKEN'}
            </span>
          )}
          <button type="button" className="btn btn-sm" onClick={() => setEditing('new')}><Plus size={14} aria-hidden /> New team</button>
        </div>
      </div>
      <div className="grid gap-3.5 md:grid-cols-[repeat(auto-fill,minmax(min(100%,26rem),1fr))]">
        {(teams ?? []).filter((t) => !t.archived).map(card)}
        <button type="button" onClick={() => setEditing('new')} className="grid place-items-center gap-1 rounded-xl border border-dashed border-zinc-300 p-6 text-center text-sm text-muted hover:border-sky-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-zinc-700">
          <b className="text-strong">+ New team</b>
          <span>Group external callers who coordinate in the callers' Slack.</span>
        </button>
      </div>
      {editing && (
        <CallerTeamPanel
          key={editing === 'new' ? 'new' : editing._id}
          team={editing === 'new' ? null : editing}
          teams={teams ?? []}
          callers={external}
          byId={byId}
          onClose={() => setEditing(null)}
          onSaved={changed}
        />
      )}
    </section>
  );
}
