import useSWR from 'swr';
import { Link } from 'react-router-dom';
import * as api from '../../api/endpoints';
import { todayInputValue } from '../../lib/week';
import { stageBadgeClass } from '../../lib/stageBadge';

/** Stage-tile keys that don't map 1:1 onto `stageBadgeClass`'s palette. */
const STAGE_BADGE_KEY: Record<string, string> = {
  hiring: 'cultural',
  canceled: 'rejected',
  tech: 'tech_round_1',
};

function localDate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

function shortLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function ThisWeekCard({ userId }: { userId?: string }) {
  const today = todayInputValue();
  const { data, error, isLoading, mutate } = useSWR(
    ['dashboard-week', userId ?? 'me', today],
    () => api.getDashboardWeek({ userId, today }),
  );

  if (error) {
    return (
      <section className="panel p-4">
        <h2 className="card-title mb-3">This week</h2>
        <p className="text-sm text-muted mb-3">Couldn&rsquo;t load this week.</p>
        <button type="button" className="btn-outline" onClick={() => mutate()}>
          Retry
        </button>
      </section>
    );
  }

  if (isLoading || !data) {
    return (
      <section className="panel p-4 space-y-3">
        <div className="skeleton h-5 w-48" />
        <div className="skeleton h-10 w-full" />
        <div className="skeleton h-10 w-full" />
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton h-16" />
          ))}
        </div>
      </section>
    );
  }

  const weekStart = localDate(data.week.start);
  const weekEnd = localDate(data.week.end);
  const noTarget = data.bids.target == null || data.interviews.target == null;

  return (
    <section className="panel p-4">
      <header className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <h2 className="card-title">
          This week · {shortLabel(weekStart)} – {shortLabel(weekEnd)}
        </h2>
        {data.streak > 0 && (
          <span className="text-sm text-muted" aria-label={`${data.streak}-day streak`}>
            🔥 {data.streak}-day streak
          </span>
        )}
      </header>

      <div className="space-y-4">
        <ProgressRow
          label="Bids"
          actual={data.bids.total}
          target={data.bids.target}
          pace={data.bids.pace}
          percentile={data.bids.percentile}
          subline={`Self ${data.bids.self} · Bidder ${data.bids.bidder}`}
        />
        <ProgressRow
          label="Interviews"
          actual={data.interviews.done}
          target={data.interviews.target}
          pace={data.interviews.pace}
          percentile={data.interviews.percentile}
        />
      </div>

      {noTarget && (
        <div className="mt-3">
          <Link to="/report?tab=weekly" className="link-inline text-xs">
            Set weekly targets
          </Link>
        </div>
      )}

      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-4">
        {data.stages.map((s) => (
          <Link
            key={s.key}
            to="/interviews"
            className={
              'block rounded-lg border p-2 text-center transition hover:opacity-80 ' +
              stageBadgeClass(STAGE_BADGE_KEY[s.key] ?? s.key)
            }
          >
            <div className="text-lg font-bold tabular-nums">{s.count}</div>
            <div className="text-xs truncate">{s.label}</div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function ProgressRow({
  label,
  actual,
  target,
  pace,
  percentile,
  subline,
}: {
  label: string;
  actual: number;
  target: number | null;
  pace: api.DashboardPace | null;
  percentile: api.DashboardPercentile | null;
  subline?: string;
}) {
  const pct = target != null ? Math.round((actual / target) * 100) : null;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-strong">{label}</span>
        <span className="text-sm tabular-nums">
          {target != null ? `${actual} / ${target}` : actual}
          {pct != null && <span className="ml-2 text-muted">{pct}%</span>}
        </span>
      </div>

      {subline && <div className="mt-0.5 text-xs text-muted">{subline}</div>}

      {target != null && (
        <div className="progress-track mt-1.5">
          <div
            className={'h-full transition-all ' + (pct != null && pct >= 100 ? 'bg-success-500' : 'bg-accent-500')}
            style={{ width: `${Math.min(pct ?? 0, 100)}%` }}
          />
        </div>
      )}

      {(pace || percentile) && (
        <div className="mt-1 flex items-center justify-between text-xs text-muted">
          <span>
            {pace &&
              (pace.onTrack
                ? 'On track'
                : `Behind pace by ${pace.behindBy}${
                    pace.perDayNeeded != null ? ` · ${pace.perDayNeeded}/day needed` : ''
                  }`)}
          </span>
          <span>
            {percentile &&
              (percentile.position === 'top'
                ? `Top ${percentile.percent}% of team`
                : `Bottom ${percentile.percent}% of team`)}
          </span>
        </div>
      )}
    </div>
  );
}
