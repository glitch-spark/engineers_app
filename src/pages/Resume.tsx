import { useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { Link } from 'react-router-dom';
import { FileDown, Loader2, AlertTriangle, Plus, Trash2 } from 'lucide-react';
import ResumeTabs from '../components/ResumeTabs';
import Select from '../components/Select';
import { useAuth } from '../auth/useAuth';
import * as api from '../api/endpoints';
import { notify } from '../lib/notify';

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

  const [accountId, setAccountId] = useState('');
  const selectedAccount = accounts.find((a) => a._id === accountId);
  const selectedNeedsSetup = !!selectedAccount && !selectedAccount.hasTemplate;

  // Warn when neither profile- nor user-level resume prompt is set.
  // Generation still works (system rules + template + JD only), but output
  // quality usually drops without guidance — flag it so the user knows.
  const { data: profile } = useSWR('me-profile-for-resume', () => api.getProfile());
  const { data: selectedAccountFull } = useSWR(
    accountId ? ['account-prompt-check', accountId] : null,
    () => api.getAccount(accountId) as Promise<{ resumePromptBody?: string }>,
  );
  const promptMissing =
    !!accountId &&
    !((selectedAccountFull?.resumePromptBody || '').trim()) &&
    !((profile?.user.resumePromptBody || '').trim());

  const accountOptions = useMemo(
    () =>
      accounts.map((a) => ({
        value: a._id,
        label: `${a.name}${a.hasTemplate ? '' : ' (no template yet)'}`,
      })),
    [accounts]
  );

  const [company, setCompany] = useState('');
  const [jobUrl, setJobUrl] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [questions, setQuestions] = useState<string[]>(['']);

  const [submitting, setSubmitting] = useState(false);
  // Index of the most recently added question — its row auto-focuses on mount.
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
    if (!accountId || selectedNeedsSetup) {
      notify.warn('Pick a profile with an uploaded HTML template first');
      return;
    }
    if (!company.trim() || !jobDescription.trim()) {
      notify.warn('Company and job description are required');
      return;
    }
    // Gate: profile must have an HTML template uploaded.
    try {
      const acc = (await api.getAccount(accountId)) as Record<string, unknown>;
      const tpl = (acc.styleTemplate as string | undefined) || '';
      if (!tpl.trim()) {
        notify.warn('Upload an HTML template on the Resume Styles tab before generating.');
        return;
      }
    } catch {
      /* network failure — let the backend reject if invalid */
    }
    const cleanQuestions = questions.map((q) => q.trim()).filter(Boolean);
    const trimmedCompany = company.trim();

    setSubmitting(true);
    try {
      // Soft duplicate check — warn but let user proceed. History kept either way.
      try {
        const { jobs: existing } = await api.listResumeJobs({ accountId, limit: 100 });
        const dupCount = existing.filter(
          (j) => j.companyName.toLowerCase() === trimmedCompany.toLowerCase(),
        ).length;
        if (dupCount > 0) {
          const ok = confirm(
            `You already generated ${dupCount} resume${dupCount === 1 ? '' : 's'} for "${trimmedCompany}" with this profile. Generate another?`,
          );
          if (!ok) {
            setSubmitting(false);
            return;
          }
        }
      } catch {
        // Best-effort check — don't block submit if dedupe lookup fails.
      }

      await api.enqueueResumeJob({
        accountId,
        company: trimmedCompany,
        jobDescription,
        jobUrl: jobUrl.trim() || undefined,
        questions: cleanQuestions,
      });
      notify.success('Job queued — track status in Generated resumes tab');
      // Clear company + JD + questions so user can immediately queue another.
      setCompany('');
      setJobUrl('');
      setJobDescription('');
      setQuestions(['']);
    } catch (err) {
      notify.error(err, 'Failed to queue job');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-gray-900">Resume Generator</h1>
        <p className="text-sm text-gray-500 mt-1">
          Pick a profile, paste a JD, optionally add screening questions. Generation runs in the
          background — keep working while it builds.
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
          <Select
            label="Profile"
            required
            value={accountId}
            onChange={setAccountId}
            placeholder="Select a profile"
            options={accountOptions}
          />
        )}
        {selectedNeedsSetup && (
          <div className="flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3 mt-3">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>
              This profile has no <strong>HTML template</strong> yet.{' '}
              <Link to={`/accounts/${selectedAccount?._id}`} className="font-medium underline">Upload one</Link> first.
            </div>
          </div>
        )}
        {!selectedNeedsSetup && promptMissing && (
          <div className="flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3 mt-3">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>
              No <strong>resume prompt</strong> set for this profile or globally — the LLM will run
              with structural rules only, which usually hurts output quality. Add one on the{' '}
              <Link to={`/accounts/${selectedAccount?._id}`} className="font-medium underline">profile</Link>{' '}
              or the <Link to="/preferences" className="font-medium underline">global Prompts page</Link>.
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
              Screening questions <span className="text-xs text-gray-400 font-normal">(optional)</span>
            </label>
            <button type="button" onClick={addQuestion} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
              <Plus className="w-3 h-3" /> Add question
            </button>
          </div>
          <p className="text-xs text-gray-400 mb-2">
            If any are added, answers are written against the just-generated resume + JD after the resume completes.
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

        {/* Per-generation overrides hidden for now — re-enable when needed.
            State (overrideEnabled / promptBodyOverride) stays inert: defaults
            mean handleSubmit sends neither `guidelines` nor `promptBody`. */}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={submitting || !accountId || !!selectedNeedsSetup}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white font-medium shadow-sm hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {submitting ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Queueing...</>
            ) : (
              <><FileDown className="w-4 h-4" /> Generate</>
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
