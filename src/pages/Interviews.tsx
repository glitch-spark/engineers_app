import useSWR from 'swr';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import { Pencil, Trash2, Eye, Filter, Plus, LayoutGrid, Table as TableIcon, ArrowUpDown } from 'lucide-react';
import Modal from '../components/Modal';
import Select from '../components/Select';
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

const QUILL_MODULES = {
  toolbar: [
    [{ header: [1, 2, 3, false] }],
    ['bold', 'italic', 'underline', 'strike'],
    [{ list: 'ordered' }, { list: 'bullet' }],
    ['link'],
    ['clean'],
  ],
};

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
    case 'scheduled': return 'bg-blue-100 text-blue-800';
    case 'completed': return 'bg-gray-100 text-gray-700';
    case 'passed': return 'bg-green-100 text-green-800';
    case 'failed': return 'bg-red-100 text-red-800';
    case 'no_show': return 'bg-orange-100 text-orange-800';
    case 'rescheduled': return 'bg-yellow-100 text-yellow-800';
    case 'canceled': return 'bg-gray-200 text-gray-700';
    default: return 'bg-gray-50 text-gray-500';
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
  mainTechStack?: string | null;
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

function formatScheduled(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

function formatTimeRange(startIso: string, endIso?: string | null): string {
  if (!startIso) return '—';
  const start = new Date(startIso);
  if (isNaN(start.getTime())) return '—';
  const startStr = start.toLocaleString();
  if (!endIso) return startStr;
  const end = new Date(endIso);
  if (isNaN(end.getTime())) return startStr;
  const sameDay = start.toDateString() === end.toDateString();
  const endStr = sameDay
    ? end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : end.toLocaleString();
  return `${startStr} – ${endStr}`;
}

const stageBadgeClass = (stage: string) => {
  switch (stage) {
    case 'intro': return 'bg-gray-100 text-gray-700';
    case 'tech': return 'bg-blue-100 text-blue-800';
    case 'panel': return 'bg-purple-100 text-purple-800';
    case 'live_coding': return 'bg-indigo-100 text-indigo-800';
    case 'system_design': return 'bg-cyan-100 text-cyan-800';
    case 'cultural': return 'bg-pink-100 text-pink-800';
    case 'final': return 'bg-amber-100 text-amber-800';
    case 'ai_interview': return 'bg-emerald-100 text-emerald-800';
    default: return 'bg-gray-100 text-gray-700';
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
  const [sort, setSort] = useState<'desc' | 'asc'>('desc');

  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');
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
    email?: string;
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
      mainTechStack: '',
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
        mainTechStack: active.mainTechStack || '',
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
  const openUpdate = (iv: Interview) => { setActive(iv); setMode('update'); };
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
        mainTechStack: form.mainTechStack,
        transcript: form.transcript,
        note: form.note,
      };
      const account = ownAccounts.find((a) => a._id === form.accountId);
      const accountLabel = account?.name || account?.email || 'account';
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
    ...accounts.map((a) => ({ value: a._id, label: a.name ? `${a.name} (${a.email})` : a.email || a._id })),
  ], [accounts]);

  // Form-only account list — owner-scoped (admin sees all, staff sees own).
  const accountSelectOptions = useMemo(() =>
    ownAccounts.map((a) => ({ value: a._id, label: a.name ? `${a.name} (${a.email})` : a.email || a._id })),
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
        className="border-t hover:bg-gray-50 cursor-pointer"
        onClick={() => navigate(`/interviews/${iv._id}`)}
      >
        <td className="px-3 py-2">{iv.ownerName || creator?.name || iv.ownerEmail || creator?.email || '—'}</td>
        <td className="px-3 py-2">{formatTimeRange(iv.scheduledAt, iv.endsAt)}</td>
        <td className="px-3 py-2">
          {iv.stage ? (
            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${stageBadgeClass(iv.stage)}`}>
              {stageLabel(iv.stage)}
            </span>
          ) : <span className="text-gray-400">—</span>}
        </td>
        <td className="px-3 py-2">
          {iv.status ? (
            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${statusBadgeClass(iv.status)}`}>
              {statusLabel(iv.status)}
            </span>
          ) : <span className="text-gray-400">—</span>}
        </td>
        <td className="px-3 py-2">{iv.companyName || <span className="text-gray-400">—</span>}</td>
        <td className="px-3 py-2">{iv.interviewerName || <span className="text-gray-400">—</span>}</td>
        <td className="px-3 py-2">{account?.name || account?.email || '—'}</td>
        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
          <div className="flex gap-2 whitespace-nowrap">
            <Link to={`/interviews/${iv._id}`} className="btn" title="Open"><Eye size={16} /></Link>
            <button
              type="button"
              className="btn"
              onClick={() => openUpdate(iv)}
              disabled={!editable}
              title={editable ? 'Update' : 'Only the creator or an admin can update'}
            >
              <Pencil size={16} />
            </button>
            <button
              type="button"
              className="btn"
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
              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${stageBadgeClass(iv.stage)}`}>
                {stageLabel(iv.stage)}
              </span>
            )}
            {iv.status && (
              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${statusBadgeClass(iv.status)}`}>
                {statusLabel(iv.status)}
              </span>
            )}
          </div>
          <span className="text-xs text-gray-500">{formatTimeRange(iv.scheduledAt, iv.endsAt)}</span>
        </div>
        {(iv.companyName || iv.interviewerName || iv.appliedPosition) && (
          <div className="text-sm">
            <div className="font-medium">{iv.companyName || '—'}</div>
            {iv.appliedPosition && <div className="text-gray-600 text-xs">{iv.appliedPosition}{iv.mainTechStack ? ` · ${iv.mainTechStack}` : ''}</div>}
            {iv.interviewerName && <div className="text-gray-500 text-xs">w/ {iv.interviewerName}</div>}
          </div>
        )}
        <div className="text-sm">
          <div className="text-gray-500">Profile</div>
          <div className="font-medium">{account?.name || account?.email || '—'}</div>
        </div>
        <div className="text-sm">
          <div className="text-gray-500">Creator</div>
          <div>{iv.ownerName || creator?.name || iv.ownerEmail || creator?.email || '—'}</div>
        </div>
        <div className="flex gap-2 pt-2 border-t border-gray-100">
          <Link to={`/interviews/${iv._id}`} className="btn" title="Open"><Eye size={16} /></Link>
          <button type="button" className="btn" onClick={() => openUpdate(iv)} disabled={!editable} title="Update"><Pencil size={16} /></button>
          <button type="button" className="btn" onClick={() => openDelete(iv)} disabled={!editable} title="Delete"><Trash2 size={16} /></button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <style>{editorStyles}</style>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Interviews</h1>
        <button type="button" className="btn" onClick={openCreate}>
          <Plus size={16} className="mr-2" /> Create
        </button>
      </div>

      <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-end gap-3 flex-wrap">
        {isAdmin && (
          <div className="min-w-[180px]">
            <label className="block text-xs mb-1 text-gray-600">Creator</label>
            <Select value={creatorId} onChange={setCreatorId} options={creatorOptions} />
          </div>
        )}
        <div className="min-w-[180px]">
          <label className="block text-xs mb-1 text-gray-600">Profile</label>
          <Select value={accountId} onChange={setAccountId} options={accountOptions} />
        </div>
        <div className="min-w-[160px]">
          <label className="block text-xs mb-1 text-gray-600">Stage</label>
          <Select value={stage} onChange={setStage} options={stageOptions} />
        </div>
        <div className="min-w-[160px]">
          <label className="block text-xs mb-1 text-gray-600">Status</label>
          <Select value={statusFilter} onChange={setStatusFilter} options={statusOptions} />
        </div>
        <div>
          <label className="block text-xs mb-1 text-gray-600">From</label>
          <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs mb-1 text-gray-600">To</label>
          <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <button
          type="button"
          className="btn"
          onClick={() => { setCurrentPage(1); mutate(); }}
          title="Apply filters"
        >
          <Filter size={16} className="mr-1" /> Apply
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => setSort(sort === 'desc' ? 'asc' : 'desc')}
          title={`Sort by time: ${sort === 'desc' ? 'latest first' : 'oldest first'}`}
        >
          <ArrowUpDown size={16} className="mr-1" /> {sort === 'desc' ? 'Latest' : 'Oldest'} first
        </button>
        <div className="inline-flex rounded-md border border-gray-200 overflow-hidden">
          <button
            type="button"
            className={`px-3 py-2 text-sm ${viewMode === 'table' ? 'bg-gray-100 text-primary' : 'bg-white text-gray-600'}`}
            onClick={() => setViewMode('table')}
            title="Table view"
          >
            <TableIcon size={16} />
          </button>
          <button
            type="button"
            className={`px-3 py-2 text-sm border-l border-gray-200 ${viewMode === 'card' ? 'bg-gray-100 text-primary' : 'bg-white text-gray-600'}`}
            onClick={() => setViewMode('card')}
            title="Card view"
          >
            <LayoutGrid size={16} />
          </button>
        </div>
      </div>

      {/* Total + page-size */}
      {data && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600">
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
        <div className="card p-0 overflow-hidden">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-100 text-left">
              <tr>
                <th className="px-3 py-2">Creator</th>
                <th className="px-3 py-2">Date / Time</th>
                <th className="px-3 py-2">Stage</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Company</th>
                <th className="px-3 py-2">Interviewer</th>
                <th className="px-3 py-2">Profile</th>
                <th className="px-3 py-2 whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mr-3"></div>
                      Loading interviews...
                    </div>
                  </td>
                </tr>
              ) : interviews.length === 0 ? (
                <tr><td colSpan={8} className="px-3 py-6 text-center text-gray-500">No interviews found.</td></tr>
              ) : (
                interviews.map(renderRow)
              )}
            </tbody>
          </table>
        </div>
      ) : (
        isLoading ? (
          <div className="flex items-center justify-center py-8 text-gray-500">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mr-3"></div>
            Loading interviews...
          </div>
        ) : interviews.length === 0 ? (
          <div className="text-center text-gray-500 py-8">No interviews found.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {interviews.map(renderCard)}
          </div>
        )
      )}

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="text-sm text-gray-600">
            Showing {((pagination.page - 1) * pagination.limit) + 1} to{' '}
            {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} results
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(pagination.page - 1)}
              disabled={!pagination.hasPrev}
              className="px-3 py-1 border rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              Previous
            </button>
            <div className="flex gap-1">
              {pageNumbers(pagination.page, pagination.totalPages).map((n, idx) =>
                n === '…' ? (
                  <span key={`dots-${idx}`} className="px-2 py-1 text-sm text-gray-500">…</span>
                ) : (
                  <button
                    key={n}
                    onClick={() => setCurrentPage(n)}
                    className={`px-3 py-1 border rounded text-sm ${
                      n === pagination.page
                        ? 'bg-blue-500 text-white border-blue-500'
                        : 'hover:bg-gray-50'
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
              className="px-3 py-1 border rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
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
        <div className="space-y-4">
          {error && <p className="text-red-600 text-sm">{error}</p>}

          {mode === 'read' ? (
            <>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-gray-500 text-xs">Profile</div>
                  <div className="font-medium">
                    {(() => {
                      const a = accounts.find((x) => x._id === form.accountId);
                      return a ? `${a.name || a.email}` : form.accountId || '—';
                    })()}
                  </div>
                </div>
                <div>
                  <div className="text-gray-500 text-xs">Stage</div>
                  <div>
                    {form.stage ? (
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${stageBadgeClass(form.stage)}`}>
                        {stageLabel(form.stage)}
                      </span>
                    ) : <span className="text-gray-400">—</span>}
                  </div>
                </div>
                <div>
                  <div className="text-gray-500 text-xs">Status</div>
                  <div>
                    {form.status ? (
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${statusBadgeClass(form.status)}`}>
                        {statusLabel(form.status)}
                      </span>
                    ) : <span className="text-gray-400">—</span>}
                  </div>
                </div>
                <div>
                  <div className="text-gray-500 text-xs">Company</div>
                  <div className="font-medium">{form.companyName || '—'}</div>
                </div>
                <div>
                  <div className="text-gray-500 text-xs">Interviewer Name</div>
                  <div className="font-medium">{form.interviewerName || '—'}</div>
                </div>
                <div>
                  <div className="text-gray-500 text-xs">Applied Position</div>
                  <div className="font-medium">{form.appliedPosition || '—'}</div>
                </div>
                <div>
                  <div className="text-gray-500 text-xs">Main Tech Stack</div>
                  <div className="font-medium">{form.mainTechStack || '—'}</div>
                </div>
                <div>
                  <div className="text-gray-500 text-xs">Date</div>
                  <div>{form.date || '—'}</div>
                </div>
                <div>
                  <div className="text-gray-500 text-xs">Start time</div>
                  <div>{form.startTime || '—'}</div>
                </div>
                <div>
                  <div className="text-gray-500 text-xs">End time</div>
                  <div>{form.endTime || '—'}</div>
                </div>
              </div>
              <div>
                <div className="text-gray-500 text-xs mb-1">Interview Transcript</div>
                <div
                  className="prose-readonly bg-white"
                  dangerouslySetInnerHTML={{ __html: form.transcript || '<p class="text-gray-400 italic">—</p>' }}
                />
              </div>
              <div>
                <div className="text-gray-500 text-xs mb-1">Note</div>
                <div
                  className="prose-readonly bg-gray-50"
                  dangerouslySetInnerHTML={{ __html: form.note || '<p class="text-gray-400 italic">—</p>' }}
                />
              </div>
              <div className="flex justify-end pt-3 border-t border-gray-100">
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

              <div className="grid grid-cols-2 gap-3">
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
                  <label className="block text-sm font-medium mb-1">Main Tech Stack</label>
                  <input
                    className="input"
                    type="text"
                    value={form.mainTechStack}
                    onChange={(e) => setForm({ ...form, mainTechStack: e.target.value })}
                    placeholder="e.g. Python, FastAPI, PostgreSQL"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium">Interview Transcript</label>
                  <label className="text-xs text-blue-600 hover:text-blue-700 cursor-pointer">
                    Upload .txt / .md / .doc / .docx
                    <input
                      type="file"
                      accept=".txt,.md,.markdown,.doc,.docx,text/plain,text/markdown,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const ext = file.name.toLowerCase().split('.').pop() || '';
                        const isPlain = ext === 'txt' || ext === 'md' || ext === 'markdown';
                        const reader = new FileReader();
                        reader.onload = () => {
                          const raw = String(reader.result || '');
                          // Convert plain text/markdown to simple HTML paragraphs so the
                          // rich-text editor renders it readably.
                          const escaped = raw
                            .replace(/&/g, '&amp;')
                            .replace(/</g, '&lt;')
                            .replace(/>/g, '&gt;');
                          const html = escaped
                            .split(/\n{2,}/)
                            .map((p) => `<p>${p.replace(/\n/g, '<br/>')}</p>`)
                            .join('');
                          setForm((prev) => ({ ...prev, transcript: html }));
                          if (!isPlain) {
                            notify.error(
                              `${ext.toUpperCase()} files may not parse cleanly. Save as .txt or .md if the result looks garbled.`
                            );
                          } else {
                            notify.success('Transcript loaded');
                          }
                        };
                        reader.onerror = () => notify.error('Could not read the file');
                        reader.readAsText(file);
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>
                <div className="border border-gray-300 rounded-md">
                  <ReactQuill
                    theme="snow"
                    value={form.transcript}
                    onChange={(value) => setForm({ ...form, transcript: value })}
                    modules={QUILL_MODULES}
                    placeholder="Paste, write, or upload the transcript…"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Note</label>
                <div className="border border-gray-300 rounded-md">
                  <ReactQuill
                    theme="snow"
                    value={form.note}
                    onChange={(value) => setForm({ ...form, note: value })}
                    modules={QUILL_MODULES}
                    placeholder="Internal notes…"
                  />
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-3 border-t border-gray-100">
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
        <div className="space-y-4">
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <p className="text-sm text-gray-700">
            Are you sure you want to delete this interview? This action cannot be undone.
          </p>
          {active && (
            <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded">
              <div><span className="text-gray-500">Stage:</span> {active.stage ? stageLabel(active.stage) : '—'}</div>
              <div><span className="text-gray-500">When:</span> {formatScheduled(active.scheduledAt)}</div>
            </div>
          )}
          <div className="flex gap-2 justify-end pt-3 border-t border-gray-100">
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
  );
}
