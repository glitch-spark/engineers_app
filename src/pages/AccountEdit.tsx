import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import useSWR from 'swr';
import { AlertTriangle, ChevronDown, ChevronRight, Loader2, Save } from 'lucide-react';
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
import { promptsOf, setupStrip, type ProfileDoc } from '../lib/profileSetup';

const PROFILE_TABS = [
  { key: 'profile', label: 'Profile' },
  { key: 'metrics', label: 'Metrics' },
];

type AccShape = ProfileDoc;

const promptKey = (p: api.ResumePrompt) =>
  JSON.stringify([p.name, unitRoles(p), p.body, p.templateHtml ?? '', p.templateName ?? '']);

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

  const { data: account, error, mutate } = useSWR(['account', id] as const, () => api.getAccount(id) as Promise<ProfileDoc>);
  useEffect(() => {
    if (!error) return;
    notify.error(error, 'Could not load profile');
    navigate('/accounts');
  }, [error, navigate]);
  const onSaved = (doc: ProfileDoc) => void mutate(doc, { revalidate: false });

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
        {tab === 'metrics' ? <ProfileMetricsPanel accountId={id} /> : (
          <div className="space-y-6">
            <Details id={id} account={account} onSaved={onSaved} />

            <Section
              title="Resumes"
              desc="Upload this profile's resumes as PDFs. Their text is what Job Applies scores against each job; keep one resume per stack."
            >
              <ResumesSection accountId={id} />
            </Section>

            <PromptsBlock accountId={id} />
            <PromptEvalBlock accountId={id} />
          </div>
        )}
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

const PROMPTS_OPEN_KEY = 'profileEdit.promptsOpen';

function readPromptsOpen(): boolean {
  try {
    return window.localStorage.getItem(PROMPTS_OPEN_KEY) === '1';
  } catch {
    return false;
  }
}

function PromptsBlock({ accountId }: { accountId: string }) {
  // Collapsed by default; remembered per browser. Collapsing only hides the fields, so unsaved edits stay.
  const [open, setOpen] = useState(readPromptsOpen);
  const [prompts, setPrompts] = useState<api.ResumePrompt[]>([]);
  const [defaultId, setDefaultId] = useState('');
  // What was last loaded / saved, to mark unsaved prompts (•).
  const [savedKeys, setSavedKeys] = useState<Record<string, string>>({});
  const [savedDefault, setSavedDefault] = useState('');
  const [screeningPrompt, setScreeningPrompt] = useState('');
  const [coverLetterPrompt, setCoverLetterPrompt] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const acc = (await api.getAccount(accountId)) as AccShape;
        if (cancelled) return;
        loadPrompts(acc);
        setScreeningPrompt(acc.screeningPrompt || '');
        setCoverLetterPrompt(acc.coverLetterPrompt || '');
      } catch (err) {
        notify.error(err, 'Could not load prompts');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [accountId]);

  function loadPrompts(acc: AccShape) {
    const view = promptsOf(acc);
    setPrompts(view.prompts);
    setDefaultId(view.defaultId);
    setSavedKeys(Object.fromEntries(view.prompts.map((p) => [p.id, promptKey(p)])));
    setSavedDefault(view.defaultId);
  }

  const errors = useMemo(() => promptErrors(prompts), [prompts]);
  const dirtyIds = useMemo(
    () => new Set(prompts.filter((p) => savedKeys[p.id] !== promptKey(p)).map((p) => p.id)),
    [prompts, savedKeys],
  );
  // Anything to save in the units: an edited or new unit, a deleted one, or another default.
  const unitsChanged =
    dirtyIds.size > 0 || defaultId !== savedDefault || Object.keys(savedKeys).some((id) => !prompts.some((p) => p.id === id));

  async function save() {
    if (Object.keys(errors).length) {
      notify.info('Fix the prompt names first');
      return;
    }
    setSaving(true);
    try {
      const saved = (await api.updateAccount(accountId, {
        resumePrompts: prompts.map((p) => ({
          id: p.id,
          name: p.name.trim(),
          roles: unitRoles(p),
          body: p.body,
          templateHtml: p.templateHtml ?? '',
          templateName: p.templateName ?? '',
          ...(p.pageFormat ? { pageFormat: p.pageFormat } : {}),
        })),
        defaultPromptId: defaultId,
        screeningPrompt: screeningPrompt,
        coverLetterPrompt: coverLetterPrompt,
      })) as AccShape;
      if (saved?.resumePrompts?.length) loadPrompts(saved);
      notify.success('Prompts saved');
    } catch (err) {
      notify.error(err, 'Failed to save prompts');
    } finally {
      setSaving(false);
    }
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    try {
      window.localStorage.setItem(PROMPTS_OPEN_KEY, next ? '1' : '0');
    } catch {
      /* storage unavailable: just don't remember */
    }
  }

  const customized = [screeningPrompt.trim() && 'Screening Q&A', coverLetterPrompt.trim() && 'Cover letter'].filter(Boolean);
  const defaultName = prompts.find((p) => p.id === defaultId)?.name || 'Default';
  const summary = loading
    ? 'Loading…'
    : [
        `${prompts.length} resume unit${prompts.length === 1 ? "" : "s"} · default: ${defaultName}`,
        customized.length ? `customized: ${customized.join(', ')}` : '',
      ]
        .filter(Boolean)
        .join(' · ');

  return (
    <>
      <section className="panel">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls="profile-prompts"
          className="flex w-full items-center gap-3 rounded-[inherit] p-6 text-left hover:bg-zinc-50 dark:hover:bg-zinc-900/60"
        >
          {open ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
          )}
          <span className="card-title">Prompts</span>
          <span className="text-xs text-muted">{summary}</span>
        </button>
      </section>

      <div id="profile-prompts" hidden={!open} className="space-y-6">
        {loading ? (
          <div role="status" className="flex items-center gap-2 text-sm text-muted">
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> Loading prompts...
          </div>
        ) : (
          <>
            <Section
              title="Resume units"
              desc="One HTML template + its prompt per unit, marked with the job roles it's for. Job Applies suggests the unit whose roles fit each job; the resume LLM rewrites the template's text in place."
            >
              <ResumeUnitsEditor
                prompts={prompts}
                defaultId={defaultId}
                onChange={(next, nextDefault) => {
                  setPrompts(next);
                  setDefaultId(nextDefault);
                }}
                dirtyIds={dirtyIds}
                errors={errors}
                onSave={() => void save()}
                saving={saving}
                changed={unitsChanged}
              />
            </Section>

            <Section
              title="Screening Q&A answering prompt"
              desc="How screening-question answers are written for this profile. Overrides your global screening prompt. Empty = inherit global → built-in default."
            >
              <ResumePromptField
                kind="screening"
                value={screeningPrompt}
                onChange={setScreeningPrompt}
                label="Profile screening prompt"
                hint="Empty = inherit global → built-in default."
                defaultSource="global"
              />
            </Section>

            <Section
              title="Cover letter prompt"
              desc="How the cover letter is written when opted-in at submit time. Plain text output. Overrides your global cover-letter prompt. Empty = inherit global."
            >
              <ResumePromptField
                kind="coverLetter"
                value={coverLetterPrompt}
                onChange={setCoverLetterPrompt}
                label="Profile cover letter prompt"
                hint="Empty = inherit global. If global is also empty, generic letter is produced."
                defaultSource="global"
              />
            </Section>

            <div className="flex justify-end">
              <button
                onClick={save}
                disabled={saving}
                className="btn disabled:opacity-50"
              >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Save className="w-4 h-4" aria-hidden />}
                Save all prompts
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function Section({
  title, desc, children,
}: {
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <section className="panel p-6 space-y-3">
      <div>
        <h2 className="card-title">{title}</h2>
        {desc && <p className="text-xs text-muted">{desc}</p>}
      </div>
      {children}
    </section>
  );
}
