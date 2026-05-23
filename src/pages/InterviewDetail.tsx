import { useState } from 'react';
import useSWR from 'swr';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Sparkles, Trash2 } from 'lucide-react';
import * as api from '../api/endpoints';
import { useAuth } from '../auth/useAuth';
import { notify } from '../lib/notify';

const STAGES: Record<string, string> = {
  intro: 'Intro',
  tech: 'Tech',
  panel: 'Panel',
  live_coding: 'Live Coding',
  system_design: 'System Design',
  cultural: 'Cultural',
  final: 'Final',
  ai_interview: 'AI Interview',
};

const STATUSES: Record<string, string> = {
  scheduled: 'Scheduled',
  completed: 'Completed',
  passed: 'Passed',
  failed: 'Failed',
  no_show: 'No Show',
  rescheduled: 'Rescheduled',
  canceled: 'Canceled',
};

const stageBadgeClass = (s?: string | null) => {
  switch (s) {
    case 'intro': return 'bg-gray-100 text-gray-700 border-gray-200';
    case 'tech': return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'panel': return 'bg-purple-100 text-purple-800 border-purple-200';
    case 'live_coding': return 'bg-indigo-100 text-indigo-800 border-indigo-200';
    case 'system_design': return 'bg-cyan-100 text-cyan-800 border-cyan-200';
    case 'cultural': return 'bg-pink-100 text-pink-800 border-pink-200';
    case 'final': return 'bg-amber-100 text-amber-800 border-amber-200';
    case 'ai_interview': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    default: return 'bg-gray-100 text-gray-700 border-gray-200';
  }
};

const statusBadgeClass = (s?: string | null) => {
  switch (s) {
    case 'scheduled': return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'completed': return 'bg-gray-100 text-gray-700 border-gray-200';
    case 'passed': return 'bg-green-100 text-green-800 border-green-200';
    case 'failed': return 'bg-red-100 text-red-800 border-red-200';
    case 'no_show': return 'bg-orange-100 text-orange-800 border-orange-200';
    case 'rescheduled': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'canceled': return 'bg-gray-200 text-gray-700 border-gray-300';
    default: return 'bg-gray-50 text-gray-500 border-gray-200';
  }
};

const proseStyles = `
  .prose-block {
    font-size: 14px;
    line-height: 1.6;
    padding: 0.75rem 1rem;
    border: 1px solid #e5e7eb;
    border-radius: 0.5rem;
    background: #fff;
    overflow-wrap: break-word;
    word-break: break-word;
  }
  .prose-block p { margin: 0 0 0.5em 0; }
  .prose-block p:last-child { margin-bottom: 0; }
  .prose-block h1, .prose-block h2, .prose-block h3 { font-weight: 600; margin: 0.5em 0 0.25em; }
  .prose-block h1 { font-size: 1.25em; } .prose-block h2 { font-size: 1.15em; } .prose-block h3 { font-size: 1.05em; }
  .prose-block ul, .prose-block ol { margin: 0 0 0.5em 0; padding-left: 1.25em; }
  .prose-block a { color: #2563eb; text-decoration: underline; }
  .prose-block img { max-width: 100%; height: auto; }
  .prose-block pre, .prose-block code { white-space: pre-wrap; word-break: break-all; }
`;

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
  transcript?: string;
  note?: string;
  ownerName?: string | null;
  ownerEmail?: string | null;
};

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function tzAbbrev(d: Date): string {
  const parts = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' }).formatToParts(d);
  return parts.find((p) => p.type === 'timeZoneName')?.value || '';
}

function fmt24(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** "May 2, 15:00 - 15:30, EST" */
function formatRange(startIso?: string, endIso?: string | null): string {
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

export default function InterviewDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const meId = user?.id ?? '';

  const { data, isLoading, error, mutate } = useSWR(
    id ? ['interview', id] as const : null,
    () => api.getInterview(id!),
  );

  if (!id) return <div className="p-6 text-gray-500">Missing interview id.</div>;
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-500">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mr-3"></div>
        Loading interview...
      </div>
    );
  }
  if (error || !data) {
    const e = error as { status?: number; body?: unknown; message?: string } | undefined;
    const status = e?.status;
    const detail =
      (e?.body && typeof e.body === 'object' && 'detail' in (e.body as Record<string, unknown>)
        ? String((e.body as { detail?: unknown }).detail ?? '')
        : '') || e?.message || '';
    const friendly =
      status === 403 ? 'You don\'t have access to this interview.'
      : status === 404 ? 'This interview no longer exists.'
      : 'Couldn\'t load this interview.';
    return (
      <div className="p-6 space-y-3">
        <div className="text-red-600 font-medium">{friendly}</div>
        {detail && <div className="text-sm text-gray-600">{detail}</div>}
        <Link to="/interviews" className="btn"><ArrowLeft size={16} className="mr-1" /> Back to Interviews</Link>
      </div>
    );
  }

  const iv = data as unknown as Interview;
  const account = typeof iv.accountId === 'object' ? iv.accountId : null;
  const creator = typeof iv.createdBy === 'object' ? iv.createdBy : null;
  const createdById = typeof iv.createdBy === 'string' ? iv.createdBy : iv.createdBy?._id;
  const canEdit = isAdmin || createdById === meId;

  const onDelete = async () => {
    if (!confirm('Delete this interview? This cannot be undone.')) return;
    try {
      await api.deleteInterview(iv._id);
      notify.success('Interview deleted');
      mutate();
      navigate('/interviews');
    } catch (err) {
      notify.error(err, 'Failed to delete interview');
    }
  };

  return (
    <div className="space-y-5">
      <style>{proseStyles}</style>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link to="/interviews" className="btn" title="Back to Interviews">
            <ArrowLeft size={16} />
          </Link>
          <div>
            <h1 className="page-title">
              {(iv.stage ? STAGES[iv.stage] || iv.stage : 'Interview')}
              {iv.companyName ? ` with ${iv.companyName}` : ''}
            </h1>
            <div className="text-sm text-gray-500">
              {iv.appliedPosition ? `${iv.appliedPosition} · ` : ''}
              {formatRange(iv.scheduledAt, iv.endsAt)}
              {iv.interviewerName ? ` · w/ ${iv.interviewerName}` : ''}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Link to={`/interviews/${iv._id}/review`} className="btn">
            <Sparkles size={16} className="mr-1" /> AI Review
          </Link>
          <button
            type="button"
            className="btn"
            onClick={() => navigate(`/interviews?edit=${iv._id}`)}
            disabled={!canEdit}
            title={canEdit ? 'Edit' : 'Only the creator or an admin can edit'}
          >
            <Pencil size={16} className="mr-1" /> Edit
          </button>
          <button
            type="button"
            className="btn"
            onClick={onDelete}
            disabled={!canEdit}
            title={canEdit ? 'Delete' : 'Only the creator or an admin can delete'}
            style={canEdit ? { backgroundColor: '#dc2626', color: 'white' } : undefined}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* Meta */}
      <div className="card p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div>
          <div className="text-gray-500 text-xs">Stage</div>
          <div>
            {iv.stage ? (
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${stageBadgeClass(iv.stage)}`}>
                {STAGES[iv.stage] || iv.stage}
              </span>
            ) : <span className="text-gray-400">—</span>}
          </div>
        </div>
        <div>
          <div className="text-gray-500 text-xs">Status</div>
          <div>
            {iv.status ? (
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${statusBadgeClass(iv.status)}`}>
                {STATUSES[iv.status] || iv.status}
              </span>
            ) : <span className="text-gray-400">—</span>}
          </div>
        </div>
        <div>
          <div className="text-gray-500 text-xs">Company</div>
          <div className="font-medium">{iv.companyName || '—'}</div>
        </div>
        <div>
          <div className="text-gray-500 text-xs">Interviewer Name</div>
          <div className="font-medium">{iv.interviewerName || '—'}</div>
        </div>
        <div>
          <div className="text-gray-500 text-xs">Applied Position</div>
          <div className="font-medium">{iv.appliedPosition || '—'}</div>
        </div>
        <div>
          <div className="text-gray-500 text-xs">Profile</div>
          <div className="font-medium">{account?.name || '—'}</div>
        </div>
        <div>
          <div className="text-gray-500 text-xs">Creator</div>
          <div>{iv.ownerName || creator?.name || iv.ownerEmail || creator?.email || '—'}</div>
        </div>
        <div>
          <div className="text-gray-500 text-xs">When</div>
          <div>{formatRange(iv.scheduledAt, iv.endsAt)}</div>
        </div>
      </div>

      {/* Body sections */}
      <div className="space-y-3">
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Interview Transcript</div>
          <div
            className="prose-block"
            dangerouslySetInnerHTML={{ __html: iv.transcript || '<p class="text-gray-400 italic">—</p>' }}
          />
        </div>
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Note</div>
          <div
            className="prose-block bg-gray-50"
            dangerouslySetInnerHTML={{ __html: iv.note || '<p class="text-gray-400 italic">—</p>' }}
          />
        </div>
        <ExtractedQuestions interviewId={id} hasTranscript={!!(iv.transcript || '').trim()} />
      </div>
    </div>
  );
}

function ExtractedQuestions({ interviewId, hasTranscript }: { interviewId: string; hasTranscript: boolean }) {
  const { data, mutate, isLoading } = useSWR(
    ['interview-questions', interviewId],
    () => api.listInterviewQuestions(interviewId),
    { refreshInterval: 8000 },
  );
  const [reextracting, setReextracting] = useState(false);

  async function reextract() {
    setReextracting(true);
    try {
      await api.reextractInterview(interviewId);
      notify.success('Re-extraction queued');
      setTimeout(() => mutate(), 1500);
    } catch (err) {
      notify.error(err, 'Could not re-extract');
    } finally {
      setReextracting(false);
    }
  }

  const questions = data?.questions ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs text-gray-500 uppercase tracking-wide">Extracted questions</div>
        {hasTranscript && (
          <button
            type="button"
            onClick={reextract}
            disabled={reextracting}
            className="text-xs text-primary hover:underline disabled:opacity-50"
          >
            {reextracting ? 'Queuing…' : 'Re-extract'}
          </button>
        )}
      </div>
      {!hasTranscript ? (
        <div className="text-xs text-gray-400 italic">Upload a transcript to enable extraction.</div>
      ) : isLoading && questions.length === 0 ? (
        <div className="text-xs text-gray-400">Loading…</div>
      ) : questions.length === 0 ? (
        <div className="text-xs text-gray-400 italic">
          No extracted questions yet. Extraction runs automatically when a transcript is saved (~30-60s).
          Use Re-extract if it didn't trigger.
        </div>
      ) : (
        <ol className="space-y-2">
          {questions.map((q, i) => (
            <li key={q._id} className="border border-gray-200 rounded-md p-3 bg-white">
              <div className="flex items-start justify-between gap-2 mb-1">
                <p className="text-sm font-medium text-gray-900 flex-1">
                  <span className="text-gray-400 mr-2">{i + 1}.</span>
                  {q.question}
                </p>
                {q.score != null && (
                  <span className={`text-xs font-semibold ${scoreTextColor(q.score)}`}>
                    {q.score}/10
                  </span>
                )}
              </div>
              {q.candidateAnswer && (
                <p className="text-sm text-gray-700 whitespace-pre-wrap mb-1.5">{q.candidateAnswer}</p>
              )}
              {q.scoreRationale && (
                <p className="text-xs text-gray-500 mb-1">
                  <strong>Why:</strong> {q.scoreRationale}
                </p>
              )}
              {q.improvementTip && (
                <p className="text-xs text-blue-700">
                  <strong>Tip:</strong> {q.improvementTip}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function scoreTextColor(n: number): string {
  if (n >= 8) return 'text-green-700';
  if (n >= 6) return 'text-blue-700';
  if (n >= 4) return 'text-amber-700';
  return 'text-red-700';
}
