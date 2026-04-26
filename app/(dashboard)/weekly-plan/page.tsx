'use client';

import useSWR from 'swr';
import { useSession } from 'next-auth/react';
import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Modal from '@/components/Modal';
import { Pencil, Trash2, Filter, Calendar, User, Eye } from 'lucide-react';

// Dynamically import ReactQuill to avoid SSR issues
const ReactQuill = dynamic(() => import('react-quill'), { ssr: false });
import 'react-quill/dist/quill.snow.css';
import 'react-quill/dist/quill.bubble.css';

// Custom styles for the rich text editor and content display
const editorStyles = `
  .ql-editor {
    min-height: 200px;
    font-size: 14px;
    line-height: 1.5;
  }
  .ql-toolbar {
    border-top: 1px solid #ccc;
    border-left: 1px solid #ccc;
    border-right: 1px solid #ccc;
  }
  .ql-container {
    border-bottom: 1px solid #ccc;
    border-left: 1px solid #ccc;
    border-right: 1px solid #ccc;
  }
  
  /* Rich text content styling */
  .prose h1, .prose h2, .prose h3, .prose h4, .prose h5, .prose h6 {
    font-weight: 600;
    margin-top: 1.5em;
    margin-bottom: 0.5em;
    line-height: 1.25;
  }
  .prose h1 { font-size: 1.5em; }
  .prose h2 { font-size: 1.25em; }
  .prose h3 { font-size: 1.125em; }
  
  .prose p {
    margin-bottom: 1em;
    line-height: 1.6;
  }
  
  .prose ul, .prose ol {
    margin-bottom: 1em;
    padding-left: 1.5em;
  }
  
  .prose li {
    margin-bottom: 0.25em;
  }
  
  /* ReactQuill specific list styling */
  .prose .ql-list {
    margin-bottom: 1em;
    padding-left: 1.5em;
  }
  
  .prose .ql-list.ql-list-ordered {
    list-style-type: decimal;
  }
  
  .prose .ql-list.ql-list-bullet {
    list-style-type: disc;
  }
  
  .prose .ql-list li {
    margin-bottom: 0.25em;
    display: list-item;
  }
  
  .prose .ql-list.ql-list-ordered li {
    list-style-type: decimal;
  }
  
  .prose .ql-list.ql-list-bullet li {
    list-style-type: disc;
  }
  
  /* Handle nested lists */
  .prose .ql-list .ql-list {
    margin-top: 0.25em;
    margin-bottom: 0.25em;
  }
  
  .prose .ql-list .ql-list.ql-list-ordered {
    list-style-type: lower-alpha;
  }
  
  .prose .ql-list .ql-list .ql-list.ql-list-ordered {
    list-style-type: lower-roman;
  }
  
  .prose strong {
    font-weight: 600;
  }
  
  .prose em {
    font-style: italic;
  }
  
  .prose u {
    text-decoration: underline;
  }
  
  .prose a {
    color: #2563eb;
    text-decoration: underline;
  }
  
  .prose a:hover {
    color: #1d4ed8;
  }
  
  .prose blockquote {
    border-left: 4px solid #e5e7eb;
    padding-left: 1em;
    margin: 1em 0;
    font-style: italic;
    color: #6b7280;
  }
  
  /* ReactQuill specific elements */
  .prose .ql-indent-1 { padding-left: 3em; }
  .prose .ql-indent-2 { padding-left: 6em; }
  .prose .ql-indent-3 { padding-left: 9em; }
  .prose .ql-indent-4 { padding-left: 12em; }
  .prose .ql-indent-5 { padding-left: 15em; }
  .prose .ql-indent-6 { padding-left: 18em; }
  .prose .ql-indent-7 { padding-left: 21em; }
  .prose .ql-indent-8 { padding-left: 24em; }
  
  /* ReactQuill headers */
  .prose .ql-header-1 { font-size: 1.5em; font-weight: 600; margin: 1.5em 0 0.5em 0; }
  .prose .ql-header-2 { font-size: 1.25em; font-weight: 600; margin: 1.5em 0 0.5em 0; }
  .prose .ql-header-3 { font-size: 1.125em; font-weight: 600; margin: 1.5em 0 0.5em 0; }
  
  /* ReactQuill text formatting */
  .prose .ql-bold { font-weight: 600; }
  .prose .ql-italic { font-style: italic; }
  .prose .ql-underline { text-decoration: underline; }
  .prose .ql-strike { text-decoration: line-through; }
  
  /* ReactQuill links */
  .prose .ql-link { color: #2563eb; text-decoration: underline; }
  .prose .ql-link:hover { color: #1d4ed8; }
  
  /* ReactQuill code */
  .prose .ql-code-block {
    background-color: #f3f4f6;
    border: 1px solid #e5e7eb;
    border-radius: 0.375rem;
    padding: 1rem;
    font-family: 'Courier New', monospace;
    font-size: 0.875rem;
    margin: 1em 0;
    overflow-x: auto;
  }
  
  .prose .ql-code {
    background-color: #f3f4f6;
    padding: 0.125rem 0.25rem;
    border-radius: 0.25rem;
    font-family: 'Courier New', monospace;
    font-size: 0.875rem;
  }
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

type PaginationData = {
  plans: WeeklyPlan[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
};

const fetcher = (u: string) => fetch(u).then(r => r.json());

// Helper function to get week info from date
function getWeekInfo(date: Date) {
  const year = date.getFullYear();
  const startOfYear = new Date(year, 0, 1);
  const days = Math.floor((date.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
  const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7);
  
  // Get start and end of week (Monday to Sunday)
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

// Helper function to format date range
function formatDateRange(startDate: string, endDate: string) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  return `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`;
}

// Helper function to truncate HTML content safely
function truncateHtml(html: string, maxLength: number): string {
  if (!html) return '';
  
  // Remove HTML tags to get plain text length
  const plainText = html.replace(/<[^>]*>/g, '');
  
  if (plainText.length <= maxLength) {
    return html;
  }
  
  // Find a good breaking point near maxLength
  let truncated = plainText.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  
  if (lastSpace > maxLength * 0.8) {
    truncated = truncated.substring(0, lastSpace);
  }
  
  // Find the corresponding position in the original HTML
  let htmlPosition = 0;
  let textPosition = 0;
  
  while (htmlPosition < html.length && textPosition < truncated.length) {
    if (html[htmlPosition] === '<') {
      // Skip HTML tag
      while (htmlPosition < html.length && html[htmlPosition] !== '>') {
        htmlPosition++;
      }
      htmlPosition++; // Skip the '>'
    } else {
      if (html[htmlPosition] === truncated[textPosition]) {
        textPosition++;
      }
      htmlPosition++;
    }
  }
  
  return html.substring(0, htmlPosition) + '...';
}

// Helper function to check if the week is over or if it's Friday afternoon
function isWeekOver(endDate: string): boolean {
  const today = new Date();
  const weekEnd = new Date(endDate);
  
  // Check if the week has completely ended
  if (today > weekEnd) {
    return true;
  }
  
  // Check if it's Friday afternoon (after 12:00 PM on Friday)
  const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, ..., 5 = Friday, 6 = Saturday
  const hour = today.getHours();
  
  // If it's Friday and after 12:00 PM (noon), show results field
  if (dayOfWeek === 5 && hour >= 12) {
    return true;
  }
  
  return false;
}

export default function WeeklyPlanPage() {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role as 'admin' | 'staff' | undefined;
  const isAdmin = role === 'admin';

  // Filters
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [weekNumber, setWeekNumber] = useState(getWeekInfo(new Date()).weekNumber.toString());
  const [userId, setUserId] = useState('');
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const plansUrl = useMemo(() => {
    const qs = new URLSearchParams();
    if (year) qs.set('year', year);
    if (weekNumber) qs.set('weekNumber', weekNumber);
    if (isAdmin && userId) qs.set('userId', userId);
    qs.set('page', currentPage.toString());
    qs.set('limit', pageSize.toString());
    const q = qs.toString();
    return `/api/weekly-plans?${q}`;
  }, [year, weekNumber, isAdmin, userId, currentPage, pageSize]);

  const { data, mutate, isLoading } = useSWR<PaginationData>(plansUrl, fetcher);
  const { data: usersData } = useSWR<{ users: any[]; pagination: any } | null>(isAdmin ? '/api/users' : null, fetcher);
  const users = usersData?.users || [];

  // Modal state
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<WeeklyPlan | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  
  // Preview dialog state
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewPlan, setPreviewPlan] = useState<WeeklyPlan | null>(null);

  // Form state
  const [form, setForm] = useState({
    selectedDate: '',
    weekNumber: 0,
    year: 0,
    startDate: '',
    endDate: '',
    content: '',
    result: '',
  });

  // Preload form on edit
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
      setError('Content is required');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const url = editing ? `/api/weekly-plans/${editing._id}` : '/api/weekly-plans';
      const method = editing ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weekNumber: form.weekNumber,
          year: form.year,
          startDate: form.startDate,
          endDate: form.endDate,
          content: form.content,
          result: form.result,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error);
      }

      setOpen(false);
      mutate();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (plan: WeeklyPlan) => {
    if (!confirm('Are you sure you want to delete this weekly plan?')) return;
    
    try {
      await fetch(`/api/weekly-plans/${plan._id}`, { method: 'DELETE' });
      mutate();
    } catch (err) {
      console.error('Failed to delete weekly plan:', err);
    }
  };


  const handlePageChange = (page: number) => {
    setCurrentPage(page);
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

  const plans = data?.plans || [];
  const pagination = data?.pagination;

  // Generate year options
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  // Generate week options
  const weekOptions = Array.from({ length: 52 }, (_, i) => i + 1);

  return (
    <div className="space-y-4">
      <style jsx>{editorStyles}</style>
      {/* Header + Title */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Weekly Plans</h1>
        <button type="button" className="btn" onClick={openAdd}>
          <Calendar size={16} className="mr-2" />
          Add Plan
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-end gap-3 flex-wrap">
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label className="block text-xs mb-1 text-gray-600">Year</label>
            <select
              className="select focus-ring"
              value={year}
              onChange={(e) => setYear(e.target.value)}
            >
              {yearOptions.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs mb-1 text-gray-600">Week</label>
            <select
              className="select focus-ring"
              value={weekNumber}
              onChange={(e) => setWeekNumber(e.target.value)}
            >
              <option value="">All weeks</option>
              {weekOptions.map(w => (
                <option key={w} value={w}>Week {w}</option>
              ))}
            </select>
          </div>
          {isAdmin && (
            <div>
              <label className="block text-xs mb-1 text-gray-600">User</label>
              <select
                className="select focus-ring"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
              >
                <option value="">All users</option>
                {(users || []).map((u: any) => (
                  <option key={u._id} value={u._id}>
                    {u.name || u.email}
                  </option>
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

      {/* Results Summary */}
      {data && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600">
            <span>
              Showing {data.pagination.total} plan{data.pagination.total !== 1 ? 's' : ''} total
            </span>
          </div>
          
          {/* Page Size Selector */}
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

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100 text-left">
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
                <td colSpan={5} className="px-3 py-6 text-center text-gray-500">
                  Loading...
                </td>
              </tr>
            ) : plans.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-gray-500">
                  No weekly plans found.
                </td>
              </tr>
            ) : (
              plans.map((plan) => {
                const canEdit = true; // Users can always edit their own plans
                const canDelete = true; // Users can always delete their own plans
                
                return (
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
                    <td className="px-3 py-2">
                      {formatDateRange(plan.startDate, plan.endDate)}
                    </td>
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
                        {/* Preview */}
                        <button
                          type="button"
                          className="btn"
                          onClick={() => openPreview(plan)}
                          title="Preview"
                        >
                          <Eye size={16} />
                        </button>
                        {/* Edit */}
                        <button
                          type="button"
                          className="btn"
                          onClick={() => {
                            setEditing(plan);
                            setError('');
                            setOpen(true);
                          }}
                          disabled={!canEdit}
                          title="Edit"
                        >
                          <Pencil size={16} />
                        </button>
                        {/* Delete */}
                        <button
                          type="button"
                          className="btn"
                          onClick={() => remove(plan)}
                          disabled={!canDelete}
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600">
            Showing {((pagination.page - 1) * pagination.limit) + 1} to{' '}
            {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
            {pagination.total} results
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => handlePageChange(pagination.page - 1)}
              disabled={!pagination.hasPrev}
              className="px-3 py-1 border rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              Previous
            </button>
            
            {/* Page Numbers */}
            <div className="flex gap-1">
              {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                let pageNum;
                if (pagination.totalPages <= 5) {
                  pageNum = i + 1;
                } else if (pagination.page <= 3) {
                  pageNum = i + 1;
                } else if (pagination.page >= pagination.totalPages - 2) {
                  pageNum = pagination.totalPages - 4 + i;
                } else {
                  pageNum = pagination.page - 2 + i;
                }
                
                return (
                  <button
                    key={pageNum}
                    onClick={() => handlePageChange(pageNum)}
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
              onClick={() => handlePageChange(pagination.page + 1)}
              disabled={!pagination.hasNext}
              className="px-3 py-1 border rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Modal */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Edit Weekly Plan' : 'Add Weekly Plan'}
      >
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
                modules={{
                  toolbar: [
                    [{ 'header': [1, 2, 3, false] }],
                    ['bold', 'italic', 'underline', 'strike'],
                    [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                    [{ 'indent': '-1'}, { 'indent': '+1' }],
                    ['link'],
                    ['clean']
                  ],
                }}
              />
            </div>
          </div>

          {/* Result field - only show if week is over or if editing an existing plan with result */}
          {(isWeekOver(form.endDate) || (editing && editing.result)) && (
            <div>
              <label className="block text-sm font-medium mb-1">
                Results & Outcomes
                <span className="text-xs text-gray-500 ml-1">
                  {new Date(form.endDate) < new Date() 
                    ? '(How did the week go? What was accomplished?)'
                    : '(How is the week going so far? What have you accomplished?)'
                  }
                </span>
              </label>
              <div className="border border-gray-300 rounded-md">
                <ReactQuill
                  theme="snow"
                  value={form.result}
                  onChange={(value) => setForm({ ...form, result: value })}
                  placeholder={
                    new Date(form.endDate) < new Date() 
                      ? "Enter your results and outcomes for this week..."
                      : "Reflect on your progress so far this week..."
                  }
                  style={{ minHeight: '120px' }}
                  modules={{
                    toolbar: [
                      [{ 'header': [1, 2, 3, false] }],
                      ['bold', 'italic', 'underline', 'strike'],
                      [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                      [{ 'indent': '-1'}, { 'indent': '+1' }],
                      ['link'],
                      ['clean']
                    ],
                  }}
                />
              </div>
            </div>
          )}

          {/* Footer buttons - Fixed at bottom */}
          <div className="flex gap-2 justify-end pt-4 border-t border-gray-100 mt-6">
            <button
              type="button"
              className="btn"
              onClick={save}
              disabled={!form.content.trim() || saving}
            >
              {saving
                ? editing
                  ? 'Saving...'
                  : 'Creating...'
                : editing
                ? 'Save changes'
                : 'Create Plan'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Preview Dialog */}
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
                style={{
                  fontSize: '14px',
                  lineHeight: '1.6'
                }}
                dangerouslySetInnerHTML={{ 
                  __html: previewPlan.content && previewPlan.content.trim() !== '' 
                    ? previewPlan.content 
                    : '<p class="text-gray-500 italic">No content available.</p>' 
                }}
              />
            </div>

            {/* Results section - only show if week is over or if there are results */}
            {(isWeekOver(previewPlan.endDate) || (previewPlan.result && previewPlan.result.trim() !== '')) && (
              <div>
                <label className="font-medium text-gray-600 block mb-2">Results & Outcomes</label>
                <div 
                  className="prose prose-sm max-w-none p-4 border border-gray-200 rounded-md bg-gray-50 min-h-[100px] max-h-[250px] overflow-auto"
                  style={{
                    fontSize: '14px',
                    lineHeight: '1.6'
                  }}
                  dangerouslySetInnerHTML={{ 
                    __html: previewPlan.result && previewPlan.result.trim() !== '' 
                      ? previewPlan.result 
                      : '<p class="text-gray-500 italic">No results recorded yet.</p>' 
                  }}
                />
              </div>
            )}

            {/* Footer buttons */}
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
              <button
                type="button"
                className="btn"
                onClick={closePreview}
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
