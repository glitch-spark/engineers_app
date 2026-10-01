import type {
  JobApplyCounts,
  JobApplyGate,
  JobApplyRowStatus,
  JobApplyRunStatus,
  ScoreBand,
} from '../../api/endpoints';

export const RUN_STATUS_LABEL: Record<JobApplyRunStatus, string> = {
  queued: 'Queued',
  running: 'Running',
  done: 'Done',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

export const RUN_STATUS_BADGE: Record<JobApplyRunStatus, string> = {
  queued: 'badge-neutral',
  running: 'badge-info',
  done: 'badge-success',
  failed: 'badge-danger',
  cancelled: 'badge-neutral',
};

export const ROW_STATUS_LABEL: Record<JobApplyRowStatus, string> = {
  pending: 'Pending',
  fetched: 'Fetched',
  extracted: 'Extracted',
  scored: 'Scored',
  excluded: 'Excluded',
  fetch_failed: 'Fetch failed',
  llm_failed: 'Extraction failed',
};

export const isActive = (status: JobApplyRunStatus) => status === 'queued' || status === 'running';

export function bandClass(band: ScoreBand): string {
  switch (band) {
    case 'strong':
      return 'badge-success';
    case 'good':
      return 'badge-info';
    case 'fair':
      return 'badge-warning';
    default:
      return 'badge-danger';
  }
}

export type Tone = 'fail' | 'warn' | 'ok';
export const TONE_CLASS: Record<Tone, string> = {
  fail: 'badge-danger',
  warn: 'badge-warning',
  ok: 'badge-neutral',
};

const GATE_LABEL: Record<string, string> = {
  remote: 'Remote',
  clearance: 'Clearance',
  freshness: 'Posted',
  location: 'Location',
  workAuth: 'Work auth',
};

function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/** Chip for one gate: failures and unknowns get a short label; plain passes return null (not shown). */
export function gateChip(g: JobApplyGate): { label: string; tone: Tone; title: string } | null {
  const name = GATE_LABEL[g.name] ?? g.name;
  const title = g.reason ? `${name}: ${g.reason}` : name;
  if (g.result === 'fail') {
    if (g.name === 'remote') return { label: capitalize(g.reason || 'Not remote'), tone: 'fail', title };
    if (g.name === 'clearance') return { label: 'Clearance required', tone: 'fail', title };
    if (g.name === 'freshness') return { label: capitalize(g.reason || 'Too old'), tone: 'fail', title };
    return { label: `${name} mismatch`, tone: 'fail', title };
  }
  if (g.result === 'unknown') {
    if (g.name === 'freshness') return { label: 'Date unknown', tone: 'warn', title };
    if (g.name === 'remote') return { label: 'Work mode unknown', tone: 'warn', title };
    return null; // unknown location / work auth pass silently; shown in the row detail
  }
  if (g.name === 'clearance' && g.reason.includes('preferred')) {
    return { label: 'Clearance preferred', tone: 'warn', title };
  }
  return null;
}

/** Rough overall progress: extraction is most of the work, scoring is quick. */
export function runProgress(c: JobApplyCounts): { pct: number; label: string } {
  if (!c.total) return { pct: 0, label: '0 jobs' };
  const extractedOrFailed = Math.min(c.total, c.extracted + c.failed);
  const pct = Math.round(((0.85 * extractedOrFailed + 0.15 * Math.min(c.total, c.scored)) / c.total) * 100);
  const label =
    c.scored > 0 ? `Scored ${c.scored}/${c.total}` : `Read ${extractedOrFailed}/${c.total}`;
  return { pct: Math.min(100, pct), label };
}

export function formatDate(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function ageDays(iso?: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86_400_000));
}
