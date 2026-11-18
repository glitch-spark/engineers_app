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

const fmt = (h: StatsHeadline) =>
  h.format === 'rank' ? String(h.value)
    : h.key === 'perDay' ? h.value.toLocaleString(undefined, { maximumFractionDigits: 0 })
      : h.value.toLocaleString();

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
  const [main, rank, perDay] = [headline[0], headline.find((h) => h.key === 'rank'), headline.find((h) => h.key === 'perDay')];
  if (!main) return null;
  const outside = main.team != null && main.of === main.team.n + 1;
  const v = main.vsMedian;
  const good = v != null && (v > 0) === main.higherIsBetter;
  return (
    <div className="panel p-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Cell label={main.label}><Big>{fmt(main)}</Big><Muted>{main.note}</Muted></Cell>
        {main.team && <Cell label="Team median"><Big>{main.team.median.toLocaleString()}</Big><Muted>{main.team.n} people</Muted></Cell>}
        <Cell label={rank?.label ?? 'Your rank'}>
          {outside
            ? <Big><span className="text-base">would rank {main.rank} of {main.of}</span></Big>
            : <Big>{main.rank} <span className="text-sm font-normal text-muted">of {main.of}</span></Big>}
          {v != null && v !== 0 && (
            <p className={`text-xs ${good ? GOOD : BAD}`}>{v > 0 ? '▲' : '▼'} {pctAbs(v)} {v > 0 ? 'above' : 'below'} median</p>
          )}
        </Cell>
        {perDay && <Cell label={perDay.label}><Big>{fmt(perDay)}</Big><Muted>{perDay.note}</Muted></Cell>}
      </div>
      {main.team && main.team.n >= 2 && <RangeBar team={main.team} value={main.value} />}
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
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="space-y-4">
      <Header headline={view.headline} />

      <div className="panel p-4">
        <h3 className="font-semibold">What to work on</h3>
        {view.notEnoughData ? (
          <p className="mt-2 text-sm text-muted">Not enough data yet — check back after a few working days.</p>
        ) : view.tips.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Nothing stands out — you're in line with the team.</p>
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
        <h3 className="font-semibold">Everyone <span className="text-xs font-normal text-muted">· {view.everyone.metric}, ranked</span></h3>
        <div className="mt-2 space-y-0.5">
          {rows.map((r) => (
            <div key={r.userId} data-testid={`everyone-${r.userId}`} data-subject={r.isSubject}
              className={`grid grid-cols-[28px_120px_1fr_60px_60px] items-center gap-2 rounded px-1 py-0.5 text-sm ${r.isSubject ? 'bg-blue-500/10 font-semibold' : ''}`}>
              <span>{r.rank}</span>
              {canPick
                ? <button type="button" className="truncate text-left hover:underline" onClick={() => onPick(r.userId)}>{r.name}</button>
                : <span className="truncate">{r.name}</span>}
              <span className="h-2.5 rounded" title={Object.entries(r.parts).map(([k, p]) => `${k} ${p}`).join(' · ')}
                style={{ width: `${(r.value / max) * 100}%`, background: r.isSubject ? colors.me : colors.other }} />
              <span className="tabular-nums">{r.value.toLocaleString()}</span>
              <span className={`text-xs ${r.vsMedian == null || r.vsMedian === 0 ? 'text-muted' : r.vsMedian > 0 ? GOOD : BAD}`}>
                {r.vsMedian == null ? '' : r.vsMedian === 0 ? 'median' : signed(r.vsMedian)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="panel p-4">
        <h3 className="font-semibold">Trend <span className="text-xs font-normal text-muted">· {view.trend.unit}ly, you vs team median</span></h3>
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

      <details className="panel p-4 text-sm">
        <summary className="cursor-pointer font-semibold">How these are counted</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
          {view.definitions.map((d) => <li key={d}>{d}</li>)}
        </ul>
      </details>
    </div>
  );
}
