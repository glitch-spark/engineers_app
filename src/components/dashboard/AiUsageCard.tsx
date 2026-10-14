import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import * as api from '../../api/endpoints';
import { useChartTheme } from '../../theme/useChartTheme';
import { useTheme } from '../../theme/ThemeProvider';
import { formatUsd } from '../../lib/modelCost';
import MultiSelect from '../MultiSelect';
import Segmented from '../jobApplies/Segmented';
import {
  AI_USAGE_PERIODS,
  type AiUsagePeriod,
  aiUsageRange,
  bucketLabel,
  customRangeError,
  defaultCustomRange,
  viewerTimeZone,
} from '../../lib/aiUsagePeriod';

const FEATURE_LABELS: Record<string, string> = {
  resume: 'Resume',
  cover_letter: 'Cover letter',
  screening: 'Screening answers',
  job_extract: 'Job posting extraction',
  eval_resume: 'Eval: resume',
  eval_judge: 'Eval: judge',
  interview_extract: 'Interview: questions',
  interview_score: 'Interview: scoring',
  interview_analyze: 'Interview: analysis',
  analyze_chat: 'Analysis chat',
  ai_review: 'AI review',
  interview_chat: 'Interview chat',
  other: 'Other',
};
const featureLabel = (key: string) => FEATURE_LABELS[key] ?? key;
const modelLabel = (key: string) => key || 'Unknown model';

type StackBy = 'feature' | 'model' | 'user';
const STACKS: { value: StackBy; label: string }[] = [
  { value: 'feature', label: 'Feature' },
  { value: 'model', label: 'Model' },
  { value: 'user', label: 'User' },
];
const SERIES_KEY: Record<StackBy, 'byFeature' | 'byModel' | 'byUser'> = {
  feature: 'byFeature',
  model: 'byModel',
  user: 'byUser',
};

// Categorical slots in fixed order (validated light/dark steps); past seven series the rest fold into "Other".
const SERIES_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6'];
const SERIES_DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9'];
const OTHER_LIGHT = '#a1a1aa';
const OTHER_DARK = '#71717a';
const OTHER_KEY = '__other';

const count = new Intl.NumberFormat('en-US');
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
const ROW_LIMIT = 15; // table rows before "Show all"; the Total row always covers everything
const usd = (v: number) => (v === 0 ? '$0.00' : formatUsd(v));

type Row = api.AiUsageReport['rows'][number];
type SortKey = 'userName' | 'feature' | 'model' | 'calls' | 'inputTokens' | 'outputTokens' | 'costUsd';
const COLUMNS: { key: SortKey; label: string; numeric: boolean }[] = [
  { key: 'userName', label: 'User', numeric: false },
  { key: 'feature', label: 'Feature', numeric: false },
  { key: 'model', label: 'Model', numeric: false },
  { key: 'calls', label: 'Calls', numeric: true },
  { key: 'inputTokens', label: 'Input tokens', numeric: true },
  { key: 'outputTokens', label: 'Output tokens', numeric: true },
  { key: 'costUsd', label: 'Cost', numeric: true },
];

function sortValue(row: Row, key: SortKey): number | string {
  if (key === 'feature') return featureLabel(row.feature).toLowerCase();
  if (key === 'userName' || key === 'model') return row[key].toLowerCase();
  return row[key];
}

/** Admins' AI spend: who, which feature, which model, over a period in the viewer's time zone. */
export default function AiUsageCard() {
  const chart = useChartTheme();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [period, setPeriod] = useState<AiUsagePeriod>('this_month');
  const [custom, setCustom] = useState(() => defaultCustomRange());
  const [users, setUsers] = useState<string[]>([]);
  const [features, setFeatures] = useState<string[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [stackBy, setStackBy] = useState<StackBy>('feature');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'costUsd', dir: 'desc' });
  const [showAll, setShowAll] = useState(false);

  const tz = viewerTimeZone();
  const customError = period === 'custom' ? customRangeError(custom) : null;
  const range = customError ? null : aiUsageRange(period, custom);
  const filtered = users.length + features.length + models.length > 0;

  const { data, error, isLoading, mutate } = useSWR(
    range ? ['ai-usage', range.from, range.to, tz, users.join(','), features.join(','), models.join(',')] : null,
    () => api.getAiUsage({ from: range!.from, to: range!.to, tz, userId: users, feature: features, model: models }),
    { keepPreviousData: true },
  );

  const userNames = useMemo(() => new Map((data?.options.users ?? []).map((u) => [u.id, u.name])), [data]);
  const seriesName = (key: string) =>
    stackBy === 'feature' ? featureLabel(key) : stackBy === 'model' ? modelLabel(key) : userNames.get(key) ?? key;

  // Top seven stack keys by cost in the period, the rest summed as "Other".
  const { points, keys } = useMemo(() => {
    if (!data) return { points: [], keys: [] as string[] };
    const field = SERIES_KEY[stackBy];
    const totals = new Map<string, number>();
    for (const p of data.series) for (const [k, v] of Object.entries(p[field])) totals.set(k, (totals.get(k) ?? 0) + v);
    const ranked = [...totals.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([k]) => k);
    const top = ranked.slice(0, SERIES_LIGHT.length);
    const folded = ranked.length > top.length;
    const pts = data.series.map((p) => {
      const point: Record<string, number | string> = { label: bucketLabel(p.bucket), bucket: p.bucket };
      let other = 0;
      for (const [k, v] of Object.entries(p[field])) {
        if (top.includes(k)) point[k] = v;
        else other += v;
      }
      if (folded && other > 0) point[OTHER_KEY] = other;
      return point;
    });
    return { points: pts, keys: folded ? [...top, OTHER_KEY] : top };
  }, [data, stackBy]);

  const rows = useMemo(() => {
    const out = [...(data?.rows ?? [])];
    const sign = sort.dir === 'asc' ? 1 : -1;
    out.sort((a, b) => {
      const va = sortValue(a, sort.key);
      const vb = sortValue(b, sort.key);
      if (va < vb) return -sign;
      if (va > vb) return sign;
      return b.costUsd - a.costUsd;
    });
    return out;
  }, [data, sort]);

  const toggle = (key: SortKey) =>
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: COLUMNS.find((c) => c.key === key)?.numeric ? 'desc' : 'asc' },
    );
  const clearFilters = () => {
    setUsers([]);
    setFeatures([]);
    setModels([]);
  };

  const palette = isDark ? SERIES_DARK : SERIES_LIGHT;
  const colorOf = (key: string, i: number) => (key === OTHER_KEY ? (isDark ? OTHER_DARK : OTHER_LIGHT) : palette[i]);
  const totals = data?.totals;

  return (
    <section className="panel p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="card-title">AI usage</h2>
          <p className="text-xs text-muted">Times in {tz}</p>
        </div>
        <div className="max-w-full overflow-x-auto">
          <Segmented label="Period" value={period} options={AI_USAGE_PERIODS} onChange={setPeriod} />
        </div>
      </div>

      {period === 'custom' && (
        <div className="flex items-center flex-wrap gap-2">
          <div className="w-44">
            <input
              type="date"
              className="input"
              aria-label="From"
              value={custom.from}
              onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
            />
          </div>
          <span className="text-muted">–</span>
          <div className="w-44">
            <input
              type="date"
              className="input"
              aria-label="To"
              value={custom.to}
              onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
            />
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-end">
        <FilterField label="Users">
          {(id) => (
            <MultiSelect
              id={id}
              value={users}
              onChange={setUsers}
              options={(data?.options.users ?? []).map((u) => ({ value: u.id, label: u.name }))}
              placeholder="All users"
            />
          )}
        </FilterField>
        <FilterField label="Features">
          {(id) => (
            <MultiSelect
              id={id}
              value={features}
              onChange={setFeatures}
              options={(data?.options.features ?? []).map((f) => ({ value: f, label: featureLabel(f) }))}
              placeholder="All features"
            />
          )}
        </FilterField>
        <FilterField label="Models">
          {(id) => (
            <MultiSelect
              id={id}
              value={models}
              onChange={setModels}
              options={(data?.options.models ?? []).map((m) => ({ value: m, label: modelLabel(m) }))}
              placeholder="All models"
            />
          )}
        </FilterField>
        <button type="button" className="btn-outline" onClick={clearFilters} disabled={!filtered}>
          Clear filters
        </button>
      </div>

      {customError ? (
        <p className="text-sm text-muted">{customError}</p>
      ) : error ? (
        // Any error, even with older data kept by SWR: that data belongs to the previous selection.
        <div>
          <p className="mb-3 text-sm text-muted">Couldn&rsquo;t load AI usage.</p>
          <button type="button" className="btn-outline" onClick={() => mutate()}>
            Retry
          </button>
        </div>
      ) : isLoading || !data || !totals ? (
        <div className="space-y-3">
          <div className="skeleton h-16 w-full" />
          <div className="skeleton h-[280px] w-full" />
        </div>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Tile label="Total cost" value={usd(totals.costUsd)} />
            <Tile label="Calls" value={count.format(totals.calls)} />
            <Tile label="Input tokens" value={compact.format(totals.inputTokens)} hint={count.format(totals.inputTokens)} />
            <Tile label="Output tokens" value={compact.format(totals.outputTokens)} hint={count.format(totals.outputTokens)} />
            <Tile label="Avg per call" value={totals.calls ? usd(totals.costUsd / totals.calls) : '—'} />
          </dl>
          {(totals.estimatedCostUsd > 0 || totals.unpricedCalls > 0) && (
            <p className="text-xs text-muted">
              {totals.estimatedCostUsd > 0 &&
                `${usd(totals.estimatedCostUsd)} of this is estimated: it was rebuilt from older records that stored one cost per job, not per step. `}
              {totals.unpricedCalls > 0 &&
                `${count.format(totals.unpricedCalls)} calls used models without a known price and count as $0.`}
            </p>
          )}

          {totals.calls === 0 ? (
            <p className="text-sm text-muted">
              {filtered ? 'No AI calls match these filters in this period.' : 'No AI calls in this period.'}
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-sm font-medium text-strong">
                  Cost per {data.bucket === 'hour' ? 'hour' : 'day'}
                </h3>
                <Segmented label="Split by" value={stackBy} options={STACKS} onChange={setStackBy} />
              </div>
              <div role="img" aria-label={`Stacked bar chart of AI cost per ${data.bucket}, split by ${stackBy}`}>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={points} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
                    <XAxis dataKey="label" stroke={chart.axis} fontSize={12} tick={{ fill: chart.axis }} minTickGap={8} />
                    <YAxis
                      stroke={chart.axis}
                      fontSize={12}
                      tick={{ fill: chart.axis }}
                      tickFormatter={(v: number) => `$${v < 10 ? v.toFixed(2) : Math.round(v)}`}
                      width={56}
                    />
                    <Tooltip
                      cursor={{ fill: chart.grid, opacity: 0.6 }}
                      formatter={(value) => usd(Number(value))}
                      itemStyle={{ color: chart.tooltipText }}
                      contentStyle={{
                        backgroundColor: chart.tooltipBg,
                        borderColor: chart.tooltipBorder,
                        color: chart.tooltipText,
                      }}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: 12 }}
                      formatter={(value) => <span style={{ color: chart.axis }}>{value}</span>}
                    />
                    {keys.map((k, i) => (
                      <Bar
                        key={k}
                        dataKey={k}
                        name={k === OTHER_KEY ? 'Other' : seriesName(k)}
                        stackId="cost"
                        fill={colorOf(k, i)}
                        stroke={chart.tooltipBg}
                        strokeWidth={1}
                        maxBarSize={36}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="table-wrap overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="table-head">
                    <tr>
                      {COLUMNS.map((c) => {
                        const active = sort.key === c.key;
                        return (
                          <th
                            key={c.key}
                            scope="col"
                            aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                            className={`px-3 py-2 font-medium text-strong whitespace-nowrap ${c.numeric ? 'text-right' : 'text-left'}`}
                          >
                            <button type="button" className="inline-flex items-center gap-1 hover:underline" onClick={() => toggle(c.key)}>
                              {c.label}
                              <span aria-hidden className="text-xs text-muted">
                                {active ? (sort.dir === 'asc' ? '▲' : '▼') : ''}
                              </span>
                            </button>
                          </th>
                        );
                      })}
                      <th scope="col" className="px-3 py-2 font-medium text-strong text-right whitespace-nowrap normal-case">
                        Share
                      </th>
                    </tr>
                  </thead>
                  <tbody className="row-divider">
                    {(showAll ? rows : rows.slice(0, ROW_LIMIT)).map((r) => (
                      <tr key={`${r.userId ?? '-'}|${r.feature}|${r.model}`}>
                        <td className={`px-3 py-2 ${r.userId ? '' : 'text-muted'}`}>{r.userName}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{featureLabel(r.feature)}</td>
                        <td className="px-3 py-2 whitespace-nowrap font-mono text-xs">{modelLabel(r.model)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{count.format(r.calls)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{count.format(r.inputTokens)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{count.format(r.outputTokens)}</td>
                        <td className="px-3 py-2 text-right tabular-nums" title={r.estimated ? 'Includes an estimated split' : undefined}>
                          {usd(r.costUsd)}
                          {r.estimated && <span className="text-muted">*</span>}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted">
                          {totals.costUsd ? `${((r.costUsd / totals.costUsd) * 100).toFixed(1)}%` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t border-zinc-200 dark:border-zinc-800">
                    <tr className="font-semibold text-strong">
                      <th scope="row" colSpan={3} className="px-3 py-2 text-left">
                        Total
                      </th>
                      <td className="px-3 py-2 text-right tabular-nums">{count.format(totals.calls)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{count.format(totals.inputTokens)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{count.format(totals.outputTokens)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{usd(totals.costUsd)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">100%</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              {rows.length > ROW_LIMIT && (
                <button type="button" className="btn-outline" onClick={() => setShowAll((v) => !v)}>
                  {showAll ? `Show top ${ROW_LIMIT}` : `Show all ${count.format(rows.length)} rows`}
                </button>
              )}
              {rows.some((r) => r.estimated) && (
                <p className="text-xs text-muted">* Includes an estimated screening / cover-letter split.</p>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}

function FilterField({ label, children }: { label: string; children: (id: string) => React.ReactNode }) {
  const id = `ai-usage-${label.toLowerCase()}`;
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="block text-xs text-muted mb-1">
        {label}
      </label>
      {children(id)}
    </div>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 px-3 py-2 dark:border-zinc-800" title={hint}>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums text-strong">{value}</dd>
    </div>
  );
}
