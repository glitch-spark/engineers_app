import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { Loader2, Save } from 'lucide-react';
import * as api from '../api/endpoints';
import { notify } from '../lib/notify';
import ResumeTabs from '../components/ResumeTabs';
import ResumePromptField from '../components/ResumePromptField';
import PageHeader from '../components/PageHeader';

export default function PreferencesPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Prompts" />
      <ResumeTabs />

      <GlobalPromptsCard />
    </div>
  );
}

function GlobalPromptsCard() {
  const { data, mutate } = useSWR('preferences-profile', () => api.getProfile());
  const [resumePrompt, setResumePrompt] = useState('');
  const [screeningPrompt, setScreeningPrompt] = useState('');
  const [coverLetterPrompt, setCoverLetterPrompt] = useState('');
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (data && !loaded) {
      setResumePrompt(data.user.resumePromptBody || '');
      setScreeningPrompt(data.user.screeningPromptBody || '');
      setCoverLetterPrompt(data.user.coverLetterPromptBody || '');
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
        coverLetterPromptBody: coverLetterPrompt,
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
      <section className="panel p-6 space-y-3">
        <div>
          <h2 className="section-title">Resume generating prompt — global</h2>
          <p className="text-xs text-muted mt-1">
            Default content prompt for every profile. A profile can override this on its Prompts tab;
            a single generation can override it on the Resume Generator page.
          </p>
        </div>
        <ResumePromptField
          value={resumePrompt}
          onChange={setResumePrompt}
          label="Global resume content prompt"
          hint="Empty = no global guidance is sent to the LLM."
        />
      </section>

      <section className="panel p-6 space-y-3">
        <div>
          <h2 className="section-title">Screening Q&amp;A answering prompt — global</h2>
          <p className="text-xs text-muted mt-1">
            Default screening-answer prompt for every profile. A profile can override this on its
            Prompts tab.
          </p>
        </div>
        <ResumePromptField
          kind="screening"
          value={screeningPrompt}
          onChange={setScreeningPrompt}
          label="Global screening prompt"
          hint="Empty = no global guidance is sent to the LLM."
        />
      </section>

      <section className="panel p-6 space-y-3">
        <div>
          <h2 className="section-title">Cover letter prompt — global</h2>
          <p className="text-xs text-muted mt-1">
            Default cover-letter prompt used when "Also generate a cover letter" is checked at
            submit time. A profile can override this on its Prompts tab.
          </p>
        </div>
        <ResumePromptField
          kind="coverLetter"
          value={coverLetterPrompt}
          onChange={setCoverLetterPrompt}
          label="Global cover letter prompt"
          hint="Empty = no global guidance; cover letter will be generic."
        />
      </section>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !data}
          className="btn disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save prompts
        </button>
      </div>
    </div>
  );
}
