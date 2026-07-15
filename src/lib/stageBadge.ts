/** Interview / pipeline stage labels and badge styling (shared across pages). */

export const INTERVIEW_STAGES = [
  { value: 'intro', label: 'Intro' },
  { value: 'tech', label: 'Tech' },
  { value: 'panel', label: 'Panel' },
  { value: 'live_coding', label: 'Live Coding' },
  { value: 'system_design', label: 'System Design' },
  { value: 'cultural', label: 'Cultural' },
  { value: 'final', label: 'Final' },
  { value: 'ai_interview', label: 'AI Interview' },
] as const;

/** Canonical interview-stage order (mirrors backend STAGE_ORDER, minus bid_sent/terminal). */
export const INTERVIEW_STAGE_ORDER = [
  'intro',
  'tech',
  'live_coding',
  'system_design',
  'panel',
  'cultural',
  'ai_interview',
  'final',
] as const;

export type InterviewStageValue = (typeof INTERVIEW_STAGE_ORDER)[number];

const INTERVIEW_STAGE_SET = new Set<string>(INTERVIEW_STAGE_ORDER);

export function isInterviewStage(stage: string): stage is InterviewStageValue {
  return INTERVIEW_STAGE_SET.has(stage);
}

/** Distinct interview stages reached, from history + current stage, in pipeline order. */
export function getReachedInterviewStages(app: {
  stage: string;
  stageHistory: Array<{ stage: string }>;
}): string[] {
  const reached = new Set<string>();
  for (const h of app.stageHistory) {
    if (isInterviewStage(h.stage)) reached.add(h.stage);
  }
  if (isInterviewStage(app.stage)) reached.add(app.stage);
  return INTERVIEW_STAGE_ORDER.filter((s) => reached.has(s));
}

const EXTRA_LABELS: Record<string, string> = {
  bid_sent: 'Applied',
  offer: 'Offer',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
};

export function stageLabel(stage?: string | null): string {
  if (!stage) return '—';
  return INTERVIEW_STAGES.find((s) => s.value === stage)?.label
    ?? EXTRA_LABELS[stage]
    ?? stage.replace(/_/g, ' ');
}

export function stageBadgeClass(stage?: string | null): string {
  switch (stage) {
    case 'intro':
      return 'bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700';
    case 'tech':
      return 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800';
    case 'panel':
      return 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800';
    case 'live_coding':
      return 'bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800';
    case 'system_design':
      return 'bg-cyan-100 text-cyan-800 border-cyan-200 dark:bg-cyan-950/40 dark:text-cyan-300 dark:border-cyan-800';
    case 'cultural':
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
