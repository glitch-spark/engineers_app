import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import Select from '../Select';
import * as api from '../../api/endpoints';
import { formatProfileLabel } from '../../lib/countries';
import { archivedLabel, pickerProfiles } from '../../lib/profileArchive';
import { NO_MATCH_REASONS, type ApplicationFormState } from '../../lib/interviewForm';
import type { InterviewResumeLink, NoMatchReason } from '../../api/endpoints';
import CompanyMatchField from './CompanyMatchField';
import LinkedResumeCard from './LinkedResumeCard';

const POSITION_SUGGESTIONS = ['Backend', 'Frontend', 'Fullstack', 'AI / ML', 'Mobile', 'DevOps', 'Data', 'QA', 'Other'];

type ProfileRow = {
  _id: string;
  name?: string;
  country?: string | null;
  region?: string | null;
  archived?: boolean;
  resumes?: { id: string; filename: string }[];
};

/** `value` once it has stopped changing for `ms` (the fixed-resume score follows the Job URL as it's typed). */
function useSettled<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return settled;
}

/**
 * Profile, company, position and job link — shared by every round. Company searches the profile's resumes and links
 * the one the interview came from (or records why none was found).
 */
export default function ApplicationFields({
  app,
  onChange,
  disabled,
  idPrefix,
  savedLink,
  interviewId,
}: {
  app: ApplicationFormState;
  onChange: (patch: Partial<ApplicationFormState>) => void;
  disabled?: boolean;
  idPrefix: string;
  /** Editing: the interview's current link, shown while `app.link` is `keep`. */
  savedLink?: InterviewResumeLink | null;
  interviewId?: string;
}) {
  const link = app.link;
  const matchId = link.mode === 'match' ? link.matchId : '';
  const { data: preview, error: previewError } = useSWR(
    matchId && app.accountId ? ['resume-match', app.accountId, matchId] : null,
    () => api.getResumeMatch(app.accountId, matchId),
  );
  const toSearch = () => onChange({ link: { mode: 'search' } });
  const fixedId = link.mode === 'none' && link.reason === 'fixed_resume' ? link.resumeId : '';
  const jobUrl = useSettled(app.jobUrl.trim(), 500);
  const { data: fixed, error: fixedError } = useSWR(
    fixedId && app.accountId ? ['fixed-resume', app.accountId, fixedId, jobUrl] : null,
    () => api.getFixedResumePreview(app.accountId, fixedId, jobUrl),
    { keepPreviousData: true },
  );
  // Owner-scoped: staff get their own profiles, admins get all. Archived
  // profiles are left out, except the one this interview already uses.
  const { data } = useSWR(['accounts-own', 'all'], () => api.listAccounts({ limit: 1000, status: 'all' }));
  const [initialAccountId] = useState(app.accountId);
  const rows = useMemo(() => (data?.accounts as ProfileRow[] | undefined) || [], [data]);
  const profileResumes = rows.find((a) => a._id === app.accountId)?.resumes || [];
  const options = useMemo(() => {
    return pickerProfiles(rows, initialAccountId).map((a) => ({
      value: a._id,
      label: archivedLabel(formatProfileLabel(a.name, a.country, a._id, a.region), a.archived),
    }));
  }, [rows, initialAccountId]);
  const id = (k: string) => `${idPrefix}-app-${k}`;
  const req = <span className="text-red-700 dark:text-red-400" aria-hidden> *</span>;

  return (
    <fieldset className="space-y-3">
      <legend className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">Application</legend>
      <div>
        <label htmlFor={id('profile')} className="block text-sm font-medium mb-1">Profile{req}</label>
        <Select
          id={id('profile')}
          value={app.accountId}
          // A linked resume belongs to the old profile: search again (a no-match reason still holds).
          onChange={(v) => onChange({ accountId: v, link: link.mode === 'none' ? { ...link, resumeId: '' } : { mode: 'search' } })}
          options={[{ value: '', label: 'Select profile…' }, ...options]}
          disabled={disabled}
        />
      </div>
      <div>
        <label htmlFor={id('company')} className="block text-sm font-medium mb-1">Company{req}</label>
        {link.mode === 'search' ? (
          <CompanyMatchField
            id={id('company')}
            accountId={app.accountId}
            value={app.companyName}
            disabled={disabled}
            onChange={(companyName) => onChange({ companyName })}
            onPick={(m) => onChange({
              companyName: m.company,
              jobUrl: app.jobUrl.trim() ? app.jobUrl : m.jobUrl || '',
              link: { mode: 'match', matchId: m.matchId },
            })}
          />
        ) : (
          <input
            id={id('company')}
            className={`input ${link.mode === 'none' ? 'cursor-not-allowed bg-zinc-100 text-muted dark:bg-zinc-900' : ''}`}
            value={app.companyName}
            disabled={disabled}
            // No company found: the name typed while searching is kept as is (untick to change it).
            readOnly={link.mode === 'none'}
            aria-required
            onChange={(e) => onChange({ companyName: e.target.value })}
          />
        )}
      </div>
      {link.mode === 'match' && (
        <LinkedResumeCard
          link={preview}
          accountId={app.accountId}
          loading={!preview && !previewError}
          error={!!previewError}
          onChange={toSearch}
        />
      )}
      {link.mode === 'keep' && savedLink && (
        <LinkedResumeCard link={savedLink} accountId={app.accountId} interviewId={interviewId} onChange={toSearch} />
      )}
      {(link.mode === 'search' || link.mode === 'none') && (
        <label
          className={`flex items-center gap-2 text-sm ${!app.companyName.trim() && link.mode === 'search' ? 'text-muted' : ''}`}
          title={!app.companyName.trim() && link.mode === 'search' ? 'Type the company name first' : undefined}
        >
          <input
            type="checkbox"
            checked={link.mode === 'none'}
            disabled={disabled || (link.mode === 'search' && !app.companyName.trim())}
            onChange={(e) => onChange({
              link: e.target.checked ? { mode: 'none', reason: '', note: '', resumeId: '' } : { mode: 'search' },
            })}
          />
          No company found: keep the name typed above
        </label>
      )}
      {link.mode === 'none' && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={id('reason')} className="block text-sm font-medium mb-1">Reason{req}</label>
            <Select
              id={id('reason')}
              value={link.reason}
              onChange={(v) => onChange({ link: { ...link, reason: v as NoMatchReason | '', resumeId: '' } })}
              options={[{ value: '', label: 'Why no company was found…' }, ...NO_MATCH_REASONS]}
              disabled={disabled}
            />
          </div>
          <div>
            <label htmlFor={id('reason-note')} className="block text-sm font-medium mb-1">
              Note{link.reason === 'other' && req}
            </label>
            <input
              id={id('reason-note')}
              className="input"
              value={link.note}
              disabled={disabled}
              aria-required={link.reason === 'other'}
              placeholder={link.reason === 'other' ? 'What happened?' : 'Optional'}
              onChange={(e) => onChange({ link: { ...link, note: e.target.value } })}
            />
          </div>
          {link.reason === 'fixed_resume' && (
            <div className="sm:col-span-2">
              <label htmlFor={id('fixed')} className="block text-sm font-medium mb-1">Fixed resume{req}</label>
              <Select
                id={id('fixed')}
                value={link.resumeId}
                onChange={(v) => onChange({ link: { ...link, resumeId: v } })}
                options={[
                  { value: '', label: profileResumes.length ? 'Which uploaded resume was sent…' : 'This profile has no uploaded resumes' },
                  ...profileResumes.map((r) => ({ value: r.id, label: r.filename })),
                ]}
                disabled={disabled || !profileResumes.length}
              />
            </div>
          )}
        </div>
      )}
      {fixedId && (
        <LinkedResumeCard link={fixed} accountId={app.accountId} loading={!fixed && !fixedError} error={!!fixedError} />
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={id('position')} className="block text-sm font-medium mb-1">Position</label>
          <input
            id={id('position')}
            className="input"
            value={app.appliedPosition}
            disabled={disabled}
            list={id('positions')}
            placeholder="e.g. Backend"
            onChange={(e) => onChange({ appliedPosition: e.target.value })}
          />
          <datalist id={id('positions')}>
            {POSITION_SUGGESTIONS.map((p) => <option key={p} value={p} />)}
          </datalist>
        </div>
        <div>
          <label htmlFor={id('job')} className="block text-sm font-medium mb-1">Job URL</label>
          <input
            id={id('job')}
            className="input"
            type="url"
            value={app.jobUrl}
            disabled={disabled}
            placeholder="https://…"
            onChange={(e) => onChange({ jobUrl: e.target.value })}
          />
        </div>
      </div>
    </fieldset>
  );
}
