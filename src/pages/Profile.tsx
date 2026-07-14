import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { Loader2, Save, Zap, CheckCircle2, KeyRound, AlertCircle } from 'lucide-react';
import { useAuth } from '../auth/useAuth';
import * as api from '../api/endpoints';
import type { FreeLlmModelPreset } from '../api/endpoints';
import { notify } from '../lib/notify';
import PageHeader from '../components/PageHeader';

interface ProfileData {
  username: string;
  email: string;
  image: string;
  birthday: string;
}

interface PasswordData {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

/**
 * Read an image file, resize so the longer side <= `maxDim` px, and return
 * a JPEG data URL (quality 0.85). Keeps the profile image small enough to
 * sit in the Mongo doc without per-request bloat (~30-60 KB typical).
 */
async function readResizedDataURL(file: File, maxDim = 256): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error('Could not decode image'));
      im.src = objectUrl;
    });
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas not supported');
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true);

  const EMPTY_PROFILE: ProfileData = {
    username: '', email: '', image: '', birthday: '',
  };
  const [formData, setFormData] = useState<ProfileData>(EMPTY_PROFILE);
  const [passwordData, setPasswordData] = useState<PasswordData>({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [originalData, setOriginalData] = useState<ProfileData>(EMPTY_PROFILE);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await api.getProfile();
        if (cancelled) return;
        const userData: ProfileData = {
          username: data.user.username || user?.name || '',
          email: data.user.email || user?.email || '',
          image: data.user.image || user?.image || '',
          birthday: data.user.birthday ? new Date(data.user.birthday).toISOString().slice(0, 10) : '',
        };
        setFormData(userData);
        setOriginalData(userData);
      } catch (error) {
        if (cancelled) return;
        notify.error(error, 'Failed to load profile');
        const userData: ProfileData = {
          ...EMPTY_PROFILE,
          username: user?.name || '',
          email: user?.email || '',
          image: user?.image || '',
        };
        setFormData(userData);
        setOriginalData(userData);
      } finally {
        if (!cancelled) setIsLoadingData(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setPasswordData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await api.updateProfile(formData);
      notify.success('Profile updated successfully');
      setOriginalData(formData);
      setIsEditing(false);
      // Push the new image/username into the auth context so subscribers
      // (Topbar avatar, sidebar greetings, etc.) re-render immediately.
      await refreshUser();
    } catch (error) {
      notify.error(error, 'Failed to update profile');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      notify.error('New passwords do not match');
      return;
    }

    if (passwordData.newPassword.length < 6) {
      notify.error('New password must be at least 6 characters long');
      return;
    }

    setIsLoading(true);
    try {
      await api.changePassword({
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword,
      });
      notify.success('Password changed successfully');
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setIsChangingPassword(false);
    } catch (error) {
      notify.error(error, 'Failed to change password');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setFormData(originalData);
    setIsEditing(false);
  };

  const handlePasswordCancel = () => {
    setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
    setIsChangingPassword(false);
  };

  const hasChanges = JSON.stringify(formData) !== JSON.stringify(originalData);

  if (isLoadingData) {
    return (
      <div className="space-y-6">
        <PageHeader title="Profile" />
        <div className="card">
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Profile" />

      <div className="card">
        <div className="flex flex-col lg:flex-row gap-8">
          <div className="flex flex-col items-center lg:items-start space-y-4">
            <div className="relative group">
              <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-zinc-200 dark:border-zinc-700 shadow-lg">
                {formData.image ? (
                  <img
                    src={formData.image}
                    alt="Profile"
                    width={128}
                    height={128}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.src = `https://ui-avatars.com/api/?username=${encodeURIComponent(formData.username)}&size=128&background=2563eb&color=fff`;
                    }}
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center text-white text-4xl font-bold">
                    {formData.username ? formData.username.charAt(0).toUpperCase() : 'U'}
                  </div>
                )}
              </div>

              {isEditing && (
                <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </div>
              )}
            </div>

            {isEditing && (
              <div className="form-group w-full max-w-xs space-y-2">
                <label className="form-label">Profile image</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (!file) return;
                    if (!file.type.startsWith('image/')) {
                      notify.error('Pick an image file');
                      return;
                    }
                    try {
                      const dataUrl = await readResizedDataURL(file, 256);
                      setFormData((prev) => ({ ...prev, image: dataUrl }));
                    } catch (err) {
                      notify.error(err, 'Failed to read image');
                    }
                  }}
                  className="block text-xs text-muted file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:bg-primary file:text-white file:font-medium file:cursor-pointer hover:file:bg-primary-dark"
                />
                <div className="text-[11px] text-faint">or paste a URL</div>
                <input
                  id="image"
                  name="image"
                  type="url"
                  value={formData.image.startsWith('data:') ? '' : formData.image}
                  onChange={handleInputChange}
                  className="input focus-ring"
                  placeholder="https://example.com/image.jpg"
                />
              </div>
            )}
          </div>

          <div className="flex-1 space-y-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="form-group">
                  <label htmlFor="username" className="form-label">Username</label>
                  <input
                    id="username"
                    name="username"
                    type="text"
                    value={formData.username}
                    onChange={handleInputChange}
                    className="input focus-ring"
                    placeholder="Enter your username"
                    disabled={!isEditing}
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="email" className="form-label">Email Address</label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    className="input focus-ring"
                    placeholder="Enter your email address"
                    disabled={!isEditing}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="birthday" className="form-label">Birthday</label>
                <input
                  id="birthday"
                  name="birthday"
                  type="date"
                  value={formData.birthday}
                  onChange={handleInputChange}
                  className="select focus-ring"
                  disabled={!isEditing}
                />
              </div>

              <div className="flex flex-col sm:flex-row gap-3 pt-4">
                {!isEditing ? (
                  <button type="button" onClick={() => setIsEditing(true)} className="btn">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                    Edit Profile
                  </button>
                ) : (
                  <>
                    <button type="submit" className="btn" disabled={isLoading || !hasChanges}>
                      {isLoading ? (
                        <>
                          <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Saving...
                        </>
                      ) : (
                        <>
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Save Changes
                        </>
                      )}
                    </button>

                    <button type="button" onClick={handleCancel} className="btn-outline" disabled={isLoading}>
                      Cancel
                    </button>
                  </>
                )}
              </div>
            </form>
          </div>
        </div>
      </div>

      <FreeLlmSettingsCard />

      <div className="card mt-4">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="card-header mb-0">Change Password</h3>
            <p className="text-muted">Update your account password for enhanced security</p>
          </div>
          {!isChangingPassword && (
            <button type="button" onClick={() => setIsChangingPassword(true)} className="btn-outline">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
              Change Password
            </button>
          )}
        </div>

        {isChangingPassword && (
          <form onSubmit={handlePasswordSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="form-group">
                <label htmlFor="currentPassword" className="form-label">Current Password</label>
                <input
                  id="currentPassword"
                  name="currentPassword"
                  type="password"
                  value={passwordData.currentPassword}
                  onChange={handlePasswordChange}
                  className="input focus-ring"
                  placeholder="Enter your current password"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="form-group">
                <label htmlFor="newPassword" className="form-label">New Password</label>
                <input
                  id="newPassword"
                  name="newPassword"
                  type="password"
                  value={passwordData.newPassword}
                  onChange={handlePasswordChange}
                  className="input focus-ring"
                  placeholder="Enter your new password"
                  minLength={6}
                  required
                />
                <p className="text-xs text-muted mt-1">Minimum 6 characters</p>
              </div>

              <div className="form-group">
                <label htmlFor="confirmPassword" className="form-label">Confirm New Password</label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  value={passwordData.confirmPassword}
                  onChange={handlePasswordChange}
                  className="input focus-ring"
                  placeholder="Confirm your new password"
                  minLength={6}
                  required
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-4">
              <button type="submit" className="btn" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Changing Password...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Change Password
                  </>
                )}
              </button>

              <button type="button" onClick={handlePasswordCancel} className="btn-outline" disabled={isLoading}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="card mt-4">
        <h3 className="card-header">Account Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted">Account Type</p>
            <p className="text-strong">Standard Account</p>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted">Member Since</p>
            <p className="text-strong">
              {user?.email ? new Date().toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              }) : 'N/A'}
            </p>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted">Last Login</p>
            <p className="text-strong">
              {new Date().toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </p>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted">Status</p>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
              Active
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function FreeLlmSettingsCard() {
  const { data: profile, mutate: mutateProfile } = useSWR('profile-free-llm', () => api.getProfile());
  const { data: modelsData } = useSWR('free-llm-models', () => api.listFreeLlmModels());
  const models = modelsData?.models ?? [];

  const [modelId, setModelId] = useState('');
  const [maxTokens, setMaxTokens] = useState<number>(8192);
  const [apiKey, setApiKey] = useState('');
  const [keyHint, setKeyHint] = useState('');
  const [keySet, setKeySet] = useState(false);
  const [verified, setVerified] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testStatus, setTestStatus] = useState('');

  useEffect(() => {
    if (profile && !loaded) {
      const u = profile.user;
      setModelId(u.freeLlmModelId || '');
      setMaxTokens(u.freeLlmMaxTokens ?? 8192);
      setKeyHint(u.freeLlmApiKeyHint || '');
      setKeySet(!!u.freeLlmApiKeySet);
      setVerified(!!u.freeLlmKeyVerified);
      setLoaded(true);
    }
  }, [profile, loaded]);

  function applyFreeLlmFields(res: {
    freeLlmApiKeySet: boolean;
    freeLlmApiKeyHint: string;
    freeLlmKeyVerified?: boolean;
  }) {
    setKeySet(res.freeLlmApiKeySet);
    setKeyHint(res.freeLlmApiKeyHint);
    if (res.freeLlmKeyVerified !== undefined) {
      setVerified(res.freeLlmKeyVerified);
    }
    setApiKey('');
  }

  function onModelChange(id: string) {
    setModelId(id);
    const preset = models.find((m) => m.id === id);
    if (preset) setMaxTokens(preset.defaultMaxTokens);
  }

  const connected = verified && keySet && !!modelId;
  const pendingVerify = keySet && !verified;

  async function handleSave() {
    if (!modelId) return;
    setSaving(true);
    try {
      const res = await api.updateFreeLlmSettings({
        freeLlmModelId: modelId,
        freeLlmMaxTokens: maxTokens,
        ...(apiKey.trim() ? { freeLlmApiKey: apiKey.trim() } : {}),
      });
      applyFreeLlmFields(res);
      if (apiKey.trim()) {
        setVerified(false);
        notify.success('API key saved — run Test connection to verify');
      } else {
        notify.success('Free LLM settings saved');
      }
      mutateProfile();
    } catch (err) {
      notify.error(err, 'Failed to save free LLM settings');
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    if (!modelId) return;
    setTesting(true);
    setTestStatus('');
    try {
      if (apiKey.trim() || !keySet) {
        setTestStatus('Saving API key…');
        const saveRes = await api.updateFreeLlmSettings({
          freeLlmModelId: modelId,
          freeLlmMaxTokens: maxTokens,
          ...(apiKey.trim() ? { freeLlmApiKey: apiKey.trim() } : {}),
        });
        applyFreeLlmFields(saveRes);
      }
      setTestStatus('Contacting NVIDIA — this can take up to 45 seconds…');
      const res = await api.testFreeLlm();
      applyFreeLlmFields(res);
      setVerified(true);
      setTestStatus('');
      notify.success(`Connected to ${res.model}`);
      mutateProfile();
    } catch (err) {
      setVerified(false);
      setTestStatus('');
      notify.error(err, 'Free LLM test failed');
      mutateProfile();
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="panel mt-4 p-0 overflow-hidden">
      <div className="border-b border-zinc-200/80 px-5 py-4 dark:border-zinc-800">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="section-title flex items-center gap-2">
              <Zap className="h-5 w-5 text-sky-600 dark:text-sky-400" />
              Resume LLM (free tier)
            </h3>
            <p className="section-desc mt-1 max-w-2xl">
              NVIDIA Integrate models for resume generation and screening. OpenAI is used when the free tier is unavailable.
            </p>
          </div>
          {connected ? (
            <span className="badge-success inline-flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
              Connected
            </span>
          ) : pendingVerify ? (
            <span className="badge-warning inline-flex items-center gap-1.5">
              <KeyRound className="h-3.5 w-3.5" aria-hidden />
              Key saved
            </span>
          ) : (
            <span className="badge-neutral inline-flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5" aria-hidden />
              Not configured
            </span>
          )}
        </div>
      </div>

      <div className="space-y-5 p-5">
        {connected && (
          <div className="banner-info text-sm text-body">
            Free tier is active. Model <span className="font-mono text-xs">{models.find((m) => m.id === modelId)?.model}</span> will be used for resume and screening tasks.
          </div>
        )}
        {pendingVerify && !testing && (
          <div className="rounded-xl border border-amber-200/80 bg-amber-50/60 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
            Key saved as <span className="font-mono">{keyHint}</span>. Run <strong>Test connection</strong> to verify and enable the free tier.
          </div>
        )}
        {testing && testStatus && (
          <div className="banner-info flex items-center gap-2 text-sm text-body">
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-sky-600 dark:text-sky-400" aria-hidden />
            {testStatus}
          </div>
        )}

        <div>
          <label className="form-label">Model</label>
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {models.map((m: FreeLlmModelPreset) => {
              const selected = modelId === m.id;
              const active = selected && connected;
              return (
                <label
                  key={m.id}
                  className={`choice-card flex flex-col gap-1.5 p-4 transition ${
                    active
                      ? 'choice-card-selected ring-2 ring-emerald-500/25 dark:ring-emerald-400/30'
                      : selected
                        ? 'choice-card-selected'
                        : connected
                          ? 'opacity-80'
                          : ''
                  }`}
                >
                  <input
                    type="radio"
                    name="freeLlmModel"
                    value={m.id}
                    checked={selected}
                    onChange={() => onModelChange(m.id)}
                    className="sr-only"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-strong">{m.label}</span>
                    {active && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />}
                  </div>
                  <span className="font-mono text-xs text-muted">{m.model}</span>
                  <span className="text-xs text-faint">
                    Default {m.defaultMaxTokens.toLocaleString()} tokens
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="form-group">
            <label htmlFor="freeLlmApiKey" className="form-label">NVIDIA API key</label>
            <input
              id="freeLlmApiKey"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="input focus-ring font-mono text-sm"
              placeholder={keySet ? `${keyHint} (leave blank to keep)` : 'nvapi-...'}
              autoComplete="off"
            />
            <p className="mt-1 text-xs text-muted">
              Saved securely on your profile. Only the last four characters are shown after saving.
            </p>
          </div>
          <div className="form-group">
            <label htmlFor="freeLlmMaxTokens" className="form-label">Max tokens</label>
            <input
              id="freeLlmMaxTokens"
              type="number"
              min={512}
              max={16384}
              value={maxTokens}
              onChange={(e) => setMaxTokens(Number(e.target.value))}
              className="input focus-ring"
            />
            <p className="mt-1 text-xs text-muted">~40 requests/minute shared across all models on your key.</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 border-t border-zinc-200/80 pt-4 dark:border-zinc-800">
          <button type="button" onClick={handleSave} disabled={saving || !modelId} className="btn">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save settings
          </button>
          <button
            type="button"
            onClick={handleTest}
            disabled={testing || !modelId || (!keySet && !apiKey.trim())}
            className="btn-accent"
          >
            {testing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Testing…
              </>
            ) : (
              <>
                <Zap className="h-4 w-4" />
                Test connection
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
