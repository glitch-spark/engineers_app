import { useMemo } from 'react';
import { Legend, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from 'recharts';
import { EVAL_ROLES, type EvalRole, type PromptEvalRoleScore } from '../../api/endpoints';
import { useTheme } from '../../theme/ThemeProvider';
import { useChartTheme } from '../../theme/useChartTheme';
import { ROLE_LABEL, SERIES_COLORS } from './format';

export type RadarMetric = 'match' | 'believability';

export interface RadarSeries {
  id: string;
  label: string;
  scores: Partial<Record<EvalRole, PromptEvalRoleScore>>;
}

export const METRIC_LABEL: Record<RadarMetric, string> = { match: 'Match', believability: 'Believability' };

/**
 * One axis per role, 0-100, one polygon per run. Roles no run scored are left out so each polygon stays closed.
 * Identity never relies on color alone: a single run needs no legend (the card names it); two or more get one.
 */
export default function RoleRadar({ series, metric, height = 320 }: { series: RadarSeries[]; metric: RadarMetric; height?: number }) {
  const chart = useChartTheme();
  const { theme } = useTheme();
  const mode = theme === 'dark' ? 'dark' : 'light';

  const data = useMemo(() => {
    const roles = EVAL_ROLES.filter((role) => series.some((s) => s.scores[role]?.[metric] != null));
    return roles.map((role) => {
      const point: Record<string, string | number | null> = { role: ROLE_LABEL[role] };
      for (const s of series) point[s.id] = s.scores[role]?.[metric] ?? null;
      return point;
    });
  }, [series, metric]);

  if (series.length === 0 || data.length === 0) {
    return (
      <p className="flex items-center justify-center text-sm text-muted" style={{ height }}>
        No scored roles yet.
      </p>
    );
  }

  return (
    <div style={{ height }} role="img" aria-label={`${METRIC_LABEL[metric]} score per role`}>
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} outerRadius="72%" margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
          <PolarGrid stroke={chart.grid} strokeDasharray="3 3" />
          <PolarAngleAxis dataKey="role" tick={{ fill: chart.axis, fontSize: 12 }} />
          <PolarRadiusAxis angle={90} domain={[0, 100]} tickCount={6} tick={{ fill: chart.axis, fontSize: 10 }} axisLine={false} />
          <Tooltip
            contentStyle={{ backgroundColor: chart.tooltipBg, borderColor: chart.tooltipBorder, color: chart.tooltipText, fontSize: 12 }}
            formatter={(value: number | string) => [typeof value === 'number' ? Math.round(value) : value, METRIC_LABEL[metric]]}
          />
          {series.map((s, i) => {
            const color = SERIES_COLORS[i % SERIES_COLORS.length][mode];
            return (
              <Radar
                key={s.id}
                name={s.label}
                dataKey={s.id}
                stroke={color}
                strokeWidth={2}
                fill={color}
                fillOpacity={series.length > 1 ? 0.12 : 0.25}
                dot={{ r: 3, fill: color, strokeWidth: 0 }}
                isAnimationActive={false}
              />
            );
          })}
          {series.length > 1 && <Legend wrapperStyle={{ color: chart.axis, fontSize: 12 }} />}
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Match / believability toggle for a radar; rendered by the card that owns the chart. */
export function MetricToggle({ value, onChange }: { value: RadarMetric; onChange: (m: RadarMetric) => void }) {
  return (
    <div className="segmented" role="group" aria-label="Score shown">
      {(['match', 'believability'] as RadarMetric[]).map((m) => (
        <button key={m} type="button" aria-pressed={value === m} onClick={() => onChange(m)} className={'segmented-btn ' + (value === m ? 'segmented-btn-active' : '')}>
          {METRIC_LABEL[m]}
        </button>
      ))}
    </div>
  );
}
