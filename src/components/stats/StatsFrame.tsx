import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { StatsHeadline, StatsView } from '../../api/endpoints';
import { useChartTheme } from '../../theme/useChartTheme';
import { useTheme } from '../../theme/ThemeProvider';
import { seriesColors } from '../statistics/rateShared';
import RangeBar from './RangeBar';

/** The shared "you vs team" frame every statistics tab renders: header, tips, everyone, trend, definitions. */

const SEV = { bad: 'bg-red-600', watch: 'bg-amber-500', good: 'bg-green-600' } as const;
const GOOD = 'text-green-600 dark:text-green-400';
const BAD = 'text-red-600 dark:text-red-400';

const num = (v: number | null, format: StatsHeadline['format']) =>
  v == null ? '—'
    : format === 'per100' ? v.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
      : format === 'pct' ? `${Math.round(v * 100)}%`
        : format === 'rank' ? String(v)
          : v.toLocaleString(undefined, { maximumFractionDigits: 0 });

const withUnit = (v: number | null, format: StatsHeadline['format']) => (
  <>{num(v, format)}{format === 'per100' && v != null && <span className="text-sm font-normal text-muted"> per 100 bids</span>}</>
);
const METRIC_LABEL: Record<string, string> = { bids: 'bids', per100: 'interviews per 100 bids' };
const isProfiles = (v: StatsView) => v.everyone.rowKind === 'profile';

const pctAbs = (v: number) => `${Math.round(Math.abs(v) * 100)}%`;
const signed = (v: number) => `${v < 0 ? '−' : v > 0 ? '+' : ''}${pctAbs(v)}`;

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="stat-card-label">{label}</p>
      {children}
    </div>
  );
}
const Big = ({ children }: { children: React.ReactNode }) => <p className="text-2xl font-bold tabular-nums">{children}</p>;
const Muted = ({ children }: { children: React.ReactNode }) => <p className="text-xs text-muted">{children}</p>;

function Header({ headline }: { headline: StatsHeadline[] }) {
  const main = headline[0];
  if (!main) return null;
  const rank = headline.find((h) => h.key === 'rank');
  const rest = headline.slice(1).filter((h) => h !== rank);
  const outside = main.team != null && main.of === main.team.n + 1;
  const v = main.vsMedian;
  const good = v != null && (v > 0) === main.higherIsBetter;
  return (
    <div className="panel p-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Cell label={main.label}>
          <Big>{withUnit(main.value, main.format)}</Big>
          <Muted>{main.note}</Muted>
        </Cell>
        {main.team && <Cell label="Team median"><Big>{withUnit(main.team.median, main.format)}</Big><Muted>{main.team.n} people</Muted></Cell>}
        {rank && (
          <Cell label={rank.label}>
            {outside
              ? <Big><span className="text-base">would rank {main.rank} of {main.of}</span></Big>
              : main.rank == null
                ? <Big><span className="text-base">{rank.note}</span></Big>
                : <Big>{main.rank} <span className="text-sm font-normal text-muted">of {main.of}</span></Big>}
            {v != null && v !== 0 && (
              <p className={`text-xs ${good ? GOOD : BAD}`}>{v > 0 ? '▲' : '▼'} {pctAbs(v)} {v > 0 ? 'above' : 'below'} median</p>
            )}
          </Cell>
        )}
        {rest.map((h) => <Cell key={h.key} label={h.label}><Big>{num(h.value, h.format)}</Big><Muted>{h.note}</Muted></Cell>)}
      </div>
      {main.team && main.team.n >= 2 && main.team.median != null && main.value != null && <RangeBar team={main.team} value={main.value} />}
    </div>
  );
}

export default function StatsFrame({ view, canPick, onPick }: {
  view: StatsView; canPick: boolean; onPick: (userId: string) => void;
}) {
  const chart = useChartTheme();
  const { theme } = useTheme();
  const colors = seriesColors(theme === 'dark');
  const rows = view.everyone.rows;
  const higherIsBetter = view.headline[0]?.higherIsBetter ?? true;
  const t0 = view.headline[0]?.team;
  const outside = t0 != null && view.headline[0].of === t0.n + 1;
  const fmtFormat = view.everyone.metric === 'per100' ? 'per100' : 'count';
  const max = Math.max(1, ...rows.filter((r) => r.rank != null).map((r) => r.value ?? 0));
  const anyRanked = rows.some((r) => r.rank != null);
  return (
    <div className="space-y-4">
      <Header headline={view.headline} />

      <div className="panel p-4">
        <h3 className="font-semibold">What to work on</h3>
        {view.notEnoughData ? (
          <p className="mt-2 text-sm text-muted">Not enough data yet — check back after a few working days.</p>
        ) : view.tips.length === 0 ? (
          <p className="mt-2 text-sm text-muted">{outside ? (view.tab === 'bids' ? 'No bids in this period.' : 'No activity in this period.') : "Nothing stands out — you're in line with the team."}</p>
        ) : view.tips.map((t) => (
          <div key={t.id} className="flex gap-2.5 border-t border-zinc-200 py-2 first:border-t-0 dark:border-zinc-800">
            <span className={`mt-1.5 h-2 w-2 flex-none rounded-full ${SEV[t.severity]}`} aria-label={t.severity} />
            <div>
              <p className="text-sm">{t.text}</p>
              {t.detail && <p className="text-xs text-muted">{t.detail}</p>}
            </div>
          </div>
        ))}
      </div>

      <div className="panel p-4">
        <h3 className="font-semibold">Everyone <span className="text-xs font-normal text-muted">· {isProfiles(view) && view.everyone.metric === 'per100' ? 'interviews per 100 bids by profile' : METRIC_LABEL[view.everyone.metric] ?? view.everyone.metric}{anyRanked ? ', ranked' : ''}</span></h3>
        {rows.length === 0 && isProfiles(view) && <p className="mt-2 text-sm text-muted">No profiles yet.</p>}
        <div className="mt-2 space-y-0.5">
          {rows.map((r) => (
            <div key={r.userId} data-testid={`everyone-${r.userId}`} data-subject={r.isSubject}
              className={`grid grid-cols-[28px_120px_1fr_110px_60px] items-center gap-2 rounded px-1 py-0.5 text-sm ${r.isSubject ? 'bg-blue-500/10 font-semibold' : ''}`}>
              <span>{r.rank ?? ''}</span>
              {canPick && !isProfiles(view)
                ? <button type="button" className="truncate text-left hover:underline" onClick={() => onPick(r.userId)}>{r.name}</button>
                : <span className="truncate">{r.name}{r.region && <span className="ml-1.5 text-xs font-normal text-muted">{r.region}</span>}</span>}
              {r.value == null
                ? <span />
                : <span className="h-2.5 rounded" title={Object.entries(r.parts).map(([k, p]) => `${k} ${p}`).join(' · ')}
                  style={{ width: `${Math.min(100, (r.value / max) * 100)}%`, background: r.isSubject ? colors.me : colors.other, opacity: r.rank === null ? 0.4 : 1 }} />}
              <span className="tabular-nums">
                {num(r.value, fmtFormat)}
                {r.rank === null && <span className="ml-1 text-xs font-normal text-muted">not ranked</span>}
              </span>
              <span className={`text-xs ${r.vsMedian == null || r.vsMedian === 0 ? '' : (r.vsMedian > 0) === higherIsBetter ? GOOD : BAD}`}>
                {r.vsMedian == null || r.vsMedian === 0 ? '' : signed(r.vsMedian)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {view.trend && (
        <div className="panel p-4">
          <h3 className="font-semibold">Trend <span className="text-xs font-normal text-muted">· {view.trend.unit === 'day' ? 'Daily' : 'Weekly'}, you vs team median</span></h3>
          <div className="mt-2 h-40">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={view.trend.buckets}>
                <CartesianGrid stroke={chart.grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: chart.axis, fontSize: 10 }} />
                <YAxis tick={{ fill: chart.axis, fontSize: 10 }} width={36} />
                <Tooltip contentStyle={{ background: chart.tooltipBg, borderColor: chart.tooltipBorder, color: chart.tooltipText }} />
                <Line type="monotone" dataKey="median" name="Team median" stroke={colors.other} strokeWidth={2} strokeDasharray="5 4" dot={false} />
                <Line type="monotone" dataKey="you" name="You" stroke={colors.me} strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <details className="panel p-4 text-sm">
        <summary className="cursor-pointer font-semibold">How these are counted</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
          {view.definitions.map((d, i) => <li key={i}>{d}</li>)}
        </ul>
      </details>
    </div>
  );
}
