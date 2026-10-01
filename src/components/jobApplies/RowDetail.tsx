import useSWR from 'swr';
import { Loader2 } from 'lucide-react';
import * as api from '../../api/endpoints';
import type { JobApplyResumeHealth, JobApplyResumeScore, JobApplyTermHit } from '../../api/endpoints';
import { TONE_CLASS, bandClass, gateChip, healthBadge } from './format';

const COMPONENT_LABEL: Record<string, string> = {
  required: 'Required skills',
  keywords: 'All keywords',
  years: 'Years of experience',
  title: 'Job title match',
  education: 'Education',
  relevance: 'Content relevance',
};
const COMPONENT_ORDER = ['required', 'keywords', 'years', 'title', 'education', 'relevance'];
const TIER_LABEL: Record<JobApplyTermHit['tier'], string> = {
  required: 'Required',
  core: 'Core duty',
  mentioned: 'Mentioned',
  preferred: 'Nice to have',
  context: 'Context',
};
const MATCH_NOTE: Record<JobApplyTermHit['match'], string> = {
  exact: 'exact',
  variant: 'variant',
  fuzzy: 'close spelling',
  missing: 'missing',
};
const WHERE_NOTE: Record<JobApplyTermHit['where'], string> = {
  recent: 'in a recent role',
  skills: 'skills/summary only',
  old: 'only in roles 5+ years ago',
  none: '',
};

function ScoreCard({
  score,
  profileName,
  open,
  health,
}: {
  score: JobApplyResumeScore;
  profileName: string;
  open: boolean;
  health?: JobApplyResumeHealth['health'];
}) {
  const parts = COMPONENT_ORDER.filter((k) => score.components[k]);
  const totalWeight = parts.reduce((n, k) => n + score.components[k].weight, 0) || 1;
  const tiers = (Object.keys(TIER_LABEL) as JobApplyTermHit['tier'][]).filter((t) => score.terms.some((h) => h.tier === t));

  return (
    <details open={open} className="card-compact">
      <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm">
        <span className="font-medium text-zinc-800 dark:text-zinc-100">{profileName}</span>
        <span className="text-zinc-500">·</span>
        <span className="truncate">{score.filename}</span>
        <span className={bandClass(score.band)}>{score.total}</span>
        {score.knockouts.length > 0 && <span className="badge-warning">{score.knockouts.length} knockout risk{score.knockouts.length === 1 ? '' : 's'}</span>}
        {health && (
          <span className={healthBadge(health.score, health.issues).className} title={healthBadge(health.score, health.issues).title}>
            Parse health {health.score}
          </span>
        )}
      </summary>

      <div className="mt-3 space-y-4">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left">
              <th className="py-1 pr-3 font-medium">Component</th>
              <th className="py-1 pr-3 text-right font-medium">Score</th>
              <th className="py-1 pr-3 text-right font-medium">Weight</th>
              <th className="py-1 pr-3 text-right font-medium">Points lost</th>
              <th className="py-1 font-medium">Detail</th>
            </tr>
          </thead>
          <tbody>
            {parts.map((k) => {
              const c = score.components[k];
              const lost = (c.weight * (100 - c.score)) / totalWeight;
              return (
                <tr key={k}>
                  <td className="py-1 pr-3">{COMPONENT_LABEL[k] ?? k}</td>
                  <td className="py-1 pr-3 text-right tabular-nums">{Math.round(c.score)}</td>
                  <td className="py-1 pr-3 text-right tabular-nums">{c.weight}</td>
                  <td className="py-1 pr-3 text-right tabular-nums">{lost.toFixed(1)}</td>
                  <td className="py-1 text-zinc-500 dark:text-zinc-400">{c.detail}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {tiers.map((tier) => {
          const hits = score.terms.filter((h) => h.tier === tier);
          return (
            <div key={tier} className="space-y-1">
              <p className="form-label">{TIER_LABEL[tier]}</p>
              <ul className="flex flex-wrap gap-1.5">
                {hits.map((h) => (
                  <li
                    key={h.term}
                    className={h.credit > 0 ? (h.credit >= 0.85 ? 'badge-success' : 'badge-info') : 'badge-danger'}
                    title={[MATCH_NOTE[h.match], WHERE_NOTE[h.where], `weight ${h.weight.toFixed(2)}`, `credit ${Math.round(h.credit * 100)}%`]
                      .filter(Boolean)
                      .join(' · ')}
                  >
                    {h.credit > 0 ? h.term : `✕ ${h.term}`}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}

        {score.knockouts.length > 0 && (
          <div className="space-y-1">
            <p className="form-label">Knockout risks</p>
            <ul className="list-disc pl-5 text-sm text-amber-800 dark:text-amber-300">
              {score.knockouts.map((k) => (
                <li key={k}>{k}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </details>
  );
}

export default function RowDetail({
  rowId,
  profileNames,
  healthByResume = {},
}: {
  rowId: string;
  profileNames: Record<string, string>;
  healthByResume?: Record<string, JobApplyResumeHealth['health']>;
}) {
  const { data, error, isLoading } = useSWR(['job-apply-row', rowId], () => api.getJobApplyRow(rowId));

  if (isLoading) {
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-muted">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading breakdown…
      </p>
    );
  }
  if (error || !data) return <p className="text-sm text-red-700 dark:text-red-400">Could not load this job's breakdown.</p>;

  const bestIds = new Set(data.suggestions.map((s) => s.resumeId));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
        <span>
          Requirements read by{' '}
          {data.extractionSource === 'rules' ? 'rules (LLM unavailable — lower confidence)' : data.extractionSource === 'cache' ? 'LLM (cached)' : 'LLM'}
        </span>
        {data.timezoneNote && <span>· Time zone: {data.timezoneNote}</span>}
        {data.statusReason && <span>· {data.statusReason}</span>}
      </div>

      {data.profileGates.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {data.profileGates.flatMap((pg) =>
            pg.gates.map((g) => {
              const chip = gateChip(g);
              const tone = g.result === 'fail' ? 'fail' : g.result === 'unknown' ? 'warn' : 'ok';
              return (
                <li key={`${pg.accountId}-${g.name}`} className={TONE_CLASS[chip?.tone ?? tone]} title={g.reason}>
                  {profileNames[pg.accountId] ?? 'Profile'}: {g.name === 'workAuth' ? 'work auth' : g.name} {g.result}
                </li>
              );
            }),
          )}
        </ul>
      )}

      {data.scores.length === 0 ? (
        <p className="hint">No resumes were scored for this job.</p>
      ) : (
        data.scores.map((s, i) => (
          <ScoreCard
            key={s.resumeId}
            score={s}
            profileName={profileNames[s.accountId] ?? 'Profile'}
            open={i === 0 || bestIds.has(s.resumeId)}
            health={healthByResume[s.resumeId]}
          />
        ))
      )}
    </div>
  );
}
