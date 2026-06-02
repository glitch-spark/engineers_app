import useSWR from 'swr';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, Trophy } from 'lucide-react';
import * as api from '../api/endpoints';
import type { ConsolidatedLeaderboard } from '../api/endpoints';
import { useAuth } from '../auth/useAuth';
import NameWithAvatar from '../components/NameWithAvatar';
import PageHeader from '../components/PageHeader';
import { Delta, RankChip, TargetCell, MiniTrend, fmtConversion } from '../lib/leaderboardUI';

type SortKey = 'bids' | 'interviews' | 'conversion';

const RANGES: { value: string; label: string }[] = [
  { value: 'week', label: 'This week' },
  { value: '30', label: '30d' },
  { value: '90', label: '90d' },
  { value: '365', label: '1y' },
];

export default function LeaderboardPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const range = params.get('range') || 'week';
  const setRange = (r: string) => {
    const next = new URLSearchParams(params);
    next.set('range', r);
    setParams(next, { replace: true });
  };

  const [sortKey, setSortKey] = useState<SortKey>('conversion');

  const { data, isLoading, error } = useSWR(
    ['leaderboard-consolidated', range],
    () => api.getLeaderboardConsolidated(range),
    { revalidateOnFocus: false },
  );

  const sortedUsers = useMemo(() => {
    const users = data?.users ?? [];
    return [...users].sort((a, b) => {
      // conversion sort: qualifiers first
      if (sortKey === 'conversion') {
        if (a.qualifiesConversion !== b.qualifiesConversion) return a.qualifiesConversion ? -1 : 1;
      }
      return b[sortKey] - a[sortKey];
    });
  }, [data, sortKey]);

  const isAdmin = user?.role === 'admin';

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

      {error && (
        <div className="bg-white rounded-[12px] border border-red-100 p-4 text-sm text-red-700">
          Failed to load leaderboard.
        </div>
      )}

      {(isLoading || !data) && !error && (
        <div className="bg-white rounded-[12px] border border-gray-100 p-4 flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      )}

      {data && (
        <>
          {/* Champion cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <ChampionCard label="Top bidder" value={data.champions.bids?.value} fmt={(v) => String(v)} winner={data.champions.bids} />
            <ChampionCard label="Top interviewer" value={data.champions.interviews?.value} fmt={(v) => String(v)} winner={data.champions.interviews} />
            <ChampionCard label="Top conversion" value={data.champions.conversion?.value} fmt={(v) => fmtConversion(v)} winner={data.champions.conversion} />
          </div>

          {/* Personal panel (non-admin only) */}
          {user && !isAdmin && data.yourStats && (
            <YourStats stats={data.yourStats} range={data.label} />
          )}

          {/* Table */}
          <div className="bg-white rounded-[12px] border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-2 text-left w-12">#</th>
                    <th className="px-4 py-2 text-left">User</th>
                    <ColHeader label="Bids" active={sortKey === 'bids'} onClick={() => setSortKey('bids')} />
                    <ColHeader label="Interviews" active={sortKey === 'interviews'} onClick={() => setSortKey('interviews')} />
                    <ColHeader label="Conversion" active={sortKey === 'conversion'} onClick={() => setSortKey('conversion')} />
                    <th className="px-4 py-2 text-center text-xs uppercase tracking-wide">Trend (8w)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sortedUsers.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-6 text-center text-sm text-gray-500">No qualifying users yet.</td></tr>
                  )}
                  {sortedUsers.map((u, idx) => {
                    const isMe = u.userId === user?.id;
                    return (
                      <tr key={u.userId} className={'hover:bg-gray-50 ' + (isMe ? 'bg-blue-50/40' : '')}>
                        <td className="px-4 py-2 text-center text-gray-700">{idx + 1}</td>
                        <td className="px-4 py-2 text-gray-900">
                          <NameWithAvatar name={u.name} imageUrl={u.image} />
                          {isMe && <span className="ml-2 text-[10px] uppercase tracking-wider text-blue-700 font-semibold">you</span>}
                        </td>
                        <MetricCell
                          value={u.bids}
                          target={u.bidsTarget}
                          prev={u.prevBids}
                          rank={u.rank_bids}
                          showTarget={range === 'week'}
                        />
                        <MetricCell
                          value={u.interviews}
                          target={u.interviewsTarget}
                          prev={u.prevInterviews}
                          rank={u.rank_interviews}
                          showTarget={range === 'week'}
                        />
                        <td className="px-4 py-2 text-right tabular-nums whitespace-nowrap">
                          {u.qualifiesConversion ? (
                            <>
                              <span className="font-semibold text-gray-900">{fmtConversion(u.conversion)}</span>
                              <div className="text-[10px] text-gray-400 flex items-center justify-end gap-1">
                                <RankChip rank={u.rank_conversion} />
                                <Delta cur={u.conversion} prev={u.prevConversion} />
                              </div>
                            </>
                          ) : (
                            <span className="text-xs text-gray-400">
                              {data.conversionMinBids}+ bids needed
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2 align-middle">
                          <MiniTrend data={u.trend} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ColHeader({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <th className={`px-4 py-2 text-right cursor-pointer select-none uppercase tracking-wide ${active ? 'text-primary' : 'text-gray-500'}`}
        onClick={onClick}>
      {label} {active && '▾'}
    </th>
  );
}

function MetricCell({
  value, target, prev, rank, showTarget,
}: {
  value: number; target: number; prev: number; rank?: number; showTarget: boolean;
}) {
  return (
    <td className="px-4 py-2 text-right tabular-nums whitespace-nowrap">
      <span className="font-semibold text-gray-900">{value.toLocaleString()}</span>
      {showTarget && target > 0 && (
        <span className="text-gray-400 text-xs font-medium"> / {target}</span>
      )}
      <div className="text-[10px] flex items-center justify-end gap-1 mt-0.5">
        <RankChip rank={rank} />
        {showTarget && <TargetCell value={value} target={target} />}
        <Delta cur={value} prev={prev} />
      </div>
    </td>
  );
}

function ChampionCard({
  label, value, fmt, winner,
}: {
  label: string;
  value?: number;
  fmt: (v: number) => string;
  winner: { userId: string; name: string; image?: string | null; value: number } | null;
}) {
  return (
    <div className="bg-white rounded-[12px] border border-gray-100 shadow-sm p-4">
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <Trophy size={12} className="text-amber-500" /> {label}
      </div>
      {winner ? (
        <>
          <div className="mt-2 text-2xl font-bold text-gray-900 tabular-nums">
            {value !== undefined ? fmt(value) : '—'}
          </div>
          <div className="mt-1 text-xs">
            <NameWithAvatar name={winner.name} imageUrl={winner.image} />
          </div>
        </>
      ) : (
        <div className="mt-2 text-sm text-gray-400 italic">No qualifying user yet</div>
      )}
    </div>
  );
}

function YourStats({ stats, range }: {
  stats: NonNullable<ConsolidatedLeaderboard['yourStats']>;
  range: string;
}) {
  return (
    <div className="bg-blue-50/50 rounded-[12px] border border-blue-100 p-4">
      <div className="text-xs font-medium text-blue-800 mb-2">Your numbers — {range}</div>
      <div className="grid grid-cols-3 gap-4">
        <StatBlock
          label="Bids"
          value={stats.bids}
          target={stats.bidsTarget}
          rank={stats.rankBids}
          prev={stats.prevBids}
        />
        <StatBlock
          label="Interviews"
          value={stats.interviews}
          target={stats.interviewsTarget}
          rank={stats.rankInterviews}
          prev={stats.prevInterviews}
        />
        <StatBlock
          label="Conversion"
          value={stats.conversion}
          rank={stats.rankConversion}
          prev={stats.prevConversion}
          isConversion
        />
      </div>
    </div>
  );
}

function StatBlock({
  label, value, target, rank, prev, isConversion,
}: {
  label: string;
  value: number;
  target?: number;
  rank?: number;
  prev: number;
  isConversion?: boolean;
}) {
  const display = isConversion ? fmtConversion(value) : value.toLocaleString();
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-blue-700/70">{label}</div>
      <div className="text-xl font-bold text-gray-900 tabular-nums">{display}</div>
      <div className="flex items-center gap-2 text-[11px] text-gray-500 mt-0.5">
        {rank && <span className="font-semibold text-gray-700">#{rank}</span>}
        {!isConversion && target && target > 0 && <TargetCell value={value} target={target} />}
        <Delta cur={value} prev={prev} />
      </div>
    </div>
  );
}
