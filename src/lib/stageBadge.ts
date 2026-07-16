/** Interview / pipeline stage labels and badge styling (shared across pages). */

/** Board-level stage shown in the interview form (Tech expands to sub-stages). */
export const BOARD_FORM_STAGES = [
  { value: 'ai_interview', label: 'AI Interview' },
  { value: 'intro', label: 'Intro' },
  { value: 'tech', label: 'Tech' },
  { value: 'cultural', label: 'Hiring Manager' },
  { value: 'panel', label: 'Panel' },
  { value: 'final', label: 'Final' },
  { value: 'rejected', label: 'Rejected' },
] as const;

/** Sub-stages that live under the Tech board column. */
export const TECH_SUB_STAGES = [
  { value: 'tech_round_1', label: 'Tech round 1' },
  { value: 'tech_round_2', label: 'Tech round 2' },
  { value: 'live_coding', label: 'Live Coding' },
  { value: 'system_design', label: 'System Design' },
  { value: 'home_assessment', label: 'Home Assessment' },
] as const;

export const TECH_SUB_STAGE_VALUES = TECH_SUB_STAGES.map((s) => s.value);

export function isTechSubStage(stage?: string | null): boolean {
  return !!stage && (TECH_SUB_STAGE_VALUES as readonly string[]).includes(stage);
}

/** True when the stored stage belongs in the Tech pan (including legacy `tech`). */
export function isTechBoardStage(stage?: string | null): boolean {
  return stage === 'tech' || stage === 'tech1' || stage === 'tech2' || isTechSubStage(stage);
}

/** Map a stored API stage → board-level form stage value. */
export function toBoardFormStage(stage?: string | null): string {
  if (!stage) return '';
  if (isTechBoardStage(stage)) return 'tech';
  if (stage === 'hiring_manager') return 'cultural';
  return stage;
}

/** Tech sub-stage value for the form (empty when not a known tech sub-stage). */
export function toTechSubStage(stage?: string | null): string {
  if (!stage) return '';
  if (stage === 'tech' || stage === 'tech1') return 'tech_round_1';
  if (stage === 'tech2') return 'tech_round_2';
  if (isTechSubStage(stage)) return stage;
  return '';
}

/**
 * Coerce legacy/generic tech keys to a concrete Tech sub-stage.
 * Plain `tech` is a board column, not a real interview stage — never show/store it.
 * Also strip leaked Python enum labels like `InterviewStage.tech`.
 */
export function normalizeInterviewStage(stage?: string | null): string {
  if (!stage) return '';
  let s = stage;
  if (s.startsWith('InterviewStage.')) s = s.slice('InterviewStage.'.length);
  if (s === 'tech' || s === 'tech1') return 'tech_round_1';
  if (s === 'tech2') return 'tech_round_2';
  if (s === 'hiring_manager') return 'cultural';
  return s;
}

/** Resolve form board stage + optional tech sub-stage into the API stage string. */
export function resolveInterviewStage(boardStage: string, techSubStage: string): string {
  if (!boardStage) return '';
  // Tech is only a board column — no stage until a sub-stage is chosen.
  if (boardStage === 'tech') return techSubStage || '';
  return boardStage;
}

export const INTERVIEW_STAGES = [
  { value: 'ai_interview', label: 'AI Interview' },
  { value: 'intro', label: 'Intro' },
  { value: 'tech_round_1', label: 'Tech round 1' },
  { value: 'tech_round_2', label: 'Tech round 2' },
  { value: 'live_coding', label: 'Live Coding' },
  { value: 'system_design', label: 'System Design' },
  { value: 'home_assessment', label: 'Home Assessment' },
  { value: 'cultural', label: 'Hiring Manager' },
  { value: 'panel', label: 'Panel' },
  { value: 'final', label: 'Final' },
  { value: 'rejected', label: 'Rejected' },
] as const;

/** Canonical interview-stage order (mirrors backend STAGE_ORDER, minus bid_sent/terminal). */
export const INTERVIEW_STAGE_ORDER = [
  'intro',
  'tech_round_1',
  'tech_round_2',
  'live_coding',
  'system_design',
  'home_assessment',
  'panel',
  'cultural',
  'ai_interview',
  'final',
  'rejected',
] as const;

export type InterviewStageValue = (typeof INTERVIEW_STAGE_ORDER)[number];

const INTERVIEW_STAGE_SET = new Set<string>(INTERVIEW_STAGE_ORDER);

export function isInterviewStage(stage: string): stage is InterviewStageValue {
  return INTERVIEW_STAGE_SET.has(normalizeInterviewStage(stage));
}

/** Distinct interview stages reached, from history + current stage, in pipeline order. */
export function getReachedInterviewStages(app: {
  stage: string;
  stageHistory: Array<{ stage: string }>;
}): string[] {
  const reached = new Set<string>();
  for (const h of app.stageHistory) {
    const s = normalizeInterviewStage(h.stage);
    if (isInterviewStage(s)) reached.add(s);
  }
  const current = normalizeInterviewStage(app.stage);
  if (isInterviewStage(current)) reached.add(current);
  return INTERVIEW_STAGE_ORDER.filter((s) => reached.has(s));
}

/** Chronological movement trail for an interview card (history + current). */
export function getInterviewMovementTrail(iv: {
  stage?: string | null;
  stageHistory?: Array<{ stage: string }>;
}): string[] {
  return getInterviewMovementEntries(iv).map((e) => e.stage);
}

export type MovementEntry = { stage: string; scheduledAt?: string };

/** Movement trail with per-round scheduled dates (YYYY-MM-DD when available). */
export function getInterviewMovementEntries(iv: {
  stage?: string | null;
  scheduledAt?: string | null;
  stageHistory?: Array<{ stage: string; scheduledAt?: string | null }>;
}): MovementEntry[] {
  const trail: MovementEntry[] = [];
  const toDate = (raw?: string | null): string | undefined => {
    if (!raw) return undefined;
    // Already YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const d = new Date(raw);
    if (isNaN(d.getTime())) return undefined;
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };
  const push = (rawStage?: string | null, rawDate?: string | null) => {
    const s = normalizeInterviewStage(rawStage);
    if (!s) return;
    const date = toDate(rawDate);
    const tip = trail[trail.length - 1];
    if (tip?.stage === s) {
      if (date && tip.scheduledAt !== date) tip.scheduledAt = date;
      return;
    }
    trail.push({ stage: s, ...(date ? { scheduledAt: date } : {}) });
  };
  for (const h of iv.stageHistory ?? []) {
    push(h.stage, h.scheduledAt);
  }
  push(iv.stage, iv.scheduledAt);
  return trail;
}

const EXTRA_LABELS: Record<string, string> = {
  bid_sent: 'Applied',
  offer: 'Offer',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
  hiring_manager: 'Hiring Manager',
  tech: 'Tech round 1',
  tech1: 'Tech round 1',
  tech2: 'Tech round 2',
};

export function stageLabel(stage?: string | null): string {
  if (!stage) return '—';
  const s = normalizeInterviewStage(stage) || stage;
  return INTERVIEW_STAGES.find((x) => x.value === s)?.label
    ?? EXTRA_LABELS[s]
    ?? EXTRA_LABELS[stage]
    ?? s.replace(/_/g, ' ');
}

export function stageBadgeClass(stage?: string | null): string {
  switch (stage) {
    case 'intro':
      return 'bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700';
    case 'tech':
    case 'tech_round_1':
    case 'tech_round_2':
    case 'tech1':
    case 'tech2':
      return 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800';
    case 'panel':
      return 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800';
    case 'live_coding':
      return 'bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800';
    case 'system_design':
      return 'bg-cyan-100 text-cyan-800 border-cyan-200 dark:bg-cyan-950/40 dark:text-cyan-300 dark:border-cyan-800';
    case 'home_assessment':
      return 'bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800';
    case 'cultural':
    case 'hiring_manager':
      return 'bg-pink-100 text-pink-800 border-pink-200 dark:bg-pink-950/40 dark:text-pink-300 dark:border-pink-800';
    case 'final':
      return 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800';
    case 'ai_interview':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800';
    case 'offer':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800';
    case 'rejected':
      return 'bg-red-100 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800';
    case 'withdrawn':
      return 'bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700';
    case 'bid_sent':
      return 'bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700';
    default:
      return 'bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700';
  }
}
