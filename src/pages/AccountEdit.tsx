import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import useSWR from 'swr';
import { AlertTriangle, ChevronDown, ChevronRight, Loader2, Plus, Save } from 'lucide-react';
import * as api from '../api/endpoints';
import { notify } from '../lib/notify';
import ResumePromptField from '../components/ResumePromptField';
import ResumesSection from '../components/ResumesSection';
import PromptEvalBlock from '../components/promptEval/PromptEvalBlock';
import ResumeUnitsEditor from '../components/prompts/ResumeUnitsEditor';
import { promptErrors, unitRoles } from '../components/prompts/promptRoles';
import CountrySelect from '../components/CountrySelect';
import Select from '../components/Select';
import PageHeader from '../components/PageHeader';
import ProfileMetricsPanel from '../components/profiles/ProfileMetricsPanel';
import Tabs from '../components/Tabs';
import { PROFILE_REGION_OPTIONS } from '../lib/countries';
import {
  DETAIL_FIELDS, PROFILE_SWR_OPTIONS, PROMPT_FIELDS, RESUME_FIELDS, leaveOnLoadError, mergeOwned, promptsDirty, promptsOf,
  setupStrip, tailoringSetUp, type ProfileDoc, type PromptsState,
} from '../lib/profileSetup';

const PROFILE_TABS = [
  { key: 'profile', label: 'Profile' },
  { key: 'metrics', label: 'Metrics' },
];

type AccShape = ProfileDoc;

export default function AccountEditPage() {
  const { id } = useParams<{ id?: string }>();
  const isNew = !id || id === 'new';
  return isNew ? <NewProfile /> : <EditProfile id={id} />;
}

/** The New profile page: name, country, region, then create (unchanged). */
function NewProfile() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [country, setCountry] = useState('');
  const [region, setRegion] = useState('');
  const [saving, setSaving] = useState(false);

  async function createProfile() {
    if (!name.trim()) {
      notify.error('Profile name is required');
      return;
    }
    setSaving(true);
    try {
      const created = (await api.createAccount({
        name: name.trim(),
        ...(country ? { country } : {}),
        ...(region ? { region } : {}),
      })) as AccShape;
      const newId = created._id;
      notify.success(`Profile "${name.trim()}" created`);
      if (typeof newId === 'string') {
        navigate(`/accounts/${newId}`, { replace: true });
      } else {
        navigate('/accounts');
      }
    } catch (err) {
      notify.error(err, 'Failed to create profile');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader title="New profile" backTo="/accounts" />

      <section className="panel p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(10rem,12rem)_minmax(8rem,10rem)] gap-4">
          <div>
            <label className="block text-xs font-medium text-muted mb-1" htmlFor="profile-name">
              Profile name <span className="text-red-700 dark:text-red-400" aria-hidden>*</span>
            </label>
            <input
              id="profile-name"
              required
              aria-required
              aria-describedby="profile-name-hint"
              className="input w-full text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. AI Full-stack, Backend, QA Engineer"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1" htmlFor="profile-country">
              Country <span className="text-faint font-normal">(optional)</span>
            </label>
            <CountrySelect id="profile-country" value={country} onChange={setCountry} />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1" htmlFor="profile-region">
              Region <span className="text-faint font-normal">(optional)</span>
            </label>
            <Select
              id="profile-region"
              value={region}
              onChange={setRegion}
              options={PROFILE_REGION_OPTIONS}
              className="text-sm"
            />
          </div>
        </div>
        <p id="profile-name-hint" className="text-xs text-faint">
          A label to distinguish this profile in dropdowns. Country and region appear with the
          profile name on Interviews. After creating, upload your HTML resume template and
          (optionally) customize the prompts.
        </p>

        <div className="flex justify-end">
          <button
            onClick={createProfile}
            disabled={saving || !name.trim()}
            className="btn disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Save className="w-4 h-4" aria-hidden />}
            Create profile
          </button>
        </div>
      </section>
    </div>
  );
}

/** An existing profile: its name as the title, what it has set up, then the Profile or Metrics tab. The profile is
 * loaded once here and handed to the sections; a section's save puts the server's copy back (`onSaved`). */
function EditProfile({ id }: { id: string }) {
  const navigate = useNavigate();
  // The open tab lives in the URL (?tab=metrics), so a link or a reload lands on it.
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'metrics' ? 'metrics' : 'profile';
  const setTab = (key: string) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (key === 'metrics') next.set('tab', key);
      else next.delete('tab');
      return next;
    }, { replace: true });

  const { data: account, error, mutate } = useSWR(
    ['account', id] as const, () => api.getAccount(id) as Promise<ProfileDoc>, PROFILE_SWR_OPTIONS,
  );
  useEffect(() => {
    if (!leaveOnLoadError(error, account)) return;
    notify.error(error, 'Could not load profile');
    navigate('/accounts');
  }, [error, account, navigate]);
  // Each section's save merges back only the fields it owns (responses differ in shape and can arrive out of order).
  const savedInto = (fields: readonly (keyof ProfileDoc)[]) => (doc: ProfileDoc) =>
    void mutate((prev) => mergeOwned(prev, doc, fields), { revalidate: false });

  if (!account) {
    return (
      <div role="status" className="p-6 flex items-center gap-2 text-sm text-muted">
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> Loading...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <PageHeader title={account.name || 'Profile'} backTo="/accounts" />
        <SetupStrip account={account} />
      </div>

      <Tabs tabs={PROFILE_TABS} value={tab} onChange={setTab} ariaLabel="Profile sections">
        {tab === 'metrics' && <ProfileMetricsPanel accountId={id} />}
        {/* Kept mounted (hidden) on the Metrics tab, so unsaved prompt edits survive switching tabs. */}
        <div className="space-y-6" hidden={tab === 'metrics'}>
          <Details id={id} account={account} onSaved={savedInto(DETAIL_FIELDS)} />

          <ResumesSection accountId={id} initial={account.resumes} onSaved={savedInto(RESUME_FIELDS)} />

          <PromptsArea key={id} id={id} account={account} onSaved={savedInto(PROMPT_FIELDS)} />
        </div>
      </Tabs>
    </div>
  );
}

/** Country · region · fixed resumes · tailoring units under the title, an Archived chip, and warnings about units
 * Job Applies can't use well. Counts what is saved (what Job Applies uses), not unsaved edits. */
function SetupStrip({ account }: { account: ProfileDoc }) {
  const { parts, warnings, archived } = setupStrip(account, promptsOf(account));
  return (
    <div className="space-y-1 pl-1">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
        {archived && <span className="badge-neutral">Archived</span>}
        <span>{parts.join(' · ')}</span>
      </p>
      {warnings.map((w) => (
        <p key={w} className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {w}
        </p>
      ))}
    </div>
  );
}

/** Name, country and region on one row. The name saves on blur only when it changed; a blank one goes back to the
 * saved name. Country and region save as soon as they change. */
function Details({ id, account, onSaved }: { id: string; account: ProfileDoc; onSaved: (doc: ProfileDoc) => void }) {
  const savedName = account.name ?? '';
  const [name, setName] = useState(savedName);
  const [nameError, setNameError] = useState('');
  const country = (account.country || '').toUpperCase();
  const region = account.region || '';
  useEffect(() => setName(savedName), [id, savedName]);

  async function renameProfile() {
    const next = name.trim();
    if (!next) {
      setName(savedName);
      setNameError('A profile needs a name');
      return;
    }
    if (next === savedName) {
      if (name !== next) setName(next);
      return;
    }
    try {
      onSaved((await api.updateAccount(id, { name: next })) as ProfileDoc);
      notify.success('Profile renamed');
    } catch (err) {
      notify.error(err, 'Failed to rename profile');
    }
  }

  async function saveField(field: 'country' | 'region', value: string, label: string) {
    try {
      onSaved((await api.updateAccount(id, { [field]: value || '' })) as ProfileDoc);
      notify.success(value ? `${label} updated` : `${label} cleared`);
    } catch (err) {
      notify.error(err, `Failed to update ${label.toLowerCase()}`);
    }
  }

  return (
    <section className="panel p-6" aria-label="Details">
      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(10rem,12rem)_minmax(8rem,10rem)] gap-4">
        <div>
          <label className="block text-xs font-medium text-muted mb-1" htmlFor="profile-name">Profile name</label>
          <input
            id="profile-name"
            className="input w-full text-sm"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (nameError) setNameError('');
            }}
            onBlur={renameProfile}
            aria-invalid={!!nameError}
            aria-describedby={nameError ? 'profile-name-error' : undefined}
            placeholder="e.g. AI Full-stack, Backend, QA Engineer"
          />
          {nameError && <p id="profile-name-error" className="mt-1 text-xs text-red-700 dark:text-red-400">{nameError}</p>}
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1" htmlFor="profile-country">
            Country <span className="text-faint font-normal">(optional)</span>
          </label>
          <CountrySelect id="profile-country" value={country} onChange={(v) => void saveField('country', v, 'Country')} />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1" htmlFor="profile-region">
            Region <span className="text-faint font-normal">(optional)</span>
          </label>
          <Select
            id="profile-region"
            value={region}
            onChange={(v) => void saveField('region', v, 'Region')}
            options={PROFILE_REGION_OPTIONS}
            className="text-sm"
          />
        </div>
      </div>
    </section>
  );
}

/** Everything prompt-related for one profile, edited together and saved by one Save: the tailoring units (Tailoring)
 * and the screening / cover-letter prompts. Unsaved edits are marked and guarded against reloading or closing the
 * tab (the app's router can't block in-app navigation). */
function PromptsArea({ id, account, onSaved }: { id: string; account: ProfileDoc; onSaved: (doc: ProfileDoc) => void }) {
  const saved = useMemo(() => promptsOf(account), [account]);
  const [draft, setDraft] = useState<PromptsState>(saved);
  const [saving, setSaving] = useState(false);
  const [moreOpen, setMoreOpen] = useState(readMoreOpen);
  // Tailoring shows as one line until it's set up, or until the user asks to set it up in this visit.
  const [tailoringOpen, setTailoringOpen] = useState(() => tailoringSetUp(saved.prompts));
  const errors = useMemo(() => promptErrors(draft.prompts), [draft.prompts]);
  const dirty = useMemo(() => promptsDirty(saved, draft), [saved, draft]);
  // When the stored prompts change under an untouched draft (a fresh load replacing a cached copy), follow them.
  const lastSaved = useRef(saved);
  useEffect(() => {
    const before = lastSaved.current;
    lastSaved.current = saved;
    if (before !== saved && !promptsDirty(before, draft).changed) setDraft(saved);
  }, [saved, draft]);

  useEffect(() => {
    if (!dirty.changed) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty.changed]);

  async function save() {
    if (Object.keys(errors).length) {
      notify.info('Fix the unit names first');
      return;
    }
    setSaving(true);
    try {
      const doc = (await api.updateAccount(id, {
        resumePrompts: draft.prompts.map((p) => ({
          id: p.id,
          name: p.name.trim(),
          roles: unitRoles(p),
          body: p.body,
          templateHtml: p.templateHtml ?? '',
          templateName: p.templateName ?? '',
          ...(p.pageFormat ? { pageFormat: p.pageFormat } : {}),
        })),
        defaultPromptId: draft.defaultId,
        screeningPrompt: draft.screeningPrompt,
        coverLetterPrompt: draft.coverLetterPrompt,
      })) as ProfileDoc;
      onSaved(doc);
      // Saved units get their real ids from the server; start again from what was stored.
      if (doc?.resumePrompts?.length) setDraft(promptsOf(doc));
      notify.success('Prompts saved');
    } catch (err) {
      notify.error(err, 'Failed to save prompts');
    } finally {
      setSaving(false);
    }
  }

  const status = dirty.changed
    ? `Unsaved${dirty.dirtyUnitIds.length ? ` · ${dirty.dirtyUnitIds.length} unit${dirty.dirtyUnitIds.length === 1 ? '' : 's'}` : ''}`
    : 'Saved';
  const saveButton = (
    <div className="flex shrink-0 items-center gap-2">
      <span className="text-xs text-muted" aria-live="polite">{status}</span>
      <button type="button" onClick={() => void save()} disabled={saving || !dirty.changed} className="btn btn-sm disabled:opacity-50">
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Save className="h-3.5 w-3.5" aria-hidden />}
        Save
      </button>
    </div>
  );

  return (
    <>
      {tailoringOpen ? (
        <section className="panel space-y-4 p-6" aria-labelledby="tailoring-title">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="tailoring-title" className="card-title">Tailoring</h2>
              <p className="text-xs text-muted">The unit whose roles fit the job: its draft rewritten by its prompt.</p>
            </div>
            {saveButton}
          </div>
          <ResumeUnitsEditor
            prompts={draft.prompts}
            defaultId={draft.defaultId}
            onChange={(prompts, defaultId) => setDraft((d) => ({ ...d, prompts, defaultId }))}
            dirtyIds={new Set(dirty.dirtyUnitIds)}
            errors={errors}
          />
        </section>
      ) : (
        <section className="panel flex flex-wrap items-center gap-3 px-6 py-4" aria-labelledby="tailoring-title">
          <h2 id="tailoring-title" className="card-title">Tailoring</h2>
          <span className="text-sm text-muted">No tailoring set up.</span>
          <button type="button" className="btn btn-sm" onClick={() => setTailoringOpen(true)}>
            <Plus className="h-3.5 w-3.5" aria-hidden /> Set up tailoring
          </button>
        </section>
      )}

      <section className="panel">
        <button
          type="button"
          onClick={() => setMoreOpen(writeMoreOpen(!moreOpen))}
          aria-expanded={moreOpen}
          aria-controls="profile-more"
          className="flex w-full items-center gap-3 rounded-[inherit] px-6 py-4 text-left hover:bg-zinc-50 dark:hover:bg-zinc-900/60"
        >
          {moreOpen ? <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden /> : <ChevronRight className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />}
          <span className="card-title">More: screening answers, cover letter, prompt eval</span>
          {dirty.moreChanged && <span className="text-xs text-sky-700 dark:text-sky-300">Unsaved</span>}
        </button>
        <div id="profile-more" hidden={!moreOpen} className="space-y-6 border-t border-zinc-200 p-6 dark:border-zinc-800">
          <ResumePromptField
            kind="screening"
            value={draft.screeningPrompt}
            onChange={(screeningPrompt) => setDraft((d) => ({ ...d, screeningPrompt }))}
            label="Screening Q&A answering prompt"
            hint="Overrides your global screening prompt. Empty = inherit global → built-in default."
            defaultSource="global"
          />
          <ResumePromptField
            kind="coverLetter"
            value={draft.coverLetterPrompt}
            onChange={(coverLetterPrompt) => setDraft((d) => ({ ...d, coverLetterPrompt }))}
            label="Cover letter prompt"
            hint="Plain text, used when opted in at submit time. Overrides your global cover-letter prompt. Empty = inherit global."
            defaultSource="global"
          />
          <div className="flex justify-end">{saveButton}</div>
          <PromptEvalBlock accountId={id} embedded />
        </div>
      </section>
    </>
  );
}

const MORE_OPEN_KEY = 'profileEdit.moreOpen';

/** The More fold is closed by default and remembered per browser. */
function readMoreOpen(): boolean {
  try {
    return window.localStorage.getItem(MORE_OPEN_KEY) === '1';
  } catch {
    return false;
  }
}

function writeMoreOpen(open: boolean): boolean {
  try {
    window.localStorage.setItem(MORE_OPEN_KEY, open ? '1' : '0');
  } catch {
    /* storage unavailable: just don't remember */
  }
  return open;
}
