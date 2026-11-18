import useSWR from 'swr';
import * as api from '../../api/endpoints';
import { useAuth } from '../../auth/useAuth';
import { ServerUpdateNote } from '../statistics/rateShared';
import { toStatsParams } from '../../lib/dateRange';
import { StatsFilterBar, useStatsFilters } from '../statistics/statsFilters';
import StatsFrame from './StatsFrame';

/** A Statistics tab that shows the you-vs-team frame (header, tips, everyone, trend). Admins can view a teammate via `user`. */
export default function FramedTab({ tab }: { tab: 'bids' | 'interviews' | 'profiles' | 'callers' | 'earnings' | 'ai-usage' }) {
  const ai = tab === 'ai-usage';
  const f = useStatsFilters(ai ? 'ai' : 'stats', { noRegion: tab === 'earnings' });
  const me = useAuth().user;
  const isAdmin = me?.role === 'admin';
  const user = isAdmin ? f.values.user : '';
  // AI usage's presets (Today, Yesterday, ...) all go to the frame as an explicit day range.
  const params = ai ? (f.range ? { ...toStatsParams('custom', f.range), region: f.region } : null)
    : tab === 'earnings' && f.params ? { ...f.params, region: 'all' as const } : f.params; // Earnings has no region
  const { data, error, isLoading } = useSWR(
    params ? ['stats', tab, params.period, params.date, params.to, ai || tab === 'earnings' ? '' : params.region, user] : null,
    () => api.getStatsView(tab, { ...params!, ...(user ? { user } : {}) }),
    { keepPreviousData: true },
  );
  // keepPreviousData hands back the last range's report even when the key is null: an invalid range shows none.
  const shown = params ? data : undefined;
  return (
    <div className="space-y-4">
      <StatsFilterBar f={f} noRegion={tab === 'earnings'} viewing viewingSubject={shown?.subject}>
        {isLoading && shown && <span className="spinner spinner-sm mb-2.5" role="status" aria-label="Loading" />}
      </StatsFilterBar>
      {!params ? (
        <p className="panel p-6 text-sm text-muted">Pick a valid date range to see statistics.</p>
      ) : error ? (
        <p className="panel p-6 text-sm text-red-700 dark:text-red-400">Couldn’t load the statistics. Try again.</p>
      ) : !shown ? (
        <p className="panel flex items-center gap-2 p-6 text-sm text-muted" role="status">
          <span className="spinner spinner-sm" aria-hidden /> Loading statistics…
        </p>
      ) : !shown.headline ? <ServerUpdateNote />
        : (
          <>
            <p className="text-xs text-muted">
              {shown.subject.userId !== me?.id ? `Viewing ${shown.subject.name} · ${shown.label}` : shown.label}
            </p>
            <StatsFrame view={shown} canPick={isAdmin} onPick={(id) => f.patch({ user: id })} />
          </>
        )}
    </div>
  );
}
