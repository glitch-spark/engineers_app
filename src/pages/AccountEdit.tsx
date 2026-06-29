import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import useSWR from 'swr';
import { Loader2, Save } from 'lucide-react';
import * as api from '../api/endpoints';
import { notify } from '../lib/notify';
import ResumePromptField from '../components/ResumePromptField';
import ResumeStylingEditor from '../components/ResumeStylingEditor';
import PageHeader from '../components/PageHeader';
import Select from '../components/Select';

type AccShape = {
  _id?: string;
  name?: string;
  resumePromptBody?: string;
  screeningPrompt?: string;
  coverLetterPrompt?: string;
  llmProvider?: string | null;
};

export default function AccountEditPage() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const isNew = !id || id === 'new';

  const [name, setName] = useState('');
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isNew) {
      setName('');
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const acc = (await api.getAccount(id!)) as AccShape;
        if (cancelled) return;
        setName(acc.name || '');
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
      const created = (await api.createAccount({ name: name.trim() })) as AccShape;
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

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2 text-sm text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading...
      </div>
    );
  }

  if (isNew) {
    return (
      <div className="space-y-6 max-w-xl">
        <PageHeader title="New profile" backTo="/accounts" />

        <section className="bg-white rounded-[12px] border border-gray-100 p-6 shadow-sm space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Profile name <span className="text-red-500">*</span>
            </label>
            <input
              className="input w-full text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. AI Full-stack, Backend, QA Engineer"
              autoFocus
            />
            <p className="text-xs text-gray-400 mt-1">
              A label to distinguish this profile in dropdowns. After creating, upload your HTML
              resume template and (optionally) customize the prompts.
            </p>
          </div>

          <div className="flex justify-end">
            <button
              onClick={createProfile}
              disabled={saving || !name.trim()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-[8px] bg-primary text-white font-medium shadow-sm hover:bg-primary-dark disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
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

      <Section title="Profile name" desc="A label to distinguish this profile in dropdowns.">
        <input
          className="input w-full text-sm"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={renameProfile}
          placeholder="e.g. AI Full-stack, Backend, QA Engineer"
        />
      </Section>

      <Section title="HTML template" desc="Upload your resume as an .html file. The resume LLM rewrites text in place per generation; structure and styles preserved.">
        <ResumeStylingEditor accountId={id!} showHeader={false} />
      </Section>

      <PromptsBlock accountId={id!} />
    </div>
  );
}

function PromptsBlock({ accountId }: { accountId: string }) {
  const [resumePrompt, setResumePrompt] = useState('');
  const [screeningPrompt, setScreeningPrompt] = useState('');
  const [coverLetterPrompt, setCoverLetterPrompt] = useState('');
  const [llmProvider, setLlmProvider] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const { data: providersData } = useSWR('llm-providers', () => api.listLlmProviders());
  const providerSelectOptions = [
    { value: '', label: 'Inherit from user' },
    ...(providersData?.providers || []).map((p) => ({ value: p.id, label: p.label })),
  ];
  if (providerSelectOptions.length === 1) {
    providerSelectOptions.push(
      { value: 'openai', label: 'OpenAI (default)' },
      { value: 'nvidia_free', label: 'Free AI — DeepSeek v4' },
    );
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const acc = (await api.getAccount(accountId)) as AccShape;
        if (cancelled) return;
        setResumePrompt(acc.resumePromptBody || '');
        setScreeningPrompt(acc.screeningPrompt || '');
        setCoverLetterPrompt(acc.coverLetterPrompt || '');
        setLlmProvider(acc.llmProvider || '');
      } catch (err) {
        notify.error(err, 'Could not load prompts');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [accountId]);

  async function save() {
    setSaving(true);
    try {
      await api.updateAccount(accountId, {
        resumePromptBody: resumePrompt,
        screeningPrompt: screeningPrompt,
        coverLetterPrompt: coverLetterPrompt,
        llmProvider,
      });
      notify.success('Prompts saved');
    } catch (err) {
      notify.error(err, 'Failed to save prompts');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Section title="Prompts" desc="">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading prompts...
        </div>
      </Section>
    );
  }

  return (
    <>
      <Section
        title="AI provider"
        desc="Which LLM powers resume generation for this profile. Inherit uses the user's default unless overridden here."
      >
        <Select
          label="AI Provider"
          value={llmProvider}
          onChange={setLlmProvider}
          options={providerSelectOptions}
        />
        {llmProvider === 'nvidia_free' && (
          <p className="text-xs text-amber-700 mt-1">
            Free AI only works when this profile or its owner is on the admin allowlist (AI Settings).
          </p>
        )}
      </Section>

      <Section
        title="Resume generating prompt"
        desc="Drives which fields the resume LLM rewrites (and how). Overrides your global prompt for this profile only. Empty = inherit global → built-in default."
      >
        <ResumePromptField
          value={resumePrompt}
          onChange={setResumePrompt}
          label="Profile resume content prompt"
          hint="Empty = inherit global → built-in default."
          defaultSource="global"
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
          className="inline-flex items-center gap-2 px-4 py-2 rounded-[8px] bg-primary text-white font-medium shadow-sm hover:bg-primary-dark disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save prompts
        </button>
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
    <section className="bg-white rounded-[12px] border border-gray-100 p-6 shadow-sm space-y-3">
      <div>
        <h2 className="card-title">{title}</h2>
        {desc && <p className="text-xs text-gray-500">{desc}</p>}
      </div>
      {children}
    </section>
  );
}
