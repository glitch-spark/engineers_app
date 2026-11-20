import useSWR from 'swr';
import { Link } from 'react-router-dom';
import * as api from '../../api/endpoints';
import { todayInputValue } from '../../lib/week';

/** "$1,200"; a loss as "−$773"; `signed` also marks a gain: "+$3,514". */
const money = (n: number, signed = false) =>
  `${n < 0 ? '−' : signed ? '+' : ''}$${Math.round(Math.abs(n)).toLocaleString('en-US')}`;
const percent = (x: number) => `${+x.toFixed(1)}%`;

const TILE_LABEL = 'text-[11px] font-medium uppercase tracking-wider text-muted';
const BIG = 'text-xl font-bold tabular-nums text-strong';

/** This month: earnings, the interviews in progress and the pass rate. */
export default function MetricsCard() {
  const today = todayInputValue();
  const net = useSWR(['home-net-monthly', today], () => api.getDashboardNetMonthly({ today }));
  // An older server has no month read: the stage counts then come from the week, as before.
  const month = useSWR(['home-month-interviews', today], () => api.getDashboardMonthInterviews({ today }), { shouldRetryOnError: false });
  const week = useSWR(['home-week', today], () => api.getDashboardWeek({ today }));
  const [y, m] = today.split('-').map(Number);
  const title = `This month · ${new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long' })}`;

  if (net.error && !net.data) {
    return (
      <section className="panel p-4">
        <h2 className="card-title mb-3">{title}</h2>
        <p className="text-sm text-muted mb-3">Couldn&rsquo;t load this month.</p>
        <button type="button" className="btn-outline" onClick={() => { net.mutate(); month.mutate(); }}>Retry</button>
      </section>
    );
  }
  if (!net.data || (!month.data && !month.error)) {
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
  const moneyIn = cur ? cur.in ?? cur.income : null;
  const moneyOut = cur ? cur.out ?? cur.outcome : null;
  const stages = month.data
    ? month.data.pipeline.filter((s) => s.count > 0)
    : (week.data?.stages ?? []).filter((s) => s.count > 0 && s.key !== 'canceled');
  const waiting = month.data?.waitingForResult ?? 0;
  const followUps = month.data?.followUpsDue ?? 0;
  const rate = month.data?.passRate;

  return (
    <section className="panel p-4">
      <h2 className="card-title mb-3">{title}</h2>
      <div className="grid gap-5 sm:grid-cols-3">
        <div role="group" aria-label="Earnings">
          <div className={TILE_LABEL}>Earnings</div>
          <div className={BIG}>{money(cur?.net ?? 0)}</div>
          {prev && <div className="text-xs text-muted">last month {money(prev.net, true)}</div>}
          {moneyIn != null && moneyOut != null && (
            <div className="text-xs text-muted">in {money(Math.abs(moneyIn))} · out {money(Math.abs(moneyOut))}</div>
          )}
          <Link to="/transactions" className="link-inline mt-1.5 text-xs">Transactions →</Link>
        </div>
        <div role="group" aria-label="Interviews in progress">
          <div className={TILE_LABEL}>Interviews in progress</div>
          <div className="mt-1 text-sm text-body">
            {stages.length ? stages.map((s) => `${s.count} ${s.label}`).join(' · ') : 'No interviews in progress'}
          </div>
          {waiting > 0 && <div className="mt-1 text-xs text-muted">{waiting} waiting for a result</div>}
          {followUps > 0 && <div className="text-xs text-muted">{followUps} follow-up{followUps === 1 ? '' : 's'} due</div>}
          <Link to="/interviews" className="link-inline mt-1.5 text-xs">Interviews →</Link>
        </div>
        {rate && rate.decided > 0 && (
          <div role="group" aria-label="Pass rate">
            <div className={TILE_LABEL}>Pass rate</div>
            {rate.few || rate.value == null ? (
              <div className="mt-1 text-sm text-muted">too few to tell</div>
            ) : (
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className={BIG}>{percent(rate.value)}</span>
                {rate.teamRate != null && <span className="text-xs text-muted">team {percent(rate.teamRate)}</span>}
              </div>
            )}
            <div className="text-xs text-muted">{rate.passed} passed of {rate.decided} decided rounds</div>
            <Link to="/statistics?tab=interviews" className="link-inline mt-1.5 text-xs">Statistics →</Link>
          </div>
        )}
      </div>
    </section>
  );
}
