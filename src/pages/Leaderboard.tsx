import useSWR from 'swr';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, Trophy } from 'lucide-react';
import * as api from '../api/endpoints';
import type { ConsolidatedLeaderboard, ConsolidatedLeaderboardUser } from '../api/endpoints';
import { useAuth } from '../auth/useAuth';
import NameWithAvatar from '../components/NameWithAvatar';
import PageHeader from '../components/PageHeader';
import { Delta, RankChip, TargetCell, MiniTrend, fmtConversion } from '../lib/leaderboardUI';

type SortKey = 'bids' | 'interviews' | 'conversion';

const RANGES: { value: string; label: string }[] = [
  { value: 'week', label: 'Mon–Sat' },
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
          <div className="segmented">
            {RANGES.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setRange(r.value)}
                className={
                  'segmented-btn ' +
                  (range === r.value ? 'segmented-btn-active' : '')
                }
              >
                {r.label}
              </button>
            ))}
          </div>
        }
      />

      {error && (
        <div className="alert-error text-sm text-red-700">
          Failed to load leaderboard.
        </div>
      )}

      {(isLoading || !data) && !error && (
        <div className="panel p-4 flex items-center gap-2 text-sm text-muted">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      )}

      {data && (
        <>
          {/* Champion cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <TailorBidderChampionCard users={data.users} showPlanTailor={range === 'week'} />
            <InterviewChampionCard users={data.users} />
            <ConversionChampionCard users={data.users} minBids={data.conversionMinBids} />
          </div>

          {/* Personal panel (non-admin only) */}
          {user && !isAdmin && data.yourStats && (
            <YourStats stats={data.yourStats} range={data.label} showPlanTailor={range === 'week'} />
          )}

          {/* Table */}
          <div className="table-wrap">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="table-head">
                  <tr>
                    <th className="px-4 py-2 text-left w-12">#</th>
                    <th className="px-4 py-2 text-left">User</th>
                    <ColHeader label="Bids" active={sortKey === 'bids'} onClick={() => setSortKey('bids')} />
                    <ColHeader label="Interviews" active={sortKey === 'interviews'} onClick={() => setSortKey('interviews')} />
                    <ColHeader label="Conversion" active={sortKey === 'conversion'} onClick={() => setSortKey('conversion')} />
                    <th className="px-4 py-2 text-center text-xs uppercase tracking-wide">Trend (8w)</th>
                  </tr>
                </thead>
                <tbody className="row-divider">
                  {sortedUsers.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-6 text-center text-sm text-muted">No qualifying users yet.</td></tr>
                  )}
                  {sortedUsers.map((u, idx) => {
                    const isMe = u.userId === user?.id;
                    return (
                      <tr key={u.userId} className={'table-row ' + (isMe ? 'table-row-me' : '')}>
                        <td className="px-4 py-2 text-center text-body">{idx + 1}</td>
                        <td className="px-4 py-2 text-strong">
                          <NameWithAvatar name={u.name} imageUrl={u.image} />
                          {isMe && <span className="ml-2 text-[10px] uppercase tracking-wider text-sky-700 dark:text-sky-400 font-semibold">you</span>}
                        </td>
                        <MetricCell
                          value={u.bids}
                          target={u.bidsTarget}
                          prev={u.prevBids}
                          rank={u.rank_bids}
                          showTarget={range === 'week' && !(u.bidsPlan || u.bidsTailor)}
                          bidsPlan={range === 'week' ? u.bidsPlan : undefined}
                          bidsTailor={range === 'week' ? u.bidsTailor : undefined}
                        />
                        <MetricCell
                          value={u.interviews}
                          target={u.interviewsTarget}
                          prev={u.prevInterviews}
                          rank={u.rank_interviews}
                          showTarget={range === 'week'}
                          canceled={u.interviewsCanceled}
                          valueClassName="text-emerald-600 dark:text-emerald-400"
                        />
                        <td className="px-4 py-2 text-right tabular-nums whitespace-nowrap">
                          {u.qualifiesConversion ? (
                            <>
                              <span className="font-semibold text-strong">{fmtConversion(u.conversion)}</span>
                              <div className="text-[10px] text-faint flex items-center justify-end gap-1">
                                <RankChip rank={u.rank_conversion} />
                                <Delta cur={u.conversion} prev={u.prevConversion} />
                              </div>
                            </>
                          ) : (
                            <span className="text-xs text-faint">
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
    <th className={`px-4 py-2 text-right cursor-pointer select-none uppercase tracking-wide ${active ? 'text-sky-600 dark:text-sky-400' : 'text-muted'}`}
        onClick={onClick}>
      {label} {active && '▾'}
    </th>
  );
}

function MetricCell({
  value, target, prev, rank, showTarget, canceled, valueClassName, bidsPlan, bidsTailor,
}: {
  value: number; target: number; prev: number; rank?: number; showTarget: boolean;
  canceled?: number;
  valueClassName?: string;
  bidsPlan?: number;
  bidsTailor?: number;
}) {
  const showPlanTailor = bidsPlan !== undefined || bidsTailor !== undefined;
  return (
    <td className="px-4 py-2 text-right tabular-nums whitespace-nowrap">
      {showPlanTailor ? (
        <span className="font-semibold text-strong">
          Plan {bidsPlan ?? 0}
          <span className="text-faint font-medium"> / Tailor {bidsTailor ?? 0}</span>
        </span>
      ) : (
        <>
          <span className={`font-semibold ${valueClassName || 'text-strong'}`}>{value.toLocaleString()}</span>
          {showTarget && target > 0 && (
            <span className="text-faint text-xs font-medium"> / {target}</span>
          )}
        </>
      )}
      {(canceled ?? 0) > 0 && (
        <span className="ml-1 text-xs font-semibold text-red-600 dark:text-red-400">
          (Canceled - {canceled})
        </span>
      )}
      <div className="text-[10px] flex items-center justify-end gap-1 mt-0.5">
        <RankChip rank={rank} />
        {showTarget && !showPlanTailor && <TargetCell value={value} target={target} />}
        {showPlanTailor && (bidsPlan ?? 0) > 0 && (
          <TargetCell value={bidsTailor ?? 0} target={bidsPlan ?? 0} />
        )}
        <Delta cur={value} prev={prev} />
      </div>
    </td>
  );
}

function tailorScore(u: ConsolidatedLeaderboardUser): number {
  return u.bidsTailor ?? u.bids ?? 0;
}

function TailorBidderChampionCard({
  users,
  showPlanTailor,
}: {
  users: ConsolidatedLeaderboardUser[];
  showPlanTailor: boolean;
}) {
  const tied = useMemo(() => {
    if (!users.length) return [] as ConsolidatedLeaderboardUser[];
    const max = Math.max(...users.map(tailorScore));
    if (max <= 0) return [];
    return users
      .filter((u) => tailorScore(u) === max)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [users]);

  const [idx, setIdx] = useState(0);
  const tieKey = tied.map((u) => u.userId).join('|');
  useEffect(() => {
    setIdx(0);
  }, [tieKey]);

  if (tied.length === 0) {
    return (
      <div className="panel p-4">
        <div className="flex items-center gap-2 text-xs text-muted">
          <Trophy size={12} className="text-amber-500" /> Top Tailor Bidder
        </div>
        <div className="mt-2 text-sm text-faint italic">No qualifying user yet</div>
      </div>
    );
  }

  const activeIdx = ((idx % tied.length) + tied.length) % tied.length;
  const winner = tied[activeIdx];
  const plan = winner.bidsPlan ?? 0;
  const tailor = tailorScore(winner);

  const cycle = () => {
    if (tied.length < 2) return;
    setIdx((i) => (i + 1) % tied.length);
  };

  return (
    <div className="panel p-4">
      <div className="flex items-center gap-2 text-xs text-muted">
        <Trophy size={12} className="text-amber-500" /> Top Tailor Bidder
        {tied.length > 1 && (
          <span className="text-[10px] text-faint">· click total to switch</span>
        )}
      </div>
      <button
        type="button"
        onClick={cycle}
        disabled={tied.length < 2}
        className={`mt-2 text-left text-2xl font-bold text-strong tabular-nums leading-tight rounded-md -ml-1 px-1 ${
          tied.length > 1
            ? 'cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors'
            : 'cursor-default'
        }`}
        title={tied.length > 1 ? 'Click to show next tied tailor bidder' : undefined}
      >
        {showPlanTailor ? (
          <>
            Plan {plan}
            <span className="text-base font-medium text-muted"> / Tailor {tailor}</span>
          </>
        ) : (
          tailor
        )}
      </button>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {tied.map((u, i) => {
          const focused = i === activeIdx;
          return (
            <button
              key={u.userId}
              type="button"
              onClick={() => setIdx(i)}
              className={`rounded-lg px-1.5 py-1 transition-colors ${
                focused
                  ? 'ring-2 ring-sky-500 bg-sky-50 dark:bg-sky-950/40'
                  : 'opacity-60 hover:opacity-100 hover:bg-zinc-100 dark:hover:bg-zinc-800'
              }`}
              title={focused ? u.name : `Show ${u.name}`}
            >
              <NameWithAvatar name={u.name} imageUrl={u.image} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function InterviewChampionCard({ users }: { users: ConsolidatedLeaderboardUser[] }) {
  const tied = useMemo(() => {
    if (!users.length) return [] as ConsolidatedLeaderboardUser[];
    const max = Math.max(...users.map((u) => u.interviews));
    if (max <= 0) return [];
    return users
      .filter((u) => u.interviews === max)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [users]);

  const [idx, setIdx] = useState(0);
  const tieKey = tied.map((u) => u.userId).join('|');
  useEffect(() => {
    setIdx(0);
  }, [tieKey]);

  if (tied.length === 0) {
    return (
      <div className="panel p-4">
        <div className="flex items-center gap-2 text-xs text-muted">
          <Trophy size={12} className="text-amber-500" /> Top interviewer
        </div>
        <div className="mt-2 text-sm text-faint italic">No qualifying user yet</div>
      </div>
    );
  }

  const activeIdx = ((idx % tied.length) + tied.length) % tied.length;
  const winner = tied[activeIdx];
  const breakdownText = (winner.interviewBreakdown ?? [])
    .filter((x) => x.count > 0)
    .map((x) => `${x.label}-${x.count}`)
    .join(', ');
  const canceled = winner.interviewsCanceled ?? 0;

  const cycle = () => {
    if (tied.length < 2) return;
    setIdx((i) => (i + 1) % tied.length);
  };

  return (
    <div className="panel p-4">
      <div className="flex items-center gap-2 text-xs text-muted">
        <Trophy size={12} className="text-amber-500" /> Top interviewer
        {tied.length > 1 && (
          <span className="text-[10px] text-faint">· click total to switch</span>
        )}
      </div>
      <button
        type="button"
        onClick={cycle}
        disabled={tied.length < 2}
        className={`mt-2 text-left text-2xl font-bold text-strong tabular-nums leading-tight rounded-md -ml-1 px-1 ${
          tied.length > 1
            ? 'cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors'
            : 'cursor-default'
        }`}
        title={tied.length > 1 ? 'Click to show next tied interviewer' : undefined}
      >
        {winner.interviews}
        {breakdownText && (
          <span className="text-sm font-medium text-muted">
            ({breakdownText})
          </span>
        )}
        {canceled > 0 && (
          <span className="ml-1 text-sm font-semibold text-red-600 dark:text-red-400">
            / Canceled-{canceled}
          </span>
        )}
      </button>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {tied.map((u, i) => {
          const focused = i === activeIdx;
          return (
            <button
              key={u.userId}
              type="button"
              onClick={() => setIdx(i)}
              className={`rounded-lg px-1.5 py-1 transition-colors ${
                focused
                  ? 'ring-2 ring-sky-500 bg-sky-50 dark:bg-sky-950/40'
                  : 'opacity-60 hover:opacity-100 hover:bg-zinc-100 dark:hover:bg-zinc-800'
              }`}
              title={focused ? u.name : `Show ${u.name}`}
            >
              <NameWithAvatar name={u.name} imageUrl={u.image} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ConversionChampionCard({
  users,
  minBids,
}: {
  users: ConsolidatedLeaderboardUser[];
  minBids: number;
}) {
  const tied = useMemo(() => {
    const qualified = users.filter((u) => u.qualifiesConversion);
    if (!qualified.length) return [] as ConsolidatedLeaderboardUser[];
    const max = Math.max(...qualified.map((u) => u.conversion));
    if (max <= 0) return [];
    return qualified
      .filter((u) => u.conversion === max)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [users]);

  const [idx, setIdx] = useState(0);
  const tieKey = tied.map((u) => u.userId).join('|');
  useEffect(() => {
    setIdx(0);
  }, [tieKey]);

  if (tied.length === 0) {
    return (
      <div className="panel p-4">
        <div className="flex items-center gap-2 text-xs text-muted">
          <Trophy size={12} className="text-amber-500" /> Top conversion
        </div>
        <div className="mt-2 text-sm text-faint italic">
          No qualifying user yet ({minBids}+ bids needed)
        </div>
      </div>
    );
  }

  const activeIdx = ((idx % tied.length) + tied.length) % tied.length;
  const winner = tied[activeIdx];

  const cycle = () => {
    if (tied.length < 2) return;
    setIdx((i) => (i + 1) % tied.length);
  };

  return (
    <div className="panel p-4">
      <div className="flex items-center gap-2 text-xs text-muted">
        <Trophy size={12} className="text-amber-500" /> Top conversion
        {tied.length > 1 && (
          <span className="text-[10px] text-faint">· click total to switch</span>
        )}
      </div>
      <button
        type="button"
        onClick={cycle}
        disabled={tied.length < 2}
        className={`mt-2 text-left text-2xl font-bold text-strong tabular-nums leading-tight rounded-md -ml-1 px-1 ${
          tied.length > 1
            ? 'cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors'
            : 'cursor-default'
        }`}
        title={tied.length > 1 ? 'Click to show next tied conversion leader' : undefined}
      >
        {fmtConversion(winner.conversion)}
        <span className="ml-1.5 text-sm font-medium text-muted">
          ({winner.interviews}/{winner.bids})
        </span>
      </button>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {tied.map((u, i) => {
          const focused = i === activeIdx;
          return (
            <button
              key={u.userId}
              type="button"
              onClick={() => setIdx(i)}
              className={`rounded-lg px-1.5 py-1 transition-colors ${
                focused
                  ? 'ring-2 ring-sky-500 bg-sky-50 dark:bg-sky-950/40'
                  : 'opacity-60 hover:opacity-100 hover:bg-zinc-100 dark:hover:bg-zinc-800'
              }`}
              title={focused ? u.name : `Show ${u.name}`}
            >
              <NameWithAvatar name={u.name} imageUrl={u.image} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function YourStats({ stats, range, showPlanTailor }: {
  stats: NonNullable<ConsolidatedLeaderboard['yourStats']>;
  range: string;
  showPlanTailor?: boolean;
}) {
  return (
    <div className="banner-info">
      <div className="text-xs font-medium text-sky-800 dark:text-sky-300 mb-2">Your numbers — {range}</div>
      <div className="grid grid-cols-3 gap-4">
        <StatBlock
          label="Bids"
          value={stats.bids}
          target={stats.bidsTarget}
          rank={stats.rankBids}
          prev={stats.prevBids}
          bidsPlan={showPlanTailor ? stats.bidsPlan : undefined}
          bidsTailor={showPlanTailor ? stats.bidsTailor : undefined}
        />
        <StatBlock
          label="Interviews"
          value={stats.interviews}
          target={stats.interviewsTarget}
          rank={stats.rankInterviews}
          prev={stats.prevInterviews}
          canceled={stats.interviewsCanceled}
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
  label, value, target, rank, prev, isConversion, canceled, bidsPlan, bidsTailor,
}: {
  label: string;
  value: number;
  target?: number;
  rank?: number;
  prev: number;
  isConversion?: boolean;
  canceled?: number;
  bidsPlan?: number;
  bidsTailor?: number;
}) {
  const showPlanTailor = !isConversion && (bidsPlan !== undefined || bidsTailor !== undefined);
  const display = isConversion ? fmtConversion(value) : value.toLocaleString();
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-sky-700/70 dark:text-sky-400/80">{label}</div>
      <div className="text-xl font-bold tabular-nums">
        {showPlanTailor ? (
          <span className="text-strong">
            Plan {bidsPlan ?? 0}
            <span className="text-sm font-medium text-muted"> / Tailor {bidsTailor ?? 0}</span>
          </span>
        ) : (
          <>
            <span className={isConversion ? 'text-strong' : 'text-emerald-600 dark:text-emerald-400'}>{display}</span>
            {!isConversion && (canceled ?? 0) > 0 && (
              <span className="ml-1.5 text-sm font-semibold text-red-600 dark:text-red-400">
                (Canceled - {canceled})
              </span>
            )}
          </>
        )}
      </div>
      <div className="flex items-center gap-2 text-[11px] text-muted mt-0.5">
        {rank && <span className="font-semibold text-body">#{rank}</span>}
        {!isConversion && !showPlanTailor && target && target > 0 && <TargetCell value={value} target={target} />}
        {showPlanTailor && (bidsPlan ?? 0) > 0 && (
          <TargetCell value={bidsTailor ?? 0} target={bidsPlan ?? 0} />
        )}
        <Delta cur={value} prev={prev} />
      </div>
    </div>
  );
}
