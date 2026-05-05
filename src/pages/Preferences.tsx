import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { Link } from 'react-router-dom';
import { Loader2, Save } from 'lucide-react';
import MDEditor from '@uiw/react-md-editor';
import Select from '../components/Select';
import { useAuth } from '../auth/useAuth';
import * as api from '../api/endpoints';
import { notify } from '../lib/notify';
import ResumeTabs from '../components/ResumeTabs';

type GuidelinesMode = 'markdown' | 'plaintext';

export default function PreferencesPage() {
  const { user } = useAuth();

  const { data: accountsData, isLoading: accountsLoading } = useSWR(
    'preferences-accounts-lookup',
    () => api.lookupAccounts()
  );

  const accounts = useMemo(() => {
    const all = accountsData?.accounts ?? [];
    return all.filter((a) => a.createdBy && user?.id && a.createdBy === user.id);
  }, [accountsData, user?.id]);

  const [accountId, setAccountId] = useState('');

  const accountOptions = useMemo(
    () =>
      accounts.map((a) => ({
        value: a._id,
        label: `${a.name}${a.label ? ` — ${a.label}` : ''}`,
      })),
    [accounts]
  );

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-gray-900">Preferences</h1>
        <p className="text-sm text-gray-500 mt-1">
          Per-profile prompts and defaults used by Resume Generator. More preference categories
          will land here as the app grows.
        </p>
      </header>
      <ResumeTabs />

      <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
        {accountsLoading ? (
          <p className="text-sm text-gray-500">Loading profiles...</p>
        ) : accounts.length === 0 ? (
          <p className="text-sm text-gray-500">
            You don't own any profiles yet.{' '}
            <Link to="/accounts" className="font-medium underline text-primary">
              Create one
            </Link>{' '}
            first.
          </p>
        ) : (
          <Select
            label="Profile"
            value={accountId}
            onChange={setAccountId}
            placeholder="Select a profile to edit"
            options={accountOptions}
          />
        )}
      </div>

      {accountId && <ScreeningGuidelinesCard accountId={accountId} />}
    </div>
  );
}

function ScreeningGuidelinesCard({ accountId }: { accountId: string }) {
  const { data, mutate } = useSWR(
    ['preferences-account', accountId],
    async () => (await api.getAccount(accountId)) as Record<string, unknown>
  );

  const [mode, setMode] = useState<GuidelinesMode>('plaintext');
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    setMode(((data.screeningPromptMode as GuidelinesMode) || 'plaintext'));
    setText((data.screeningPrompt as string) || '');
  }, [accountId, data]);

  async function handleSave() {
    setSaving(true);
    try {
      await api.updateAccount(accountId, {
        screeningPromptMode: mode,
        screeningPrompt: text,
      });
      notify.success('Guidelines saved');
      mutate();
    } catch (err) {
      notify.error(err, 'Failed to save guidelines');
    } finally {
      setSaving(false);
    }
  }

  if (!data) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm flex items-center gap-2 text-sm text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading...
      </div>
    );
  }

  return (
    <section className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Screening Q&amp;A guidelines</h2>
          <p className="text-xs text-gray-500 mt-1">
            How answers should be written for this candidate — voice, length, tone, things to
            mention or avoid. Used by Resume Generator's screening answer flow.
          </p>
        </div>
        <ModeToggle value={mode} onChange={setMode} />
      </div>

      {mode === 'markdown' ? (
        <div data-color-mode="light">
          <MDEditor value={text} onChange={(v) => setText(v ?? '')} height={260} preview="edit" />
        </div>
      ) : (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          placeholder="Use the candidate's voice, keep answers under 150 words, lead with concrete examples..."
          className="input focus-ring w-full text-sm"
        />
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white font-medium shadow-sm hover:bg-primary-dark disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save
        </button>
      </div>
    </section>
  );
}

function ModeToggle({ value, onChange }: { value: GuidelinesMode; onChange: (v: GuidelinesMode) => void }) {
  return (
    <div className="inline-flex border border-gray-200 rounded-md overflow-hidden text-xs">
      {(['plaintext', 'markdown'] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={`px-2 py-1 ${value === m ? 'bg-primary text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
        >
          {m === 'plaintext' ? 'Plain text' : 'Markdown'}
        </button>
      ))}
    </div>
  );
}
