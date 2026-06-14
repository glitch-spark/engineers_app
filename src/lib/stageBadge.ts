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
    case 'intro': return 'bg-gray-100 text-gray-700 border-gray-200';
    case 'tech': return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'panel': return 'bg-purple-100 text-purple-800 border-purple-200';
    case 'live_coding': return 'bg-indigo-100 text-indigo-800 border-indigo-200';
    case 'system_design': return 'bg-cyan-100 text-cyan-800 border-cyan-200';
    case 'cultural': return 'bg-pink-100 text-pink-800 border-pink-200';
    case 'final': return 'bg-amber-100 text-amber-800 border-amber-200';
    case 'ai_interview': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    case 'offer': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    case 'rejected': return 'bg-red-100 text-red-800 border-red-200';
    case 'withdrawn': return 'bg-gray-100 text-gray-600 border-gray-200';
    case 'bid_sent': return 'bg-gray-100 text-gray-700 border-gray-200';
    default: return 'bg-gray-100 text-gray-700 border-gray-200';
  }
}
