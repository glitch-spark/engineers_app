import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { Loader2, Save } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import * as api from '../api/endpoints';
import { notify } from '../lib/notify';

export default function AdminAiPage() {
  const { data: settingsData, mutate, isLoading } = useSWR('llm-settings', () => api.getLlmSettings());
  const { data: usersData } = useSWR('users-lookup', () => api.lookupUsers());
  const { data: accountsData } = useSWR('accounts-lookup', () => api.lookupAccounts());

  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [nvidiaApiKey, setNvidiaApiKey] = useState('');
  const [openaiResumeModel, setOpenaiResumeModel] = useState('gpt-5-mini');
  const [nvidiaResumeModel, setNvidiaResumeModel] = useState('deepseek-ai/deepseek-v4-pro');
  const [nvidiaMaxRpm, setNvidiaMaxRpm] = useState(40);
  const [freeTierUserIds, setFreeTierUserIds] = useState<string[]>([]);
  const [freeTierAccountIds, setFreeTierAccountIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const settings = settingsData?.settings;

  useEffect(() => {
    if (!settings) return;
    setOpenaiResumeModel(settings.openaiResumeModel || 'gpt-5-mini');
    setNvidiaResumeModel(settings.nvidiaResumeModel || 'deepseek-ai/deepseek-v4-pro');
    setNvidiaMaxRpm(settings.nvidiaMaxRpm || 40);
    setFreeTierUserIds(settings.freeTierUserIds || []);
    setFreeTierAccountIds(settings.freeTierAccountIds || []);
  }, [settings]);

  const users = usersData?.users || [];
  const accounts = accountsData?.accounts || [];

  const userOptions = useMemo(
    () => users.map((u) => ({ id: u._id, label: u.name || u.email || u._id })),
    [users],
  );
  const accountOptions = useMemo(
    () => accounts.map((a) => ({ id: a._id, label: a.name })),
    [accounts],
  );

  function toggleId(list: string[], id: string): string[] {
    return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  }

  async function save() {
    if (openaiApiKey || nvidiaApiKey) {
      const ok = confirm('Save new API keys? Existing keys will be replaced when you enter new values.');
      if (!ok) return;
    }
    setSaving(true);
    try {
      await api.updateLlmSettings({
        ...(openaiApiKey.trim() ? { openaiApiKey: openaiApiKey.trim() } : {}),
        ...(nvidiaApiKey.trim() ? { nvidiaApiKey: nvidiaApiKey.trim() } : {}),
        openaiResumeModel,
        nvidiaResumeModel,
        nvidiaMaxRpm,
        freeTierUserIds,
        freeTierAccountIds,
      });
      setOpenaiApiKey('');
      setNvidiaApiKey('');
      await mutate();
      notify.success('AI settings saved');
    } catch (err) {
      notify.error(err, 'Failed to save AI settings');
    } finally {
      setSaving(false);
    }
  }

  if (isLoading && !settings) {
    return (
      <div className="flex items-center gap-2 text-gray-500 p-6">
        <Loader2 className="w-5 h-5 animate-spin" /> Loading AI settings...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="AI Settings" />
      <p className="text-sm text-gray-600 -mt-4">
        Configure global LLM credentials, models, and free-tier allowlist for resume generation.
      </p>

      <section className="card p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">API credentials</h2>
        <p className="text-sm text-gray-600">
          Keys are encrypted in the database. Leave blank to keep the current value.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium mb-1">OpenAI API key</label>
            <input
              type="password"
              className="input w-full"
              placeholder={settings?.openaiApiKeyMasked || 'sk-...'}
              value={openaiApiKey}
              onChange={(e) => setOpenaiApiKey(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">NVIDIA API key</label>
            <input
              type="password"
              className="input w-full"
              placeholder={settings?.nvidiaApiKeyMasked || 'nvapi-...'}
              value={nvidiaApiKey}
              onChange={(e) => setNvidiaApiKey(e.target.value)}
            />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium mb-1">OpenAI resume model</label>
            <input className="input w-full" value={openaiResumeModel} onChange={(e) => setOpenaiResumeModel(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">NVIDIA resume model</label>
            <input className="input w-full" value={nvidiaResumeModel} onChange={(e) => setNvidiaResumeModel(e.target.value)} />
          </div>
        </div>
        <p className="text-sm text-gray-500">
          Free tier rate limit: <strong>{nvidiaMaxRpm} requests / minute</strong> (shared globally).
        </p>
      </section>

      <section className="card p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Free-tier allowlist</h2>
        <p className="text-sm text-gray-600">
          Users or profiles must appear here before &quot;Free AI — DeepSeek&quot; can be used.
        </p>
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <h3 className="text-sm font-medium mb-2">Users</h3>
            <div className="max-h-48 overflow-y-auto border rounded-md p-2 space-y-1">
              {userOptions.map((u) => (
                <label key={u.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={freeTierUserIds.includes(u.id)}
                    onChange={() => setFreeTierUserIds((ids) => toggleId(ids, u.id))}
                  />
                  <span>{u.label}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <h3 className="text-sm font-medium mb-2">Profiles</h3>
            <div className="max-h-48 overflow-y-auto border rounded-md p-2 space-y-1">
              {accountOptions.map((a) => (
                <label key={a.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={freeTierAccountIds.includes(a.id)}
                    onChange={() => setFreeTierAccountIds((ids) => toggleId(ids, a.id))}
                  />
                  <span>{a.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-[8px] bg-primary text-white font-medium shadow-sm hover:bg-primary-dark disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save settings
        </button>
      </div>
    </div>
  );
}
