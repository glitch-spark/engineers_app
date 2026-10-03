import { useEffect, useId, useMemo, useState } from 'react';
import useSWR from 'swr';
import { Link } from 'react-router-dom';
import { FileDown, Loader2, AlertTriangle } from 'lucide-react';
import ResumeTabs from '../components/ResumeTabs';
import PageHeader from '../components/PageHeader';
import ModelSelect from '../components/ModelSelect';
import { useModelChoice } from '../lib/useModelChoice';
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

  const ownedAccounts = useMemo(() => {
    const all = accountsData?.accounts ?? [];
    return all.filter((a) => a.createdBy && user?.id && a.createdBy === user.id);
  }, [accountsData, user?.id]);

  const accounts = useMemo(
    () => ownedAccounts.filter((a) => a.showInGenerate !== false && !a.archived),
    [ownedAccounts],
  );

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
    setErrors((e) => (e.profiles ? { ...e, profiles: undefined } : e));
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

  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ profiles?: string; company?: string; jd?: string }>({});
  const fid = useId();
  const [generateCoverLetter, setGenerateCoverLetter] = useState(false);
  const [coverLetterHook, setCoverLetterHook] = useState('');
  const resumeModel = useModelChoice('resume');
  const coverLetterModel = useModelChoice('cover_letter');
  // Collapsed by default after picking — long list eats vertical space.
  const [profilesOpen, setProfilesOpen] = useState<boolean>(() => {
    try { return localStorage.getItem('resume-gen-profiles-open') !== '0'; } catch { return true; }
  });
  useEffect(() => {
    try { localStorage.setItem('resume-gen-profiles-open', profilesOpen ? '1' : '0'); } catch { /* ignore */ }
  }, [profilesOpen]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const eligible = accountIds.filter((id) => accounts.find((a) => a._id === id)?.hasTemplate);
    if (eligible.length === 0) {
      notify.warn('Pick at least one profile with an uploaded HTML template');
      setErrors({ profiles: 'Pick at least one profile with an uploaded HTML template.' });
      setProfilesOpen(true);
      return;
    }
    if (!company.trim() || !jobDescription.trim()) {
      notify.warn('Company and job description are required');
      setErrors({
        company: company.trim() ? undefined : 'Company is required.',
        jd: jobDescription.trim() ? undefined : 'Job description is required.',
      });
      document.getElementById(company.trim() ? `${fid}-jd` : `${fid}-company`)?.focus();
      return;
    }
    setErrors({});

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
            generateCoverLetter,
            // '' (model list unavailable) is omitted so the server picks its default.
            resumeModel: resumeModel.value || undefined,
            coverLetterModel: generateCoverLetter ? coverLetterModel.value || undefined : undefined,
            coverLetterHook: generateCoverLetter ? coverLetterHook.trim() || undefined : undefined,
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

      // Clear company + JD; keep profile selection so the user can
      // immediately queue another batch.
      setCompany('');
      setJobUrl('');
      setJobDescription('');
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
      <PageHeader title="Resumes" />
      <ResumeTabs />

      <div className="panel p-4">
        {accountsLoading ? (
          <p role="status" className="text-sm text-muted">Loading profiles...</p>
        ) : ownedAccounts.length === 0 ? (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 dark:text-amber-300 dark:bg-amber-950/30 dark:border-amber-800">
            You don't own any profiles yet.{' '}
            <Link to="/accounts" className="font-medium underline">Create one</Link> to start generating.
          </p>
        ) : accounts.length === 0 ? (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 dark:text-amber-300 dark:bg-amber-950/30 dark:border-amber-800">
            No profiles are enabled for generation.{' '}
            <Link to="/accounts" className="font-medium underline">Open Profiles</Link>{' '}
            and check <span className="font-medium">Generate</span> for the ones you want to use here.
          </p>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-2">
              <button
                type="button"
                id={`${fid}-profiles-label`}
                onClick={() => setProfilesOpen((v) => !v)}
                className="inline-flex items-center gap-1 text-xs font-medium text-body hover:text-primary"
                aria-expanded={profilesOpen}
                aria-controls={`${fid}-profiles`}
              >
                <span className="text-faint" aria-hidden>{profilesOpen ? '▾' : '▸'}</span>
                Profiles <span className="text-red-700 dark:text-red-400" aria-hidden>*</span><span className="sr-only">(required)</span>
                <span className="ml-2 text-faint font-normal">
                  ({accountIds.length} selected)
                </span>
              </button>
              {profilesOpen && selectableIds.length > 0 && (
                <button
                  type="button"
                  onClick={toggleAll}
                  className="link text-xs"
                >
                  {allSelected ? 'Clear all' : 'Select all'}
                </button>
              )}
            </div>
            {profilesOpen && (
            <div
              id={`${fid}-profiles`}
              role="group"
              aria-labelledby={`${fid}-profiles-label`}
              aria-describedby={errors.profiles ? `${fid}-profiles-error` : undefined}
            >
            <ul className="row-divider border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
              {accounts.map((a) => {
                const checked = accountIds.includes(a._id);
                const disabled = !a.hasTemplate;
                const promptMissing = !a.hasPrompt && !globalPromptSet;
                return (
                  <li key={a._id} className={disabled ? undefined : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/60'}>
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
                        className={'h-4 w-4 m-0 flex-shrink-0' + (disabled ? ' opacity-60' : '')}
                      />
                      <span className={'flex-1 text-sm text-strong leading-none' + (disabled ? ' opacity-60' : '')}>{a.name}</span>
                      {disabled && (
                        <span className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1">
                          <AlertTriangle size={12} aria-hidden /> No template —{' '}
                          <Link to={`/accounts/${a._id}`} className="underline">upload</Link>
                        </span>
                      )}
                      {!disabled && checked && promptMissing && (
                        <span className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1" title="No profile prompt and no global prompt set">
                          <AlertTriangle size={12} aria-hidden /> No prompt
                        </span>
                      )}
                    </label>
                  </li>
                );
              })}
            </ul>
            </div>
            )}
            {errors.profiles && (
              <p id={`${fid}-profiles-error`} role="alert" className="mt-2 text-xs text-red-700 dark:text-red-400">{errors.profiles}</p>
            )}
          </div>
        )}
        {missingPromptCount > 0 && (
          <div className="flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3 mt-3 dark:text-amber-200 dark:bg-amber-950/30 dark:border-amber-800">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden />
            <div>
              {missingPromptCount} selected profile{missingPromptCount === 1 ? '' : 's'} have no
              resume prompt, and you don't have a <Link to="/preferences" className="font-medium underline">global Prompts</Link> set
              either — the LLM will run with structural rules only, which usually hurts output quality.
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="panel p-6 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor={`${fid}-company`} className="block text-xs font-medium mb-1 text-muted">
              Company<span className="text-red-700 dark:text-red-400 ml-1" aria-hidden>*</span>
            </label>
            <input
              id={`${fid}-company`}
              aria-invalid={errors.company ? true : undefined}
              aria-describedby={errors.company ? `${fid}-company-error` : undefined}
              type="text"
              value={company}
              onChange={(e) => { setCompany(e.target.value); setErrors((er) => ({ ...er, company: undefined })); }}
              placeholder="Acme Corp"
              className="input focus-ring w-full text-sm"
              required
            />
            {errors.company && (
              <p id={`${fid}-company-error`} className="mt-1 text-xs text-red-700 dark:text-red-400">{errors.company}</p>
            )}
          </div>
          <div>
            <label htmlFor={`${fid}-url`} className="block text-xs font-medium mb-1 text-muted">
              Job posting URL <span className="text-xs text-faint font-normal">(optional)</span>
            </label>
            <input
              id={`${fid}-url`}
              type="url"
              value={jobUrl}
              onChange={(e) => setJobUrl(e.target.value)}
              placeholder="https://acme.com/jobs/123"
              className="input focus-ring w-full text-sm"
            />
          </div>
        </div>

        <div>
          <label htmlFor={`${fid}-jd`} className="block text-xs font-medium mb-1 text-muted">
            Job description<span className="text-red-700 dark:text-red-400 ml-1" aria-hidden>*</span>
          </label>
          <textarea
            id={`${fid}-jd`}
            aria-invalid={errors.jd ? true : undefined}
            aria-describedby={`${errors.jd ? `${fid}-jd-error ` : ''}${fid}-jd-count`}
            value={jobDescription}
            onChange={(e) => { setJobDescription(e.target.value); setErrors((er) => ({ ...er, jd: undefined })); }}
            placeholder="Paste the full job description here..."
            rows={10}
            className="input focus-ring w-full text-sm"
            required
          />
          {errors.jd && (
            <p id={`${fid}-jd-error`} className="mt-1 text-xs text-red-700 dark:text-red-400">{errors.jd}</p>
          )}
          <p id={`${fid}-jd-count`} className="text-xs text-faint mt-1">{jobDescription.length.toLocaleString()} characters</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <ModelSelect
            label="Resume model"
            options={resumeModel.options}
            value={resumeModel.value}
            onChange={resumeModel.setValue}
            loading={resumeModel.loading}
          />
          {generateCoverLetter && (
            <ModelSelect
              label="Cover letter model"
              options={coverLetterModel.options}
              value={coverLetterModel.value}
              onChange={coverLetterModel.setValue}
              loading={coverLetterModel.loading}
            />
          )}
        </div>

        {generateCoverLetter && (
          <div>
            <label htmlFor={`${fid}-hook`} className="block text-xs font-medium mb-1 text-muted">
              Cover letter hook <span className="text-xs text-faint font-normal">(optional)</span>
            </label>
            <input
              id={`${fid}-hook`}
              type="text"
              value={coverLetterHook}
              onChange={(e) => setCoverLetterHook(e.target.value)}
              maxLength={500}
              placeholder="e.g. I mentored three interns on a Kafka stack like yours"
              className="input focus-ring w-full text-sm"
            />
            <p className="mt-1 text-xs text-faint">One true line the letter should work in naturally.</p>
          </div>
        )}

        <div className="flex items-center justify-between flex-wrap gap-3">
          <label className="inline-flex items-center gap-2 text-sm text-body cursor-pointer">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={generateCoverLetter}
              onChange={(e) => setGenerateCoverLetter(e.target.checked)}
            />
            Also generate a cover letter
            <span className="text-xs text-faint"></span>
          </label>
          <button
            type="submit"
            disabled={submitting || accountIds.length === 0}
            className="btn disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <><Loader2 className="w-4 h-4 animate-spin" aria-hidden /> Queueing...</>
            ) : (
              <>
                <FileDown className="w-4 h-4" aria-hidden /> Generate
                {accountIds.length > 0 && ` (${accountIds.length})`}
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

