import useSWR from 'swr';
import { Link } from 'react-router-dom';
import * as api from '../../api/endpoints';
import { todayInputValue } from '../../lib/week';

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export default function MetricsCard() {
  const today = todayInputValue();
  const net = useSWR(['home-net-monthly', today], () => api.getDashboardNetMonthly({ today }));
  const week = useSWR(['home-week', today], () => api.getDashboardWeek({ today }));

  if ((net.error && !net.data) || (week.error && !week.data)) {
    return (
      <section className="panel p-4">
        <h2 className="card-title mb-3">Metrics</h2>
        <p className="text-sm text-muted mb-3">Couldn&rsquo;t load metrics.</p>
        <button type="button" className="btn-outline" onClick={() => { net.mutate(); week.mutate(); }}>Retry</button>
      </section>
    );
  }
  if (!net.data || !week.data) {
    return (
      <section className="panel p-4 space-y-3">
        <div className="skeleton h-5 w-40" />
        <div className="skeleton h-10 w-full" />
      </section>
    );
  }

  const months = net.data.months;
  const cur = months[months.length - 1];
  const prev = months.length > 1 ? months[months.length - 2] : null;
  const change = cur && prev && prev.net > 0 ? Math.round(((cur.net - prev.net) / prev.net) * 100) : null;
  const stages = week.data.stages.filter((s) => s.count > 0 && s.key !== 'canceled');

  return (
    <section className="panel p-4 grid gap-3 sm:grid-cols-2">
      <div>
        <div className="text-xs text-muted">Earnings this month</div>
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-bold tabular-nums">{usd.format(cur?.net ?? 0)}</span>
          {change != null && <span className="text-xs text-muted">{change >= 0 ? '▲' : '▼'}{Math.abs(change)}%</span>}
        </div>
        <Link to="/statistics?tab=earnings" className="link-inline text-xs">Statistics</Link>
      </div>
      <div>
        <div className="text-xs text-muted">Pipeline</div>
        <div className="text-sm">
          {stages.length ? stages.map((s) => `${s.count} ${s.label}`).join(' · ') : 'No interviews in progress'}
        </div>
        <Link to="/interviews" className="link-inline text-xs">Interviews</Link>
      </div>
    </section>
  );
}
