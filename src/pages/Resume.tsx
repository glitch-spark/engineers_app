import { useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { Link } from 'react-router-dom';
import { FileDown, Loader2, AlertTriangle, Plus, Trash2 } from 'lucide-react';
import ResumeTabs from '../components/ResumeTabs';
import { useAuth } from '../auth/useAuth';
import * as api from '../api/endpoints';
import { notify } from '../lib/notify';

const SELECTION_KEY = 'resume-gen-accountIds';

function loadInitialSelection(): string[] {
  try {
    const raw = localStorage.getItem(SELECTION_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export default function ResumeGeneratorPage() {
  const { user } = useAuth();

  const { data: accountsData, isLoading: accountsLoading } = useSWR(
    'resume-accounts-lookup',
    () => api.lookupAccounts()
  );

  const accounts = useMemo(() => {
    const all = accountsData?.accounts ?? [];
    return all.filter((a) => a.createdBy && user?.id && a.createdBy === user.id);
  }, [accountsData, user?.id]);

  const [accountIds, setAccountIds] = useState<string[]>(loadInitialSelection);

  // Drop stale ids (deleted profiles) once the lookup loads.
  useEffect(() => {
    if (!accountsData) return;
    const valid = new Set(accounts.map((a) => a._id));
    setAccountIds((prev) => prev.filter((id) => valid.has(id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountsData]);

  // Persist selection so re-submits don't require re-picking.
  useEffect(() => {
    localStorage.setItem(SELECTION_KEY, JSON.stringify(accountIds));
  }, [accountIds]);

  function toggle(id: string) {
    setAccountIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  const selectableIds = useMemo(
    () => accounts.filter((a) => a.hasTemplate).map((a) => a._id),
    [accounts],
  );
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => accountIds.includes(id));

  function toggleAll() {
    if (allSelected) {
      setAccountIds([]);
    } else {
      setAccountIds(selectableIds);
    }
  }

  // Used both to warn and to determine the global-prompt fallback state.
  const { data: profile } = useSWR('me-profile-for-resume', () => api.getProfile());
  const globalPromptSet = !!(profile?.user.resumePromptBody || '').trim();

  const [company, setCompany] = useState('');
  const [jobUrl, setJobUrl] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [questions, setQuestions] = useState<string[]>(['']);

  const [submitting, setSubmitting] = useState(false);
  const [focusIdx, setFocusIdx] = useState(-1);

  function setQuestion(i: number, value: string) {
    setQuestions((qs) => qs.map((q, idx) => (idx === i ? value : q)));
  }
  function addQuestion() {
    setQuestions((qs) => {
      setFocusIdx(qs.length);
      return [...qs, ''];
    });
  }
  function removeQuestion(i: number) {
    setQuestions((qs) => (qs.length === 1 ? [''] : qs.filter((_, idx) => idx !== i)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const eligible = accountIds.filter((id) => accounts.find((a) => a._id === id)?.hasTemplate);
    if (eligible.length === 0) {
      notify.warn('Pick at least one profile with an uploaded HTML template');
      return;
    }
    if (!company.trim() || !jobDescription.trim()) {
      notify.warn('Company and job description are required');
      return;
    }

    const cleanQuestions = questions.map((q) => q.trim()).filter(Boolean);
    const trimmedCompany = company.trim();
    const lcCompany = trimmedCompany.toLowerCase();

    setSubmitting(true);
    try {
      // Per-profile soft dup check. Aggregate all conflicts into one confirm.
      const dupChecks = await Promise.all(
        eligible.map(async (id) => {
          try {
            const { jobs } = await api.listResumeJobs({ accountId: id, limit: 100 });
            const n = jobs.filter((j) => j.companyName.toLowerCase() === lcCompany).length;
            if (n === 0) return null;
            const name = accounts.find((a) => a._id === id)?.name || id;
            return { id, name, count: n };
          } catch {
            return null;
          }
        }),
      );
      const dups = dupChecks.filter((d): d is { id: string; name: string; count: number } => !!d);
      if (dups.length > 0) {
        const lines = dups.map((d) => `• ${d.name}: ${d.count}`).join('\n');
        const ok = confirm(
          `You already generated resumes for "${trimmedCompany}":\n${lines}\n\nQueue another for each anyway?`,
        );
        if (!ok) {
          setSubmitting(false);
          return;
        }
      }

      const results = await Promise.allSettled(
        eligible.map((id) =>
          api.enqueueResumeJob({
            accountId: id,
            company: trimmedCompany,
            jobDescription,
            jobUrl: jobUrl.trim() || undefined,
            questions: cleanQuestions,
          }),
        ),
      );
      const ok = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.length - ok;

      if (failed === 0) {
        notify.success(`${ok} job${ok === 1 ? '' : 's'} queued — track in Generated resumes tab`);
      } else if (ok === 0) {
        notify.error(`All ${failed} jobs failed to queue`);
      } else {
        notify.warn(`${ok} queued, ${failed} failed`);
      }

      // Clear company + JD + questions; keep profile selection so the user
      // can immediately queue another batch.
      setCompany('');
      setJobUrl('');
      setJobDescription('');
      setQuestions(['']);
    } catch (err) {
      notify.error(err, 'Failed to queue jobs');
    } finally {
      setSubmitting(false);
    }
  }

  // For the warning banner: do any eligible-selected profiles have neither a
  // per-profile prompt nor a user-level global prompt? If so, warn.
  const missingPromptCount = useMemo(() => {
    if (globalPromptSet) return 0;
    return accountIds.filter((id) => {
      const a = accounts.find((x) => x._id === id);
      return a?.hasTemplate && !a.hasPrompt;
    }).length;
  }, [accountIds, accounts, globalPromptSet]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-gray-900">Resume Generator</h1>
        <p className="text-sm text-gray-500 mt-1">
          Pick one or more profiles, paste a JD, optionally add screening questions. Each profile
          generates its own resume in the background.
        </p>
      </header>
      <ResumeTabs />

      <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
        {accountsLoading ? (
          <p className="text-sm text-gray-500">Loading profiles...</p>
        ) : accounts.length === 0 ? (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
            You don't own any profiles yet.{' '}
            <Link to="/accounts" className="font-medium underline">Create one</Link> to start generating.
          </p>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-700">
                Profiles <span className="text-red-500">*</span>
                <span className="ml-2 text-gray-400 font-normal">
                  ({accountIds.length} selected)
                </span>
              </label>
              {selectableIds.length > 0 && (
                <button
                  type="button"
                  onClick={toggleAll}
                  className="text-xs text-primary hover:underline"
                >
                  {allSelected ? 'Clear all' : 'Select all'}
                </button>
              )}
            </div>
            <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg overflow-hidden">
              {accounts.map((a) => {
                const checked = accountIds.includes(a._id);
                const disabled = !a.hasTemplate;
                const promptMissing = !a.hasPrompt && !globalPromptSet;
                return (
                  <li key={a._id} className={disabled ? 'opacity-60' : 'hover:bg-gray-50'}>
                    <label
                      htmlFor={`acc-${a._id}`}
                      className={'flex items-center gap-3 px-3 py-2 ' + (disabled ? '' : 'cursor-pointer')}
                    >
                      <input
                        id={`acc-${a._id}`}
                        type="checkbox"
                        checked={checked}
                        disabled={disabled}
                        onChange={() => toggle(a._id)}
                        className="h-4 w-4 m-0 flex-shrink-0"
                      />
                      <span className="flex-1 text-sm text-gray-800 leading-none">{a.name}</span>
                      {disabled && (
                        <span className="text-xs text-amber-700 flex items-center gap-1">
                          <AlertTriangle size={12} /> No template —{' '}
                          <Link to={`/accounts/${a._id}`} className="underline">upload</Link>
                        </span>
                      )}
                      {!disabled && checked && promptMissing && (
                        <span className="text-xs text-amber-700 flex items-center gap-1" title="No profile prompt and no global prompt set">
                          <AlertTriangle size={12} /> No prompt
                        </span>
                      )}
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {missingPromptCount > 0 && (
          <div className="flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3 mt-3">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>
              {missingPromptCount} selected profile{missingPromptCount === 1 ? '' : 's'} have no
              resume prompt, and you don't have a <Link to="/preferences" className="font-medium underline">global Prompts</Link> set
              either — the LLM will run with structural rules only, which usually hurts output quality.
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-100 p-6 space-y-5 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium mb-1 text-gray-600">
              Company<span className="text-red-500 ml-1">*</span>
            </label>
            <input
              type="text"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Acme Corp"
              className="input focus-ring w-full text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1 text-gray-600">
              Job posting URL <span className="text-xs text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="url"
              value={jobUrl}
              onChange={(e) => setJobUrl(e.target.value)}
              placeholder="https://acme.com/jobs/123"
              className="input focus-ring w-full text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium mb-1 text-gray-600">
            Job description<span className="text-red-500 ml-1">*</span>
          </label>
          <textarea
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            placeholder="Paste the full job description here..."
            rows={10}
            className="input focus-ring w-full text-sm"
            required
          />
          <p className="text-xs text-gray-400 mt-1">{jobDescription.length.toLocaleString()} characters</p>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-gray-600">
              Screening questions <span className="text-xs text-gray-400 font-normal">(optional, applied to every profile)</span>
            </label>
            <button type="button" onClick={addQuestion} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
              <Plus className="w-3 h-3" /> Add question
            </button>
          </div>
          <p className="text-xs text-gray-400 mb-2">
            If any are added, answers are written against the just-generated resume + JD after each resume completes.
          </p>
          <div className="space-y-2">
            {questions.map((q, i) => (
              <QuestionRow
                key={i}
                index={i}
                value={q}
                onChange={(v) => setQuestion(i, v)}
                onRemove={() => removeQuestion(i)}
                canRemove={questions.length > 1 || q !== ''}
                autoFocus={i === focusIdx}
              />
            ))}
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={submitting || accountIds.length === 0}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[8px] bg-primary text-white font-medium shadow-sm hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {submitting ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Queueing...</>
            ) : (
              <>
                <FileDown className="w-4 h-4" /> Generate
                {accountIds.length > 0 && ` (${accountIds.length})`}
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

// ---------- form helpers -----------------------------------------------------

function QuestionRow({
  index,
  value,
  onChange,
  onRemove,
  canRemove,
  autoFocus,
}: {
  index: number;
  value: string;
  onChange: (v: string) => void;
  onRemove: () => void;
  canRemove: boolean;
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex items-start gap-2">
      <span className="text-xs text-gray-400 mt-2.5 w-5 text-right">{index + 1}.</span>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={1}
        placeholder={`Question ${index + 1}`}
        className="input focus-ring flex-1 text-sm resize-none overflow-hidden min-h-[40px]"
      />
      <button
        type="button"
        onClick={onRemove}
        disabled={!canRemove}
        className="p-2 text-gray-400 hover:text-red-600 disabled:opacity-30 mt-1"
        title="Remove question"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}
