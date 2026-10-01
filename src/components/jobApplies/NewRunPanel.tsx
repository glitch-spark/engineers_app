import { useId, useMemo, useState, type FormEvent } from 'react';
import useSWR from 'swr';
import { useNavigate } from 'react-router-dom';
import { Loader2, Upload } from 'lucide-react';
import * as api from '../../api/endpoints';
import MultiSelect from '../MultiSelect';
import { notify } from '../../lib/notify';
import { countryFlag } from '../../lib/countries';

interface ProfileResume {
  id: string;
  filename: string;
}

interface ProfileOption {
  _id: string;
  name: string;
  country?: string | null;
  region?: string | null;
  resumes: ProfileResume[];
}

function toProfile(raw: Record<string, unknown>): ProfileOption {
  const resumes = Array.isArray(raw.resumes) ? (raw.resumes as Record<string, unknown>[]) : [];
  return {
    _id: String(raw._id),
    name: String(raw.name ?? ''),
    country: (raw.country as string | null | undefined) ?? null,
    region: (raw.region as string | null | undefined) ?? null,
    resumes: resumes
      .filter((r) => r.id)
      .map((r) => ({ id: String(r.id), filename: String(r.filename ?? 'resume') })),
  };
}

export default function NewRunPanel() {
  const navigate = useNavigate();
  const ids = { file: useId(), threshold: useId(), maxAge: useId(), profiles: useId() };
  const [file, setFile] = useState<File | null>(null);
  const [profileIds, setProfileIds] = useState<string[]>([]);
  const [checked, setChecked] = useState<Record<string, string[]>>({});
  const [threshold, setThreshold] = useState(75);
  const [maxAgeDays, setMaxAgeDays] = useState(30);
  const [submitting, setSubmitting] = useState(false);

  const { data } = useSWR('job-applies-profiles', () => api.listAccounts({ limit: 200 }));
  const profiles = useMemo(() => (data?.accounts ?? []).map(toProfile), [data]);
  const byId = useMemo(() => new Map(profiles.map((p) => [p._id, p])), [profiles]);

  const options = profiles.map((p) => ({
    value: p._id,
    label: `${p.name}${p.country ? ` · ${countryFlag(p.country)} ${p.country}` : p.region ? ` · ${p.region}` : ''}`,
    hint: p.resumes.length ? `${p.resumes.length} resume${p.resumes.length === 1 ? '' : 's'}` : 'no resumes',
  }));

  const onProfilesChange = (next: string[]) => {
    setProfileIds(next);
    setChecked((prev) => {
      const out: Record<string, string[]> = {};
      for (const id of next) out[id] = prev[id] ?? (byId.get(id)?.resumes.map((r) => r.id) ?? []);
      return out;
    });
  };

  const toggleResume = (accountId: string, resumeId: string, on: boolean) =>
    setChecked((prev) => {
      const cur = new Set(prev[accountId] ?? []);
      if (on) cur.add(resumeId);
      else cur.delete(resumeId);
      return { ...prev, [accountId]: [...cur] };
    });

  const selection = profileIds
    .map((accountId) => ({ accountId, resumeIds: checked[accountId] ?? [] }))
    .filter((s) => s.resumeIds.length > 0);
  const resumeCount = selection.reduce((n, s) => n + s.resumeIds.length, 0);
  const canSubmit = !!file && resumeCount > 0 && !submitting;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file || !canSubmit) return;
    setSubmitting(true);
    try {
      const res = await api.createJobApplyRun(file, selection, threshold, maxAgeDays);
      notify.success(`Started: ${res.total} jobs`);
      navigate(`/job-applies/${res.runId}`);
    } catch (err) {
      notify.error(err, 'Could not start the run');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="card space-y-5" aria-labelledby={`${ids.file}-title`}>
      <h2 id={`${ids.file}-title`} className="card-title">New run</h2>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor={ids.file} className="form-label">Job sheet (.xlsx or .csv)</label>
          <input
            id={ids.file}
            type="file"
            accept=".xlsx,.csv"
            className="input"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <p className="hint">
            One job per row. A URL column is required; a full job-description column is optional (URL-only rows are fetched).
          </p>
        </div>

        <div className="space-y-2">
          <span id={ids.profiles} className="form-label block">Profiles</span>
          <MultiSelect
            value={profileIds}
            onChange={onProfilesChange}
            options={options}
            ariaLabelledBy={ids.profiles}
            placeholder="Search profiles…"
            emptyText="No profiles"
          />
        </div>
      </div>

      {profileIds.length > 0 && (
        <fieldset className="space-y-3">
          <legend className="form-label">Resumes to score</legend>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {profileIds.map((pid) => {
              const p = byId.get(pid);
              if (!p) return null;
              return (
                <div key={pid} className="card-compact space-y-2">
                  <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">{p.name}</p>
                  {p.resumes.length === 0 ? (
                    <p className="hint">This profile has no resumes. Add one on the profile page.</p>
                  ) : (
                    <ul className="space-y-1">
                      {p.resumes.map((r) => (
                        <li key={r.id}>
                          <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                            <input
                              type="checkbox"
                              checked={(checked[pid] ?? []).includes(r.id)}
                              onChange={(e) => toggleResume(pid, r.id, e.target.checked)}
                            />
                            <span className="truncate">{r.filename}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
          <p className="hint">Each job suggests at most one resume per profile — the best-scoring one.</p>
        </fieldset>
      )}

      <div className="grid gap-5 sm:grid-cols-2 lg:max-w-xl">
        <div className="space-y-2">
          <label htmlFor={ids.threshold} className="form-label">
            Minimum score to suggest: <span className="font-semibold text-zinc-900 dark:text-zinc-50">{threshold}</span>
          </label>
          <input
            id={ids.threshold}
            type="range"
            min={50}
            max={95}
            step={1}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            className="w-full accent-sky-600"
          />
        </div>
        <div className="space-y-2">
          <label htmlFor={ids.maxAge} className="form-label">Max posting age (days)</label>
          <input
            id={ids.maxAge}
            type="number"
            min={1}
            max={365}
            value={maxAgeDays}
            onChange={(e) => setMaxAgeDays(Math.max(1, Math.min(365, Number(e.target.value) || 30)))}
            className="input"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn" disabled={!canSubmit}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Upload className="h-4 w-4" aria-hidden />}
          Start run
        </button>
        <p className="hint">
          {resumeCount > 0
            ? `${resumeCount} resume${resumeCount === 1 ? '' : 's'} across ${selection.length} profile${selection.length === 1 ? '' : 's'}. Only remote, clearance-free jobs posted in the last ${maxAgeDays} days are suggested.`
            : 'Pick a sheet and at least one resume.'}
        </p>
      </div>
    </form>
  );
}
