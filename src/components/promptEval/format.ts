import type {
  EvalRole,
  PromptEvalPromptSource,
  PromptEvalRowStatus,
  PromptEvalRun,
  PromptEvalRunStatus,
} from '../../api/endpoints';
import { formatDateTime } from '../jobApplies/format';

export const ROLE_LABEL: Record<EvalRole, string> = {
  fullstack: 'Fullstack',
  frontend: 'Frontend',
  backend: 'Backend',
  ai: 'AI',
  ml: 'ML',
  llm: 'LLM',
  data: 'Data',
  test: 'Test',
};

export const RUN_STATUS_LABEL: Record<PromptEvalRunStatus, string> = {
  running: 'Running',
  done: 'Done',
  failed: 'Failed',
};

export const RUN_STATUS_BADGE: Record<PromptEvalRunStatus, string> = {
  running: 'badge-info',
  done: 'badge-success',
  failed: 'badge-danger',
};

export const ROW_STATUS_LABEL: Record<PromptEvalRowStatus, string> = {
  pending: 'Pending',
  generating: 'Generating',
  judging: 'Judging',
  done: 'Done',
  failed: 'Failed',
};

export const ROW_STATUS_BADGE: Record<PromptEvalRowStatus, string> = {
  pending: 'badge-neutral',
  generating: 'badge-info',
  judging: 'badge-info',
  done: 'badge-success',
  failed: 'badge-danger',
};

export const PROMPT_SOURCE_LABEL: Record<PromptEvalPromptSource, string> = {
  custom: 'Edited in the eval form',
  profile: 'Profile prompt',
  global: 'Global prompt',
  none: 'No custom prompt (built-in rules only)',
};

/** Server-side cap, mirrored so the picker can stop at it. */
export const MAX_JDS_PER_RUN = 12;

export const isRunActive = (status: PromptEvalRunStatus) => status === 'running';

/** Badge class for a 0-100 score: same bands as the judge rubric. */
export function scoreClass(n: number | null | undefined): string {
  if (n == null) return 'badge-neutral';
  if (n >= 80) return 'badge-success';
  if (n >= 65) return 'badge-info';
  if (n >= 50) return 'badge-warning';
  return 'badge-danger';
}

/** 'anthropic:claude-opus-5-5' → 'claude-opus-5-5'; empty → 'default'. */
export function modelShort(id: string | null | undefined): string {
  if (!id) return 'default';
  const i = id.indexOf(':');
  return i >= 0 ? id.slice(i + 1) : id;
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return '';
  if (ms < 1000) return `${ms} ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

export function formatScore(n: number | null | undefined): string {
  return n == null ? '—' : String(Math.round(n));
}

/** How a run is named in headers and legends: its label, else when it ran. */
export function runTitle(run: PromptEvalRun): string {
  return run.label?.trim() || formatDateTime(run.createdAt);
}

/**
 * Series colors for overlaid runs, one slot per run in fixed order (validated categorical palette, light and
 * dark steps). Identity never relies on color alone: the legend and the matrix below name every run.
 */
export const SERIES_COLORS: { light: string; dark: string }[] = [
  { light: '#2a78d6', dark: '#3987e5' },
  { light: '#eb6834', dark: '#d95926' },
  { light: '#1baf7a', dark: '#199e70' },
  { light: '#eda100', dark: '#c98500' },
];

export const MAX_COMPARE = SERIES_COLORS.length;
