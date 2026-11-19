import useSWR from 'swr';
import * as api from '../../api/endpoints';
import RateTable, { NoMaturedNote, noneMatured } from './RateTable';

/** "What kind of job works" card: interviews per 100 matured bids by job site, score, area and profile age. */
export default function JobFitCard({ params, user, onShowLastMonth }: { params: { period: api.StatsPeriod; date: string; to?: string; region: api.StatsRegion } | null; user: string; onShowLastMonth?: () => void }) {
  const { data, error, isLoading } = useSWR(
    params ? ['stats-jobs', params.period, params.date, params.to, params.region, user] : null,
    () => api.getJobFit({ ...params!, ...(user ? { user } : {}) }),
    { keepPreviousData: true },
  );
  if (!params) return null;
  if (error) return <p className="panel p-6 text-sm text-red-700 dark:text-red-400">Couldn’t load the job report. Try again.</p>;
  if (!data) {
    return isLoading ? (
      <p className="panel flex items-center gap-2 p-6 text-sm text-muted" role="status">
        <span className="spinner spinner-sm" aria-hidden /> Loading job report…
      </p>
    ) : null;
  }
  const { bySite, byScore, byArea, byAge, known } = data;
  const empty = [...bySite, ...byScore, ...byArea, ...byAge].every((g) => g.you.bids === 0);
  const pct = (v: number | null, what: string) => (v == null ? undefined : `${what} known for ${v}% of your bids.`);
  return (
    <div className="panel p-4">
      <h3 className="font-semibold">What kind of job works</h3>
      <p className="text-xs text-muted">Interviews per 100 matured bids — yours vs the team, in four ways. Groups with fewer than 30 matured bids show "too few".</p>
      {!empty && noneMatured([...bySite, ...byScore, ...byArea, ...byAge]) && <NoMaturedNote days={data.window.matured_days} onShowLastMonth={onShowLastMonth} />}
      {empty ? (
        <p className="mt-2 text-sm text-muted">Nothing to break down yet — no job-level bids in this period.</p>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
          <RateTable title="By job site" rows={bySite} />
          <RateTable title="By resume score" caption={pct(known.score, 'Score')} rows={byScore} />
          <RateTable title="By job area" caption={pct(known.area, 'Area')} rows={byArea} />
          <RateTable title="By profile age (when the bid went out)" rows={byAge} />
        </div>
      )}
    </div>
  );
}
