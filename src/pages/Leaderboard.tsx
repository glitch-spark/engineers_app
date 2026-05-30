import useSWR from 'swr';
import { useSearchParams, Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import * as api from '../api/endpoints';
import type { LeaderboardMetric } from '../api/endpoints';
import { useAuth } from '../auth/useAuth';
import NameWithAvatar from '../components/NameWithAvatar';
import PageHeader from '../components/PageHeader';

const METRICS: { value: LeaderboardMetric; label: string }[] = [
  { value: 'earnings', label: 'Top earners' },
  { value: 'bids', label: 'Most bids' },
  { value: 'interviews', label: 'Most interviews' },
  { value: 'conversion', label: 'Best conversion' },
];

const RANGES: { value: number; label: string }[] = [
  { value: 7, label: '7d' },
  { value: 30, label: '30d' },
  { value: 90, label: '90d' },
  { value: 365, label: '1y' },
];

const MEDALS = ['🥇', '🥈', '🥉'];

function formatValue(metric: LeaderboardMetric, value: number): string {
  if (metric === 'earnings') {
    return value.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    });
  }
  if (metric === 'conversion') {
    return `${(value * 100).toFixed(1)}%`;
  }
  return value.toLocaleString();
}

export default function LeaderboardPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const metric = (params.get('metric') as LeaderboardMetric | null) || 'earnings';
  const range = Number(params.get('range') || 30);

  const setMetric = (m: LeaderboardMetric) => {
    const next = new URLSearchParams(params);
    next.set('metric', m);
    setParams(next, { replace: true });
  };
  const setRange = (r: number) => {
    const next = new URLSearchParams(params);
    next.set('range', String(r));
    setParams(next, { replace: true });
  };

  const { data, error, isLoading } = useSWR(
    ['leaderboard', metric, range],
    () => api.getLeaderboard({ metric, range, limit: 20 }),
    { revalidateOnFocus: false },
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leaderboard"
        action={
          <div className="flex items-center gap-1 bg-white border border-gray-100 rounded-md p-0.5">
            {RANGES.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setRange(r.value)}
                className={
                  'text-xs px-2 py-1 rounded ' +
                  (range === r.value
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 hover:bg-gray-50')
                }
              >
                {r.label}
              </button>
            ))}
          </div>
        }
      />

      <div className="flex items-center gap-1 border-b border-gray-200">
        {METRICS.map((m) => (
          <button
            key={m.value}
            type="button"
            onClick={() => setMetric(m.value)}
            className={
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ' +
              (metric === m.value
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-600 hover:text-gray-900')
            }
          >
            {m.label}
          </button>
        ))}
      </div>

      {error ? (
        <div className="bg-white rounded-md border border-red-100 p-4 text-sm text-red-700">
          Failed to load leaderboard.
        </div>
      ) : isLoading || !data ? (
        <div className="bg-white rounded-md border border-gray-100 p-4 flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : (
        <>
          {/* Your rank pill — hidden for admins (admins are excluded from
              leaderboards server-side; the opt-in CTA would be misleading). */}
          {user?.role !== 'admin' && (
            <div className="bg-white rounded-[12px] border border-gray-100 shadow-sm p-3 flex items-center justify-between flex-wrap gap-2">
              <div className="text-sm">
                {data.yourRank.optedIn ? (
                  data.yourRank.rank ? (
                    <>
                      <span className="text-gray-500">Your rank: </span>
                      <span className="font-semibold text-gray-900">
                        #{data.yourRank.rank}
                      </span>
                      <span className="text-gray-500"> / {data.yourRank.outOf}</span>
                      <span className="ml-3 text-gray-700">
                        {data.yourRank.value !== null ? formatValue(metric, data.yourRank.value) : '—'}
                      </span>
                      {data.yourRank.secondary && (
                        <span className="ml-2 text-xs text-gray-400">{data.yourRank.secondary}</span>
                      )}
                    </>
                  ) : (
                    <span className="text-gray-500">
                      You're opted in but don't qualify in this metric/window yet.
                    </span>
                  )
                ) : (
                  <span className="text-gray-500">
                    You're not on the leaderboard.{' '}
                    <Link to="/profile" className="text-blue-600 hover:underline">
                      Opt in from your profile
                    </Link>
                    {' '}to compete.
                  </span>
                )}
              </div>
            </div>
          )}

          {data.rows.length === 0 ? (
            <div className="bg-white rounded-md border border-gray-100 p-6 text-sm text-gray-500 text-center">
              No qualifying users in this window yet.
            </div>
          ) : (
            <div className="bg-white rounded-[12px] border border-gray-100 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-600">
                  <tr>
                    <th className="px-4 py-2 text-center w-12">#</th>
                    <th className="px-4 py-2 text-left">Name</th>
                    <th className="px-4 py-2 text-right">Value</th>
                    <th className="px-4 py-2 text-right">Detail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.rows.map((r) => {
                    const isMe = r.userId === user?.id;
                    const medal = r.rank <= 3 ? MEDALS[r.rank - 1] : null;
                    return (
                      <tr
                        key={r.userId}
                        className={
                          'hover:bg-gray-50 ' + (isMe ? 'bg-blue-50/40' : '')
                        }
                      >
                        <td className="px-4 py-2 text-center text-gray-700">
                          {medal ? <span className="text-base">{medal}</span> : r.rank}
                        </td>
                        <td className="px-4 py-2 text-gray-900">
                          <NameWithAvatar name={r.name} imageUrl={r.image} />
                          {isMe && (
                            <span className="ml-2 text-[10px] uppercase tracking-wider text-blue-700 font-semibold">
                              you
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right font-semibold text-gray-900">
                          {formatValue(metric, r.value)}
                        </td>
                        <td className="px-4 py-2 text-right text-xs text-gray-500">
                          {r.secondary}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
