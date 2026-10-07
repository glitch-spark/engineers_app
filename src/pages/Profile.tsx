import { useState, useEffect, useMemo } from 'react';
import useSWR from 'swr';
import { Loader2, Save, Zap, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../auth/useAuth';
import * as api from '../api/endpoints';
import { messageOf, notify } from '../lib/notify';
import { listTimeZones, normalizeSlackTimezone } from '../lib/slackDigestPrefs';
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

/** Account timestamps come from /auth/me; show "—" when the backend hasn't recorded one yet. */
function formatAccountDate(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', opts);
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
  const [passwordError, setPasswordError] = useState<{
    field: 'newPassword' | 'confirmPassword' | 'form';
    message: string;
  } | null>(null);

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
    setPasswordError(null);
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
      setPasswordError({ field: 'confirmPassword', message: 'New passwords do not match' });
      document.getElementById('confirmPassword')?.focus();
      return;
    }

    const newPasswordProblem =
      passwordData.newPassword.length < 8
        ? 'New password must be at least 8 characters long'
        : new TextEncoder().encode(passwordData.newPassword).length > 72
          ? 'New password is too long (72 bytes max)'
          : null;
    if (newPasswordProblem) {
      notify.error(newPasswordProblem);
      setPasswordError({ field: 'newPassword', message: newPasswordProblem });
      document.getElementById('newPassword')?.focus();
      return;
    }
    setPasswordError(null);

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
      setPasswordError({ field: 'form', message: messageOf(error, 'Failed to change password') });
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
    setPasswordError(null);
    setIsChangingPassword(false);
  };

  const hasChanges = JSON.stringify(formData) !== JSON.stringify(originalData);

  if (isLoadingData) {
    return (
      <div className="space-y-6">
        <PageHeader title="Profile" />
        <div className="card">
          <div className="flex items-center justify-center py-12">
            <div role="status" className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" aria-hidden></div>
              <span className="sr-only">Loading profile…</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Profile" />

      <div className="card">
        <h2 className="sr-only">Profile details</h2>
        <div className="flex flex-col lg:flex-row gap-8">
          <div className="flex flex-col items-center lg:items-start space-y-4">
            <div className="relative group">
              <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-zinc-200 dark:border-zinc-700 shadow-lg">
                {formData.image ? (
                  <img
                    src={formData.image}
                    alt={formData.username ? `${formData.username}'s profile photo` : 'Profile photo'}
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
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </div>
              )}
            </div>

            {isEditing && (
              <div className="form-group w-full max-w-xs space-y-2">
                <label htmlFor="imageFile" className="form-label">Profile image</label>
                <input
                  id="imageFile"
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
                <label htmlFor="image" className="block text-[11px] text-faint">or paste a URL</label>
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
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                    Edit Profile
                  </button>
                ) : (
                  <>
                    <button type="submit" className="btn" disabled={isLoading || !hasChanges}>
                      {isLoading ? (
                        <>
                          <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden>
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Saving...
                        </>
                      ) : (
                        <>
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
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

      <SlackAlertsCard />

      <div className="card mt-4">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="card-header mb-0">Change Password</h2>
            <p className="text-muted">Update your account password for enhanced security</p>
          </div>
          {!isChangingPassword && (
            <button type="button" onClick={() => setIsChangingPassword(true)} className="btn-outline">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
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
                  minLength={8}
                  required
                  aria-invalid={passwordError?.field === 'newPassword' || undefined}
                  aria-describedby={`newPassword-hint${passwordError?.field === 'newPassword' ? ' password-error' : ''}`}
                />
                <p id="newPassword-hint" className="text-xs text-muted mt-1">Minimum 8 characters</p>
                {passwordError?.field === 'newPassword' && (
                  <p id="password-error" className="text-xs text-red-700 dark:text-red-400 mt-1">{passwordError.message}</p>
                )}
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
                  minLength={8}
                  required
                  aria-invalid={passwordError?.field === 'confirmPassword' || undefined}
                  aria-describedby={passwordError?.field === 'confirmPassword' ? 'password-error' : undefined}
                />
                {passwordError?.field === 'confirmPassword' && (
                  <p id="password-error" className="text-xs text-red-700 dark:text-red-400 mt-1">{passwordError.message}</p>
                )}
              </div>
            </div>

            {passwordError?.field === 'form' && (
              <p role="alert" className="text-sm text-red-700 dark:text-red-400">{passwordError.message}</p>
            )}
            <div className="flex flex-col sm:flex-row gap-3 pt-4">
              <button type="submit" className="btn" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden>
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Changing Password...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
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
        <h2 className="card-header">Account Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted">Account Type</p>
            <p className="text-strong">Standard Account</p>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted">Member Since</p>
            <p className="text-strong">
              {formatAccountDate(user?.createdAt, { year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted">Last Login</p>
            <p className="text-strong">
              {formatAccountDate(user?.lastLoginAt, {
                year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
              })}
            </p>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted">Status</p>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300">
              Active
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SlackAlertsCard() {
  const { data, mutate } = useSWR('profile-slack', () => api.getSlackStatus());
  const [saving, setSaving] = useState(false);
  const [savingId, setSavingId] = useState(false);
  const [testing, setTesting] = useState(false);
  const [memberId, setMemberId] = useState('');
  const [timezone, setTimezone] = useState('America/New_York');
  const [loaded, setLoaded] = useState(false);
  const timeZones = useMemo(() => listTimeZones(), []);

  useEffect(() => {
    if (data && !loaded) {
      setMemberId(data.slackUserId ?? '');
      setTimezone(normalizeSlackTimezone(data.slackTimezone));
      setLoaded(true);
    }
  }, [data, loaded]);

  async function saveMemberId(value: string | null) {
    setSavingId(true);
    try {
      const next = await api.updateSlackPrefs({ slackUserId: value });
      setMemberId(next.slackUserId ?? '');
      await mutate(next, { revalidate: false });
      notify.success(next.slackUserId ? 'Slack member ID saved' : 'Slack member ID removed');
    } catch (err) {
      notify.error(err, 'Failed to save your Slack member ID');
    } finally {
      setSavingId(false);
    }
  }

  async function handleSavePrefs() {
    setSaving(true);
    try {
      await api.updateSlackPrefs({ slackTimezone: timezone });
      await mutate();
      notify.success('Timezone saved');
    } catch (err) {
      notify.error(err, 'Failed to save Slack preferences');
    } finally {
      setSaving(false);
    }
  }

  async function handleTestDm() {
    setTesting(true);
    try {
      await api.testSlackDm();
      notify.success('Test DM sent — check Slack');
    } catch (err) {
      notify.error(err, 'Test DM failed — open a chat with the bot once and retry');
    } finally {
      setTesting(false);
    }
  }

  const saved = (data?.slackUserId ?? '').trim();
  const connected = !!saved;
  const botReady = !!data?.slackBotConfigured;
  const zoneOptions = data?.slackTimezones?.length ? data.slackTimezones : timeZones;
  const dirty = memberId.trim().toUpperCase() !== saved;

  return (
    <div className="card mt-4">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="card-header mb-0">Slack</h2>
          <p className="text-muted">
            Your Slack member ID lets the bot tag you in #caller interview threads and the daily caller
            interviews list.
          </p>
        </div>
        {connected ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
            Linked
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-md bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            Not linked
          </span>
        )}
      </div>

      <form
        className="form-group mb-0 sm:max-w-xl"
        onSubmit={(e) => {
          e.preventDefault();
          void saveMemberId(memberId.trim() || null);
        }}
      >
        <label className="form-label" htmlFor="slackMemberId">
          Slack member ID
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            id="slackMemberId"
            value={memberId}
            onChange={(e) => setMemberId(e.target.value)}
            placeholder="U04ABC12345"
            autoComplete="off"
            spellCheck={false}
            className="input focus-ring min-w-0 flex-1 font-mono uppercase"
          />
          <button type="submit" className="btn" disabled={savingId || !dirty}>
            {savingId ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
            Save
          </button>
          {connected && (
            <button type="button" className="btn-outline" disabled={savingId} onClick={() => void saveMemberId(null)}>
              Clear
            </button>
          )}
        </div>
        <p className="mt-1.5 text-xs text-muted">
          In Slack: click your profile picture → <strong>Profile</strong> → <strong>⋮</strong> →{' '}
          <strong>Copy member ID</strong>.
        </p>
      </form>

      {connected && (
        <div className="mt-6 space-y-5 border-t border-zinc-200/80 pt-5 dark:border-zinc-800">
          <div className="sm:max-w-xs">
            <div className="form-group mb-0">
              <label className="form-label" htmlFor="slackTimezone">
                Timezone
              </label>
              <select
                id="slackTimezone"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="input focus-ring"
              >
                {zoneOptions.map((z) => (
                  <option key={z.value} value={z.value}>
                    {z.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <p className="text-xs text-muted">
            Sets your local day for in-app alerts and daily limits. Offsets include daylight time for that city
            (UTC−12 through UTC+14).
          </p>

          <div className="flex flex-wrap gap-3">
            <button type="button" className="btn" disabled={saving} onClick={handleSavePrefs}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
              Save timezone
            </button>
            <button type="button" className="btn-accent" disabled={!botReady || testing} onClick={handleTestDm}>
              {testing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Zap className="h-4 w-4" aria-hidden />}
              Send test DM
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
