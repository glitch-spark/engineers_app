import { useMemo, useState } from 'react';
import useSWR from 'swr';
import Select from '../Select';
import * as api from '../../api/endpoints';
import { formatProfileLabel } from '../../lib/countries';
import { archivedLabel, pickerProfiles } from '../../lib/profileArchive';
import type { ApplicationFormState } from '../../lib/interviewForm';

const POSITION_SUGGESTIONS = ['Backend', 'Frontend', 'Fullstack', 'AI / ML', 'Mobile', 'DevOps', 'Data', 'QA', 'Other'];

/** Profile, company, position and job link — shared by every round. */
export default function ApplicationFields({
  app,
  onChange,
  disabled,
  idPrefix,
}: {
  app: ApplicationFormState;
  onChange: (patch: Partial<ApplicationFormState>) => void;
  disabled?: boolean;
  idPrefix: string;
}) {
  // Owner-scoped: staff get their own profiles, admins get all. Archived
  // profiles are left out, except the one this interview already uses.
  const { data } = useSWR(['accounts-own', 'all'], () => api.listAccounts({ limit: 1000, status: 'all' }));
  const [initialAccountId] = useState(app.accountId);
  const options = useMemo(() => {
    const rows = (data?.accounts as Array<{ _id: string; name?: string; country?: string | null; region?: string | null; archived?: boolean }>) || [];
    return pickerProfiles(rows, initialAccountId).map((a) => ({
      value: a._id,
      label: archivedLabel(formatProfileLabel(a.name, a.country, a._id, a.region), a.archived),
    }));
  }, [data, initialAccountId]);
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
          onChange={(v) => onChange({ accountId: v })}
          options={[{ value: '', label: 'Select profile…' }, ...options]}
          disabled={disabled}
        />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={id('company')} className="block text-sm font-medium mb-1">Company{req}</label>
          <input
            id={id('company')}
            className="input"
            value={app.companyName}
            disabled={disabled}
            aria-required
            onChange={(e) => onChange({ companyName: e.target.value })}
          />
        </div>
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
    </fieldset>
  );
}
