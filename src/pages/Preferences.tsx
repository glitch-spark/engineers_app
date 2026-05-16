import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { Loader2, Save } from 'lucide-react';
import * as api from '../api/endpoints';
import { notify } from '../lib/notify';
import ResumeTabs from '../components/ResumeTabs';
import ResumePromptField from '../components/ResumePromptField';

export default function PreferencesPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-gray-900">Prompts</h1>
        <p className="text-sm text-gray-500 mt-1">
          Your global prompts — applied to every profile unless a profile overrides them on its
          own Prompts tab.
        </p>
      </header>
      <ResumeTabs />

      <GlobalPromptsCard />
    </div>
  );
}

function GlobalPromptsCard() {
  const { data, mutate } = useSWR('preferences-profile', () => api.getProfile());
  const [resumePrompt, setResumePrompt] = useState('');
  const [screeningPrompt, setScreeningPrompt] = useState('');
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (data && !loaded) {
      setResumePrompt(data.user.resumePromptBody || '');
      setScreeningPrompt(data.user.screeningPromptBody || '');
      setLoaded(true);
    }
  }, [data, loaded]);

  async function handleSave() {
    if (!data) return;
    setSaving(true);
    try {
      await api.updateProfile({
        username: data.user.username,
        email: data.user.email,
        resumePromptBody: resumePrompt,
        screeningPromptBody: screeningPrompt,
      });
      notify.success('Global prompts saved');
      mutate();
    } catch (err) {
      notify.error(err, 'Failed to save prompts');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Resume generating prompt — global</h2>
          <p className="text-xs text-gray-500 mt-1">
            Default content prompt for every profile. A profile can override this on its Prompts tab;
            a single generation can override it on the Resume Generator page.
          </p>
        </div>
        <ResumePromptField
          value={resumePrompt}
          onChange={setResumePrompt}
          label="Global resume content prompt"
          hint="Empty = use the built-in default."
        />
      </section>

      <section className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Screening Q&amp;A answering prompt — global</h2>
          <p className="text-xs text-gray-500 mt-1">
            Default screening-answer prompt for every profile. A profile can override this on its
            Prompts tab.
          </p>
        </div>
        <ResumePromptField
          kind="screening"
          value={screeningPrompt}
          onChange={setScreeningPrompt}
          label="Global screening prompt"
          hint="Empty = use the built-in default."
        />
      </section>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !data}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white font-medium shadow-sm hover:bg-primary-dark disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save prompts
        </button>
      </div>
    </div>
  );
}
