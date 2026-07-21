import useSWR from 'swr';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Plus, ChevronLeft, ChevronRight, Loader2, Trash2, FileText } from 'lucide-react';
import Modal from '../components/Modal';
import Select from '../components/Select';
import InterviewTabs from '../components/InterviewTabs';
import PageHeader from '../components/PageHeader';
import {
  FORM_STATUSES,
  InterviewFormFields,
  InterviewSidePanel,
  StageMovementTrail,
  blankInterviewForm,
  buildSaveBody,
  formatScheduledDate,
  interviewToForm,
  schedulePayload,
  splitDateTime,
  withCurrentStageInHistory,
  type Interview,
  type InterviewFormState,
} from '../components/InterviewEditPanel';
import { useAuth } from '../auth/useAuth';
import * as api from '../api/endpoints';
import { notify } from '../lib/notify';
import {
  BOARD_FORM_STAGES,
  TECH_SUB_STAGES,
  TECH_SUB_STAGE_VALUES,
  getInterviewMovementEntries,
  isTechBoardStage,
  normalizeInterviewStage,
  resolveInterviewStage,
  stageBadgeClass,
  stageLabel,
  toTechSubStage,
  type MovementEntry,
} from '../lib/stageBadge';
import {
  DATE_RANGE_PRESET_OPTIONS,
  currentWeekdayRange,
  formatDateRangeText,
  rangeForDatePreset,
  toDateInputValue,
  type DateRangePreset,
} from '../lib/dateRangePresets';

const editorStyles = `
  .ql-editor { min-height: 140px; font-size: 14px; line-height: 1.5; }
  .prose h1, .prose h2, .prose h3 { font-weight: 600; margin-top: 1em; margin-bottom: 0.5em; }
  .prose h1 { font-size: 1.4em; } .prose h2 { font-size: 1.2em; } .prose h3 { font-size: 1.1em; }
  .prose p { margin-bottom: 0.75em; line-height: 1.6; }
  .prose ul, .prose ol { margin-bottom: 0.75em; padding-left: 1.5em; }
  .prose strong { font-weight: 600; } .prose em { font-style: italic; } .prose u { text-decoration: underline; }
  .prose a { color: #2563eb; text-decoration: underline; }

  /* Read-modal prose blocks: word-wrap, scroll vertically only, min 2 / max 5 lines.
     line-height 1.5 * font-size 14px = 21px per line; padding adds ~16px each side. */
  .prose-readonly {
    font-size: 14px;
    line-height: 1.5;
    padding: 0.5rem 0.75rem;
    border: 1px solid #e5e7eb;
    border-radius: 0.375rem;
    min-height: calc(2 * 1.5em + 1rem);   /* 2 lines + padding */
    max-height: calc(5 * 1.5em + 1rem);   /* 5 lines + padding */
    overflow-y: auto;
    overflow-x: hidden;
    overflow-wrap: break-word;
    word-wrap: break-word;
    word-break: break-word;
  }
  .prose-readonly p { margin: 0 0 0.5em 0; }
  .prose-readonly p:last-child { margin-bottom: 0; }
  .prose-readonly h1, .prose-readonly h2, .prose-readonly h3 { font-weight: 600; margin: 0.5em 0 0.25em; }
  .prose-readonly h1 { font-size: 1.25em; } .prose-readonly h2 { font-size: 1.15em; } .prose-readonly h3 { font-size: 1.05em; }
  .prose-readonly ul, .prose-readonly ol { margin: 0 0 0.5em 0; padding-left: 1.25em; }
  .prose-readonly a { color: #2563eb; text-decoration: underline; }
  .prose-readonly img { max-width: 100%; height: auto; }
  .prose-readonly pre, .prose-readonly code { white-space: pre-wrap; word-break: break-all; }
`;

const BOARD_COLUMNS = [
  { key: 'ai_interview', label: 'AI Interview', tone: 'border-emerald-300 dark:border-emerald-600', columnClass: 'flex-1 min-w-0' },
  { key: 'intro', label: 'Intro', tone: 'border-zinc-300 dark:border-zinc-600', columnClass: 'flex-1 min-w-0' },
  { key: 'tech', label: 'Tech', tone: 'border-blue-300 dark:border-blue-600', columnClass: 'flex-1 min-w-0' },
  { key: 'hiring_manager', label: 'Hiring Manager', tone: 'border-pink-300 dark:border-pink-600', columnClass: 'flex-1 min-w-0' },
  { key: 'panel', label: 'Panel', tone: 'border-purple-300 dark:border-purple-600', columnClass: 'flex-1 min-w-0' },
  { key: 'final', label: 'Final', tone: 'border-amber-300 dark:border-amber-600', columnClass: 'flex-1 min-w-0' },
  { key: 'rejected', label: 'Rejected', tone: 'border-red-400 dark:border-red-500', columnClass: 'flex-1 min-w-0' },
] as const;

type BoardColumnKey = (typeof BOARD_COLUMNS)[number]['key'];

const BOARD_CARD_STYLES: Record<BoardColumnKey, { card: string; hover: string; accent: string }> = {
  ai_interview: {
    card: 'bg-gradient-to-br from-emerald-50 via-white to-teal-50/80 border-emerald-200/90 dark:from-emerald-950/50 dark:via-zinc-950 dark:to-teal-950/30 dark:border-emerald-800/80',
    hover: 'hover:border-emerald-400 hover:shadow-md hover:shadow-emerald-100/80 dark:hover:border-emerald-500 dark:hover:shadow-emerald-950/40',
    accent: 'bg-emerald-400 dark:bg-emerald-500',
  },
  intro: {
    card: 'bg-gradient-to-br from-slate-50 via-white to-gray-50 border-slate-200 dark:from-zinc-900 dark:via-zinc-950 dark:to-zinc-900/80 dark:border-zinc-700',
    hover: 'hover:border-slate-400 hover:shadow-md hover:shadow-slate-100/80 dark:hover:border-zinc-500 dark:hover:shadow-black/40',
    accent: 'bg-slate-400 dark:bg-zinc-500',
  },
  tech: {
    card: 'bg-gradient-to-br from-blue-50 via-white to-sky-50/80 border-blue-200/90 dark:from-blue-950/50 dark:via-zinc-950 dark:to-sky-950/30 dark:border-blue-800/80',
    hover: 'hover:border-blue-400 hover:shadow-md hover:shadow-blue-100/80 dark:hover:border-blue-500 dark:hover:shadow-blue-950/40',
    accent: 'bg-blue-400 dark:bg-blue-500',
  },
  hiring_manager: {
    card: 'bg-gradient-to-br from-pink-50 via-white to-rose-50/80 border-pink-200/90 dark:from-pink-950/50 dark:via-zinc-950 dark:to-rose-950/30 dark:border-pink-800/80',
    hover: 'hover:border-pink-400 hover:shadow-md hover:shadow-pink-100/80 dark:hover:border-pink-500 dark:hover:shadow-pink-950/40',
    accent: 'bg-pink-400 dark:bg-pink-500',
  },
  panel: {
    card: 'bg-gradient-to-br from-purple-50 via-white to-violet-50/80 border-purple-200/90 dark:from-purple-950/50 dark:via-zinc-950 dark:to-violet-950/30 dark:border-purple-800/80',
    hover: 'hover:border-purple-400 hover:shadow-md hover:shadow-purple-100/80 dark:hover:border-purple-500 dark:hover:shadow-purple-950/40',
    accent: 'bg-purple-400 dark:bg-purple-500',
  },
  final: {
    card: 'bg-gradient-to-br from-amber-50 via-white to-orange-50/80 border-amber-200/90 dark:from-amber-950/50 dark:via-zinc-950 dark:to-orange-950/30 dark:border-amber-800/80',
    hover: 'hover:border-amber-400 hover:shadow-md hover:shadow-amber-100/80 dark:hover:border-amber-500 dark:hover:shadow-amber-950/40',
    accent: 'bg-amber-400 dark:bg-amber-500',
  },
  rejected: {
    card: 'bg-gradient-to-br from-red-50 via-white to-rose-50/80 border-red-200/90 dark:from-red-950/50 dark:via-zinc-950 dark:to-rose-950/30 dark:border-red-800/80',
    hover: 'hover:border-red-400 hover:shadow-md hover:shadow-red-100/80 dark:hover:border-red-500 dark:hover:shadow-red-950/40',
    accent: 'bg-red-500 dark:bg-red-500',
  },
};

/** Visible column counts — 7 pans never all fit; scroll with arrows. */
const BOARD_VISIBLE_WIDE = 5;   // window width > 1440px
const BOARD_VISIBLE_NARROW = 4;
const BOARD_WIDE_MIN_PX = 1441; // >1440px

/** API stage written when a card is dropped on a board column. */
const BOARD_COLUMN_TO_STAGE: Record<BoardColumnKey, string> = {
  ai_interview: 'ai_interview',
  intro: 'intro',
  // Tech pan always opens the sub-stage picker; this fallback is unused.
  tech: 'tech_round_1',
  hiring_manager: 'cultural',
  panel: 'panel',
  final: 'final',
  rejected: 'rejected',
};

function columnDroppableId(columnKey: BoardColumnKey): string {
  return `col:${columnKey}`;
}

function resolveInterviewDropColumn(
  overId: string,
  activeId: string,
  rows: Interview[],
): BoardColumnKey | undefined {
  if (!overId || overId === activeId) return undefined;
  if (overId.startsWith('col:')) {
    const key = overId.slice(4);
    if (BOARD_COLUMNS.some((c) => c.key === key)) return key as BoardColumnKey;
  }
  const overIv = rows.find((i) => i._id === overId);
  if (overIv) return boardColumnForStage(overIv.stage);
  return undefined;
}

/** Prefer column droppables so cards land in the pan under the pointer, not on themselves. */
const interviewBoardCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  const columnHit = pointerCollisions.find((c) => String(c.id).startsWith('col:'));
  if (columnHit) return [columnHit];

  const cardHit = pointerCollisions.find(
    (c) => !String(c.id).startsWith('col:') && String(c.id) !== String(args.active.id),
  );
  if (cardHit) return [cardHit];

  const rectCollisions = rectIntersection(args);
  const columnRect = rectCollisions.find((c) => String(c.id).startsWith('col:'));
  if (columnRect) return [columnRect];

  return pointerCollisions.length > 0 ? pointerCollisions : closestCorners(args);
};

function boardColumnForStage(stage?: string | null): BoardColumnKey {
  switch (stage) {
    case 'ai_interview':
      return 'ai_interview';
    case 'tech':
    case 'tech1':
    case 'tech2':
    case 'tech_round_1':
    case 'tech_round_2':
    case 'live_coding':
    case 'system_design':
    case 'home_assessment':
      return 'tech';
    case 'cultural':
    case 'hiring_manager':
      return 'hiring_manager';
    case 'panel':
      return 'panel';
    case 'final':
    case 'offer':
      return 'final';
    case 'rejected':
      return 'rejected';
    case 'intro':
    case 'others':
    default:
      return 'intro';
  }
}

const STATUSES = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'completed', label: 'Completed' },
  { value: 'passed', label: 'Passed' },
  { value: 'failed', label: 'Failed' },
  { value: 'no_show', label: 'No Show' },
  { value: 'rescheduled', label: 'Rescheduled' },
  { value: 'canceled', label: 'Canceled' },
];

const statusBadgeClass = (s?: string | null) => {
  switch (s) {
    case 'scheduled': return 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800';
    case 'completed': return 'bg-zinc-100 dark:bg-zinc-800 text-body border-zinc-200 dark:border-zinc-700';
    case 'passed': return 'bg-green-100 text-green-800 border-green-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800';
    case 'failed': return 'bg-red-100 text-red-800 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800';
    case 'no_show': return 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-950/50 dark:text-orange-300 dark:border-orange-800';
    case 'rescheduled': return 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800';
    case 'canceled': return 'bg-zinc-200 text-body border-zinc-300 dark:bg-zinc-700 dark:border-zinc-600 dark:text-zinc-300';
    default: return 'bg-zinc-50 dark:bg-zinc-900/80 text-muted border-zinc-200 dark:border-zinc-700';
  }
};

const statusLabel = (v?: string | null) =>
  v ? STATUSES.find((s) => s.value === v)?.label ?? v : '—';

function boardStatusLabel(status?: string | null): string {
  if (status === 'scheduled' || status === 'rescheduled') return 'Scheduled';
  if (status === 'completed') return 'Completed';
  return statusLabel(status);
}

function boardStatusClass(status?: string | null): string {
  if (status === 'scheduled' || status === 'rescheduled') {
    return 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800';
  }
  if (status === 'completed') {
    return 'bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700';
  }
  return statusBadgeClass(status);
}

type ModalMode = 'create' | 'read' | 'update' | 'delete' | null;

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function tzAbbrev(d: Date): string {
  // "GMT-04:00" or named like "EDT" via toLocaleDateString long timezone name.
  const parts = new Intl.DateTimeFormat(undefined, {
    timeZoneName: 'short',
  }).formatToParts(d);
  const tz = parts.find((p) => p.type === 'timeZoneName')?.value || '';
  return tz;
}

function fmt24(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** "May 2, 15:00 - 15:30, EST" */
function formatPretty(startIso: string, endIso?: string | null): string {
  if (!startIso) return '—';
  const s = new Date(startIso);
  if (isNaN(s.getTime())) return '—';
  const datePart = `${MONTH_NAMES[s.getMonth()]} ${s.getDate()}`;
  const tz = tzAbbrev(s);
  if (!endIso) return `${datePart}, ${fmt24(s)}, ${tz}`;
  const e = new Date(endIso);
  if (isNaN(e.getTime())) return `${datePart}, ${fmt24(s)}, ${tz}`;
  if (s.toDateString() !== e.toDateString()) {
    const dateE = `${MONTH_NAMES[e.getMonth()]} ${e.getDate()}`;
    return `${datePart}, ${fmt24(s)} – ${dateE}, ${fmt24(e)}, ${tz}`;
  }
  return `${datePart}, ${fmt24(s)} - ${fmt24(e)}, ${tz}`;
}

const formatScheduled = (iso: string) => formatPretty(iso);

/** Stages excluded from the board “interviews total” round count. */
const ROUND_COUNT_EXCLUDED = new Set(['ai_interview', 'rejected', 'home_assessment']);

/** Display order + short labels for the total breakdown. */
const ROUND_BREAKDOWN_GROUPS: Array<{ key: string; label: string; match: (stage: string) => boolean }> = [
  { key: 'intro', label: 'Intro', match: (s) => s === 'intro' },
  {
    key: 'tech',
    label: 'Tech',
    match: (s) =>
      s === 'tech'
      || s === 'tech1'
      || s === 'tech2'
      || s === 'tech_round_1'
      || s === 'tech_round_2'
      || s === 'live_coding'
      || s === 'system_design',
    // home_assessment excluded via ROUND_COUNT_EXCLUDED
  },
  {
    key: 'hiring',
    label: 'Hiring',
    match: (s) => s === 'cultural' || s === 'hiring_manager',
  },
  { key: 'panel', label: 'Panel', match: (s) => s === 'panel' },
  { key: 'final', label: 'Final', match: (s) => s === 'final' || s === 'offer' },
];

function roundBreakdownGroupKey(stage: string): string | null {
  if (ROUND_COUNT_EXCLUDED.has(stage)) return null;
  const group = ROUND_BREAKDOWN_GROUPS.find((g) => g.match(stage));
  return group?.key ?? null;
}

/** YYYY-MM-DD for comparing badge dates against the From/To filter. */
function movementDateKey(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  // Prefer calendar prefix so timezone conversion cannot move the day.
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const d = new Date(raw);
  if (isNaN(d.getTime())) return undefined;
  return toDateInputValue(d);
}

function dateInSelectedRange(dateKey: string | undefined, fromDate?: string, toDate?: string): boolean {
  if (!dateKey) return false;
  if (fromDate && dateKey < fromDate) return false;
  if (toDate && dateKey > toDate) return false;
  return true;
}

/** Stage values that satisfy the board Stage filter. */
function stageFilterMatchSet(filter: string): Set<string> | null {
  if (!filter) return null;
  if (filter === 'tech') {
    return new Set<string>([
      'tech',
      'tech1',
      'tech2',
      ...TECH_SUB_STAGE_VALUES,
    ]);
  }
  const n = normalizeInterviewStage(filter);
  const set = new Set<string>([filter, n].filter(Boolean));
  if (n === 'cultural' || filter === 'hiring_manager') {
    set.add('cultural');
    set.add('hiring_manager');
  }
  return set;
}

/**
 * Dated rounds for filter/count — each badge keeps its own date.
 * Current interview.scheduledAt only applies to the current tip stage.
 */
function getStrictDatedRounds(iv: Interview): MovementEntry[] {
  const trail: MovementEntry[] = [];
  const push = (stageRaw?: string | null, dateRaw?: string | null) => {
    const stage = normalizeInterviewStage(stageRaw);
    if (!stage) return;
    const scheduledAt = movementDateKey(dateRaw);
    const tip = trail[trail.length - 1];
    if (tip?.stage === stage) {
      if (scheduledAt) tip.scheduledAt = scheduledAt;
      return;
    }
    trail.push({ stage, ...(scheduledAt ? { scheduledAt } : {}) });
  };
  for (const h of iv.stageHistory ?? []) {
    // History entries must keep their own dates — never fill from interview.scheduledAt.
    push(h.stage, h.scheduledAt ?? null);
  }
  push(iv.stage, iv.scheduledAt);
  return trail;
}

/** True when this card should appear for the current Stage + date filters. */
function interviewMatchesBoardFilters(
  iv: Interview,
  stageFilter: string,
  fromDate?: string,
  toDate?: string,
): boolean {
  const rounds = getStrictDatedRounds(iv);
  const matchSet = stageFilterMatchSet(stageFilter);

  if (matchSet) {
    // Stage filter: must have that badge; when a date range is set, that badge's date must be in range.
    return rounds.some((e) => {
      if (!matchSet.has(e.stage)) return false;
      if (fromDate || toDate) return dateInSelectedRange(e.scheduledAt, fromDate, toDate);
      return true;
    });
  }

  if (fromDate || toDate) {
    // Date-only: any badge whose own date falls in range.
    return rounds.some((e) => dateInSelectedRange(e.scheduledAt, fromDate, toDate));
  }
  return true;
}

/**
 * Count interview rounds (stage badges) whose scheduled date falls in [from, to].
 * When a Stage filter is set, only badges of that stage are counted
 * (e.g. Intro filter → Intro only, not later Hiring/Tech on the same card).
 * Tech = round 1/2 + live coding + system design (never Home Assessment).
 * Rejected + Scheduled = canceled — counted separately (not in the main total).
 */
function countInterviewRoundsInRange(
  rows: Interview[],
  fromDate?: string,
  toDate?: string,
  stageFilter?: string,
): { total: number; breakdown: Array<{ label: string; count: number }>; canceled: number } {
  const counts: Record<string, number> = {};
  for (const g of ROUND_BREAKDOWN_GROUPS) counts[g.key] = 0;
  const matchSet = stageFilterMatchSet(stageFilter || '');
  const showCanceled = !stageFilter || stageFilter === 'rejected';

  let total = 0;
  let canceled = 0;
  for (const iv of rows) {
    const isCanceled =
      (iv.status || '') === 'scheduled' && normalizeInterviewStage(iv.stage) === 'rejected';

    if (isCanceled) {
      if (!showCanceled) continue;
      const inRange =
        !(fromDate || toDate)
        || dateInSelectedRange(movementDateKey(iv.scheduledAt), fromDate, toDate)
        || getStrictDatedRounds(iv).some((e) => dateInSelectedRange(e.scheduledAt, fromDate, toDate));
      if (inRange) canceled += 1;
      continue;
    }

    for (const entry of getStrictDatedRounds(iv)) {
      if (ROUND_COUNT_EXCLUDED.has(entry.stage)) continue;
      if (matchSet && !matchSet.has(entry.stage)) continue;
      if (!dateInSelectedRange(entry.scheduledAt, fromDate, toDate)) continue;
      const groupKey = roundBreakdownGroupKey(entry.stage);
      if (!groupKey) continue;
      counts[groupKey] = (counts[groupKey] || 0) + 1;
      total += 1;
    }
  }

  const breakdown = ROUND_BREAKDOWN_GROUPS
    .map((g) => ({ label: g.label, count: counts[g.key] || 0 }))
    .filter((x) => x.count > 0);

  return { total, breakdown, canceled };
}

/** YYYY-MM-DD for date inputs from an interview's scheduledAt. */
function interviewDateInput(iv: { scheduledAt?: string | null }): string {
  const raw = iv.scheduledAt;
  if (!raw) return toDateInputValue(new Date());
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return toDateInputValue(new Date());
  return toDateInputValue(d);
}

/** Keep existing clock times when only the calendar date changes on a board move. */
function scheduleFromInterviewDate(
  iv: { scheduledAt?: string | null; endsAt?: string | null },
  date: string,
): { scheduledAt: string; endsAt: string } {
  const start = splitDateTime(iv.scheduledAt || '');
  const end = splitDateTime(iv.endsAt || '');
  return schedulePayload(date, start.time || '09:00', end.time || '10:00');
}

export default function InterviewsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const meId = user?.id ?? '';

  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // User filter defaults to the logged-in user once auth hydrates.
  const [creatorId, setCreatorId] = useState('');
  const [userFilterReady, setUserFilterReady] = useState(false);
  useEffect(() => {
    if (!userFilterReady && meId) {
      setCreatorId(meId);
      setUserFilterReady(true);
    }
  }, [meId, userFilterReady]);

  const [accountId, setAccountId] = useState('');
  const [stage, setStage] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [datePreset, setDatePreset] = useState<DateRangePreset>('this_week');
  const [from, setFrom] = useState(() => currentWeekdayRange().from);
  const [to, setTo] = useState(() => currentWeekdayRange().to);

  const applyDatePreset = (preset: DateRangePreset) => {
    setDatePreset(preset);
    setBoardOffset(0);
    if (preset === 'custom') return;
    const range = rangeForDatePreset(preset);
    setFrom(range.from);
    setTo(range.to);
  };
  const sort: 'desc' = 'desc';
  const [boardOffset, setBoardOffset] = useState(0);
  const [visibleColumnCount, setVisibleColumnCount] = useState(
    () => (typeof window !== 'undefined' && window.innerWidth >= BOARD_WIDE_MIN_PX
      ? BOARD_VISIBLE_WIDE
      : BOARD_VISIBLE_NARROW),
  );

  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${BOARD_WIDE_MIN_PX}px)`);
    const onChange = () => {
      const count = mq.matches ? BOARD_VISIBLE_WIDE : BOARD_VISIBLE_NARROW;
      setVisibleColumnCount(count);
      setBoardOffset((prev) => Math.min(prev, Math.max(0, BOARD_COLUMNS.length - count)));
    };
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  const boardPageSize = 500;

  const { data, mutate, isLoading, error: loadError } = useSWR(
    ['interviews', creatorId, accountId, stage, statusFilter, from, to, sort, boardPageSize] as const,
    () => api.listInterviews({
      page: 1,
      limit: boardPageSize,
      sort,
      ...(creatorId ? { creatorId } : {}),
      ...(accountId ? { accountId } : {}),
      ...(stage ? { stage } : {}),
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    }),
    { revalidateOnFocus: false },
  );

  const { data: accountsLookup } = useSWR(['accounts-lookup'], () => api.lookupAccounts());
  const accounts = accountsLookup?.accounts ?? [];

  // Owner-scoped accounts for the create/update form. Backend returns the user's own
  // accounts for staff and ALL accounts for admin.
  const { data: ownAccountsData } = useSWR(['accounts-own'], () => api.listAccounts({ limit: 1000 }));
  const ownAccounts = (ownAccountsData?.accounts as Array<{
    _id: string;
    name?: string;
    title?: string;
    resumes?: Array<{ id: string; filename: string }>;
  }>) || [];

  const { data: usersData } = useSWR(['users-lookup', 'staff-only'], () => api.lookupUsers({ excludeRole: 'admin' }));
  const users = (usersData?.users as Array<{ _id: string; name?: string | null; email?: string | null }>) || [];

  const interviewsRaw = (data?.interviews as Interview[]) || [];
  const pagination = data?.pagination;

  const interviews = useMemo(
    () =>
      interviewsRaw.filter((iv) =>
        interviewMatchesBoardFilters(iv, stage, from || undefined, to || undefined),
      ),
    [interviewsRaw, stage, from, to],
  );

  const interviewRoundStats = useMemo(
    () => countInterviewRoundsInRange(interviews, from || undefined, to || undefined, stage || undefined),
    [interviews, from, to, stage],
  );
  const interviewRoundTotal = interviewRoundStats.total;
  const interviewRoundBreakdown = interviewRoundStats.breakdown;
  const interviewCanceledTotal = interviewRoundStats.canceled;

  const boardBuckets = useMemo(() => {
    const buckets = Object.fromEntries(
      BOARD_COLUMNS.map((col) => [col.key, [] as Interview[]]),
    ) as Record<BoardColumnKey, Interview[]>;
    for (const iv of interviews) {
      const key = boardColumnForStage(iv.stage);
      buckets[key].push(iv);
    }
    for (const col of BOARD_COLUMNS) {
      buckets[col.key].sort(
        (a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime(),
      );
    }
    return buckets;
  }, [interviews]);

  const visibleColumns = BOARD_COLUMNS.slice(boardOffset, boardOffset + visibleColumnCount);
  const canBoardPrev = boardOffset > 0;
  const canBoardNext = boardOffset + visibleColumnCount < BOARD_COLUMNS.length;

  /** Shift the visible window so the given pan is on screen. */
  const revealBoardColumn = (colKey: BoardColumnKey) => {
    const idx = BOARD_COLUMNS.findIndex((c) => c.key === colKey);
    if (idx < 0) return;
    setBoardOffset((prev) => {
      if (idx < prev) return idx;
      if (idx >= prev + visibleColumnCount) return idx - visibleColumnCount + 1;
      return prev;
    });
  };

  useEffect(() => {
    if (!stage) return;
    const colKey = boardColumnForStage(stage);
    if (!colKey) return;
    revealBoardColumn(colKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to stage / width changes
  }, [stage, visibleColumnCount]);

  // Modal state
  const [mode, setMode] = useState<ModalMode>(null);
  const [active, setActive] = useState<Interview | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [panelInterview, setPanelInterview] = useState<Interview | null>(null);
  const [panelForm, setPanelForm] = useState<InterviewFormState>(blankInterviewForm);
  const [panelSaving, setPanelSaving] = useState(false);
  const [panelError, setPanelError] = useState('');

  const blankForm = blankInterviewForm;

  const [form, setForm] = useState<InterviewFormState>(blankInterviewForm);

  useEffect(() => {
    if (mode === 'create') {
      setForm(blankForm());
      setError('');
    } else if ((mode === 'update' || mode === 'read') && active) {
      setForm(interviewToForm(active));
      setError('');
    }
  }, [mode, active]);

  const closeModal = () => {
    setMode(null);
    setActive(null);
    setError('');
  };

  const openPanel = (iv: Interview) => {
    setPanelInterview(iv);
    setPanelForm(interviewToForm(iv));
    setPanelError('');
  };

  const closePanel = () => {
    setPanelInterview(null);
    setPanelError('');
  };

  const openCreate = () => { closePanel(); setActive(null); setMode('create'); };
  const openUpdate = (iv: Interview) => {
    closePanel();
    setForm(interviewToForm(iv));
    setActive(iv);
    setMode('update');
    setError('');
  };
  const openDelete = (iv: Interview) => { setActive(iv); setMode('delete'); };

  const openTranscript = (iv: Interview) => {
    navigate(`/interviews/${iv._id}`);
  };

  // Honor `?edit=:id` so the detail page can hand off to the edit modal.
  const editParam = searchParams.get('edit');
  const panelParam = searchParams.get('panel');

  useEffect(() => {
    if (!panelParam) return;
    const fromList = (data?.interviews as Interview[] | undefined)?.find((i) => i._id === panelParam);
    const clearPanelParam = () => {
      const next = new URLSearchParams(searchParams);
      next.delete('panel');
      setSearchParams(next, { replace: true });
    };
    if (fromList) {
      openPanel(fromList);
      clearPanelParam();
      return;
    }
    let cancelled = false;
    api.getInterview(panelParam)
      .then((iv) => {
        if (cancelled) return;
        openPanel(iv as unknown as Interview);
        clearPanelParam();
      })
      .catch(() => {
        if (!cancelled) clearPanelParam();
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelParam, data]);

  useEffect(() => {
    if (!editParam || mode !== null) return;
    const fromList = (data?.interviews as Interview[] | undefined)?.find((i) => i._id === editParam);
    if (fromList) {
      openUpdate(fromList);
      const next = new URLSearchParams(searchParams);
      next.delete('edit');
      setSearchParams(next, { replace: true });
      return;
    }
    let cancelled = false;
    api.getInterview(editParam)
      .then((iv) => {
        if (cancelled) return;
        openUpdate(iv as unknown as Interview);
        const next = new URLSearchParams(searchParams);
        next.delete('edit');
        setSearchParams(next, { replace: true });
      })
      .catch(() => { /* leave param; user can retry */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editParam, data]);

  const save = async () => {
    if (mode === 'create' && !form.accountId) {
      notify.error('Select a profile (account)');
      return;
    }
    if (!form.date) {
      notify.error('Select a scheduled date');
      return;
    }
    if (form.stage === 'tech' && !form.techSubStage) {
      notify.error('Select a Tech sub-stage');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const body = buildSaveBody(form);
      const account = ownAccounts.find((a) => a._id === form.accountId);
      const accountLabel = account?.name || account?.title || 'account';
      const resolvedStage = resolveInterviewStage(form.stage, form.techSubStage);
      const stageText = resolvedStage ? `${stageLabel(resolvedStage)} ` : '';
      if (mode === 'update' && active) {
        await api.updateInterview(active._id, body);
        notify.success(`${stageText}interview for ${accountLabel} updated successfully`);
      } else {
        await api.createInterview(body);
        notify.success(`${stageText}interview for ${accountLabel} created successfully`);
      }
      closeModal();
      mutate();
    } catch (err) {
      notify.error(err, 'Failed to save interview');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!active) return;
    setSaving(true);
    try {
      await api.deleteInterview(active._id);
      notify.success('Interview deleted');
      if (panelInterview?._id === active._id) closePanel();
      closeModal();
      mutate();
    } catch (err) {
      notify.error(err, 'Failed to delete interview');
    } finally {
      setSaving(false);
    }
  };

  const savePanel = async () => {
    if (!panelInterview) return;
    if (!panelForm.date) {
      notify.error('Select a scheduled date');
      return;
    }
    if (panelForm.stage === 'tech' && !panelForm.techSubStage) {
      notify.error('Select a Tech sub-stage');
      return;
    }
    if (!canEdit(panelInterview)) {
      notify.error('You cannot edit this interview');
      return;
    }
    setPanelSaving(true);
    setPanelError('');
    try {
      const updated = await api.updateInterview(panelInterview._id, buildSaveBody(panelForm));
      notify.success('Interview updated');
      setPanelInterview(updated as unknown as Interview);
      setPanelForm(interviewToForm(updated as unknown as Interview));
      mutate();
    } catch (err) {
      notify.error(err, 'Failed to save interview');
    } finally {
      setPanelSaving(false);
    }
  };

  const canEdit = (iv: Interview): boolean => {
    if (isAdmin) return true;
    const createdById = typeof iv.createdBy === 'string' ? iv.createdBy : iv.createdBy?._id;
    return createdById === meId;
  };

  const handleBoardPrev = () => setBoardOffset((o) => Math.max(0, o - 1));
  const handleBoardNext = () => setBoardOffset((o) => Math.min(BOARD_COLUMNS.length - visibleColumnCount, o + 1));

  const [activeDragInterview, setActiveDragInterview] = useState<Interview | null>(null);
  const [dropTargetColumn, setDropTargetColumn] = useState<BoardColumnKey | null>(null);
  /** Confirm dialog after dropping a card onto another pan (Tech includes sub-stage radios). */
  const [movePrompt, setMovePrompt] = useState<null | {
    interview: Interview;
    kind: 'tech' | 'stage';
    targetStage: string;
    label: string;
  }>(null);
  const [moveSubStage, setMoveSubStage] = useState('');
  const [moveDate, setMoveDate] = useState('');
  const [moveSaving, setMoveSaving] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const syncInterviewForms = (ivId: string, updated: Interview) => {
    if (panelInterview?._id === ivId) {
      setPanelInterview(updated);
      setPanelForm(interviewToForm(updated));
    }
    if (active?._id === ivId) {
      setActive(updated);
      setForm(interviewToForm(updated));
    }
  };

  const applyStageMove = async (
    iv: Interview,
    newStage: string,
    label: string,
    scheduledDate?: string,
  ) => {
    const ivId = iv._id;
    const previousData = data;
    const prevStage = iv.stage || undefined;
    const tipDate = scheduledDate || (() => {
      const raw = iv.scheduledAt;
      if (!raw) return undefined;
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
      const d = new Date(raw);
      if (isNaN(d.getTime())) return undefined;
      return toDateInputValue(d);
    })();
    const schedulePatch = scheduledDate ? scheduleFromInterviewDate(iv, scheduledDate) : null;

    mutate(
      (current) => {
        if (!current) return current;
        return {
          ...current,
          interviews: (current.interviews as Interview[]).map((item) => {
            if (item._id !== ivId) return item;
            let nextHistory = getInterviewMovementEntries(item);
            if (prevStage && nextHistory.length === 0) {
              nextHistory = [{ stage: prevStage, ...(item.scheduledAt ? { scheduledAt: interviewDateInput(item) } : {}) }];
            } else if (prevStage && nextHistory[nextHistory.length - 1]?.stage !== prevStage) {
              nextHistory = [
                ...nextHistory,
                { stage: prevStage, ...(item.scheduledAt ? { scheduledAt: interviewDateInput(item) } : {}) },
              ];
            }
            nextHistory = withCurrentStageInHistory(nextHistory, newStage, tipDate);
            return {
              ...item,
              stage: newStage,
              stageHistory: nextHistory,
              ...(schedulePatch
                ? { scheduledAt: schedulePatch.scheduledAt, endsAt: schedulePatch.endsAt }
                : {}),
            };
          }),
        };
      },
      { revalidate: false },
    );

    try {
      const body: Record<string, unknown> = { stage: newStage };
      if (schedulePatch) {
        body.scheduledAt = schedulePatch.scheduledAt;
        body.endsAt = schedulePatch.endsAt;
      }
      const updated = await api.updateInterview(iv._id, body);
      syncInterviewForms(ivId, updated as unknown as Interview);
      if (stage && stage !== newStage && !isTechBoardStage(stage)) setStage('');
      await mutate();
      notify.success(`Moved to ${label}`);
    } catch (err) {
      mutate(previousData, { revalidate: false });
      notify.error(err, 'Failed to move interview');
    }
  };

  const onInterviewDragStart = (e: DragStartEvent) => {
    const iv = interviews.find((i) => i._id === String(e.active.id));
    setActiveDragInterview(iv ?? null);
    setDropTargetColumn(null);
  };

  const onInterviewDragOver = (e: DragOverEvent) => {
    if (!e.over) {
      setDropTargetColumn(null);
      return;
    }
    const col = resolveInterviewDropColumn(String(e.over.id), String(e.active.id), interviews);
    setDropTargetColumn(col ?? null);
  };

  const closeMovePrompt = () => {
    if (moveSaving) return;
    setMovePrompt(null);
    setMoveSubStage('');
    setMoveDate('');
  };

  const onInterviewDragEnd = async (e: DragEndEvent) => {
    setActiveDragInterview(null);
    const ivId = String(e.active.id);
    const iv = interviews.find((i) => i._id === ivId);
    const targetCol = dropTargetColumn
      ?? (e.over ? resolveInterviewDropColumn(String(e.over.id), ivId, interviews) : undefined);
    setDropTargetColumn(null);
    if (!iv || !targetCol) return;
    if (!canEdit(iv)) {
      notify.error('You cannot move this interview');
      return;
    }
    const sourceCol = boardColumnForStage(iv.stage);

    // Dropping onto Tech always opens the sub-stage + date picker (including Tech → Tech).
    if (targetCol === 'tech') {
      setMovePrompt({ interview: iv, kind: 'tech', targetStage: '', label: 'Tech' });
      setMoveSubStage(toTechSubStage(iv.stage) || TECH_SUB_STAGES[0].value);
      setMoveDate(interviewDateInput(iv));
      return;
    }

    if (targetCol === sourceCol) return;
    const newStage = BOARD_COLUMN_TO_STAGE[targetCol];
    const colLabel = BOARD_COLUMNS.find((c) => c.key === targetCol)?.label ?? stageLabel(newStage);
    setMovePrompt({ interview: iv, kind: 'stage', targetStage: newStage, label: colLabel });
    setMoveDate(interviewDateInput(iv));
  };

  const confirmMovePrompt = async () => {
    if (!movePrompt) return;
    if (!moveDate) {
      notify.error('Select a scheduled date');
      return;
    }
    const newStage = movePrompt.kind === 'tech' ? moveSubStage : movePrompt.targetStage;
    if (!newStage) {
      notify.error(movePrompt.kind === 'tech' ? 'Select a Tech sub-stage' : 'Select a stage');
      return;
    }
    const label = movePrompt.kind === 'tech' ? stageLabel(newStage) : movePrompt.label;
    const sameStage = movePrompt.interview.stage === newStage;
    const sameDate = interviewDateInput(movePrompt.interview) === moveDate;
    if (sameStage && sameDate) {
      closeMovePrompt();
      return;
    }
    setMoveSaving(true);
    try {
      await applyStageMove(movePrompt.interview, newStage, label, moveDate);
      setMovePrompt(null);
      setMoveSubStage('');
      setMoveDate('');
    } finally {
      setMoveSaving(false);
    }
  };

  const resetFiltersPage = () => setBoardOffset(0);

  const userAccounts = useMemo(() => {
    if (!creatorId) return accounts;
    return accounts.filter((a) => a.createdBy === creatorId);
  }, [accounts, creatorId]);

  const accountOptions = useMemo(() => [
    { value: '', label: 'All' },
    ...userAccounts.map((a) => ({ value: a._id, label: a.name || a._id })),
  ], [userAccounts]);

  // Form-only account list — owner-scoped (admin sees all, staff sees own).
  const accountSelectOptions = useMemo(() =>
    ownAccounts.map((a) => ({ value: a._id, label: a.name || a._id })),
  [ownAccounts]);

  const userOptions = useMemo(() => [
    { value: '', label: 'All' },
    ...users.map((u) => ({ value: u._id, label: u.name || u.email || u._id })),
  ], [users]);

  const stageOptions = useMemo(() => [
    { value: '', label: 'All' },
    ...BOARD_FORM_STAGES,
  ], []);

  const statusOptions = useMemo(() => [
    { value: '', label: 'All' },
    ...FORM_STATUSES,
  ], []);

  const stageFormOptions = useMemo(() => [
    { value: '', label: '— None —' },
    ...BOARD_FORM_STAGES,
  ], []);

  const techSubStageOptions = useMemo(() => [...TECH_SUB_STAGES], []);

  const statusFormOptions = useMemo(() => [
    { value: '', label: '— None —' },
    ...FORM_STATUSES,
  ], []);

  return (
    <>
      <style>{editorStyles}</style>
      <div className="space-y-6">
      <PageHeader
        title="Interviews"
        action={
          <button type="button" className="btn" onClick={openCreate}>
            <Plus size={16} className="mr-2" /> Create
          </button>
        }
      />

      <InterviewTabs />

      <div className="space-y-6">
      {/* Filters */}
      <div className="flex items-end gap-3 flex-wrap panel px-4 py-3">
        <div className="w-44">
          <label className="block text-xs text-muted mb-1">User</label>
          <Select
            value={creatorId}
            onChange={(v) => {
              setCreatorId(v);
              setAccountId('');
              resetFiltersPage();
            }}
            options={userOptions}
          />
        </div>
        <div className="w-44">
          <label className="block text-xs text-muted mb-1">Profile</label>
          <Select value={accountId} onChange={(v) => { setAccountId(v); resetFiltersPage(); }} options={accountOptions} />
        </div>
        <div className="w-36">
          <label className="block text-xs text-muted mb-1">Stage</label>
          <Select value={stage} onChange={(v) => { setStage(v); resetFiltersPage(); }} options={stageOptions} />
        </div>
        <div className="w-36">
          <label className="block text-xs text-muted mb-1">Status</label>
          <Select value={statusFilter} onChange={(v) => { setStatusFilter(v); resetFiltersPage(); }} options={statusOptions} />
        </div>
        <div className="w-44">
          <label className="block text-xs text-muted mb-1">Date range</label>
          <Select
            value={datePreset}
            onChange={(v) => applyDatePreset(v as DateRangePreset)}
            options={DATE_RANGE_PRESET_OPTIONS}
          />
        </div>
        {datePreset === 'custom' ? (
          <>
            <div className="w-40">
              <label className="block text-xs text-muted mb-1">From</label>
              <input className="input w-full text-sm" type="date" value={from} onChange={(e) => { setFrom(e.target.value); resetFiltersPage(); }} />
            </div>
            <div className="w-40">
              <label className="block text-xs text-muted mb-1">To</label>
              <input className="input w-full text-sm" type="date" value={to} onChange={(e) => { setTo(e.target.value); resetFiltersPage(); }} />
            </div>
          </>
        ) : (
          from && to && (
            <div className="flex items-end pb-2 min-w-0">
              <span className="text-sm text-muted tabular-nums whitespace-nowrap" title={`${from} → ${to}`}>
                {formatDateRangeText(from, to)}
              </span>
            </div>
          )
        )}
      </div>

      {/* Total — counts stage rounds in the date range (not cards). Excludes AI / Home Assessment / Rejected. */}
      {data && (
        <div className="text-sm text-body">
          <span>
            Showing{' '}
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">{interviewRoundTotal}</span>
            {' '}interview{interviewRoundTotal !== 1 ? 's' : ''} total
            {interviewRoundBreakdown.length > 0 && (
              <span className="text-muted">
                {' '}({interviewRoundBreakdown.map((x) => `${x.label}-${x.count}`).join(', ')})
              </span>
            )}
            {interviewCanceledTotal > 0 && (
              <>
                <span className="text-faint"> / </span>
                <span className="font-semibold text-red-600 dark:text-red-400">Canceled-{interviewCanceledTotal}</span>
              </>
            )}
          </span>
          {(pagination?.total ?? 0) > boardPageSize && (
            <span className="text-amber-700 dark:text-amber-400 ml-2">
              (first {boardPageSize} cards loaded — narrow filters to see more)
            </span>
          )}
        </div>
      )}

      {/* Board — Pipeline-style kanban */}
      {isLoading && !data ? (
        <div className="panel p-6 flex items-center gap-2 text-sm text-muted">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading interviews…
        </div>
      ) : loadError ? (
        <div className="panel border-red-200 dark:border-red-900/50 p-6 text-sm text-red-600 dark:text-red-400">
          Failed to load interviews. Try refreshing the page.
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3 w-full">
            <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={handleBoardPrev}
                  disabled={!canBoardPrev}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border border-zinc-200 bg-white text-zinc-600 shadow-sm hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  aria-label="Show previous columns"
                >
                  <ChevronLeft size={16} />
                </button>

                <nav
                  className="relative w-1/2 min-w-0 select-none"
                  aria-label="Interview stages"
                >
                  <div
                    className="grid"
                    style={{ gridTemplateColumns: `repeat(${BOARD_COLUMNS.length}, minmax(0, 1fr))` }}
                  >
                    {BOARD_COLUMNS.map((c, idx) => {
                      const isVisible = idx >= boardOffset && idx < boardOffset + visibleColumnCount;
                      return (
                        <button
                          key={c.key}
                          type="button"
                          onClick={() => revealBoardColumn(c.key)}
                          className={`relative z-[1] truncate px-1 pb-3 pt-1 text-center text-[11px] sm:text-xs transition-colors duration-200 ${
                            isVisible
                              ? 'font-semibold text-zinc-900 dark:text-zinc-100'
                              : 'font-medium text-zinc-400 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-300'
                          }`}
                          title={isVisible ? `${c.label} (showing)` : `Show ${c.label}`}
                          aria-current={isVisible ? 'true' : undefined}
                        >
                          {c.label}
                        </button>
                      );
                    })}
                  </div>
                  {/* Base track */}
                  <div
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-1 rounded-full bg-zinc-200 dark:bg-zinc-700"
                    aria-hidden
                  />
                  {/* Sliding underline for the visible pan window */}
                  <div
                    className="pointer-events-none absolute bottom-0 h-1 rounded-full bg-zinc-800 dark:bg-zinc-200 transition-all duration-300 ease-out"
                    style={{
                      left: `${(boardOffset / BOARD_COLUMNS.length) * 100}%`,
                      width: `${(visibleColumnCount / BOARD_COLUMNS.length) * 100}%`,
                    }}
                    aria-hidden
                  />
                </nav>

                <button
                  type="button"
                  onClick={handleBoardNext}
                  disabled={!canBoardNext}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border border-zinc-200 bg-white text-zinc-600 shadow-sm hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  aria-label="Show next columns"
                >
                  <ChevronRight size={16} />
                </button>
              </div>

            {interviews.length === 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-[12px] px-4 py-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-300">
                No interviews match the current filters.
                {creatorId && ' Try setting User to All, or pick a different profile.'}
              </div>
            )}

            <DndContext
              sensors={sensors}
              collisionDetection={interviewBoardCollisionDetection}
              onDragStart={onInterviewDragStart}
              onDragOver={onInterviewDragOver}
              onDragEnd={onInterviewDragEnd}
              onDragCancel={() => {
                setActiveDragInterview(null);
                setDropTargetColumn(null);
              }}
            >
              <div className="flex gap-4 pb-2 w-full">
                {visibleColumns.map((col) => (
                  <InterviewBoardColumn
                    key={col.key}
                    columnKey={col.key}
                    label={col.label}
                    tone={col.tone}
                    columnClass={col.columnClass}
                    cards={boardBuckets[col.key]}
                    selectedId={panelInterview?._id}
                    isDropTarget={dropTargetColumn === col.key}
                    onCardClick={openPanel}
                    onCardDelete={openDelete}
                    onOpenTranscript={openTranscript}
                    canDelete={canEdit}
                    canDrag={canEdit}
                  />
                ))}
              </div>
              <DragOverlay>
                {activeDragInterview ? (
                  <div className="w-[220px] max-w-full opacity-95">
                    <InterviewBoardCardPreview
                      columnKey={boardColumnForStage(activeDragInterview.stage)}
                      interview={activeDragInterview}
                    />
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          </div>
        </>
      )}
      </div>

      {panelInterview && (
        <>
          <div
            className="fixed inset-0 top-16 bg-black/25 z-40"
            onClick={closePanel}
            aria-hidden
          />
          <InterviewSidePanel
            interview={panelInterview}
            form={panelForm}
            setForm={setPanelForm}
            error={panelError}
            saving={panelSaving}
            editable={canEdit(panelInterview)}
            accountSelectOptions={accountSelectOptions}
            stageFormOptions={stageFormOptions}
            techSubStageOptions={techSubStageOptions}
            statusFormOptions={statusFormOptions}
            onClose={closePanel}
            onSave={savePanel}
            onOpenTranscript={() => openTranscript(panelInterview)}
          />
        </>
      )}

      {/* Create / Update / Read modal */}
      <Modal
        open={mode === 'create' || mode === 'update' || mode === 'read'}
        onClose={closeModal}
        title={
          mode === 'create' ? 'Create Interview'
          : mode === 'update' ? 'Update Interview'
          : 'Interview Details'
        }
      >
        <div className="space-y-6">
          {error && <p className="text-red-600 text-sm">{error}</p>}

          {mode === 'read' ? (
            <>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-muted text-xs">Profile</div>
                  <div className="font-medium">
                    {(() => {
                      const a = accounts.find((x) => x._id === form.accountId);
                      return a ? (a.name || a._id) : form.accountId || '—';
                    })()}
                  </div>
                </div>
                <div>
                  <div className="text-muted text-xs">Stage</div>
                  <div>
                    {(() => {
                      const displayStage = resolveInterviewStage(form.stage, form.techSubStage) || form.stage;
                      return displayStage ? (
                        <span className={`badge ${stageBadgeClass(displayStage)}`}>
                          {stageLabel(displayStage)}
                        </span>
                      ) : <span className="text-faint">—</span>;
                    })()}
                  </div>
                </div>
                <div>
                  <div className="text-muted text-xs">Status</div>
                  <div>
                    {form.status ? (
                      <span className={`badge ${statusBadgeClass(form.status)}`}>
                        {statusLabel(form.status)}
                      </span>
                    ) : <span className="text-faint">—</span>}
                  </div>
                </div>
                <div>
                  <div className="text-muted text-xs">Company</div>
                  <div className="font-medium">{form.companyName || '—'}</div>
                </div>
                <div>
                  <div className="text-muted text-xs">Interviewer Name</div>
                  <div className="font-medium">{form.interviewerName || '—'}</div>
                </div>
                <div>
                  <div className="text-muted text-xs">Applied Position</div>
                  <div className="font-medium">{form.appliedPosition || '—'}</div>
                </div>
                <div>
                  <div className="text-muted text-xs">Scheduled date</div>
                  <div>{form.date || '—'}</div>
                </div>
              </div>
              <div>
                <div className="text-muted text-xs mb-1">Interview Transcript</div>
                <div
                  className="prose-readonly panel p-4"
                  dangerouslySetInnerHTML={{ __html: form.transcript || '<p class="text-faint italic">—</p>' }}
                />
              </div>
              <div>
                <div className="text-muted text-xs mb-1">Note</div>
                <div
                  className="prose-readonly bg-zinc-50 dark:bg-zinc-900/80"
                  dangerouslySetInnerHTML={{ __html: form.note || '<p class="text-faint italic">—</p>' }}
                />
              </div>
              <div className="flex justify-end pt-3 border-t border-zinc-200 dark:border-zinc-800">
                <button type="button" className="btn" onClick={closeModal}>Close</button>
              </div>
            </>
          ) : (
            <>
              <InterviewFormFields
                form={form}
                setForm={setForm}
                accountSelectOptions={accountSelectOptions}
                stageFormOptions={stageFormOptions}
                techSubStageOptions={techSubStageOptions}
                statusFormOptions={statusFormOptions}
                accountDisabled={mode === 'update' && !!active && !canEdit(active)}
                datalistId="applied-position-suggestions-modal"
              />

              <div className="flex gap-2 justify-end pt-3 border-t border-zinc-200 dark:border-zinc-800">
                <button type="button" className="btn" onClick={closeModal} disabled={saving}>Cancel</button>
                <button
                  type="button"
                  className="btn"
                  onClick={save}
                  disabled={
                    saving
                    || !form.date
                    || (mode === 'create' && !form.accountId)
                    || (form.stage === 'tech' && !form.techSubStage)
                  }
                >
                  {saving ? 'Saving…' : mode === 'update' ? 'Save changes' : 'Create'}
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* Delete confirm modal */}
      <Modal open={mode === 'delete'} onClose={closeModal} title="Delete Interview">
        <div className="space-y-6">
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <p className="text-sm text-body">
            Are you sure you want to delete this interview? This action cannot be undone.
          </p>
          {active && (
            <div className="text-sm text-muted bg-zinc-50 dark:bg-zinc-900/80 p-3 rounded">
              <div><span className="text-muted">Stage:</span> {active.stage ? stageLabel(active.stage) : '—'}</div>
              <div><span className="text-muted">When:</span> {formatScheduled(active.scheduledAt)}</div>
            </div>
          )}
          <div className="flex gap-2 justify-end pt-3 border-t border-zinc-200 dark:border-zinc-800">
            <button type="button" className="btn" onClick={closeModal} disabled={saving}>Cancel</button>
            <button
              type="button"
              className="btn"
              onClick={remove}
              disabled={saving}
              style={{ backgroundColor: '#dc2626', color: 'white' }}
            >
              {saving ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Stage-move confirm: scheduled date (+ Tech sub-stage radios when dropping on Tech) */}
      <Modal
        open={!!movePrompt}
        onClose={closeMovePrompt}
        title={movePrompt?.kind === 'tech' ? 'Select Tech sub-stage' : `Move to ${movePrompt?.label ?? 'stage'}`}
      >
        <div className="space-y-4">
          {movePrompt?.kind === 'tech' ? (
            <>
              <p className="text-sm text-muted">
                Choose which Tech round this interview is in, and the scheduled date for that round.
              </p>
              <div className="space-y-2">
                {TECH_SUB_STAGES.map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex items-center gap-3 rounded-[10px] border px-3 py-2.5 cursor-pointer transition-colors ${
                      moveSubStage === opt.value
                        ? 'border-sky-600 bg-sky-50 dark:border-sky-400 dark:bg-sky-950/40'
                        : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-700 dark:hover:border-zinc-600'
                    }`}
                  >
                    <input
                      type="radio"
                      name="tech-sub-stage"
                      value={opt.value}
                      checked={moveSubStage === opt.value}
                      onChange={() => setMoveSubStage(opt.value)}
                      className="accent-primary"
                    />
                    <span className="text-sm font-medium text-strong">{opt.label}</span>
                  </label>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted">
              Set the scheduled date for <span className="font-medium text-strong">{movePrompt?.label}</span>.
            </p>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">
              Scheduled date <span className="text-red-500">*</span>
            </label>
            <input
              className="input"
              type="date"
              value={moveDate}
              disabled={moveSaving}
              onChange={(e) => setMoveDate(e.target.value)}
            />
          </div>

          <div className="flex gap-2 justify-end pt-3 border-t border-zinc-200 dark:border-zinc-800">
            <button
              type="button"
              className="btn-outline"
              onClick={closeMovePrompt}
              disabled={moveSaving}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn"
              onClick={confirmMovePrompt}
              disabled={moveSaving || !moveDate || (movePrompt?.kind === 'tech' && !moveSubStage)}
            >
              {moveSaving ? 'Moving…' : 'Confirm'}
            </button>
          </div>
        </div>
      </Modal>
      </div>
    </>
  );
}

function InterviewBoardColumn({
  columnKey,
  label,
  tone,
  columnClass,
  cards,
  selectedId,
  isDropTarget,
  onCardClick,
  onCardDelete,
  onOpenTranscript,
  canDelete,
  canDrag,
}: {
  columnKey: BoardColumnKey;
  label: string;
  tone: string;
  columnClass: string;
  cards: Interview[];
  selectedId?: string;
  isDropTarget?: boolean;
  onCardClick: (iv: Interview) => void;
  onCardDelete: (iv: Interview) => void;
  onOpenTranscript: (iv: Interview) => void;
  canDelete: (iv: Interview) => boolean;
  canDrag: (iv: Interview) => boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: columnDroppableId(columnKey) });
  const highlight = isOver || isDropTarget;

  return (
    <div className={`${columnClass} bg-zinc-50 dark:bg-zinc-900/60 rounded-[12px] border-t-4 ${tone} border-x border-b border-zinc-100 dark:border-zinc-800`}>
      <header className="px-3 py-2 flex items-center justify-between text-xs text-zinc-600 dark:text-zinc-400 uppercase tracking-wide font-medium">
        <span className="truncate">{label}</span>
        <span className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded px-1.5 py-0.5 text-[10px] tabular-nums ml-2 shrink-0 text-zinc-700 dark:text-zinc-300">
          {cards.length}
        </span>
      </header>
      <div
        ref={setNodeRef}
        className={`p-2 space-y-2 min-h-[120px] max-h-[calc(100vh-300px)] overflow-y-auto transition-colors ${highlight ? 'bg-primary/5 ring-1 ring-inset ring-primary/20 rounded-b-[12px] dark:bg-sky-500/5 dark:ring-sky-400/20' : ''}`}
      >
        {cards.length === 0 ? (
          <div className="text-xs text-zinc-400 dark:text-zinc-500 text-center py-8">Drop here</div>
        ) : (
          cards.map((iv) => (
            <InterviewBoardCard
              key={iv._id}
              columnKey={columnKey}
              interview={iv}
              isSelected={selectedId === iv._id}
              onClick={() => onCardClick(iv)}
              onDelete={() => onCardDelete(iv)}
              onOpenTranscript={() => onOpenTranscript(iv)}
              deletable={canDelete(iv)}
              draggable={canDrag(iv)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function InterviewBoardCardPreview({
  columnKey,
  interview,
}: {
  columnKey: BoardColumnKey;
  interview: Interview;
}) {
  const account = typeof interview.accountId === 'object' ? interview.accountId : null;
  const profileName = account?.name || account?.email || 'Untitled profile';
  const companyName = interview.companyName || 'Untitled';
  const panStyle = BOARD_CARD_STYLES[columnKey];

  return (
    <div className={`rounded-[10px] p-3 text-sm shadow-md border relative overflow-hidden ${panStyle.card} ring-2 ring-primary dark:ring-sky-400/60`}>
      <span className={`absolute left-0 top-0 bottom-0 w-1 ${panStyle.accent}`} aria-hidden />
      <div className="font-medium text-zinc-900 dark:text-zinc-100 truncate pl-1" title={profileName}>{profileName}</div>
      <div className="mt-1 text-zinc-700 dark:text-zinc-300 truncate pl-1" title={companyName}>{companyName}</div>
      <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400 pl-1">
        {formatScheduledDate(interview.scheduledAt)}
      </div>
      <div className="mt-1.5 pl-1">
        {interview.status ? (
          <span className={`inline-flex items-center px-2 py-0.5 rounded-[8px] text-xs font-medium border ${boardStatusClass(interview.status)}`}>
            {boardStatusLabel(interview.status)}
          </span>
        ) : (
          <span className="text-[11px] text-zinc-400 dark:text-zinc-500">No status</span>
        )}
      </div>
    </div>
  );
}

function InterviewBoardCard({
  columnKey,
  interview,
  isSelected,
  onClick,
  onDelete,
  onOpenTranscript,
  deletable,
  draggable,
}: {
  columnKey: BoardColumnKey;
  interview: Interview;
  isSelected?: boolean;
  onClick: () => void;
  onDelete: () => void;
  onOpenTranscript: () => void;
  deletable: boolean;
  draggable: boolean;
}) {
  const account = typeof interview.accountId === 'object' ? interview.accountId : null;
  const profileName = account?.name || account?.email || 'Untitled profile';
  const companyName = interview.companyName || 'Untitled';
  const panStyle = BOARD_CARD_STYLES[columnKey];

  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({
    id: interview._id,
    disabled: !draggable,
  });
  const { setNodeRef: setDropRef } = useDroppable({ id: interview._id });

  const stop = (e: React.SyntheticEvent) => { e.stopPropagation(); };

  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;

  const setNodeRef = (node: HTMLElement | null) => {
    setDragRef(node);
    setDropRef(node);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(draggable ? listeners : {})}
      {...(draggable ? attributes : { role: 'button', tabIndex: 0 })}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      className={`rounded-[10px] p-3 text-sm shadow-sm border relative overflow-hidden transition-all duration-200 ${panStyle.card} ${panStyle.hover} ${isSelected ? 'ring-2 ring-primary/60 border-primary/40 dark:ring-sky-400/50 dark:border-sky-500/40' : ''} ${isDragging ? 'opacity-40' : ''} ${draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
    >
      <span className={`absolute left-0 top-0 bottom-0 w-1 ${panStyle.accent}`} aria-hidden />
      <div className="absolute top-2 right-2 flex items-center gap-0.5">
        <button
          type="button"
          onClick={(e) => { stop(e); onOpenTranscript(); }}
          onPointerDown={stop}
          className="p-1 rounded-[6px] text-zinc-400 hover:text-sky-600 hover:bg-sky-50 dark:hover:text-sky-400 dark:hover:bg-sky-950/50"
          title="Open transcript"
          aria-label="Open transcript"
        >
          <FileText size={14} />
        </button>
        {deletable && (
          <button
            type="button"
            onClick={(e) => { stop(e); onDelete(); }}
            onPointerDown={stop}
            className="p-1 rounded-[6px] text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-950/40"
            title="Delete interview"
            aria-label="Delete interview"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
      <div className="font-medium text-zinc-900 dark:text-zinc-100 truncate pr-14 pl-1" title={profileName}>
        {profileName}
      </div>
      <div className="mt-1 text-zinc-700 dark:text-zinc-300 truncate pl-1" title={companyName}>
        {companyName}
      </div>
      <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400 pl-1">
        {formatScheduledDate(interview.scheduledAt)}
      </div>
      <div className="mt-1.5 pl-1">
        {interview.status ? (
          <span className={`inline-flex items-center px-2 py-0.5 rounded-[8px] text-xs font-medium border ${boardStatusClass(interview.status)}`}>
            {boardStatusLabel(interview.status)}
          </span>
        ) : (
          <span className="text-[11px] text-zinc-400 dark:text-zinc-500">No status</span>
        )}
      </div>
      <StageMovementTrail interview={interview} />
    </div>
  );
}
