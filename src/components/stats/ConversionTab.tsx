import useSWR from 'swr';
import * as api from '../../api/endpoints';
import type { ConversionParams, ConversionReport } from '../../api/endpoints';
import { useAuth } from '../../auth/useAuth';
import Select from '../Select';
import { ServerUpdateNote } from '../statistics/rateShared';
import { StatsFilterBar, useStatsFilters, type StatsFilterState } from '../statistics/statsFilters';
import ChangesCard from './ChangesCard';
import ConversionTable from './ConversionTable';
import ProfilesCard from './ProfilesCard';
import { NoMaturedNote } from './RateTable';
import StatsFrame from './StatsFrame';
import TimingSection from './TimingSection';

const scopeBtn = (on: boolean) =>
  `whitespace-nowrap rounded-[10px] px-3 py-1 text-sm font-medium ${on ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-950 dark:text-zinc-50' : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'}`;

/** `My profiles | Profile ▾ | Team total`, bound to the `scope` / `profile` URL keys. The picker lists the subject's
 * active profiles of the region. */
function ScopeSwitch({ f, scope, subject }: { f: StatsFilterState; scope: api.ConversionScope; subject?: string }) {
  const region = f.region === 'all' ? undefined : f.region;
  const { data } = useSWR(['conversion-profiles', region, subject], () => api.listAccounts({ limit: 1000, region, userId: subject }));
  const options = ((data?.accounts ?? []) as { _id: string; name?: string; region?: string }[])
    .map((a) => ({ value: a._id, label: a.region ? `${a.name ?? a._id} · ${a.region}` : (a.name ?? a._id) }));
  return (
    <div className="flex items-center gap-0.5 rounded-xl border border-zinc-200 bg-zinc-100/70 p-0.5 dark:border-zinc-700 dark:bg-zinc-800/60">
      <button type="button" aria-pressed={scope === 'me'} className={scopeBtn(scope === 'me')}
        onClick={() => f.patch({ scope: undefined, profile: undefined })}>My profiles</button>
      <div className="w-44">
        <Select ariaLabel="Profile" placeholder="Profile…" options={options}
          value={scope === 'profile' && options.some((o) => o.value === f.values.profile) ? f.values.profile : ''}
          onChange={(profile) => f.patch({ scope: 'profile', profile })} />
      </div>
      <button type="button" aria-pressed={scope === 'team'} className={scopeBtn(scope === 'team')}
        onClick={() => f.patch({ scope: 'team', profile: undefined })}>Team total</button>
    </div>
  );
}

const n = (v: number) => v.toLocaleString();
const pct = (v: number | null) => (v == null ? '—' : `${v}%`);

function Breakdown({ d, onShowLastMonth }: { d: ConversionReport; onShowLastMonth: () => void }) {
  const t = d.totals;
  const tables: [string, api.ConversionGroup[] | undefined][] = [
    ['By bidder', d.byBidder], ['By job site', d.bySite], ['By resume score', d.byScore], ['By job area', d.byArea], ['By profile age', d.byAge],
  ];
  return (
    <div className="panel p-4">
      <p className="font-medium tabular-nums">
        {`${d.label} · ${n(t.bids)} bids · ${n(t.matured)} matured · ${n(t.interviews)} interviews · ${pct(t.rate)} · ${n(t.inPlay)} in play`}
      </p>
      <p className="text-xs text-muted">{`Rate = interviews per 100 bids that had ${d.window.matured_days}+ days to work ("matured").`}</p>
      {t.matured === 0 && t.bids > 0 && <NoMaturedNote days={d.window.matured_days} onShowLastMonth={onShowLastMonth} />}
      <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
        {tables.map(([title, rows]) => rows && <ConversionTable key={title} title={title} rows={rows} />)}
      </div>
    </div>
  );
}

/** Statistics → Conversion: the you-vs-team bids strip, then how the scope's bids turn into interviews (totals and
 * five breakdowns), then the per-profile cards. Team total drops the bidder table and the per-person cards. */
export default function ConversionTab() {
  const f = useStatsFilters('conversion');
  const me = useAuth().user;
  const isAdmin = me?.role === 'admin';
  const user = isAdmin ? f.values.user : '';
  const scope: api.ConversionScope = f.values.scope === 'team' ? 'team'
    : f.values.scope === 'profile' && f.values.profile ? 'profile' : 'me';
  const params: ConversionParams | null = f.params
    ? { ...f.params, scope, ...(scope === 'profile' ? { profile: f.values.profile } : {}) }
    : null;
  const withUser = (p: ConversionParams) => (user ? { ...p, user } : p);
  const showLast = () => f.patch({ range: 'last_month', from: '', to: '' });

  const head = useSWR(
    f.params ? ['stats', 'bids', f.params.period, f.params.date, f.params.to, f.params.region, user] : null,
    () => api.getStatsView('bids', withUser(f.params!)),
    { keepPreviousData: true },
  );
  const conv = useSWR(
    params ? ['stats-conversion', params.period, params.date, params.to, params.region, scope, params.profile, user] : null,
    () => api.getConversion(withUser(params!)),
    { keepPreviousData: true },
  );
  // keepPreviousData hands back the last range's report even when the key is null: an invalid range shows none.
  const view = params ? head.data : undefined;
  const d = params ? conv.data : undefined;
  const loading = (head.isLoading && view) || (conv.isLoading && d);
  const empty = d?.startClamped && d.totals.bids === 0;
  return (
    <div className="space-y-4">
      <StatsFilterBar f={f} viewing viewingSubject={view?.subject}
        before={<ScopeSwitch f={f} scope={scope} subject={isAdmin ? (user || me?.id) : undefined} />}>
        {loading && <span className="spinner spinner-sm mb-2.5" role="status" aria-label="Loading" />}
      </StatsFilterBar>
      {!params ? (
        <p className="panel p-6 text-sm text-muted">Pick a valid date range to see statistics.</p>
      ) : head.error || conv.error ? (
        <p className="panel p-6 text-sm text-red-700 dark:text-red-400">Couldn’t load the statistics. Try again.</p>
      ) : !view || !d ? (
        <p className="panel flex items-center gap-2 p-6 text-sm text-muted" role="status">
          <span className="spinner spinner-sm" aria-hidden /> Loading statistics…
        </p>
      ) : !view.headline || !d.totals ? <ServerUpdateNote />
        : (
          <>
            <p className="text-xs text-muted">
              {view.subject.userId !== me?.id ? `Viewing ${view.subject.name} · ${d.label}` : d.label}
            </p>
            <StatsFrame view={view} canPick={isAdmin} onPick={(id) => f.patch({ user: id })} extras={false} />
            <p className="text-xs text-muted">Bids counted from Plans and Bid Track, all profiles.</p>
            {empty ? (
              <p className="panel p-6 text-sm text-muted">No data before Oct 6, 2026 — pick a later period.</p>
            ) : (
              <>
                <Breakdown d={d} onShowLastMonth={showLast} />
                {scope !== 'team' && <ProfilesCard params={params} user={user} onShowLastMonth={showLast} />}
                {scope !== 'team' && <ChangesCard params={params} user={user} />}
                <TimingSection params={params} user={user} onShowLastMonth={showLast} />
              </>
            )}
          </>
        )}
    </div>
  );
}
