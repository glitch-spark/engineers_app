import useSWR from 'swr';
import * as api from '../../api/endpoints';
import RateTable, { NoMaturedNote, noneMatured, RateText } from './RateTable';

const tzLabel = (tz: string) => `${(tz.split('/').pop() ?? tz).replace(/_/g, ' ')} time`;
const one = (v: number) => v.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function TimingCard({ d, onShowLastMonth }: { d: api.TimingReport; onShowLastMonth?: () => void }) {
  return (
    <div className="panel p-4">
      <h3 className="font-semibold">When to bid</h3>
      <p className="text-xs text-muted">{`Interviews per 100 matured bids by when the bid went out (${tzLabel(d.timezone)}).`}</p>
      {noneMatured([...d.weekday, ...d.hours]) && <NoMaturedNote days={d.window.matured_days} onShowLastMonth={onShowLastMonth} />}
      <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
        <RateTable title="Day of week" rows={d.weekday} />
        <RateTable title="Time of day" rows={d.hours} />
      </div>
    </div>
  );
}

function teamLine(t: api.TimingReport['teamBidder'] | undefined) { // undefined: an older API during a deploy
  if (t?.per100 == null || !t.matured) return 'Team bidders overall: not enough data yet.';
  return `Team bidders overall: ${one(t.per100)} per 100 (${t.interviews.toLocaleString()} interviews from ${t.matured.toLocaleString()} matured bids).`;
}

function BiddersCard({ d }: { d: api.TimingReport }) {
  return (
    <div className="panel p-4">
      <h3 className="font-semibold">Bidder quality</h3>
      <p className="text-xs text-muted">Your bidders' bids in this period: how many, how they convert, and how many Bid Track rejected.</p>
      <div className="mt-2 overflow-x-auto">
        <table aria-label="Bidders" className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs text-muted">
              {['Bidder', 'Bids', 'Matured', 'Interviews', 'Per 100', 'Rejected'].map((h) => <th key={h} className="pb-1 pr-3 font-normal">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {d.bidders.map((b) => (
              <tr key={b.bidderId} className="border-t border-zinc-200 dark:border-zinc-800">
                <td className="py-1 pr-3">{b.name ?? 'Unnamed bidder'}</td>
                <td className="py-1 pr-3 tabular-nums">{b.bids}</td>
                <td className="py-1 pr-3 tabular-nums">{b.matured}</td>
                <td className="py-1 pr-3 tabular-nums">{b.interviews}</td>
                <td className="whitespace-nowrap py-1 pr-3 tabular-nums"><RateText c={b} /></td>
                <td className={`py-1 tabular-nums ${b.rejectedShare >= 20 ? 'font-medium text-red-700 dark:text-red-400' : ''}`}>{`${b.rejectedShare}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">
        {teamLine(d.teamBidder)}
      </p>
    </div>
  );
}

/** One request feeding the "When to bid" and "Bidder quality" cards. */
export default function TimingSection({ params, user, onShowLastMonth }: { onShowLastMonth?: () => void; params: { period: api.StatsPeriod; date: string; to?: string; region: api.StatsRegion } | null; user: string }) {
  const { data, error, isLoading } = useSWR(
    params ? ['stats-timing', params.period, params.date, params.to, params.region, user] : null,
    () => api.getTiming({ ...params!, ...(user ? { user } : {}) }),
    { keepPreviousData: true },
  );
  if (!params) return null;
  if (error) return <p className="panel p-6 text-sm text-red-700 dark:text-red-400">Couldn’t load the timing report. Try again.</p>;
  if (!data) {
    return isLoading ? (
      <p className="panel flex items-center gap-2 p-6 text-sm text-muted" role="status">
        <span className="spinner spinner-sm" aria-hidden /> Loading timing…
      </p>
    ) : null;
  }
  return (
    <>
      <TimingCard d={data} onShowLastMonth={onShowLastMonth} />
      {data.bidders.length > 0 && <BiddersCard d={data} />}
    </>
  );
}
