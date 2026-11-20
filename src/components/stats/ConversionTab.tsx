import { useMemo } from 'react';
import useSWR from 'swr';
import * as api from '../../api/endpoints';
import type { ConversionParams, ConversionReport } from '../../api/endpoints';
import { useAuth } from '../../auth/useAuth';
import Select from '../Select';
import { ServerUpdateNote } from '../statistics/rateShared';
import { StatsFilterBar, useStatsFilters, type StatsFilterState } from '../statistics/statsFilters';
import ChangesCard from './ChangesCard';
import { ConversionCards, EveryoneList, KeyFindings } from './ConversionSummary';
import ConversionTable from './ConversionTable';
import ProfilesCard from './ProfilesCard';
import { NoMaturedNote } from './RateTable';
import TimingSection from './TimingSection';

/** The Profiles dropdown: Whole team (default, no `scope` in the URL) or All my profiles (`scope=me`). User decision
 * 2026-11-19: no single-profile option. */
export function ScopeSwitch({ f, scope }: { f: StatsFilterState; scope: api.ConversionScope }) {
  return (
    <div className="w-48">
      <Select label="Profiles" labelClassName="mb-1 block text-xs text-muted" options={[{ value: 'team', label: 'Whole team' }, { value: 'me', label: 'All my profiles' }]}
        value={scope}
        onChange={(v) => f.patch({ scope: v === 'me' ? 'me' : undefined, profile: undefined })} />
    </div>
  );
}

const SCORE_NOTE = 'Interviews are easier to match to bids with a tailored resume, so "No score" is undercounted.';
const n = (v: number) => v.toLocaleString();
const pct = (v: number | null) => (v == null ? '—' : `${v}%`);

function Breakdown({ d, onShowLastMonth }: { d: ConversionReport; onShowLastMonth: () => void }) {
  const t = d.totals;
  const tables: [string, api.ConversionGroup[] | undefined][] = [
    ['Self vs bidder', d.byWho], ['By bidder', d.byBidder], ['By job site', d.bySite], ['By resume score', d.byScore], ['By job area', d.byArea], ['By profile age (when the bid went out)', d.byAge],
  ];
  return (
    <div className="panel p-4">
      <p className="font-medium tabular-nums">
        {`${d.label} · ${n(t.bids)} bids · ${n(t.matured)} matured · ${n(t.interviews)} interviews from matured bids (${n(t.interviewsAll)} in all) · ${pct(t.rate)} · ${n(t.inPlay)} in play${t.untied > 0 ? ` · ${n(t.untied)} more interviews not tied to a bid` : ''}`}
      </p>
      <p className="text-xs text-muted">{`Rate = interviews per 100 bids that had ${d.window.matured_days}+ days to work ("matured").`}</p>
      {t.interviewOnly > 0 && (
        <p className="text-xs text-muted">{`${n(t.interviewOnly)} of these ${n(t.interviewsAll)} interviews are from applications known only from their interview (no tracked bid), so rates can read high.`}</p>
      )}
      {t.matured === 0 && t.bids > 0 && <NoMaturedNote days={d.window.matured_days} onShowLastMonth={onShowLastMonth} />}
      <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
        {tables.map(([title, rows]) => rows && <ConversionTable key={title} title={title} rows={rows} teamRate={d.teamRate} note={title === 'By resume score' ? SCORE_NOTE : undefined} />)}
      </div>
    </div>
  );
}

const SHORT_DAYS = 28;
const days = (r: { from: string; to: string }) => (Date.parse(r.to) - Date.parse(r.from)) / 86_400_000 + 1;

/** Under 28 days (not Since Oct 6): rates swing, offer the longer ranges. */
function ShortPeriodNote({ f }: { f: StatsFilterState }) {
  if (!f.range || f.value.preset === 'since_oct6' || days(f.range) >= SHORT_DAYS) return null;
  const btn = 'ml-2 text-blue-600 underline dark:text-blue-400';
  return (
    <p className="panel p-3 text-sm text-amber-800 dark:text-amber-300" role="note">
      <span>Short period — rates can swing a lot. For reliable numbers, use Since Oct 6 or a range of a month or more.</span>
      <button type="button" className={btn} onClick={() => f.patch({ range: undefined, from: undefined, to: undefined })}>Since Oct 6</button>
      <button type="button" className={btn} onClick={() => f.patch({ range: 'last_month', from: undefined, to: undefined })}>Last month</button>
    </p>
  );
}

/** The Statistics filters, except that an admin picking a person to view switches to that person's profiles (a
 * whole-team view is the same for everyone), in the same URL patch. */
export function useConversionFilters(): StatsFilterState {
  const f = useStatsFilters('conversion');
  const { patch, values } = f;
  const guarded = useMemo(() => (c: Parameters<typeof patch>[0]) => {
    patch(c.user && c.user !== values.user ? { ...c, scope: 'me', profile: undefined } : c);
  }, [patch, values]);
  return { ...f, patch: guarded };
}

/** Statistics → Conversion (spec 2026-11-19 redesign): filters, top cards, Everyone, key findings, the coverage line,
 * the breakdowns, then What to change, Your profiles and When to bid. Whole team (the default) drops the bidder table
 * and the per-person cards. */
export default function ConversionTab() {
  const f = useConversionFilters();
  const me = useAuth().user;
  const isAdmin = me?.role === 'admin';
  const user = isAdmin ? f.values.user : '';
  const scope: api.ConversionScope = f.values.scope === 'me' ? 'me' : 'team';
  const params: ConversionParams | null = f.params ? { ...f.params, scope } : null;
  const withUser = (p: ConversionParams) => (user ? { ...p, user } : p);
  const showLast = () => f.patch({ range: 'last_month', from: '', to: '' });

  const conv = useSWR(
    params ? ['stats-conversion', params.period, params.date, params.to, params.region, scope, user] : null,
    () => api.getConversion(withUser(params!)),
    { keepPreviousData: true },
  );
  // keepPreviousData hands back the last range's report even when the key is null: an invalid range shows none.
  const d = params ? conv.data : undefined;
  const empty = d?.startClamped && d.totals.bids === 0;
  const s = d?.summary;
  return (
    <div className="space-y-4">
      <StatsFilterBar f={f} viewing viewingSubject={d?.subject}
        before={<ScopeSwitch f={f} scope={scope} />}>
        {conv.isLoading && d && <span className="spinner spinner-sm mb-2.5" role="status" aria-label="Loading" />}
      </StatsFilterBar>
      <ShortPeriodNote f={f} />
      {!params ? (
        <p className="panel p-6 text-sm text-muted">Pick a valid date range to see statistics.</p>
      ) : conv.error ? (
        <p className="panel p-6 text-sm text-red-700 dark:text-red-400">Couldn’t load the statistics. Try again.</p>
      ) : !d ? (
        <p className="panel flex items-center gap-2 p-6 text-sm text-muted" role="status">
          <span className="spinner spinner-sm" aria-hidden /> Loading statistics…
        </p>
      ) : !d.totals || !s || !d.findings ? <ServerUpdateNote />
        : (
          <>
            <p className="text-xs text-muted">
              {d.subject && d.subject.userId !== me?.id ? `Viewing ${d.subject.name} · ${d.label}` : d.label}
            </p>
            {empty ? (
              <p className="panel p-6 text-sm text-muted">No data before Oct 6, 2026 — pick a later period.</p>
            ) : (
              <>
                {d.startClamped && <p className="text-xs text-muted">Data starts Oct 6 — showing Oct 6 onward.</p>}
                <ConversionCards cards={s.cards} team={scope === 'team'} />
                <EveryoneList rows={s.everyone} onPick={isAdmin ? (id) => f.patch({ user: id }) : undefined} />
                <KeyFindings findings={d.findings} />
                <p className="px-1 text-xs text-muted">
                  {`Breakdowns below use job-level data: they cover ${n(s.coverage.rows)} of ${n(s.coverage.bids)} bids and ${n(s.coverage.matched)} of ${n(s.coverage.interviews)} interviews.`}
                </p>
                <Breakdown d={d} onShowLastMonth={showLast} />
                {scope !== 'team' && <ChangesCard params={params} user={user} />}
                {scope !== 'team' && <ProfilesCard params={params} user={user} onShowLastMonth={showLast} />}
                <TimingSection params={params} user={user} onShowLastMonth={showLast} />
              </>
            )}
          </>
        )}
    </div>
  );
}
