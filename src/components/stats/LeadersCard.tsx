import useSWR from 'swr';
import * as api from '../../api/endpoints';
import type { LeaderGroup, LeaderRow, LeaderShare } from '../../api/endpoints';

/** "Winning vs weakest profiles" card: the team's best and weakest profiles and what their bids have in common. */
const shares = (l: LeaderShare[]) => l.slice(0, 3).map((s) => `${s.label} ${s.share}%`).join(' · ') || '—';
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
const age = (d: number | null) => (d == null ? '—' : d < 14 ? plural(d, 'day') : plural(Math.round(d / 7), 'week'));
const regionName = (r: string | null) => (r == null || r === 'null' ? 'no region' : r);

function Column({ title, rows, g }: { title: string; rows: LeaderRow[]; g: LeaderGroup }) {
  const regions = Object.entries(g.regions).map(([r, n]) => `${regionName(r)} ${n}`).join(' · ') || '—';
  const facts: [string, string][] = [
    ['Matured bids · interviews', `${g.matured} matured bids · ${g.interviews} interviews`],
    ['Region mix', regions],
    ['Avg resume score', g.avgScore == null ? 'no scores' : `${g.avgScore} (${g.scored} scored bids)`],
    ['Job areas', `${shares(g.areas)}${g.areaKnown == null ? '' : ` · area known for ${g.areaKnown}%`}`],
    ['Profile age when bidding', age(g.medianProfileAge)],
    ['Job sites', shares(g.sites)],
    ['Median days to interview', g.daysTooFew || g.medianDays == null ? 'too few' : `${plural(g.medianDays, 'day')} (${plural(g.interviewCount, 'interview')})`],
    ['Self / bidder mix', g.selfShare == null ? '—' : `${g.selfShare}% self`],
  ];
  return (
    <section aria-label={title} className="min-w-0">
      <h4 className="text-sm font-semibold">{title}</h4>
      <ul className="mt-1 space-y-0.5 text-sm">
        {rows.map((r) => (
          <li key={r.accountId}>
            {`${r.name ?? 'Unnamed profile'} · ${r.owner ?? 'unknown owner'} · ${regionName(r.region)} · ${r.matured} matured · ${r.interviews} interviews · ${r.per100 == null ? '—' : r.per100.toFixed(1)} per 100`}
          </li>
        ))}
      </ul>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-muted">Not enough profiles with 150+ matured bids to compare.</p>
      ) : (
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <tbody>
            {facts.map(([k, v]) => (
              <tr key={k} className="border-t border-zinc-200 align-top dark:border-zinc-800">
                <th scope="row" className="py-1 pr-3 text-xs font-normal text-muted">{k}</th>
                <td className="py-1 tabular-nums">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </section>
  );
}

export default function LeadersCard({ params, user: _user }: { params: { period: api.StatsPeriod; date: string; to?: string; region: api.StatsRegion } | null; user: string }) {
  // Leaders are team-wide: the viewed user doesn't change them, so it is neither sent nor part of the key.
  const { data, error, isLoading } = useSWR(
    params ? ['stats-leaders', params.period, params.date, params.to, params.region] : null,
    () => api.getLeaders(params!),
    { keepPreviousData: true },
  );
  if (!params) return null;
  if (error) return <p className="panel p-6 text-sm text-red-700 dark:text-red-400">Couldn’t load the leaders report. Try again.</p>;
  if (!data) {
    return isLoading ? (
      <p className="panel flex items-center gap-2 p-6 text-sm text-muted" role="status">
        <span className="spinner spinner-sm" aria-hidden /> Loading leaders…
      </p>
    ) : null;
  }
  return (
    <div className="panel p-4">
      <h3 className="font-semibold">Winning vs weakest profiles</h3>
      <p className="text-xs text-muted">The team's 3 best and 3 weakest profiles by interviews per 100 matured bids (150+ matured bids each).</p>
      {data.best.length === 0 && data.weakest.length === 0 ? (
        <p className="mt-2 text-sm text-muted">No profile has 150+ matured bids in this period yet.</p>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
            <Column title="Winning" rows={data.best} g={data.groups.best} />
            <Column title="Weakest" rows={data.weakest} g={data.groups.weakest} />
          </div>
          <p className="mt-3 text-xs text-muted">{data.note}</p>
        </>
      )}
    </div>
  );
}
