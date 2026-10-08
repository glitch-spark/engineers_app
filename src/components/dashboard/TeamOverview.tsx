import { useMemo, useState } from 'react';
import useSWR from 'swr';
import * as api from '../../api/endpoints';
import { todayInputValue } from '../../lib/week';
import NameWithAvatar from '../NameWithAvatar';
import Segmented from '../jobApplies/Segmented';

const RANGES: { value: api.DashboardCompareRange; label: string }[] = [
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: '30d', label: 'Last 30 days' },
];

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const count = new Intl.NumberFormat('en-US');
const DASH = '—';
const WARN = 'text-amber-700 dark:text-amber-400 font-medium';

type UserRow = api.DashboardTeam['users'][number];
type SortKey = 'name' | 'bids' | 'interviews' | 'earnings' | 'goalBidsPct' | 'goalInterviewsPct' | 'logged' | 'streak';

const pct = (v: number | null) => (v == null ? DASH : `${v}%`);
const lowGoal = (v: number | null) => v != null && v < 50;
const lowLogging = (logged: number, workingDays: number) => workingDays > 0 && logged * 2 < workingDays;
const loggedRatio = (r: { logged: number; workingDays: number }) => (r.workingDays ? r.logged / r.workingDays : null);

function sortValue(row: UserRow, key: SortKey): number | string | null {
  if (key === 'name') return row.name.toLowerCase();
  if (key === 'logged') return loggedRatio(row);
  return row[key];
}

const COLUMNS: { key: SortKey; label: string; numeric: boolean }[] = [
  { key: 'name', label: 'User', numeric: false },
  { key: 'bids', label: 'Bids', numeric: true },
  { key: 'interviews', label: 'Interviews', numeric: true },
  { key: 'earnings', label: 'Earnings', numeric: true },
  { key: 'goalBidsPct', label: 'Bids goal', numeric: true },
  { key: 'goalInterviewsPct', label: 'Interviews goal', numeric: true },
  { key: 'logged', label: 'Days logged', numeric: true },
  { key: 'streak', label: 'Streak', numeric: true },
];

/** Admins' "All users" view: team totals and a sortable row per user; a name opens that user's dashboard. */
export default function TeamOverview({ onPick }: { onPick: (userId: string) => void }) {
  const [range, setRange] = useState<api.DashboardCompareRange>('week');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'bids', dir: 'desc' });
  const today = todayInputValue();
  const { data, error, isLoading, mutate } = useSWR(
    ['dashboard-team', range, today],
    () => api.getDashboardTeam({ range, today }),
    { keepPreviousData: true },
  );

  const users = useMemo(() => {
    const rows = [...(data?.users ?? [])];
    const sign = sort.dir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      const va = sortValue(a, sort.key);
      const vb = sortValue(b, sort.key);
      if (va == null || vb == null) return va == null && vb == null ? 0 : va == null ? 1 : -1; // no data last
      if (va < vb) return -sign;
      if (va > vb) return sign;
      return a.name.localeCompare(b.name);
    });
    return rows;
  }, [data, sort]);

  const toggle = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' ? 'asc' : 'desc' }));

  return (
    <section className="panel p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="card-title">Team</h2>
        <Segmented label="Period" value={range} options={RANGES} onChange={setRange} />
      </div>

      {error && !data ? (
        <div>
          <p className="mb-3 text-sm text-muted">Couldn&rsquo;t load the team.</p>
          <button type="button" className="btn-outline" onClick={() => mutate()}>
            Retry
          </button>
        </div>
      ) : isLoading || !data ? (
        <div className="space-y-3">
          <div className="skeleton h-16 w-full" />
          <div className="skeleton h-64 w-full" />
        </div>
      ) : (
        <>
          <Totals totals={data.totals} />
          {users.length === 0 ? (
            <p className="text-sm text-muted">No active users yet.</p>
          ) : (
            <div className="table-wrap overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="table-head">
                  <tr>
                    {COLUMNS.map((c) => {
                      const active = sort.key === c.key;
                      return (
                        <th
                          key={c.key}
                          scope="col"
                          aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                          className={`px-3 py-2 font-medium text-strong whitespace-nowrap ${c.numeric ? 'text-right' : 'text-left'}`}
                        >
                          <button type="button" className="inline-flex items-center gap-1 hover:underline" onClick={() => toggle(c.key)}>
                            {c.label}
                            <span aria-hidden className="text-xs text-muted">
                              {active ? (sort.dir === 'asc' ? '▲' : '▼') : ''}
                            </span>
                          </button>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="row-divider">
                  {users.map((u) => (
                    <tr key={u.userId}>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          className="text-left hover:underline focus-ring rounded"
                          onClick={() => onPick(u.userId)}
                          title="Open this user's dashboard"
                        >
                          <NameWithAvatar name={u.name} imageUrl={u.image} size="sm" />
                        </button>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums" title={`self ${u.bidsSelf} · bidder ${u.bidsBidder}`}>
                        {count.format(u.bids)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{count.format(u.interviews)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{currency.format(u.earnings)}</td>
                      <td className={`px-3 py-2 text-right tabular-nums ${lowGoal(u.goalBidsPct) ? WARN : ''}`}>{pct(u.goalBidsPct)}</td>
                      <td className={`px-3 py-2 text-right tabular-nums ${lowGoal(u.goalInterviewsPct) ? WARN : ''}`}>
                        {pct(u.goalInterviewsPct)}
                      </td>
                      <td className={`px-3 py-2 text-right tabular-nums ${lowLogging(u.logged, u.workingDays) ? WARN : ''}`}>
                        {u.workingDays ? `${u.logged} / ${u.workingDays}` : DASH}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{u.streak}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Totals({ totals }: { totals: api.DashboardTeamStats }) {
  const tiles: { label: string; value: string; hint?: string; warn?: boolean }[] = [
    { label: 'Bids', value: count.format(totals.bids), hint: `self ${totals.bidsSelf} · bidder ${totals.bidsBidder}` },
    { label: 'Interviews', value: count.format(totals.interviews) },
    { label: 'Earnings', value: currency.format(totals.earnings) },
    { label: 'Bids goal', value: pct(totals.goalBidsPct), warn: lowGoal(totals.goalBidsPct) },
    { label: 'Interviews goal', value: pct(totals.goalInterviewsPct), warn: lowGoal(totals.goalInterviewsPct) },
    {
      label: 'Days logged',
      value: totals.workingDays ? `${totals.logged} / ${totals.workingDays}` : DASH,
      warn: lowLogging(totals.logged, totals.workingDays),
    },
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-xl border border-zinc-200 px-3 py-2 dark:border-zinc-800" title={t.hint}>
          <dt className="text-xs text-muted">{t.label}</dt>
          <dd className={`text-lg tabular-nums ${t.warn ? WARN : 'font-semibold text-strong'}`}>{t.value}</dd>
        </div>
      ))}
    </dl>
  );
}
