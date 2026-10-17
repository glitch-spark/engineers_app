import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronDown, ChevronRight, Loader2, Save } from 'lucide-react';
import * as api from '../api/endpoints';
import { notify } from '../lib/notify';
import ResumePromptField from '../components/ResumePromptField';
import ResumesSection from '../components/ResumesSection';
import PromptEvalBlock from '../components/promptEval/PromptEvalBlock';
import ResumeUnitsEditor from '../components/prompts/ResumeUnitsEditor';
import { legacyPromptName, promptErrors, unitRoles } from '../components/prompts/promptRoles';
import CountrySelect from '../components/CountrySelect';
import Select from '../components/Select';
import PageHeader from '../components/PageHeader';
import { PROFILE_REGION_OPTIONS } from '../lib/countries';

type AccShape = {
  _id?: string;
  name?: string;
  country?: string | null;
  region?: string | null;
  resumePromptBody?: string;
  styleTemplate?: string | null;
  styleTemplateName?: string | null;
  pageFormat?: string;
  resumePrompts?: api.ResumePrompt[];
  defaultPromptId?: string | null;
  screeningPrompt?: string;
  coverLetterPrompt?: string;
};

/** A profile's resume units and default. One saved before units existed reads as a single unit: its previous HTML
 *  template and prompt (named from the prompt's heading). The server sends units already in this shape. */
function promptsOf(acc: AccShape): { prompts: api.ResumePrompt[]; defaultId: string } {
  const prompts: api.ResumePrompt[] = acc.resumePrompts?.length
    ? acc.resumePrompts.map((p) => ({ ...p, roles: unitRoles(p) }))
    : [{
        id: 'default',
        name: legacyPromptName(acc.resumePromptBody ?? ''),
        roles: [],
        body: acc.resumePromptBody ?? '',
        templateHtml: acc.styleTemplate ?? '',
        templateName: acc.styleTemplateName ?? '',
        pageFormat: acc.pageFormat,
      }];
  const defaultId = prompts.some((p) => p.id === acc.defaultPromptId) ? (acc.defaultPromptId as string) : prompts[0].id;
  return { prompts, defaultId };
}

const promptKey = (p: api.ResumePrompt) =>
  JSON.stringify([p.name, unitRoles(p), p.body, p.templateHtml ?? '', p.templateName ?? '']);

export default function AccountEditPage() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const isNew = !id || id === 'new';

  const [name, setName] = useState('');
  const [country, setCountry] = useState('');
  const [region, setRegion] = useState('');
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isNew) {
      setName('');
      setCountry('');
      setRegion('');
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const acc = (await api.getAccount(id!)) as AccShape;
        if (cancelled) return;
        setName(acc.name || '');
        setCountry((acc.country || '').toUpperCase());
        setRegion(acc.region || '');
      } catch (err) {
        notify.error(err, 'Could not load profile');
        navigate('/accounts');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id, isNew, navigate]);

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

  async function renameProfile() {
    if (!name.trim() || isNew) return;
    setSaving(true);
    try {
      await api.updateAccount(id!, { name: name.trim() });
      notify.success('Profile renamed');
    } catch (err) {
      notify.error(err, 'Failed to rename profile');
    } finally {
      setSaving(false);
    }
  }

  async function saveCountry(code: string) {
    setCountry(code);
    if (isNew) return;
    try {
      await api.updateAccount(id!, { country: code || '' });
      notify.success(code ? 'Country updated' : 'Country cleared');
    } catch (err) {
      notify.error(err, 'Failed to update country');
    }
  }

  async function saveRegion(value: string) {
    setRegion(value);
    if (isNew) return;
    try {
      await api.updateAccount(id!, { region: value || '' });
      notify.success(value ? 'Region updated' : 'Region cleared');
    } catch (err) {
      notify.error(err, 'Failed to update region');
    }
  }

  if (loading) {
    return (
      <div role="status" className="p-6 flex items-center gap-2 text-sm text-muted">
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> Loading...
      </div>
    );
  }

  if (isNew) {
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

  return (
    <div className="space-y-6">
      <PageHeader title="Edit profile" backTo="/accounts" />

      <Section
        title="Profile name"
        desc="A label to distinguish this profile in dropdowns. Optional country and region show next to the name on Interviews."
      >
        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(10rem,12rem)_minmax(8rem,10rem)] gap-4">
          <div>
            <label className="block text-xs font-medium text-muted mb-1" htmlFor="profile-name">Profile name</label>
            <input
              id="profile-name"
              className="input w-full text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={renameProfile}
              placeholder="e.g. AI Full-stack, Backend, QA Engineer"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1" htmlFor="profile-country">
              Country <span className="text-faint font-normal">(optional)</span>
            </label>
            <CountrySelect id="profile-country" value={country} onChange={saveCountry} />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1" htmlFor="profile-region">
              Region <span className="text-faint font-normal">(optional)</span>
            </label>
            <Select
              id="profile-region"
              value={region}
              onChange={saveRegion}
              options={PROFILE_REGION_OPTIONS}
              className="text-sm"
            />
          </div>
        </div>
      </Section>

      <Section
        title="Resumes"
        desc="Upload this profile's resumes as PDFs. Their text is what Job Applies scores against each job; keep one resume per stack."
      >
        <ResumesSection accountId={id!} />
      </Section>

      <PromptsBlock accountId={id!} />
      <PromptEvalBlock accountId={id!} />
    </div>
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
  }

  const errors = useMemo(() => promptErrors(prompts), [prompts]);
  const dirtyIds = useMemo(
    () => new Set(prompts.filter((p) => savedKeys[p.id] !== promptKey(p)).map((p) => p.id)),
    [prompts, savedKeys],
  );

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
                Save resume units
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
