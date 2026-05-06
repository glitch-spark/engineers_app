import useSWR from 'swr';
import { useEffect, useState } from 'react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import 'react-quill-new/dist/quill.bubble.css';
import Modal from '../components/Modal';
import { Pencil, Trash2, Filter, Calendar, User, Eye } from 'lucide-react';
import { useAuth } from '../auth/useAuth';
import * as api from '../api/endpoints';
import { ApiError } from '../api/client';
import { notify } from '../lib/notify';

const editorStyles = `
  .ql-editor { min-height: 200px; font-size: 14px; line-height: 1.5; }
  .ql-toolbar { border-top: 1px solid #ccc; border-left: 1px solid #ccc; border-right: 1px solid #ccc; }
  .ql-container { border-bottom: 1px solid #ccc; border-left: 1px solid #ccc; border-right: 1px solid #ccc; }
  .prose h1, .prose h2, .prose h3, .prose h4, .prose h5, .prose h6 { font-weight: 600; margin-top: 1.5em; margin-bottom: 0.5em; line-height: 1.25; }
  .prose h1 { font-size: 1.5em; } .prose h2 { font-size: 1.25em; } .prose h3 { font-size: 1.125em; }
  .prose p { margin-bottom: 1em; line-height: 1.6; }
  .prose ul, .prose ol { margin-bottom: 1em; padding-left: 1.5em; }
  .prose li { margin-bottom: 0.25em; }
  .prose strong { font-weight: 600; } .prose em { font-style: italic; } .prose u { text-decoration: underline; }
  .prose a { color: #2563eb; text-decoration: underline; } .prose a:hover { color: #1d4ed8; }
  .prose blockquote { border-left: 4px solid #e5e7eb; padding-left: 1em; margin: 1em 0; font-style: italic; color: #6b7280; }
  .prose .ql-indent-1 { padding-left: 3em; } .prose .ql-indent-2 { padding-left: 6em; } .prose .ql-indent-3 { padding-left: 9em; }
  .prose .ql-indent-4 { padding-left: 12em; } .prose .ql-indent-5 { padding-left: 15em; } .prose .ql-indent-6 { padding-left: 18em; }
  .prose .ql-code-block { background-color: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 0.375rem; padding: 1rem; font-family: 'Courier New', monospace; font-size: 0.875rem; margin: 1em 0; overflow-x: auto; }
  .prose .ql-code { background-color: #f3f4f6; padding: 0.125rem 0.25rem; border-radius: 0.25rem; font-family: 'Courier New', monospace; font-size: 0.875rem; }
`;

type WeeklyPlan = {
  _id: string;
  userId?: { _id: string; email?: string; name?: string };
  weekNumber: number;
  year: number;
  startDate: string;
  endDate: string;
  content: string;
  result: string;
  createdAt: string;
  updatedAt: string;
};

function getWeekInfo(date: Date) {
  const year = date.getFullYear();
  const startOfYear = new Date(year, 0, 1);
  const days = Math.floor((date.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
  const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7);

  const dayOfWeek = date.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const startDate = new Date(date);
  startDate.setDate(date.getDate() + mondayOffset);
  startDate.setHours(0, 0, 0, 0);

  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + 6);
  endDate.setHours(23, 59, 59, 999);

  return { weekNumber, year, startDate, endDate };
}

function formatDateRange(startDate: string, endDate: string) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  return `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`;
}

function getWeekDateRange(year: number, weekNumber: number) {
  const jan1 = new Date(year, 0, 1);
  const jan1Day = jan1.getDay();
  const mondayOffset = jan1Day === 0 ? -6 : 1 - jan1Day;
  const firstMonday = new Date(year, 0, 1 + mondayOffset);
  const start = new Date(firstMonday);
  start.setDate(firstMonday.getDate() + (weekNumber - 1) * 7);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start, end };
}

function formatWeekOptionLabel(year: number, weekNumber: number) {
  const { start, end } = getWeekDateRange(year, weekNumber);
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `Week ${weekNumber} (${start.toLocaleDateString(undefined, opts)} - ${end.toLocaleDateString(undefined, opts)})`;
}

function truncateHtml(html: string, maxLength: number): string {
  if (!html) return '';
  const plainText = html.replace(/<[^>]*>/g, '');
  if (plainText.length <= maxLength) return html;

  let truncated = plainText.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > maxLength * 0.8) truncated = truncated.substring(0, lastSpace);

  let htmlPosition = 0;
  let textPosition = 0;
  while (htmlPosition < html.length && textPosition < truncated.length) {
    if (html[htmlPosition] === '<') {
      while (htmlPosition < html.length && html[htmlPosition] !== '>') htmlPosition++;
      htmlPosition++;
    } else {
      if (html[htmlPosition] === truncated[textPosition]) textPosition++;
      htmlPosition++;
    }
  }
  return html.substring(0, htmlPosition) + '...';
}

function isWeekOver(endDate: string): boolean {
  const today = new Date();
  const weekEnd = new Date(endDate);
  if (today > weekEnd) return true;
  const dayOfWeek = today.getDay();
  const hour = today.getHours();
  if (dayOfWeek === 5 && hour >= 12) return true;
  return false;
}

const QUILL_MODULES = {
  toolbar: [
    [{ 'header': [1, 2, 3, false] }],
    ['bold', 'italic', 'underline', 'strike'],
    [{ 'list': 'ordered' }, { 'list': 'bullet' }],
    [{ 'indent': '-1' }, { 'indent': '+1' }],
    ['link'],
    ['clean'],
  ],
};

export default function WeeklyPlanPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [weekNumber, setWeekNumber] = useState(getWeekInfo(new Date()).weekNumber.toString());
  const [userId, setUserId] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const { data, mutate, isLoading } = useSWR(
    ['weekly-plans', year, weekNumber, isAdmin ? userId : '', currentPage, pageSize] as const,
    () => api.listWeeklyPlans({
      page: currentPage,
      limit: pageSize,
      ...(year ? { year: Number(year) } : {}),
      ...(weekNumber ? { weekNumber: Number(weekNumber) } : {}),
      ...(isAdmin && userId ? { userId } : {}),
    })
  );

  const { data: usersData } = useSWR(isAdmin ? ['users-list'] : null, () => api.listUsers());
  const users = (usersData?.users as Array<{ _id: string; name?: string; email?: string }>) || [];

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<WeeklyPlan | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewPlan, setPreviewPlan] = useState<WeeklyPlan | null>(null);

  const [form, setForm] = useState({
    selectedDate: '',
    weekNumber: 0,
    year: 0,
    startDate: '',
    endDate: '',
    content: '',
    result: '',
  });

  useEffect(() => {
    if (editing) {
      setForm({
        selectedDate: editing.startDate?.slice(0, 10) || '',
        weekNumber: editing.weekNumber,
        year: editing.year,
        startDate: editing.startDate,
        endDate: editing.endDate,
        content: editing.content,
        result: editing.result || '',
      });
    }
  }, [editing]);

  const openAdd = () => {
    setEditing(null);
    const today = new Date();
    const weekInfo = getWeekInfo(today);
    setForm({
      selectedDate: today.toISOString().split('T')[0],
      weekNumber: weekInfo.weekNumber,
      year: weekInfo.year,
      startDate: weekInfo.startDate.toISOString(),
      endDate: weekInfo.endDate.toISOString(),
      content: '',
      result: '',
    });
    setError('');
    setOpen(true);
  };

  const handleDateChange = (dateString: string) => {
    const date = new Date(dateString);
    const weekInfo = getWeekInfo(date);
    setForm({
      ...form,
      selectedDate: dateString,
      weekNumber: weekInfo.weekNumber,
      year: weekInfo.year,
      startDate: weekInfo.startDate.toISOString(),
      endDate: weekInfo.endDate.toISOString(),
    });
  };

  const save = async () => {
    if (!form.content.trim()) {
      notify.error('Content is required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const body = {
        weekNumber: form.weekNumber,
        year: form.year,
        startDate: form.startDate,
        endDate: form.endDate,
        content: form.content,
        result: form.result,
      };
      if (editing) {
        await api.updateWeeklyPlan(editing._id, body);
        notify.success(`Week ${form.weekNumber} plan updated`);
      } else {
        await api.createWeeklyPlan(body);
        notify.success(`Week ${form.weekNumber} plan created`);
      }
      setOpen(false);
      mutate();
    } catch (err) {
      notify.error(err instanceof ApiError ? err : 'Failed to save plan');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (plan: WeeklyPlan) => {
    if (!confirm('Are you sure you want to delete this weekly plan?')) return;
    try {
      await api.deleteWeeklyPlan(plan._id);
      notify.success('Weekly plan deleted');
      mutate();
    } catch (err) {
      notify.error(err, 'Failed to delete weekly plan');
    }
  };

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setCurrentPage(1);
  };

  const applyFilters = () => {
    setCurrentPage(1);
    mutate();
  };

  const openPreview = (plan: WeeklyPlan) => {
    setPreviewPlan(plan);
    setPreviewOpen(true);
  };

  const closePreview = () => {
    setPreviewOpen(false);
    setPreviewPlan(null);
  };

  const plans = (data?.plans as WeeklyPlan[]) || [];
  const pagination = data?.pagination;

  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);
  const weekOptions = Array.from({ length: 52 }, (_, i) => i + 1);

  return (
    <div className="space-y-4">
      <style>{editorStyles}</style>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Weekly Plans</h1>
        <button type="button" className="btn" onClick={openAdd}>
          <Calendar size={16} className="mr-2" />
          Add Plan
        </button>
      </div>

      <div className="flex items-end gap-3 flex-wrap">
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label className="block text-xs mb-1 text-gray-600">Year</label>
            <select className="select focus-ring" value={year} onChange={(e) => setYear(e.target.value)}>
              {yearOptions.map(y => (<option key={y} value={y}>{y}</option>))}
            </select>
          </div>
          <div>
            <label className="block text-xs mb-1 text-gray-600">Week</label>
            <select className="select focus-ring" value={weekNumber} onChange={(e) => setWeekNumber(e.target.value)}>
              <option value="">All weeks</option>
              {weekOptions.map(w => (<option key={w} value={w}>{formatWeekOptionLabel(Number(year), w)}</option>))}
            </select>
          </div>
          {isAdmin && (
            <div>
              <label className="block text-xs mb-1 text-gray-600">User</label>
              <select className="select focus-ring" value={userId} onChange={(e) => setUserId(e.target.value)}>
                <option value="">All users</option>
                {users.map((u) => (
                  <option key={u._id} value={u._id}>{u.name || u.email}</option>
                ))}
              </select>
            </div>
          )}
          <button type="button" className="btn" onClick={applyFilters}>
            <Filter size={16} className="mr-2" />
            Apply
          </button>
        </div>
      </div>

      {data && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600">
            <span>
              Showing {pagination?.total ?? 0} plan{pagination?.total !== 1 ? 's' : ''} total
            </span>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Show:</label>
            <select
              value={pageSize}
              onChange={(e) => handlePageSizeChange(Number(e.target.value))}
              className="select focus-ring text-sm"
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>
      )}

      <div className="bg-white rounded-md border border-gray-100 shadow-sm overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
            <tr>
              <th className="px-3 py-2">Week</th>
              <th className="px-3 py-2">Date Range</th>
              <th className="px-3 py-2">Content Preview</th>
              <th className="px-3 py-2">Owner</th>
              <th className="px-3 py-2 w-48">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mr-3"></div>
                    Loading weekly plans...
                  </div>
                </td>
              </tr>
            ) : plans.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-500">No weekly plans found.</td></tr>
            ) : (
              plans.map((plan) => (
                <tr
                  key={plan._id}
                  className="border-t hover:bg-gray-50 cursor-pointer"
                  onClick={() => openPreview(plan)}
                >
                  <td className="px-3 py-2">
                    <div className="font-medium flex items-center gap-2">
                      Week {plan.weekNumber}
                      {plan.result && plan.result.trim() !== '' && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Results
                        </span>
                      )}
                      {isWeekOver(plan.endDate) && (!plan.result || plan.result.trim() === '') && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                          {new Date(plan.endDate) < new Date() ? 'Add Results' : 'Reflect'}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500">{plan.year}</div>
                  </td>
                  <td className="px-3 py-2">{formatDateRange(plan.startDate, plan.endDate)}</td>
                  <td className="px-3 py-2">
                    <div
                      className="max-w-xs text-sm prose prose-sm max-w-none"
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: '-webkit-box',
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: 'vertical',
                        lineHeight: '1.4',
                        maxHeight: '4.2em',
                        fontSize: '13px'
                      }}
                      title={plan.content ? plan.content.replace(/<[^>]*>/g, '') : 'No content'}
                      dangerouslySetInnerHTML={{
                        __html: plan.content ? truncateHtml(plan.content, 150) : '—'
                      }}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <User size={14} className="text-gray-400" />
                      <span>{plan.userId?.name || plan.userId?.email || '—'}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
                      <button type="button" className="btn" onClick={() => openPreview(plan)} title="Preview">
                        <Eye size={16} />
                      </button>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => { setEditing(plan); setError(''); setOpen(true); }}
                        title="Edit"
                      >
                        <Pencil size={16} />
                      </button>
                      <button type="button" className="btn" onClick={() => remove(plan)} title="Delete">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600">
            Showing {((pagination.page - 1) * pagination.limit) + 1} to{' '}
            {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
            {pagination.total} results
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
              {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                let pageNum;
                if (pagination.totalPages <= 5) pageNum = i + 1;
                else if (pagination.page <= 3) pageNum = i + 1;
                else if (pagination.page >= pagination.totalPages - 2) pageNum = pagination.totalPages - 4 + i;
                else pageNum = pagination.page - 2 + i;

                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`px-3 py-1 border rounded text-sm ${
                      pageNum === pagination.page
                        ? 'bg-blue-500 text-white border-blue-500'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
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

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Edit Weekly Plan' : 'Add Weekly Plan'}>
        <div className="space-y-4">
          {error && <p className="text-red-600 text-sm">{error}</p>}

          <div>
            <label className="block text-sm font-medium mb-1">Select Date</label>
            <input
              className="input"
              type="date"
              value={form.selectedDate}
              onChange={(e) => handleDateChange(e.target.value)}
            />
            <p className="text-xs text-gray-500 mt-1">
              Week {form.weekNumber} of {form.year} ({formatDateRange(form.startDate, form.endDate)})
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Plan Content</label>
            <div className="border border-gray-300 rounded-md">
              <ReactQuill
                theme="snow"
                value={form.content}
                onChange={(value) => setForm({ ...form, content: value })}
                placeholder="Enter your weekly plan details..."
                style={{ minHeight: '180px' }}
                modules={QUILL_MODULES}
              />
            </div>
          </div>

          {(isWeekOver(form.endDate) || (editing && editing.result)) && (
            <div>
              <label className="block text-sm font-medium mb-1">
                Results & Outcomes
                <span className="text-xs text-gray-500 ml-1">
                  {new Date(form.endDate) < new Date()
                    ? '(How did the week go? What was accomplished?)'
                    : '(How is the week going so far? What have you accomplished?)'}
                </span>
              </label>
              <div className="border border-gray-300 rounded-md">
                <ReactQuill
                  theme="snow"
                  value={form.result}
                  onChange={(value) => setForm({ ...form, result: value })}
                  placeholder={
                    new Date(form.endDate) < new Date()
                      ? 'Enter your results and outcomes for this week...'
                      : 'Reflect on your progress so far this week...'
                  }
                  style={{ minHeight: '120px' }}
                  modules={QUILL_MODULES}
                />
              </div>
            </div>
          )}

          <div className="flex gap-2 justify-end pt-4 border-t border-gray-100 mt-6">
            <button
              type="button"
              className="btn"
              onClick={save}
              disabled={!form.content.trim() || saving}
            >
              {saving ? (editing ? 'Saving...' : 'Creating...') : editing ? 'Save changes' : 'Create Plan'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={previewOpen}
        onClose={closePreview}
        title={previewPlan ? `Weekly Plan - Week ${previewPlan.weekNumber}` : 'Preview Plan'}
      >
        {previewPlan && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <label className="font-medium text-gray-600">Week</label>
                <p>Week {previewPlan.weekNumber} of {previewPlan.year}</p>
              </div>
              <div>
                <label className="font-medium text-gray-600">Date Range</label>
                <p>{formatDateRange(previewPlan.startDate, previewPlan.endDate)}</p>
              </div>
              <div>
                <label className="font-medium text-gray-600">Owner</label>
                <p className="flex items-center gap-1">
                  <User size={14} className="text-gray-400" />
                  {previewPlan.userId?.name || previewPlan.userId?.email || '—'}
                </p>
              </div>
              <div>
                <label className="font-medium text-gray-600">Created</label>
                <p>{new Date(previewPlan.createdAt).toLocaleDateString()}</p>
              </div>
            </div>

            <div>
              <label className="font-medium text-gray-600 block mb-2">Plan Content</label>
              <div
                className="prose prose-sm max-w-none p-4 border border-gray-200 rounded-md bg-white min-h-[150px] max-h-[300px] overflow-auto"
                style={{ fontSize: '14px', lineHeight: '1.6' }}
                dangerouslySetInnerHTML={{
                  __html: previewPlan.content && previewPlan.content.trim() !== ''
                    ? previewPlan.content
                    : '<p class="text-gray-500 italic">No content available.</p>'
                }}
              />
            </div>

            {(isWeekOver(previewPlan.endDate) || (previewPlan.result && previewPlan.result.trim() !== '')) && (
              <div>
                <label className="font-medium text-gray-600 block mb-2">Results & Outcomes</label>
                <div
                  className="prose prose-sm max-w-none p-4 border border-gray-200 rounded-md bg-gray-50 min-h-[100px] max-h-[250px] overflow-auto"
                  style={{ fontSize: '14px', lineHeight: '1.6' }}
                  dangerouslySetInnerHTML={{
                    __html: previewPlan.result && previewPlan.result.trim() !== ''
                      ? previewPlan.result
                      : '<p class="text-gray-500 italic">No results recorded yet.</p>'
                  }}
                />
              </div>
            )}

            <div className="flex gap-2 justify-end pt-4 border-t border-gray-100 mt-6">
              <button
                type="button"
                className="btn"
                onClick={() => {
                  closePreview();
                  setEditing(previewPlan);
                  setError('');
                  setOpen(true);
                }}
              >
                <Pencil size={16} className="mr-2" />
                Edit Plan
              </button>
              <button type="button" className="btn" onClick={closePreview}>
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
