import useSWR from 'swr';
import { NoMaturedNote } from './RateTable';
import * as api from '../../api/endpoints';
import type { ProfileReport, ProfileRow } from '../../api/endpoints';
import { useAuth } from '../../auth/useAuth';
import GradeBadge from './GradeBadge';

/** "Your profiles" report card under the you-vs-team frame: per-profile bids, interviews, speed and a grade. */

const one = (v: number) => v.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function coverageLine(c: ProfileReport['coverage']) {
  // headerBids / unmatchedInterviews are only known for "My profiles" (null for one profile or the team).
  const base = c.headerBids == null ? `Job-level numbers cover ${c.rows} applications.`
    : c.rows > c.headerBids
      ? `Job-level numbers cover ${c.rows} applications; you counted ${c.headerBids} bids this period.`
      : `Job-level numbers cover ${c.rows} of ${c.headerBids} bids (${c.headerBids ? `${Math.round((100 * c.rows) / c.headerBids)}%` : '—'}); typed self bids aren't tied to jobs.`;
  const n = c.unmatchedInterviews ?? 0;
  return n > 0 ? `${base} ${n} interview${n === 1 ? '' : 's'} couldn't be tied to a job.` : base;
}

function Per100({ v, max, team }: { v: number | null; max: number; team: number | null }) {
  if (v == null) return <>—</>;
  return (
    <div className="flex items-center gap-2">
      <span className="w-10 text-right tabular-nums">{one(v)}</span>
      <span className="relative h-2 w-20 flex-none rounded bg-zinc-200 dark:bg-zinc-800" aria-hidden>
        <span className="absolute inset-y-0 left-0 rounded bg-blue-500" style={{ width: `${Math.min(100, (v / max) * 100)}%` }} />
        {team != null && <span className="absolute -inset-y-0.5 w-0.5 bg-zinc-900 dark:bg-zinc-100" style={{ left: `${Math.min(100, (team / max) * 100)}%` }} />}
      </span>
    </div>
  );
}

function Row({ p, max, team }: { p: ProfileRow; max: number; team: number | null }) {
  const why = p.reasons.join('; ');
  const { intro, tech, final } = p.reach;
  const recent = p.interviews - p.maturedInterviews;
  return (
    <tr className="border-t border-zinc-200 align-top dark:border-zinc-800">
      <td className="py-2 pr-3">
        <span className="font-medium">{p.name}</span>{' '}
        {p.region && <span className="rounded bg-zinc-200 px-1 text-xs dark:bg-zinc-800">{p.region}</span>}
        {p.archived && <span className="ml-1 text-xs text-muted">archived</span>}
      </td>
      <td className="py-2 pr-3" title={why}>
        <GradeBadge grade={p.grade} />
        {why && <p className="text-xs text-muted">{why}</p>}
      </td>
      <td className="py-2 pr-3 tabular-nums">{p.bidsSelf} / {p.bidsBidder}</td>
      <td className="py-2 pr-3 tabular-nums">{p.matured}</td>
      <td className="py-2 pr-3 tabular-nums">
        {p.maturedInterviews}
        {recent > 0 && <span className="ml-1 whitespace-nowrap text-xs text-muted">+{recent} recent</span>}
      </td>
      <td className="py-2 pr-3"><Per100 v={p.per100} max={max} team={team} /></td>
      <td className="whitespace-nowrap py-2 pr-3 tabular-nums">{p.days ? `${p.days.first} · ${p.days.median} · ${p.days.slowest}` : '—'}</td>
      <td className="whitespace-nowrap py-2 pr-3">{p.interviews ? `${intro} intro · ${tech} tech · ${final} final` : 'no interviews'}</td>
      <td className="py-2 tabular-nums">{p.stillInPlay}</td>
    </tr>
  );
}

const HEAD = ['Profile', 'Grade', 'Bids self / bidder', 'Matured', 'Interviews', 'Per 100 bids', 'Days first · median · slowest', 'How far', 'Still in play'];

export default function ProfilesCard({ params, user, onShowLastMonth }: { params: api.ConversionParams | null; user: string; onShowLastMonth?: () => void }) {
  const me = useAuth().user;
  const { data, error, isLoading } = useSWR(
    params ? ['stats-profiles', params.period, params.date, params.to, params.region, params.scope, params.profile, user] : null,
    () => api.getProfileReport({ ...params!, ...(user ? { user } : {}) }),
    { keepPreviousData: true },
  );
  if (!params) return null;
  if (error) return <p className="panel p-6 text-sm text-red-700 dark:text-red-400">Couldn’t load the profile report. Try again.</p>;
  if (!data) {
    return isLoading ? (
      <p className="panel flex items-center gap-2 p-6 text-sm text-muted" role="status">
        <span className="spinner spinner-sm" aria-hidden /> Loading profiles…
      </p>
    ) : null;
  }
  const { window: w, team, profiles } = data;
  const max = Math.max(1e-9, team.per100 ?? 0, ...profiles.map((p) => p.per100 ?? 0));
  const own = data.subject.userId === me?.id;
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">{coverageLine(data.coverage)}</p>
      <div className="panel p-4">
        <h3 className="font-semibold">{own ? 'Your profiles' : `${data.subject.name}'s profiles`}</h3>
        <p className="text-xs text-muted">
          {`Bids made in ${data.label} that had ${w.matured_days}+ days to work ("matured"), what became of them, and how fast.`}
          {w.thin && ` Not enough interviews yet to measure the team's response time, so ${w.matured_days} days is used.`}
        </p>
        {profiles.some((p) => p.bidsSelf + p.bidsBidder > 0) && profiles.every((p) => p.matured === 0) && (
          <NoMaturedNote days={w.matured_days} onShowLastMonth={onShowLastMonth} />
        )}
        {profiles.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No job-level bids in this period yet.</p>
        ) : (
          <>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-xs text-muted">{HEAD.map((h) => <th key={h} className="pb-1 pr-3 font-normal">{h}</th>)}</tr>
                </thead>
                <tbody>{profiles.map((p) => <Row key={p.accountId} p={p} max={max} team={team.per100} />)}</tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-muted">
              Bar = profile · line = team rate ({team.per100 == null ? '—' : one(team.per100)} per 100). Grade: ✅ at/above team and reaches tech · ⚠ below team, slow, or stuck at intro · ⛔ no interview where the team rate would have given 3+ · ⏳ fewer than 30 matured bids, or too few to tell yet.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
