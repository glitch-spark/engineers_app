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
import { Plus, ChevronLeft, ChevronRight, Loader2, Trash2, FileText, X } from 'lucide-react';
import Modal from '../components/Modal';
import Select from '../components/Select';
import InterviewTabs from '../components/InterviewTabs';
import PageHeader from '../components/PageHeader';
import { useAuth } from '../auth/useAuth';
import * as api from '../api/endpoints';
import { notify } from '../lib/notify';
import { INTERVIEW_STAGES, stageBadgeClass, stageLabel } from '../lib/stageBadge';

const editorStyles = `
  .ql-editor { min-height: 140px; font-size: 14px; line-height: 1.5; }
  .prose h1, .prose h2, .prose h3 { font-weight: 600; margin-top: 1em; margin-bottom: 0.5em; }
  .prose h1 { font-size: 1.4em; } .prose h2 { font-size: 1.2em; } .prose h3 { font-size: 1.1em; }
  .prose p { margin-bottom: 0.75em; line-height: 1.6; }
  .prose ul, .prose ol { margin-bottom: 0.75em; padding-left: 1.5em; }
  .prose strong { font-weight: 600; } .prose em { font-style: italic; } .prose u { text-decoration: underline; }
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
  html.dark .prose-readonly { border-color: #3f3f46; }
  .prose a { color: #2563eb; text-decoration: underline; }
  html.dark .prose a, html.dark .prose-readonly a { color: #38bdf8; }
  .prose-readonly p { margin: 0 0 0.5em 0; }
  .prose-readonly p:last-child { margin-bottom: 0; }
  .prose-readonly h1, .prose-readonly h2, .prose-readonly h3 { font-weight: 600; margin: 0.5em 0 0.25em; }
  .prose-readonly h1 { font-size: 1.25em; } .prose-readonly h2 { font-size: 1.15em; } .prose-readonly h3 { font-size: 1.05em; }
  .prose-readonly ul, .prose-readonly ol { margin: 0 0 0.5em 0; padding-left: 1.25em; }
  .prose-readonly a { color: #2563eb; text-decoration: underline; }
  .prose-readonly img { max-width: 100%; height: auto; }
  .prose-readonly pre, .prose-readonly code { white-space: pre-wrap; word-break: break-all; }
`;

const STAGES = INTERVIEW_STAGES;

const BOARD_COLUMNS = [
  { key: 'ai_interview', label: 'AI Interview', tone: 'border-emerald-300', columnClass: 'flex-1 min-w-0' },
  { key: 'intro', label: 'Intro', tone: 'border-zinc-300 dark:border-zinc-600', columnClass: 'flex-1 min-w-0' },
  { key: 'tech', label: 'Tech', tone: 'border-blue-300', columnClass: 'flex-1 min-w-0' },
  { key: 'hiring_manager', label: 'Hiring Manager', tone: 'border-pink-300', columnClass: 'flex-1 min-w-0' },
  { key: 'panel', label: 'Panel', tone: 'border-purple-300', columnClass: 'flex-1 min-w-0' },
  { key: 'final', label: 'Final', tone: 'border-amber-300', columnClass: 'flex-1 min-w-0' },
  { key: 'rejected', label: 'Rejected', tone: 'border-red-400', columnClass: 'flex-1 min-w-0' },
] as const;

type BoardColumnKey = (typeof BOARD_COLUMNS)[number]['key'];

const BOARD_CARD_STYLES: Record<BoardColumnKey, { card: string; hover: string; accent: string }> = {
  ai_interview: {
    card: 'bg-gradient-to-br from-emerald-50 via-white to-teal-50/80 border-emerald-200/90 dark:from-emerald-950/40 dark:via-zinc-950 dark:to-teal-950/30 dark:border-emerald-800/60',
    hover: 'hover:border-emerald-400 hover:shadow-md hover:shadow-emerald-100/80 dark:hover:border-emerald-500 dark:hover:shadow-none',
    accent: 'bg-emerald-400',
  },
  intro: {
    card: 'bg-gradient-to-br from-slate-50 via-white to-gray-50 border-slate-200 dark:from-zinc-900 dark:via-zinc-950 dark:to-zinc-900 dark:border-zinc-700',
    hover: 'hover:border-slate-400 hover:shadow-md hover:shadow-slate-100/80 dark:hover:border-zinc-500 dark:hover:shadow-none',
    accent: 'bg-slate-400',
  },
  tech: {
    card: 'bg-gradient-to-br from-blue-50 via-white to-sky-50/80 border-blue-200/90 dark:from-blue-950/40 dark:via-zinc-950 dark:to-sky-950/30 dark:border-blue-800/60',
    hover: 'hover:border-blue-400 hover:shadow-md hover:shadow-blue-100/80 dark:hover:border-blue-500 dark:hover:shadow-none',
    accent: 'bg-blue-400',
  },
  hiring_manager: {
    card: 'bg-gradient-to-br from-pink-50 via-white to-rose-50/80 border-pink-200/90 dark:from-pink-950/40 dark:via-zinc-950 dark:to-rose-950/30 dark:border-pink-800/60',
    hover: 'hover:border-pink-400 hover:shadow-md hover:shadow-pink-100/80 dark:hover:border-pink-500 dark:hover:shadow-none',
    accent: 'bg-pink-400',
  },
  panel: {
    card: 'bg-gradient-to-br from-purple-50 via-white to-violet-50/80 border-purple-200/90 dark:from-purple-950/40 dark:via-zinc-950 dark:to-violet-950/30 dark:border-purple-800/60',
    hover: 'hover:border-purple-400 hover:shadow-md hover:shadow-purple-100/80 dark:hover:border-purple-500 dark:hover:shadow-none',
    accent: 'bg-purple-400',
  },
  final: {
    card: 'bg-gradient-to-br from-amber-50 via-white to-orange-50/80 border-amber-200/90 dark:from-amber-950/40 dark:via-zinc-950 dark:to-orange-950/30 dark:border-amber-800/60',
    hover: 'hover:border-amber-400 hover:shadow-md hover:shadow-amber-100/80 dark:hover:border-amber-500 dark:hover:shadow-none',
    accent: 'bg-amber-400',
  },
  rejected: {
    card: 'bg-gradient-to-br from-red-50 via-white to-rose-50/80 border-red-200/90 dark:from-red-950/40 dark:via-zinc-950 dark:to-rose-950/30 dark:border-red-800/60',
    hover: 'hover:border-red-400 hover:shadow-md hover:shadow-red-100/80 dark:hover:border-red-500 dark:hover:shadow-none',
    accent: 'bg-red-500',
  },
};

/** Visible pans at ~1440px desktop widths (7 pans are too cramped). */
const BOARD_VISIBLE_WIDE = 5;
/** Fewer pans on narrower viewports. */
const BOARD_VISIBLE_NARROW = 4;
const BOARD_WIDE_MIN_PX = 1280;

/** API stage written when a card is dropped on a board column. */
const BOARD_COLUMN_TO_STAGE: Record<BoardColumnKey, string> = {
  ai_interview: 'ai_interview',
  intro: 'intro',
  tech: 'tech',
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
    case 'live_coding':
    case 'system_design':
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
    case 'scheduled': return 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800';
    case 'completed': return 'bg-zinc-100 dark:bg-zinc-800 text-body border-zinc-200 dark:border-zinc-700';
    case 'passed': return 'bg-green-100 text-green-800 border-green-200 dark:bg-green-950/40 dark:text-green-300 dark:border-green-800';
    case 'failed': return 'bg-red-100 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800';
    case 'no_show': return 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800';
    case 'rescheduled': return 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-300 dark:border-yellow-800';
    case 'canceled': return 'bg-zinc-200 text-body border-zinc-300 dark:bg-zinc-700 dark:border-zinc-600';
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
    return 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800';
  }
  if (status === 'completed') {
    return 'bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700';
  }
  return statusBadgeClass(status);
}

type AccountRef = { _id: string; name?: string; email?: string };
type CreatorRef = { _id: string; name?: string; email?: string };

type Interview = {
  _id: string;
  accountId: AccountRef | string;
  createdBy: CreatorRef | string;
  scheduledAt: string;
  endsAt?: string | null;
  stage?: string | null;
  status?: string | null;
  companyName?: string | null;
  interviewerName?: string | null;
  appliedPosition?: string | null;
  jobUrl?: string | null;
  transcript?: string;
  note?: string;
  ownerName?: string | null;
  ownerEmail?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type ModalMode = 'create' | 'read' | 'update' | 'delete' | null;

type InterviewFormState = {
  accountId: string;
  date: string;
  startTime: string;
  endTime: string;
  stage: string;
  status: string;
  companyName: string;
  interviewerName: string;
  appliedPosition: string;
  jobUrl: string;
  transcript: string;
  note: string;
};

function blankInterviewForm(): InterviewFormState {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  const endHour = String((now.getHours() + 1) % 24).padStart(2, '0');
  return {
    accountId: '',
    date: `${yyyy}-${mm}-${dd}`,
    startTime: `${hh}:${mi}`,
    endTime: `${endHour}:${mi}`,
    stage: '',
    status: '',
    companyName: '',
    interviewerName: '',
    appliedPosition: '',
    jobUrl: '',
    transcript: '',
    note: '',
  };
}

function interviewToForm(iv: Interview): InterviewFormState {
  const start = splitDateTime(iv.scheduledAt);
  const end = splitDateTime(iv.endsAt || '');
  const accId = typeof iv.accountId === 'string' ? iv.accountId : iv.accountId?._id ?? '';
  return {
    accountId: accId,
    date: start.date,
    startTime: start.time,
    endTime: end.time || start.time,
    stage: iv.stage || '',
    status: iv.status || '',
    companyName: iv.companyName || '',
    interviewerName: iv.interviewerName || '',
    appliedPosition: iv.appliedPosition || '',
    jobUrl: iv.jobUrl || '',
    transcript: iv.transcript || '',
    note: iv.note || '',
  };
}

function combineDateTime(date: string, time: string): string {
  // local-time interpretation, then convert to UTC ISO string
  const t = time && time.length >= 5 ? time : '00:00';
  return new Date(`${date}T${t}:00`).toISOString();
}

function splitDateTime(iso: string): { date: string; time: string } {
  if (!iso) return { date: '', time: '' };
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { date: '', time: '' };
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return { date: `${yyyy}-${mm}-${dd}`, time: `${hh}:${mi}` };
}

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
const formatTimeRange = (startIso: string, endIso?: string | null) => formatPretty(startIso, endIso);

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
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
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
      const next = mq.matches ? BOARD_VISIBLE_WIDE : BOARD_VISIBLE_NARROW;
      setVisibleColumnCount(next);
      setBoardOffset((o) => Math.min(o, Math.max(0, BOARD_COLUMNS.length - next)));
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

  const interviews = (data?.interviews as Interview[]) || [];
  const pagination = data?.pagination;

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

  useEffect(() => {
    if (!stage) return;
    const colKey = boardColumnForStage(stage);
    const idx = BOARD_COLUMNS.findIndex((c) => c.key === colKey);
    if (idx < 0) return;
    setBoardOffset((prev) => {
      if (idx < prev) return idx;
      if (idx >= prev + visibleColumnCount) return idx - visibleColumnCount + 1;
      return prev;
    });
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
      notify.error('Select a date');
      return;
    }
    if (!form.startTime || !form.endTime) {
      notify.error('Select start and end time');
      return;
    }
    if (form.endTime <= form.startTime) {
      notify.error('End time must be after start time');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const body = buildSaveBody(form);
      const account = ownAccounts.find((a) => a._id === form.accountId);
      const accountLabel = account?.name || account?.title || 'account';
      const stageText = form.stage ? `${stageLabel(form.stage)} ` : '';
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

  const buildSaveBody = (f: InterviewFormState): Record<string, unknown> => ({
    accountId: f.accountId,
    scheduledAt: combineDateTime(f.date, f.startTime),
    endsAt: combineDateTime(f.date, f.endTime),
    stage: f.stage,
    status: f.status,
    companyName: f.companyName,
    interviewerName: f.interviewerName,
    appliedPosition: f.appliedPosition,
    jobUrl: f.jobUrl,
    transcript: f.transcript,
    note: f.note,
  });

  const savePanel = async () => {
    if (!panelInterview) return;
    if (!panelForm.date || !panelForm.startTime || !panelForm.endTime) {
      notify.error('Select date and time');
      return;
    }
    if (panelForm.endTime <= panelForm.startTime) {
      notify.error('End time must be after start time');
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
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

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
    if (targetCol === sourceCol) return;
    const newStage = BOARD_COLUMN_TO_STAGE[targetCol];
    const colLabel = BOARD_COLUMNS.find((c) => c.key === targetCol)?.label ?? stageLabel(newStage);

    const previousData = data;
    mutate(
      (current) => {
        if (!current) return current;
        return {
          ...current,
          interviews: (current.interviews as Interview[]).map((item) =>
            item._id === ivId ? { ...item, stage: newStage } : item,
          ),
        };
      },
      { revalidate: false },
    );

    try {
      const updated = await api.updateInterview(iv._id, { stage: newStage });
      if (panelInterview?._id === ivId) {
        setPanelInterview(updated as unknown as Interview);
        setPanelForm((prev) => ({ ...prev, stage: newStage }));
      }
      if (stage && stage !== newStage) setStage('');
      await mutate();
      notify.success(`Moved to ${colLabel}`);
    } catch (err) {
      mutate(previousData, { revalidate: false });
      notify.error(err, 'Failed to move interview');
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
    ...STAGES,
    { value: 'rejected', label: 'Rejected' },
  ], []);

  const statusOptions = useMemo(() => [
    { value: '', label: 'All' },
    ...STATUSES,
  ], []);

  const stageFormOptions = useMemo(() => [
    { value: '', label: '— None —' },
    ...STAGES,
    { value: 'rejected', label: 'Rejected' },
  ], []);

  const statusFormOptions = useMemo(() => [
    { value: '', label: '— None —' },
    ...STATUSES,
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
        <div className="w-40">
          <label className="block text-xs text-muted mb-1">From</label>
          <input className="input w-full text-sm" type="date" value={from} onChange={(e) => { setFrom(e.target.value); resetFiltersPage(); }} />
        </div>
        <div className="w-40">
          <label className="block text-xs text-muted mb-1">To</label>
          <input className="input w-full text-sm" type="date" value={to} onChange={(e) => { setTo(e.target.value); resetFiltersPage(); }} />
        </div>
      </div>

      {/* Total */}
      {data && (
        <div className="text-sm text-muted">
          <span>Showing {pagination?.total ?? 0} interview{pagination?.total !== 1 ? 's' : ''} total</span>
          {(pagination?.total ?? 0) > boardPageSize && (
            <span className="text-amber-700 ml-2">
              (first {boardPageSize} loaded — narrow filters to see more)
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
            <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={handleBoardPrev}
                  disabled={!canBoardPrev}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-600 shadow-sm hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  aria-label="Show previous columns"
                >
                  <ChevronLeft size={16} />
                </button>
                <p className="text-xs text-muted text-center flex-1">
                  {visibleColumns.map((c) => c.label).join(' · ')}
                  <span className="text-faint"> · {boardOffset + 1}–{boardOffset + visibleColumns.length} of {BOARD_COLUMNS.length}</span>
                </p>
                <button
                  type="button"
                  onClick={handleBoardNext}
                  disabled={!canBoardNext}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-600 shadow-sm hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  aria-label="Show next columns"
                >
                  <ChevronRight size={16} />
                </button>
              </div>

            {interviews.length === 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-300">
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
                    {form.stage ? (
                      <span className={`badge ${stageBadgeClass(form.stage)}`}>
                        {stageLabel(form.stage)}
                      </span>
                    ) : <span className="text-faint">—</span>}
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
                  <div className="text-muted text-xs">Date</div>
                  <div>{form.date || '—'}</div>
                </div>
                <div>
                  <div className="text-muted text-xs">Start time</div>
                  <div>{form.startTime || '—'}</div>
                </div>
                <div>
                  <div className="text-muted text-xs">End time</div>
                  <div>{form.endTime || '—'}</div>
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
                  disabled={saving || !form.date || !form.startTime || !form.endTime || (mode === 'create' && !form.accountId)}
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
    <div className={`${columnClass} bg-zinc-50 dark:bg-zinc-900/60 rounded-xl border-t-4 ${tone} border-x border-b border-zinc-100 dark:border-zinc-800`}>
      <header className="px-3 py-2 flex items-center justify-between text-xs text-muted uppercase tracking-wide font-medium">
        <span className="truncate">{label}</span>
        <span className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded px-1.5 py-0.5 text-[10px] tabular-nums ml-2 shrink-0">
          {cards.length}
        </span>
      </header>
      <div
        ref={setNodeRef}
        className={`p-2 space-y-2 min-h-[120px] max-h-[calc(100vh-300px)] overflow-y-auto transition-colors ${highlight ? 'bg-primary/5 ring-1 ring-inset ring-primary/20 rounded-b-[12px]' : ''}`}
      >
        {cards.length === 0 ? (
          <div className="text-xs text-faint text-center py-8">Drop here</div>
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
    <div className={`rounded-[10px] p-3 text-sm shadow-md border relative overflow-hidden ${panStyle.card} ring-2 ring-primary`}>
      <span className={`absolute left-0 top-0 bottom-0 w-1 ${panStyle.accent}`} aria-hidden />
      <div className="font-medium text-strong truncate pl-1" title={profileName}>{profileName}</div>
      <div className="mt-1 text-body truncate pl-1" title={companyName}>{companyName}</div>
      <div className="mt-1 text-[11px] text-muted pl-1">
        {formatTimeRange(interview.scheduledAt, interview.endsAt)}
      </div>
      <div className="mt-1.5 pl-1">
        {interview.status ? (
          <span className={`inline-flex items-center px-2 py-0.5 rounded-[8px] text-xs font-medium border ${boardStatusClass(interview.status)}`}>
            {boardStatusLabel(interview.status)}
          </span>
        ) : (
          <span className="text-[11px] text-faint">No status</span>
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
      className={`rounded-[10px] p-3 text-sm shadow-sm border relative overflow-hidden transition-all duration-200 ${panStyle.card} ${panStyle.hover} ${isSelected ? 'ring-2 ring-primary/60 border-primary/40' : ''} ${isDragging ? 'opacity-40' : ''} ${draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
    >
      <span className={`absolute left-0 top-0 bottom-0 w-1 ${panStyle.accent}`} aria-hidden />
      <div className="absolute top-2 right-2 flex items-center gap-0.5">
        <button
          type="button"
          onClick={(e) => { stop(e); onOpenTranscript(); }}
          onPointerDown={stop}
          className="p-1 rounded-[6px] text-zinc-400 hover:text-primary hover:bg-blue-50 dark:text-zinc-500 dark:hover:bg-blue-950/40"
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
            className="p-1 rounded-[6px] text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:text-zinc-500 dark:hover:bg-red-950/40 dark:hover:text-red-400"
            title="Delete interview"
            aria-label="Delete interview"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
      <div className="font-medium text-strong truncate pr-14 pl-1" title={profileName}>
        {profileName}
      </div>
      <div className="mt-1 text-body truncate pl-1" title={companyName}>
        {companyName}
      </div>
      <div className="mt-1 text-[11px] text-muted pl-1">
        {formatTimeRange(interview.scheduledAt, interview.endsAt)}
      </div>
      <div className="mt-1.5 pl-1">
        {interview.status ? (
          <span className={`inline-flex items-center px-2 py-0.5 rounded-[8px] text-xs font-medium border ${boardStatusClass(interview.status)}`}>
            {boardStatusLabel(interview.status)}
          </span>
        ) : (
          <span className="text-[11px] text-faint">No status</span>
        )}
      </div>
    </div>
  );
}

type SelectOption = { value: string; label: string };

function InterviewFormFields({
  form,
  setForm,
  accountSelectOptions,
  stageFormOptions,
  statusFormOptions,
  accountDisabled,
  datalistId,
  disabled,
}: {
  form: InterviewFormState;
  setForm: React.Dispatch<React.SetStateAction<InterviewFormState>>;
  accountSelectOptions: SelectOption[];
  stageFormOptions: SelectOption[];
  statusFormOptions: SelectOption[];
  accountDisabled?: boolean;
  datalistId: string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">
          Profile <span className="text-red-500">*</span>
        </label>
        <Select
          value={form.accountId}
          onChange={(v) => setForm({ ...form, accountId: v })}
          options={accountSelectOptions}
          placeholder="Select a profile"
          disabled={disabled || accountDisabled}
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">
            Date <span className="text-red-500">*</span>
          </label>
          <input className="input" type="date" value={form.date} disabled={disabled} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">
            Start time <span className="text-red-500">*</span>
          </label>
          <input className="input" type="time" value={form.startTime} disabled={disabled} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">
            End time <span className="text-red-500">*</span>
          </label>
          <input className="input" type="time" value={form.endTime} disabled={disabled} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">Company Name</label>
          <input className="input" type="text" value={form.companyName} disabled={disabled} onChange={(e) => setForm({ ...form, companyName: e.target.value })} placeholder="e.g. Acme Corp" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Interviewer Name</label>
          <input className="input" type="text" value={form.interviewerName} disabled={disabled} onChange={(e) => setForm({ ...form, interviewerName: e.target.value })} placeholder="e.g. Jane Smith" />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Applied Position</label>
        <input className="input" type="text" value={form.appliedPosition} disabled={disabled} onChange={(e) => setForm({ ...form, appliedPosition: e.target.value })} placeholder="e.g. Backend, Frontend…" list={datalistId} />
        <datalist id={datalistId}>
          <option value="Backend" /><option value="Frontend" /><option value="Fullstack" />
          <option value="AI / ML" /><option value="Mobile" /><option value="DevOps" />
          <option value="Data" /><option value="QA" /><option value="Other" />
        </datalist>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Job URL <span className="text-xs text-faint font-normal">(optional)</span></label>
        <input className="input" type="url" value={form.jobUrl} disabled={disabled} onChange={(e) => setForm({ ...form, jobUrl: e.target.value })} placeholder="https://..." />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">Interview Stage</label>
          <Select value={form.stage} onChange={(v) => setForm({ ...form, stage: v })} options={stageFormOptions} placeholder="Select a stage" disabled={disabled} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Status</label>
          <Select value={form.status} onChange={(v) => setForm({ ...form, status: v })} options={statusFormOptions} placeholder="Select a status" disabled={disabled} />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-sm font-medium">Interview Transcript</label>
          {!disabled && (
            <label className="text-xs text-blue-600 hover:text-blue-700 cursor-pointer">
              {form.transcript ? 'Replace file' : 'Upload file'}
              <input
                type="file"
                accept=".txt,.md,.markdown,.doc,.docx,.pdf,text/plain,text/markdown,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const ext = file.name.toLowerCase().split('.').pop() || '';
                  const isPlain = ext === 'txt' || ext === 'md' || ext === 'markdown';
                  const reader = new FileReader();
                  reader.onload = () => {
                    const raw = String(reader.result || '');
                    setForm((prev) => ({ ...prev, transcript: raw }));
                    if (!isPlain) notify.error(`${ext.toUpperCase()} may not parse cleanly — prefer .txt or .md`);
                    else notify.success(`Transcript loaded: ${file.name}`);
                  };
                  reader.onerror = () => notify.error('Could not read the file');
                  reader.readAsText(file);
                  e.target.value = '';
                }}
              />
            </label>
          )}
        </div>
        {form.transcript ? (
          <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg p-3 max-h-40 overflow-auto bg-zinc-50 dark:bg-zinc-900/80">
            <pre className="whitespace-pre-wrap text-xs font-mono text-body">{form.transcript.slice(0, 4000)}{form.transcript.length > 4000 ? '\n…(truncated)' : ''}</pre>
          </div>
        ) : (
          <div className="border border-dashed border-zinc-300 dark:border-zinc-700 rounded-lg p-4 text-center text-xs text-faint">
            No transcript yet.
          </div>
        )}
        {!disabled && form.transcript && (
          <button type="button" onClick={() => setForm((p) => ({ ...p, transcript: '' }))} className="text-xs text-red-600 hover:underline mt-1">Clear transcript</button>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Note</label>
        <textarea className="input w-full" rows={4} value={form.note} disabled={disabled} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Internal notes…" />
      </div>
    </div>
  );
}

function InterviewSidePanel({
  interview,
  form,
  setForm,
  error,
  saving,
  editable,
  accountSelectOptions,
  stageFormOptions,
  statusFormOptions,
  onClose,
  onSave,
  onOpenTranscript,
}: {
  interview: Interview;
  form: InterviewFormState;
  setForm: React.Dispatch<React.SetStateAction<InterviewFormState>>;
  error: string;
  saving: boolean;
  editable: boolean;
  accountSelectOptions: SelectOption[];
  stageFormOptions: SelectOption[];
  statusFormOptions: SelectOption[];
  onClose: () => void;
  onSave: () => void;
  onOpenTranscript: () => void;
}) {
  const account = typeof interview.accountId === 'object' ? interview.accountId : null;
  const title = interview.companyName || account?.name || 'Interview';

  return (
    <aside className="fixed top-16 right-0 bottom-0 w-1/3 min-w-[320px] max-w-[520px] bg-white dark:bg-zinc-950 shadow-strong border-l border-zinc-200 dark:border-zinc-800 z-50 flex flex-col">
      <header className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-start justify-between gap-2 shrink-0">
        <div className="min-w-0">
          <div className="text-xs text-muted">Interview details</div>
          <div className="font-semibold text-strong truncate">{title}</div>
          {interview.stage && (
            <span className={`inline-flex mt-1 items-center px-2 py-0.5 rounded-[8px] text-[10px] font-medium border ${stageBadgeClass(interview.stage)}`}>
              {stageLabel(interview.stage)}
            </span>
          )}
        </div>
        <button type="button" onClick={onClose} className="btn-icon shrink-0" title="Close panel" aria-label="Close panel">
          <X size={16} />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
        <InterviewFormFields
          form={form}
          setForm={setForm}
          accountSelectOptions={accountSelectOptions}
          stageFormOptions={stageFormOptions}
          statusFormOptions={statusFormOptions}
          accountDisabled={!editable}
          datalistId="applied-position-suggestions-panel"
          disabled={!editable}
        />
      </div>

      <footer className="px-4 py-3 border-t border-zinc-200 dark:border-zinc-800 flex flex-wrap gap-2 justify-end shrink-0 bg-zinc-50/80 dark:bg-zinc-900/80">
        <button type="button" className="btn-outline text-sm" onClick={onOpenTranscript}>
          <FileText size={14} className="mr-1" /> Transcript
        </button>
        <button type="button" className="btn-outline text-sm" onClick={onClose}>Close</button>
        {editable && (
          <button type="button" className="btn text-sm" onClick={onSave} disabled={saving || !form.date || !form.startTime || !form.endTime || !form.accountId}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        )}
      </footer>
    </aside>
  );
}
