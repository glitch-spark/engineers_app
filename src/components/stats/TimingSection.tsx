import useSWR from 'swr';
import * as api from '../../api/endpoints';
import RateTable, { NoMaturedNote, noneMatured } from './RateTable';

const tzLabel = (tz: string) => `${(tz.split('/').pop() ?? tz).replace(/_/g, ' ')} time`;

function TimingCard({ d, team, onShowLastMonth }: { d: api.TimingReport; team: boolean; onShowLastMonth?: () => void }) {
  return (
    <div className="panel p-4">
      <h3 className="font-semibold">When to bid</h3>
      <p className="text-xs text-muted">{`Interviews per 100 matured bids by when the bid went out (${tzLabel(d.timezone)}).`}</p>
      {noneMatured([...d.weekday, ...d.hours]) && <NoMaturedNote days={d.window.matured_days} onShowLastMonth={onShowLastMonth} />}
      <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
        <RateTable title="Day of week" rows={d.weekday} team={team} />
        <RateTable title="Time of day" rows={d.hours} team={team} />
      </div>
    </div>
  );
}

/** The "When to bid" card (Bidder quality was removed, user 2026-11-19). */
export default function TimingSection({ params, user, onShowLastMonth }: { onShowLastMonth?: () => void; params: api.ConversionParams | null; user: string }) {
  const { data, error, isLoading } = useSWR(
    params ? ['stats-timing', params.period, params.date, params.to, params.region, params.scope, params.profile, user] : null,
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
      <TimingCard d={data} team={params.scope === 'team'} onShowLastMonth={onShowLastMonth} />
    </>
  );
}
