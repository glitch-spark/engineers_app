import type { ReactNode } from 'react';
import useSWR from 'swr';
import * as api from '../../api/endpoints';
import type { ConversionParams, InterviewGroup, InterviewStatsReport } from '../../api/endpoints';
import { useAuth } from '../../auth/useAuth';
import { ServerUpdateNote } from '../statistics/rateShared';
import { StatsFilterBar } from '../statistics/statsFilters';
import { CARDS_LABEL, Card, EveryoneList, KeyFindings, Muted, VsMedian, rankText, type EveryoneMetric } from './ConversionSummary';
import { ScopeSwitch, useConversionFilters } from './ConversionTab';
import ConversionTable, { type RateTableSpec } from './ConversionTable';

const n = (v: number) => v.toLocaleString();
const pct = (v: number | null) => (v == null ? '—' : `${v}%`);
const width = (v: number, of: number) => `${+((v / (of || 1)) * 100).toFixed(2)}%`;
const GOOD = 'text-green-600 dark:text-green-400';
const BAD = 'text-red-600 dark:text-red-400';

type Summary = InterviewStatsReport['summary'];

/** Top cards: the subject with a rank vs the team (All my profiles), or the team totals (Whole team, no rank). */
function InterviewCards({ cards, team }: { cards: Summary['cards']; team: boolean }) {
  const { companies, rounds, passRate, offers } = cards;
  const rate = passRate.value;
  return (
    <section aria-label={CARDS_LABEL(team)} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Card title="Companies interviewed" value={n(companies.value)} rank={rankText(companies)}>
        <VsMedian v={companies.vsMedian} median={companies.median} />
        <Muted>{`First round held in this period${team && companies.median != null ? ` · median per person ${n(companies.median)}` : ''}`}</Muted>
      </Card>
      <Card title="Total rounds" value={n(rounds.value)} rank={rankText(rounds)}>
        <VsMedian v={rounds.vsMedian} median={rounds.median} />
        <Muted>{`${n(rounds.held)} held · ${n(rounds.canceled)} canceled · ${n(rounds.scheduled)} scheduled, not held yet`}</Muted>
      </Card>
      <Card title="Pass rate" value={pct(rate)} rank={rankText(passRate)}>
        {!team && passRate.rank == null && passRate.of != null && <Muted>not ranked (under 20 decided rounds)</Muted>}
        {!team && passRate.rank != null && rate != null && passRate.teamRate != null && rate !== passRate.teamRate && (
          <p className={rate > passRate.teamRate ? GOOD : BAD}>{`${rate > passRate.teamRate ? '▲' : '▼'} team ${passRate.teamRate}%`}</p>
        )}
        <Muted>{`${n(passRate.passed)} passed of ${n(passRate.decided)} decided · ${n(passRate.waiting)} waiting`}</Muted>
      </Card>
      <Card title="Offers" value={n(offers.value)} rank={rankText(offers)}>
        <Muted>Final round passed</Muted>
      </Card>
    </section>
  );
}

type Person = Summary['everyone'][number];
const FEW = <span role="img" aria-label="Too few to tell" title="Too few decided rounds to tell" className="text-amber-600 dark:text-amber-400">⚠</span>;
const EVERYONE: EveryoneMetric<Person>[] = [
  { key: 'companies', label: 'Companies', head: 'Companies', value: (r) => r.companies, cell: (r) => n(r.companies) },
  { key: 'held', label: 'Rounds held', head: 'Rounds held', value: (r) => r.held, cell: (r) => n(r.held) },
  {
    key: 'passRate', label: 'Pass rate', head: 'Pass rate',
    // a too-few rate is shown but not compared: no bar, no rank, greyed out
    value: (r) => (r.few ? null : r.passRate), muted: (r) => r.few,
    cell: (r) => (r.passRate == null ? null : <>{`${r.passRate}%`}{r.few && <> {FEW}</>}</>),
  },
  { key: 'offers', label: 'Offers', head: 'Offers', value: (r) => r.offers, cell: (r) => n(r.offers) },
];

/** A group can be compared (bar, bar scale) when it has enough decided rounds and is not the "Unknown" catch-all. */
const comparable = (g: InterviewGroup) => !g.few && g.key !== 'unknown';
const col = (head: string, f: (g: InterviewGroup) => number) => ({ head, cell: (g: InterviewGroup) => n(f(g)) });
const ROUNDS = col('Rounds', (g) => g.rounds);
const CANCELED = col('Canceled', (g) => g.canceled);
const DECIDED = col('Decided', (g) => g.decided);
const PASSED = col('Passed', (g) => g.passed);
const GROUP_SPEC: RateTableSpec<InterviewGroup> = {
  groupHead: 'Group', columns: [ROUNDS, DECIDED, PASSED], rateHead: 'Pass rate',
  fewTip: (g) => `Only ${n(g.decided)} decided rounds — this rate can swing a lot.`,
  scaled: comparable, showBar: comparable, memberNoun: '', empty: 'No rounds.',
};

const OUTCOMES: { key: 'passed' | 'rejected' | 'noAnswer' | 'waiting' | 'canceled'; label: string; color: string }[] = [
  { key: 'passed', label: 'Passed', color: 'bg-green-500 dark:bg-green-400' },
  { key: 'rejected', label: 'Rejected', color: 'bg-red-500 dark:bg-red-400' },
  { key: 'noAnswer', label: 'No answer', color: 'bg-amber-500 dark:bg-amber-400' },
  { key: 'waiting', label: 'Waiting', color: 'bg-blue-300 dark:bg-blue-500' },
  { key: 'canceled', label: 'Canceled', color: 'bg-zinc-300 dark:bg-zinc-600' },
];

/** What happened to a stage's rounds as one stacked bar; the same numbers are its text alternative (and the columns
 * next to it), so colour is never the only way to read it. */
function OutcomeBar({ g }: { g: InterviewGroup }) {
  const total = OUTCOMES.reduce((sum, o) => sum + g[o.key], 0);
  return (
    <span role="img" aria-label={OUTCOMES.map((o) => `${n(g[o.key])} ${o.label.toLowerCase()}`).join(', ')}
      className="flex h-2.5 w-32 overflow-hidden rounded bg-zinc-100 sm:w-48 dark:bg-zinc-800">
      {OUTCOMES.map((o) => g[o.key] > 0 && <span key={o.key} data-seg={o.key} className={o.color} style={{ width: width(g[o.key], total) }} />)}
    </span>
  );
}

const OutcomeLegend = (
  <ul aria-label="Outcomes" className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
    {OUTCOMES.map((o) => (
      <li key={o.key} className="flex items-center gap-1"><span aria-hidden className={`inline-block h-2.5 w-2.5 rounded-sm ${o.color}`} />{o.label}</li>
    ))}
  </ul>
);

const STAGE_SPEC: RateTableSpec<InterviewGroup> = {
  ...GROUP_SPEC, groupHead: 'Stage',
  columns: [
    ROUNDS, { head: 'What happened', cell: (g) => <OutcomeBar g={g} /> },
    col('Held', (g) => g.held), PASSED, col('Rejected', (g) => g.rejected), col('No answer', (g) => g.noAnswer),
    col('Waiting', (g) => g.waiting), CANCELED,
  ],
};
const WHO_SPEC: RateTableSpec<InterviewGroup> = { ...GROUP_SPEC, columns: [ROUNDS, CANCELED, DECIDED, PASSED] };
const CALLER_SPEC: RateTableSpec<InterviewGroup> = { ...GROUP_SPEC, groupHead: 'Caller' };
const PASS_RATE_NOTE = 'Pass rate = passed ÷ (passed + rejected + no answer). "No answer" = closed as no answer, or silent for 14 days. Waiting rounds are not counted yet.';

const Panel = ({ children }: { children: ReactNode }) => <div className="panel min-w-0 p-4">{children}</div>;
const GRID = 'grid grid-cols-1 gap-4 md:grid-cols-2';

interface CountRow { key?: string; label: string; count: number; share?: number }

/** Rows of label · bar · count (· share of the list). The "not filled in yet" row (key `none`) is greyed and last. */
function CountBars({ label, rows, empty }: { label: string; rows: CountRow[]; empty?: string }) {
  if (rows.length === 0) return empty ? <p className="mt-1 text-sm text-muted">{empty}</p> : null;
  const blank = (r: CountRow) => r.key === 'none';
  const sorted = [...rows.filter((r) => !blank(r)), ...rows.filter(blank)];
  const max = Math.max(...rows.map((r) => r.count));
  return (
    <div className="mt-1 overflow-x-auto">
      <table aria-label={label} className="w-full text-left text-sm">
        <tbody>
          {sorted.map((r) => (
            <tr key={r.key ?? r.label} className={`border-t border-zinc-200 dark:border-zinc-800${blank(r) ? ' text-muted' : ''}`}>
              <td className="py-1 pr-3">{r.label}</td>
              <td className="w-1/3 min-w-16 py-1 pr-3">
                <span aria-hidden data-bar className={`block h-2 rounded ${blank(r) ? 'bg-zinc-200 dark:bg-zinc-700' : 'bg-zinc-400 dark:bg-zinc-500'}`}
                  style={{ width: width(r.count, max) }} />
              </td>
              <td className="py-1 pr-3 tabular-nums">{n(r.count)}</td>
              {r.share != null && <td className="py-1 tabular-nums">{pct(r.share)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Reasons({ what, rows = [] }: { what: 'rejected' | 'canceled'; rows?: CountRow[] }) {
  const title = `Why rounds were ${what}`;
  return (
    <>
      <h3 className="text-sm font-medium">{title} <span className="font-normal text-muted">({n(rows.reduce((sum, r) => sum + r.count, 0))})</span></h3>
      <CountBars label={title} rows={rows} empty={`No ${what} rounds in this period.`} />
    </>
  );
}

const shortDay = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/** Reschedules are logged only from `since` on, so the count is out of the rounds scheduled from that day. */
function Rescheduled({ reasons }: { reasons?: InterviewStatsReport['reasons'] }) {
  const rate = reasons?.rescheduleRate;
  return (
    <section aria-label="Rescheduled" className="mt-4">
      <h3 className="text-sm font-medium">Rescheduled</h3>
      {!rate || rate.rescheduled === 0 ? <p className="mt-1 text-sm text-muted">No reschedules logged yet</p> : (
        <>
          <p className="mt-1">
            <span className="text-xl font-bold tabular-nums">{`${n(rate.rescheduled)} of ${n(rate.rounds)}`}</span>{' '}
            <span className="text-xs text-muted">{`rounds since ${shortDay(rate.since)}`}</span>
          </p>
          <CountBars label="Why rounds were rescheduled" rows={reasons?.rescheduled ?? []} />
        </>
      )}
    </section>
  );
}

function Stat({ title, value, children }: { title: string; value?: string; children?: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs uppercase tracking-wide text-muted">{title}</p>
      {value != null && <p className="my-0.5 text-2xl font-bold tabular-nums">{value}</p>}
      {children}
    </div>
  );
}

function Depth({ depth }: { depth?: InterviewStatsReport['depth'] }) {
  const ended = depth?.ended ?? 0;
  const after = depth?.endedAfter ?? [];
  const first = after.find((a) => a.label === '1 round')?.count;
  const between = depth?.daysBetweenRounds;
  const answer = depth?.daysToAnswer;
  const note = 'text-xs text-muted';
  return (
    <section aria-label="Depth and speed" className="panel p-4">
      <h3 className="font-semibold">Depth and speed</h3>
      <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat title="Rounds until it ended" value={depth?.avgRounds == null ? '—' : String(depth.avgRounds)}>
          <p className={note}>{`${n(ended)} ended interviews${ended > 0 && first != null ? ` · ${Math.round((first / ended) * 100)}% ended after the first round` : ''}`}</p>
        </Stat>
        <Stat title="Ended after">
          <CountBars label="Ended after" rows={after} empty="No ended interviews yet" />
        </Stat>
        <Stat title="Days between rounds" value={between?.median == null ? '—' : String(between.median)}>
          <p className={note}>{between?.median == null ? 'No next rounds yet' : `Median, ${n(between.n)} next rounds`}</p>
        </Stat>
        <Stat title="Days until an answer" value={answer?.median == null ? '—' : String(answer.median)}>
          <p className={note}>{answer?.median == null ? 'Starts once result dates are saved' : `Median, ${n(answer.n)} rounds with a result date`}</p>
        </Stat>
      </div>
    </section>
  );
}

function FollowUps({ rows = [] }: { rows?: InterviewStatsReport['followUps'] }) {
  const cell = 'py-1 pr-3 tabular-nums';
  return (
    <div className="panel p-4">
      <h3 className="font-semibold">Follow-ups</h3>
      <div className="mt-2 overflow-x-auto">
        <table aria-label="Follow-ups" className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs text-muted">
              {['Group', 'Rounds', 'Passed', 'Rejected', 'No answer', 'Still waiting'].map((h) => <th key={h} className="pb-1 pr-3 font-normal">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className={`border-t border-zinc-200 dark:border-zinc-800${r.rounds === 0 ? ' text-muted' : ''}`}>
                <td className="py-1 pr-3">{r.label}</td>
                {[r.rounds, r.passed, r.rejected, r.noAnswer, r.waiting].map((v, i) => <td key={i} className={cell}>{n(v)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">Fills in once the follow-up reminder is live: how many silent rounds got an answer after a follow-up.</p>
    </div>
  );
}

function Report({ d, team, onPick }: { d: InterviewStatsReport; team: boolean; onPick?: (userId: string) => void }) {
  const s = d.summary;
  const teamRate = s.cards.passRate.teamRate ?? d.totals.rate;
  const table = (title: string, rows: InterviewGroup[] | undefined, spec = GROUP_SPEC, legend = false) => (
    <Panel key={title}><ConversionTable title={title} rows={rows ?? []} teamRate={teamRate} spec={spec} legend={legend} /></Panel>
  );
  return (
    <>
      {d.window?.startClamped && <p className="text-xs text-muted">Data starts Oct 6 — showing Oct 6 onward.</p>}
      <InterviewCards cards={s.cards} team={team} />
      <EveryoneList rows={s.everyone ?? []} onPick={onPick} metrics={EVERYONE} initial="passRate"
        note="Pass rate is ranked only with 20 or more decided rounds. ⚠ = too few to tell." />
      <KeyFindings findings={d.findings ?? []} note="Only findings that are unlikely to be chance are shown." />
      <Panel>
        <ConversionTable title="By stage" rows={d.byStage ?? []} teamRate={teamRate} spec={STAGE_SPEC} legend={false}
          above={OutcomeLegend} note={PASS_RATE_NOTE} />
      </Panel>
      <div className={GRID}>
        {table('Self vs caller', d.byWho, WHO_SPEC, true)}
        {table('By caller', d.byCaller, CALLER_SPEC)}
        <Panel><Reasons what="rejected" rows={d.reasons?.rejected} /></Panel>
        <Panel>
          <Reasons what="canceled" rows={d.reasons?.canceled} />
          <Rescheduled reasons={d.reasons} />
        </Panel>
      </div>
      <Depth depth={d.depth} />
      <h3 className="px-1 pt-2 font-semibold">What raises the pass rate</h3>
      <div className={GRID}>
        {table('By time of day', d.byHour)}
        {table('By who applied', d.byAppliedBy)}
        {table('By weekday', d.byWeekday)}
        {table('By resume score', d.byScore)}
        {table('By job area', d.byArea)}
        {table('By profile', d.byProfile)}
        {table('By region', d.byRegion)}
      </div>
      <FollowUps rows={d.followUps} />
    </>
  );
}

/** Statistics → Interviews (spec 2026-11-20): what happens to interview rounds after they are scheduled. The same
 * filters (and URL keys) as Bids → Interviews, then cards, Everyone, key findings, By stage, self vs caller, the
 * reasons, depth and speed, the pass-rate breakdowns and follow-ups. */
export default function InterviewStatsTab() {
  const f = useConversionFilters();
  const isAdmin = useAuth().user?.role === 'admin';
  const user = isAdmin ? f.values.user : '';
  const scope: api.ConversionScope = f.values.scope === 'me' ? 'me' : 'team';
  const params: ConversionParams | null = f.params ? { ...f.params, scope, ...(user ? { user } : {}) } : null;

  const res = useSWR(
    params ? ['stats-interviews-report', params.period, params.date, params.to, params.region, scope, user] : null,
    () => api.getInterviewsReport(params!),
    { keepPreviousData: true },
  );
  // keepPreviousData hands back the last range's report even when the key is null: an invalid range shows none.
  const d = params ? res.data : undefined;
  return (
    <div className="space-y-4">
      <StatsFilterBar f={f} viewing before={<ScopeSwitch f={f} scope={scope} />}>
        {res.isLoading && d && <span className="spinner spinner-sm mb-2.5" role="status" aria-label="Loading" />}
      </StatsFilterBar>
      {!params ? (
        <p className="panel p-6 text-sm text-muted">Pick a valid date range to see statistics.</p>
      ) : res.error ? (
        <p className="panel p-6 text-sm text-red-700 dark:text-red-400">Couldn’t load the statistics. Try again.</p>
      ) : !d ? (
        <p className="panel flex items-center gap-2 p-6 text-sm text-muted" role="status">
          <span className="spinner spinner-sm" aria-hidden /> Loading statistics…
        </p>
      ) : !d.totals || !d.summary?.cards ? <ServerUpdateNote />
        : d.totals.rounds === 0 ? (
          <p className="panel p-6 text-sm text-muted">
            {d.window?.startClamped ? 'No data before Oct 6, 2026 — pick a later period.' : 'No interview rounds in this period.'}
          </p>
        ) : <Report d={d} team={scope === 'team'} onPick={isAdmin ? (id) => f.patch({ user: id }) : undefined} />}
    </div>
  );
}
