import useSWR from 'swr';
import * as api from '../../api/endpoints';
import { todayInputValue } from '../../lib/week';

function localDate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}
const shortLabel = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

export default function WeekCard() {
  const today = todayInputValue();
  const { data, error, isLoading, mutate } = useSWR(['home-week', today], () => api.getDashboardWeek({ today }));

  if (error && !data) {
    return (
      <section className="panel p-4">
        <h2 className="card-title mb-3">This week</h2>
        <p className="text-sm text-muted mb-3">Couldn&rsquo;t load this week.</p>
        <button type="button" className="btn-outline" onClick={() => mutate()}>Retry</button>
      </section>
    );
  }
  if (isLoading || !data) {
    return (
      <section className="panel p-4 space-y-3">
        <div className="skeleton h-5 w-48" />
        <div className="skeleton h-10 w-full" />
        <div className="skeleton h-10 w-full" />
      </section>
    );
  }

  const start = localDate(data.week.start);
  const friday = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 4);
  const dow = new Date().getDay();

  return (
    <section className="panel p-4">
      <header className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <h2 className="card-title">This week · {shortLabel(start)} – {shortLabel(friday)}</h2>
        {dow >= 1 && dow <= 5 && <span className="text-sm text-muted">day {dow} of 5</span>}
      </header>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Bids" total={data.bids.total} target={data.bids.target} pace={data.bids.pace} bar />
        <Stat label="Interviews" total={data.interviews.done} target={data.interviews.target} pace={data.interviews.pace} />
        {data.routines.expected > 0 && (
          <div>
            <div className="text-xs text-muted">Routines</div>
            <div className="text-xl font-bold tabular-nums">{data.routines.done} / {data.routines.expected}</div>
          </div>
        )}
      </div>
    </section>
  );
}

function Stat({ label, total, target, pace, bar }: { label: string; total: number; target: number | null; pace: api.DashboardPace | null; bar?: boolean }) {
  const ahead = pace ? total - pace.expected : null;
  const hasTarget = target != null && target > 0;
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className="text-xl font-bold tabular-nums">{target != null ? `${total} / ${target}` : total}</div>
      {hasTarget && pace && (pace.behindBy > 0 ? (
        <div className="text-xs text-muted">▼{pace.behindBy} vs pace</div>
      ) : ahead != null && ahead >= 0 ? (
        <div className="text-xs text-muted">▲{ahead} vs pace</div>
      ) : null)}
      {bar && hasTarget && (
        <div className="progress-track mt-1.5 relative">
          <div
            className={'h-full transition-all ' + (total >= target ? 'bg-success-500' : 'bg-accent-500')}
            style={{ width: `${Math.min(100, (total / target) * 100)}%` }}
          />
          {pace && (
            <div
              data-testid="pace-tick"
              className="absolute top-0 h-full w-0.5 bg-strong"
              style={{ left: `${Math.min(100, (pace.expected / target) * 100)}%` }}
            />
          )}
        </div>
      )}
    </div>
  );
}
