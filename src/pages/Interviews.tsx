import useSWR from 'swr';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Pencil, Trash2, Eye, Plus } from 'lucide-react';
import Modal from '../components/Modal';
import Select from '../components/Select';
import InterviewTabs from '../components/InterviewTabs';
import NameWithAvatar from '../components/NameWithAvatar';
import PageHeader from '../components/PageHeader';
import { useAuth } from '../auth/useAuth';
import * as api from '../api/endpoints';
import { notify } from '../lib/notify';

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

const STAGES = [
  { value: 'intro', label: 'Intro' },
  { value: 'tech', label: 'Tech' },
  { value: 'panel', label: 'Panel' },
  { value: 'live_coding', label: 'Live Coding' },
  { value: 'system_design', label: 'System Design' },
  { value: 'cultural', label: 'Cultural' },
  { value: 'final', label: 'Final' },
  { value: 'ai_interview', label: 'AI Interview' },
];

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
    case 'scheduled': return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'completed': return 'bg-zinc-100 dark:bg-zinc-800 text-body border-zinc-200 dark:border-zinc-700';
    case 'passed': return 'bg-green-100 text-green-800 border-green-200';
    case 'failed': return 'bg-red-100 text-red-800 border-red-200';
    case 'no_show': return 'bg-orange-100 text-orange-800 border-orange-200';
    case 'rescheduled': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'canceled': return 'bg-zinc-200 text-body border-zinc-300 dark:bg-zinc-700 dark:border-zinc-600';
    default: return 'bg-zinc-50 dark:bg-zinc-900/80 text-muted border-zinc-200 dark:border-zinc-700';
  }
};

const statusLabel = (v?: string | null) =>
  v ? STATUSES.find((s) => s.value === v)?.label ?? v : '—';

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

const stageLabel = (v: string) => STAGES.find((s) => s.value === v)?.label ?? v;

function pageNumbers(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set<number>([1, 2, total - 1, total, current - 1, current, current + 1]);
  const sorted = [...set].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const out: (number | '…')[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) out.push('…');
    out.push(sorted[i]);
  }
  return out;
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

const stageBadgeClass = (stage: string) => {
  switch (stage) {
    case 'intro': return 'bg-zinc-100 dark:bg-zinc-800 text-body border-zinc-200 dark:border-zinc-700';
    case 'tech': return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'panel': return 'bg-purple-100 text-purple-800 border-purple-200';
    case 'live_coding': return 'bg-indigo-100 text-indigo-800 border-indigo-200';
    case 'system_design': return 'bg-cyan-100 text-cyan-800 border-cyan-200';
    case 'cultural': return 'bg-pink-100 text-pink-800 border-pink-200';
    case 'final': return 'bg-amber-100 text-amber-800 border-amber-200';
    case 'ai_interview': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    default: return 'bg-zinc-100 dark:bg-zinc-800 text-body border-zinc-200 dark:border-zinc-700';
  }
};

export default function InterviewsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const meId = user?.id ?? '';

  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // Filters: creator defaults to "me" on first render; cleared via the dropdown.
  const [creatorId, setCreatorId] = useState<string>(meId);
  useEffect(() => {
    // If user object loads after first render, hydrate the default.
    if (creatorId === '' && meId) setCreatorId(meId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meId]);

  const [accountId, setAccountId] = useState('');
  const [stage, setStage] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const sort: 'desc' = 'desc';
  const viewMode: 'table' = 'table';
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const { data, mutate, isLoading } = useSWR(
    ['interviews', creatorId, accountId, stage, statusFilter, from, to, sort, currentPage, pageSize] as const,
    () => api.listInterviews({
      page: currentPage,
      limit: pageSize,
      sort,
      ...(creatorId ? { creatorId } : {}),
      ...(accountId ? { accountId } : {}),
      ...(stage ? { stage } : {}),
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    })
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

  const { data: usersData } = useSWR(['users-lookup'], () => api.lookupUsers());
  const users = (usersData?.users as Array<{ _id: string; name?: string | null; email?: string | null }>) || [];

  const interviews = (data?.interviews as Interview[]) || [];
  const pagination = data?.pagination;

  // Modal state
  const [mode, setMode] = useState<ModalMode>(null);
  const [active, setActive] = useState<Interview | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const blankForm = () => {
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
  };

  const [form, setForm] = useState(blankForm);

  useEffect(() => {
    if (mode === 'create') {
      setForm(blankForm());
      setError('');
    } else if ((mode === 'update' || mode === 'read') && active) {
      const start = splitDateTime(active.scheduledAt);
      const end = splitDateTime(active.endsAt || '');
      const accId = typeof active.accountId === 'string' ? active.accountId : active.accountId?._id ?? '';
      setForm({
        accountId: accId,
        date: start.date,
        startTime: start.time,
        endTime: end.time || start.time,
        stage: active.stage || '',
        status: active.status || '',
        companyName: active.companyName || '',
        interviewerName: active.interviewerName || '',
        appliedPosition: active.appliedPosition || '',
        jobUrl: active.jobUrl || '',
        transcript: active.transcript || '',
        note: active.note || '',
      });
      setError('');
    }
  }, [mode, active]);

  const closeModal = () => {
    setMode(null);
    setActive(null);
    setError('');
  };

  const openCreate = () => { setActive(null); setMode('create'); };
  const openUpdate = (iv: Interview) => {
    // Pre-fill form synchronously so the modal renders with values on first paint
    // — useEffect-based pre-fill races with modal mount and sometimes blanks fields.
    const start = splitDateTime(iv.scheduledAt);
    const end = splitDateTime(iv.endsAt || '');
    const accId = typeof iv.accountId === 'string' ? iv.accountId : iv.accountId?._id ?? '';
    setForm({
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
    });
    setActive(iv);
    setMode('update');
    setError('');
  };
  const openDelete = (iv: Interview) => { setActive(iv); setMode('delete'); };

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
      const body: Record<string, unknown> = {
        accountId: form.accountId,
        scheduledAt: combineDateTime(form.date, form.startTime),
        endsAt: combineDateTime(form.date, form.endTime),
        stage: form.stage,
        status: form.status,
        companyName: form.companyName,
        interviewerName: form.interviewerName,
        appliedPosition: form.appliedPosition,
        jobUrl: form.jobUrl,
        transcript: form.transcript,
        note: form.note,
      };
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
      closeModal();
      mutate();
    } catch (err) {
      notify.error(err, 'Failed to delete interview');
    } finally {
      setSaving(false);
    }
  };

  const canEdit = (iv: Interview): boolean => {
    if (isAdmin) return true;
    const createdById = typeof iv.createdBy === 'string' ? iv.createdBy : iv.createdBy?._id;
    return createdById === meId;
  };

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setCurrentPage(1);
  };

  const accountOptions = useMemo(() => [
    { value: '', label: 'All' },
    ...accounts.map((a) => ({ value: a._id, label: a.name || a._id })),
  ], [accounts]);

  // Form-only account list — owner-scoped (admin sees all, staff sees own).
  const accountSelectOptions = useMemo(() =>
    ownAccounts.map((a) => ({ value: a._id, label: a.name || a._id })),
  [ownAccounts]);

  const creatorOptions = useMemo(() => [
    { value: '', label: 'All' },
    ...users.map((u) => ({ value: u._id, label: u.name || u.email || u._id })),
  ], [users]);

  const stageOptions = useMemo(() => [
    { value: '', label: 'All' },
    ...STAGES,
  ], []);

  const statusOptions = useMemo(() => [
    { value: '', label: 'All' },
    ...STATUSES,
  ], []);

  const stageFormOptions = useMemo(() => [
    { value: '', label: '— None —' },
    ...STAGES,
  ], []);

  const statusFormOptions = useMemo(() => [
    { value: '', label: '— None —' },
    ...STATUSES,
  ], []);

  const renderRow = (iv: Interview) => {
    const creator = typeof iv.createdBy === 'object' ? iv.createdBy : null;
    const account = typeof iv.accountId === 'object' ? iv.accountId : null;
    const editable = canEdit(iv);
    return (
      <tr
        key={iv._id}
        className="table-row cursor-pointer"
        onClick={() => navigate(`/interviews/${iv._id}`)}
      >
        <td className="px-3 py-2 align-middle">{(() => {
              const display = iv.ownerName || creator?.name || iv.ownerEmail || creator?.email;
              const img = (iv as { ownerImage?: string | null }).ownerImage || (creator as { image?: string } | undefined)?.image;
              return display ? <NameWithAvatar name={display} imageUrl={img} /> : '—';
            })()}</td>
        <td className="px-3 py-2 align-middle">{formatTimeRange(iv.scheduledAt, iv.endsAt)}</td>
        <td className="px-3 py-2 align-middle">
          {iv.stage ? (
            <span className={`badge ${stageBadgeClass(iv.stage)}`}>
              {stageLabel(iv.stage)}
            </span>
          ) : <span className="text-faint">—</span>}
        </td>
        <td className="px-3 py-2 align-middle">
          {iv.status ? (
            <span className={`badge ${statusBadgeClass(iv.status)}`}>
              {statusLabel(iv.status)}
            </span>
          ) : <span className="text-faint">—</span>}
        </td>
        <td className="px-3 py-2 align-middle">
          {iv.jobUrl ? (
            <a href={iv.jobUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="link">
              {iv.companyName || iv.jobUrl}
            </a>
          ) : (
            iv.companyName || <span className="text-faint">—</span>
          )}
        </td>
        <td className="px-3 py-2 align-middle">{iv.interviewerName || <span className="text-faint">—</span>}</td>
        <td className="px-3 py-2 align-middle">{account?.name || account?.email || '—'}</td>
        <td className="px-3 py-2 align-middle" onClick={(e) => e.stopPropagation()}>
          <div className="flex gap-1 whitespace-nowrap">
            <Link to={`/interviews/${iv._id}`} className="btn-icon" title="Open"><Eye size={16} /></Link>
            <button
              type="button"
              className="btn-icon"
              onClick={() => openUpdate(iv)}
              disabled={!editable}
              title={editable ? 'Update' : 'Only the creator or an admin can update'}
            >
              <Pencil size={16} />
            </button>
            <button
              type="button"
              className="btn-icon"
              onClick={() => openDelete(iv)}
              disabled={!editable}
              title={editable ? 'Delete' : 'Only the creator or an admin can delete'}
            >
              <Trash2 size={16} />
            </button>
          </div>
        </td>
      </tr>
    );
  };

  const renderCard = (iv: Interview) => {
    const creator = typeof iv.createdBy === 'object' ? iv.createdBy : null;
    const account = typeof iv.accountId === 'object' ? iv.accountId : null;
    const editable = canEdit(iv);
    return (
      <div key={iv._id} className="card p-4 space-y-2 hover:shadow-md transition">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            {iv.stage && (
              <span className={`badge ${stageBadgeClass(iv.stage)}`}>
                {stageLabel(iv.stage)}
              </span>
            )}
            {iv.status && (
              <span className={`badge ${statusBadgeClass(iv.status)}`}>
                {statusLabel(iv.status)}
              </span>
            )}
          </div>
          <span className="text-xs text-muted">{formatTimeRange(iv.scheduledAt, iv.endsAt)}</span>
        </div>
        {(iv.companyName || iv.interviewerName || iv.appliedPosition) && (
          <div className="text-sm">
            <div className="font-medium">{iv.companyName || '—'}</div>
            {iv.appliedPosition && <div className="text-muted text-xs">{iv.appliedPosition}</div>}
            {iv.interviewerName && <div className="text-muted text-xs">w/ {iv.interviewerName}</div>}
          </div>
        )}
        <div className="text-sm">
          <div className="text-muted">Profile</div>
          <div className="font-medium">{account?.name || account?.email || '—'}</div>
        </div>
        <div className="text-sm">
          <div className="text-muted">Creator</div>
          <div>{(() => {
              const display = iv.ownerName || creator?.name || iv.ownerEmail || creator?.email;
              const img = (iv as { ownerImage?: string | null }).ownerImage || (creator as { image?: string } | undefined)?.image;
              return display ? <NameWithAvatar name={display} imageUrl={img} /> : '—';
            })()}</div>
        </div>
        <div className="flex gap-1 pt-2 border-t border-zinc-200 dark:border-zinc-800">
          <Link to={`/interviews/${iv._id}`} className="btn-icon" title="Open"><Eye size={16} /></Link>
          <button type="button" className="btn-icon" onClick={() => openUpdate(iv)} disabled={!editable} title="Update"><Pencil size={16} /></button>
          <button type="button" className="btn-icon" onClick={() => openDelete(iv)} disabled={!editable} title="Delete"><Trash2 size={16} /></button>
        </div>
      </div>
    );
  };

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
      <div className="flex items-end gap-3 flex-wrap toolbar">
        {isAdmin && (
          <div className="w-44">
            <label className="block text-xs text-muted mb-1">Creator</label>
            <Select value={creatorId} onChange={(v) => { setCreatorId(v); setCurrentPage(1); }} options={creatorOptions} />
          </div>
        )}
        <div className="w-44">
          <label className="block text-xs text-muted mb-1">Profile</label>
          <Select value={accountId} onChange={(v) => { setAccountId(v); setCurrentPage(1); }} options={accountOptions} />
        </div>
        <div className="w-36">
          <label className="block text-xs text-muted mb-1">Stage</label>
          <Select value={stage} onChange={(v) => { setStage(v); setCurrentPage(1); }} options={stageOptions} />
        </div>
        <div className="w-36">
          <label className="block text-xs text-muted mb-1">Status</label>
          <Select value={statusFilter} onChange={(v) => { setStatusFilter(v); setCurrentPage(1); }} options={statusOptions} />
        </div>
        <div className="w-40">
          <label className="block text-xs text-muted mb-1">From</label>
          <input className="input w-full text-sm" type="date" value={from} onChange={(e) => { setFrom(e.target.value); setCurrentPage(1); }} />
        </div>
        <div className="w-40">
          <label className="block text-xs text-muted mb-1">To</label>
          <input className="input w-full text-sm" type="date" value={to} onChange={(e) => { setTo(e.target.value); setCurrentPage(1); }} />
        </div>
      </div>

      {/* Total + page-size */}
      {data && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted">
            <span>Showing {pagination?.total ?? 0} interview{pagination?.total !== 1 ? 's' : ''} total</span>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Show:</label>
            <select
              value={pageSize}
              onChange={(e) => handlePageSizeChange(Number(e.target.value))}
              className="select focus-ring text-sm"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>
      )}

      {/* List */}
      {viewMode === 'table' ? (
        <div className="table-wrap">
          <table className="min-w-full text-sm">
            <thead className="table-head">
              <tr>
                <th className="px-3 py-2 font-medium">Creator</th>
                <th className="px-3 py-2 font-medium">Date / Time</th>
                <th className="px-3 py-2 font-medium">Stage</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Company</th>
                <th className="px-3 py-2 font-medium">Interviewer</th>
                <th className="px-3 py-2 font-medium">Profile</th>
                <th className="px-3 py-2 font-medium whitespace-nowrap text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="row-divider">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-muted">
                    <div className="flex items-center justify-center">
                      <div className="spinner spinner-md mr-3"></div>
                      Loading interviews...
                    </div>
                  </td>
                </tr>
              ) : interviews.length === 0 ? (
                <tr><td colSpan={8} className="px-3 py-6 text-center text-muted">No interviews found.</td></tr>
              ) : (
                interviews.map(renderRow)
              )}
            </tbody>
          </table>
        </div>
      ) : (
        isLoading ? (
          <div className="flex items-center justify-center py-8 text-muted">
            <div className="spinner spinner-md mr-3"></div>
            Loading interviews...
          </div>
        ) : interviews.length === 0 ? (
          <div className="text-center text-muted py-8">No interviews found.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {interviews.map(renderCard)}
          </div>
        )
      )}

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="text-sm text-muted">
            Showing {((pagination.page - 1) * pagination.limit) + 1} to{' '}
            {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} results
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(pagination.page - 1)}
              disabled={!pagination.hasPrev}
              className="px-3 py-1 border rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
            >
              Previous
            </button>
            <div className="flex gap-1">
              {pageNumbers(pagination.page, pagination.totalPages).map((n, idx) =>
                n === '…' ? (
                  <span key={`dots-${idx}`} className="px-2 py-1 text-sm text-muted">…</span>
                ) : (
                  <button
                    key={n}
                    onClick={() => setCurrentPage(n)}
                    className={`px-3 py-1 border rounded text-sm ${
                      n === pagination.page
                        ? 'bg-blue-500 text-white border-blue-500'
                        : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/60'
                    }`}
                  >
                    {n}
                  </button>
                )
              )}
            </div>
            <button
              onClick={() => setCurrentPage(pagination.page + 1)}
              disabled={!pagination.hasNext}
              className="px-3 py-1 border rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
            >
              Next
            </button>
          </div>
        </div>
      )}
      </div>

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
              <div>
                <label className="block text-sm font-medium mb-1">
                  Profile <span className="text-red-500">*</span>
                </label>
                <Select
                  value={form.accountId}
                  onChange={(v) => setForm({ ...form, accountId: v })}
                  options={accountSelectOptions}
                  placeholder="Select a profile"
                  disabled={mode === 'update' && !!active && !canEdit(active)}
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    className="input"
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Start time <span className="text-red-500">*</span>
                  </label>
                  <input
                    className="input"
                    type="time"
                    value={form.startTime}
                    onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    End time <span className="text-red-500">*</span>
                  </label>
                  <input
                    className="input"
                    type="time"
                    value={form.endTime}
                    onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Company Name</label>
                  <input
                    className="input"
                    type="text"
                    value={form.companyName}
                    onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                    placeholder="e.g. Acme Corp"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Interviewer Name</label>
                  <input
                    className="input"
                    type="text"
                    value={form.interviewerName}
                    onChange={(e) => setForm({ ...form, interviewerName: e.target.value })}
                    placeholder="e.g. Jane Smith"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Applied Position</label>
                <input
                  className="input"
                  type="text"
                  value={form.appliedPosition}
                  onChange={(e) => setForm({ ...form, appliedPosition: e.target.value })}
                  placeholder="e.g. Backend, Frontend, AI, Mobile…"
                  list="applied-position-suggestions"
                />
                <datalist id="applied-position-suggestions">
                  <option value="Backend" />
                  <option value="Frontend" />
                  <option value="Fullstack" />
                  <option value="AI / ML" />
                  <option value="Mobile" />
                  <option value="DevOps" />
                  <option value="Data" />
                  <option value="QA" />
                  <option value="Other" />
                </datalist>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Job URL <span className="text-xs text-faint font-normal">(optional)</span></label>
                <input
                  className="input"
                  type="url"
                  value={form.jobUrl}
                  onChange={(e) => setForm({ ...form, jobUrl: e.target.value })}
                  placeholder="https://..."
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Interview Stage</label>
                  <Select
                    value={form.stage}
                    onChange={(v) => setForm({ ...form, stage: v })}
                    options={stageFormOptions}
                    placeholder="Select a stage"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Status</label>
                  <Select
                    value={form.status}
                    onChange={(v) => setForm({ ...form, status: v })}
                    options={statusFormOptions}
                    placeholder="Select a status"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium">Interview Transcript</label>
                  <label className="text-xs text-blue-600 hover:text-blue-700 cursor-pointer">
                    {form.transcript ? 'Replace file' : 'Upload .txt / .md / .doc / .pdf'}
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
                          if (!isPlain) {
                            notify.error(
                              `${ext.toUpperCase()} files may not parse cleanly as plain text. Save as .txt or .md if the result looks garbled.`
                            );
                          } else {
                            notify.success(`Transcript loaded: ${file.name}`);
                          }
                        };
                        reader.onerror = () => notify.error('Could not read the file');
                        reader.readAsText(file);
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>
                {form.transcript ? (
                  <div className="border border-zinc-300 dark:border-zinc-600 rounded-md p-3 max-h-60 overflow-auto bg-zinc-50 dark:bg-zinc-900/80">
                    <pre className="whitespace-pre-wrap text-xs font-mono text-body">{form.transcript.slice(0, 4000)}{form.transcript.length > 4000 ? '\n…(truncated)' : ''}</pre>
                  </div>
                ) : (
                  <div className="border border-dashed border-zinc-300 dark:border-zinc-600 rounded-md p-4 text-center text-xs text-faint">
                    No transcript yet. Upload a file above.
                  </div>
                )}
                {form.transcript && (
                  <button
                    type="button"
                    onClick={() => setForm((p) => ({ ...p, transcript: '' }))}
                    className="text-xs text-red-600 hover:underline mt-1"
                  >
                    Clear transcript
                  </button>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Note</label>
                <textarea
                  className="input w-full"
                  rows={5}
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  placeholder="Internal notes…"
                />
              </div>

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
