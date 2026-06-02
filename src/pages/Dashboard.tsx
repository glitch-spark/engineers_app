import useSWR from 'swr';
import { Link } from 'react-router-dom';
import { Loader2, ArrowRight, Calendar, ClipboardCheck, FileText, Sparkles } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import MotivationHero from '../components/MotivationHero';
import PageHeader from '../components/PageHeader';
import { useAuth } from '../auth/useAuth';
import * as api from '../api/endpoints';
import { Delta, RankChip, TargetCell, fmtConversion } from '../lib/leaderboardUI';

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - t);
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function formatWhen(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  if (sameDay) return `Today ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  if (d.toDateString() === tomorrow.toDateString()) {
    return `Tomorrow ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function DashboardPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const { data: lb, isLoading: lbLoading } = useSWR(
    ['dashboard-leaderboard'],
    () => api.getLeaderboardConsolidated('week', 12),
    { revalidateOnFocus: false },
  );
  const { data: feed, isLoading: feedLoading } = useSWR(
    ['dashboard-feed'],
    () => api.getDashboardFeed(),
  );

  const yourStats = lb?.yourStats ?? null;
  const meTrend = lb?.users.find((u) => u.userId === user?.id)?.trend ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" />
      {!isAdmin && <MotivationHero userId={user?.id} />}

      {/* Hero KPI row — bids, interviews, conversion (this week) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {lbLoading && !lb ? (
          <SkeletonHero />
        ) : (
          <>
            <HeroCard
              label="Bids"
              value={yourStats?.bids ?? 0}
              target={yourStats?.bidsTarget ?? 0}
              prev={yourStats?.prevBids ?? 0}
              rank={yourStats?.rankBids}
            />
            <HeroCard
              label="Interviews"
              value={yourStats?.interviews ?? 0}
              target={yourStats?.interviewsTarget ?? 0}
              prev={yourStats?.prevInterviews ?? 0}
              rank={yourStats?.rankInterviews}
            />
            <ConversionHeroCard
              value={yourStats?.conversion ?? 0}
              prev={yourStats?.prevConversion ?? 0}
              rank={yourStats?.rankConversion}
              minBids={lb?.conversionMinBids ?? 10}
              qualifies={yourStats != null && yourStats.bids >= (lb?.conversionMinBids ?? 10)}
            />
          </>
        )}
      </div>

      {/* Funnel + Plan CTA */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="md:col-span-2">
          <FunnelCard
            bids={yourStats?.bids ?? 0}
            interviews={yourStats?.interviews ?? 0}
            conversion={yourStats?.conversion ?? 0}
            minBids={lb?.conversionMinBids ?? 10}
          />
        </div>
        <WeeklyPlanCTA />
      </div>

      {/* Trend chart — 12 weeks bids vs interviews */}
      <section className="bg-white rounded-[12px] border border-gray-100 shadow-sm p-4">
        <header className="flex items-center justify-between mb-3">
          <h2 className="card-title uppercase tracking-wide">Trend — last 12 weeks</h2>
          <Link to="/leaderboard" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
            See leaderboard <ArrowRight size={12} />
          </Link>
        </header>
        {meTrend.length === 0 ? (
          <div className="text-sm text-gray-400 italic">No activity in the last 12 weeks yet.</div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={meTrend} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" stroke="#64748b" fontSize={12} />
              <YAxis stroke="#64748b" fontSize={12} allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="bids" name="Bids" stroke="#2563eb" strokeWidth={2} dot />
              <Line type="monotone" dataKey="interviews" name="Interviews" stroke="#f59e0b" strokeWidth={2} dot />
            </LineChart>
          </ResponsiveContainer>
        )}
      </section>

      {/* Upcoming interviews + recent activity */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <UpcomingInterviewsCard upcoming={feed?.upcoming ?? []} loading={feedLoading && !feed} />
        <RecentActivityCard recent={feed?.recent ?? []} loading={feedLoading && !feed} />
      </div>
    </div>
  );
}

// ---------- Hero cards ----------

function HeroCard({
  label, value, target, prev, rank,
}: {
  label: string; value: number; target: number; prev: number; rank?: number;
}) {
  return (
    <div className="bg-white rounded-[12px] border border-gray-100 shadow-sm p-4">
      <div className="flex items-center justify-between">
        <div className="text-xs text-gray-500">{label} — this week</div>
        <RankChip rank={rank} large />
      </div>
      <div className="mt-2 text-3xl font-bold text-gray-900 tabular-nums">
        {value.toLocaleString()}
        {target > 0 && (
          <span className="text-base font-medium text-gray-400"> / {target}</span>
        )}
      </div>
      <div className="mt-1 flex items-center gap-3 text-xs">
        {target > 0 ? <TargetCell value={value} target={target} /> : <span className="text-gray-400">no target set</span>}
        <Delta cur={value} prev={prev} />
      </div>
    </div>
  );
}

function ConversionHeroCard({
  value, prev, rank, minBids, qualifies,
}: { value: number; prev: number; rank?: number; minBids: number; qualifies: boolean }) {
  return (
    <div className="bg-white rounded-[12px] border border-gray-100 shadow-sm p-4">
      <div className="flex items-center justify-between">
        <div className="text-xs text-gray-500">Conversion — this week</div>
        <RankChip rank={rank} large />
      </div>
      {qualifies ? (
        <>
          <div className="mt-2 text-3xl font-bold text-gray-900 tabular-nums">{fmtConversion(value)}</div>
          <div className="mt-1 flex items-center gap-3 text-xs">
            <Delta cur={value} prev={prev} />
          </div>
        </>
      ) : (
        <>
          <div className="mt-2 text-3xl font-bold text-gray-400 tabular-nums">—</div>
          <div className="mt-1 text-xs text-gray-400">{minBids}+ bids needed to qualify</div>
        </>
      )}
    </div>
  );
}

function SkeletonHero() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <div key={i} className="bg-white rounded-[12px] border border-gray-100 shadow-sm p-4">
          <div className="h-3 w-24 bg-gray-100 rounded mb-3" />
          <div className="h-8 w-32 bg-gray-100 rounded" />
          <div className="mt-2 h-3 w-20 bg-gray-100 rounded" />
        </div>
      ))}
    </>
  );
}

// ---------- Funnel ----------

function FunnelCard({
  bids, interviews, conversion, minBids,
}: { bids: number; interviews: number; conversion: number; minBids: number }) {
  const stages = [
    { label: 'Bids', value: bids, color: 'bg-blue-500' },
    { label: 'Interviews', value: interviews, color: 'bg-amber-500' },
  ];
  const top = Math.max(...stages.map((s) => s.value), 1);
  return (
    <div className="bg-white rounded-[12px] border border-gray-100 shadow-sm p-4">
      <header className="flex items-center justify-between mb-3">
        <h2 className="card-title uppercase tracking-wide">Pipeline — this week</h2>
        <div className="text-xs text-gray-500">
          Bid → Interview <span className="font-semibold text-gray-700">{bids >= minBids ? fmtConversion(conversion) : `${minBids}+ needed`}</span>
        </div>
      </header>
      <div className="space-y-2">
        {stages.map((s) => (
          <div key={s.label} className="flex items-center gap-3">
            <div className="w-24 text-sm text-gray-700">{s.label}</div>
            <div className="flex-1 h-6 bg-gray-100 rounded-[6px] overflow-hidden">
              <div className={`h-full ${s.color}`} style={{ width: `${Math.max(2, (s.value / top) * 100)}%` }} />
            </div>
            <div className="w-12 text-right text-sm font-semibold text-gray-900 tabular-nums">{s.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Weekly plan CTA ----------

function WeeklyPlanCTA() {
  return (
    <Link
      to="/weekly-plan"
      className="bg-white rounded-[12px] border border-gray-100 shadow-sm p-4 hover:bg-gray-50 transition flex flex-col justify-between min-h-[140px]"
    >
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <ClipboardCheck size={14} /> Weekly plan
      </div>
      <div className="text-sm text-gray-800 mt-2">
        Set this week's targets, log results at Friday EOD.
      </div>
      <span className="mt-3 text-xs text-primary inline-flex items-center gap-1">
        Open weekly plan <ArrowRight size={12} />
      </span>
    </Link>
  );
}

// ---------- Upcoming interviews ----------

function UpcomingInterviewsCard({ upcoming, loading }: {
  upcoming: api.DashboardFeed['upcoming'];
  loading: boolean;
}) {
  return (
    <div className="bg-white rounded-[12px] border border-gray-100 shadow-sm p-4">
      <header className="flex items-center justify-between mb-3">
        <h2 className="card-title uppercase tracking-wide flex items-center gap-2">
          <Calendar size={14} className="text-gray-500" /> Upcoming interviews
        </h2>
        <Link to="/interviews" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
          All <ArrowRight size={12} />
        </Link>
      </header>
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
      ) : upcoming.length === 0 ? (
        <div className="text-sm text-gray-400 italic">Nothing scheduled.</div>
      ) : (
        <ul className="divide-y divide-gray-100">
          {upcoming.map((iv) => (
            <li key={iv.interviewId} className="py-2 flex items-center justify-between gap-3 text-sm">
              <div className="min-w-0">
                <Link to={`/interviews/${iv.interviewId}`} className="font-medium text-gray-900 hover:underline truncate">
                  {iv.company || 'Interview'}
                </Link>
                {iv.stage && <span className="ml-2 text-xs text-gray-500">{iv.stage}</span>}
              </div>
              <span className="text-xs text-gray-500 whitespace-nowrap">{formatWhen(iv.scheduledAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------- Recent activity ----------

function RecentActivityCard({ recent, loading }: {
  recent: api.DashboardFeed['recent'];
  loading: boolean;
}) {
  return (
    <div className="bg-white rounded-[12px] border border-gray-100 shadow-sm p-4">
      <header className="flex items-center justify-between mb-3">
        <h2 className="card-title uppercase tracking-wide flex items-center gap-2">
          <Sparkles size={14} className="text-gray-500" /> Recent activity
        </h2>
      </header>
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
      ) : recent.length === 0 ? (
        <div className="text-sm text-gray-400 italic">No activity yet.</div>
      ) : (
        <ul className="divide-y divide-gray-100">
          {recent.map((ev, i) => (
            <li key={i} className="py-2 flex items-center justify-between gap-3 text-sm">
              <div className="flex items-center gap-2 min-w-0">
                {ev.kind === 'bid' ? (
                  <FileText size={14} className="text-blue-500 flex-shrink-0" />
                ) : (
                  <Calendar size={14} className="text-amber-500 flex-shrink-0" />
                )}
                <span className="text-gray-700 truncate">
                  {ev.kind === 'bid' ? (
                    <>Bid sent to <strong>{ev.company || '—'}</strong></>
                  ) : (
                    <>Interview {ev.status ? `(${ev.status})` : ''} — <strong>{ev.company || '—'}</strong></>
                  )}
                </span>
              </div>
              <span className="text-xs text-gray-400 whitespace-nowrap">{timeAgo(ev.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
