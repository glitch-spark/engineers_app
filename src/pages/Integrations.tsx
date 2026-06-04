import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import useSWR from 'swr';
import { Mail, Loader2, RefreshCw, Unplug, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import * as api from '../api/endpoints';
import { notify } from '../lib/notify';
import PageHeader from '../components/PageHeader';

/**
 * Integrations / Gmail connect.
 *
 * Connect flow:
 *  1. Click "Connect Gmail" -> POST /oauth-start -> backend returns a Google
 *     consent URL signed with our state JWT.
 *  2. Open the URL in a popup (window.open). User consents on Google.
 *  3. Google redirects to the backend callback, which exchanges the code,
 *     stores an EmailAccount, then 302s the popup back to the SPA at
 *     /integrations?status=connected&detail=<email>.
 *  4. This page listens for that query param via useSearchParams, shows a
 *     toast, and refreshes the account list.
 *
 * The popup itself navigates back to this same page after callback, so we
 * detect the query param in the popup AND broadcast it to the opener via
 * postMessage so the parent tab refreshes immediately and the popup closes.
 */

function formatTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString();
}

export default function IntegrationsPage() {
  const [params, setParams] = useSearchParams();
  const accountsKey = 'email-accounts';
  const { data, mutate, isLoading } = useSWR(accountsKey, () => api.listEmailAccounts());
  const [connecting, setConnecting] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  // 1. If this page renders inside the OAuth popup, forward the status to
  //    the opener and close. The parent tab handles the toast + refresh.
  // 2. If this page is the parent and we receive a status query (popup
  //    rerouted us before window.opener was set), handle it here.
  useEffect(() => {
    const status = params.get('status');
    const detail = params.get('detail');
    if (!status) return;
    if (window.opener && window.opener !== window) {
      try {
        window.opener.postMessage({ source: 'engineer:gmail-oauth', status, detail }, window.location.origin);
      } catch {
        /* cross-origin opener — ignore */
      }
      window.close();
      return;
    }
    if (status === 'connected') notify.success(detail ? `Connected ${detail}` : 'Gmail connected');
    else notify.error(detail || 'Gmail connect failed');
    setParams(new URLSearchParams(), { replace: true });
    mutate();
  }, [params, setParams, mutate]);

  // Listen for postMessage from the popup variant.
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const data = e.data as { source?: string; status?: string; detail?: string };
      if (data?.source !== 'engineer:gmail-oauth') return;
      if (data.status === 'connected') notify.success(data.detail ? `Connected ${data.detail}` : 'Gmail connected');
      else notify.error(data.detail || 'Gmail connect failed');
      mutate();
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [mutate]);

  async function onConnect() {
    setConnecting(true);
    try {
      const { url } = await api.startGmailOAuth();
      const w = window.open(url, 'gmail-oauth', 'width=520,height=720');
      if (!w) notify.error('Popup blocked. Allow popups for this site and try again.');
    } catch (e: unknown) {
      notify.error((e as Error)?.message || 'Failed to start OAuth');
    } finally {
      setConnecting(false);
    }
  }

  async function onSync(id: string) {
    setSyncingId(id);
    try {
      const { stats } = await api.syncEmailAccount(id);
      const parts = [
        `${stats.fetched} fetched`,
        stats.auto_applied ? `${stats.auto_applied} auto-applied` : null,
        stats.needs_review ? `${stats.needs_review} need review` : null,
      ].filter(Boolean);
      notify.success(`Sync complete — ${parts.join(', ')}`);
      mutate();
    } catch (e: unknown) {
      notify.error((e as Error)?.message || 'Sync failed');
    } finally {
      setSyncingId(null);
    }
  }

  async function onDisconnect(id: string, email: string) {
    if (!confirm(`Disconnect ${email}? You'll need to re-authorize to sync again.`)) return;
    try {
      await api.disconnectEmailAccount(id);
      notify.success(`${email} disconnected`);
      mutate();
    } catch (e: unknown) {
      notify.error((e as Error)?.message || 'Disconnect failed');
    }
  }

  const accounts = (data?.accounts || []).filter((a) => !a.disconnectedAt);

  return (
    <div className="space-y-6">
      <PageHeader title="Integrations" />

      <section className="bg-white border border-gray-200 rounded-[8px] p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-md bg-red-50">
              <Mail className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Gmail</h2>
              <p className="text-sm text-gray-600 mt-1 max-w-xl">
                Connect your inbox so application emails — recruiter reach-outs, interview invites, offers,
                rejections — auto-flow into the Pipeline board. First sync pulls the last 7 days; after that
                you click "Sync now" to fetch new mail.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onConnect}
            disabled={connecting}
            className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-[6px] bg-primary text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
            Connect Gmail
          </button>
        </div>

        <div className="mt-6 border-t border-gray-100 pt-4">
          {isLoading ? (
            <div className="text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
          ) : accounts.length === 0 ? (
            <p className="text-sm text-gray-500">No accounts connected yet.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {accounts.map((a) => (
                <li key={a.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900 truncate">{a.email}</span>
                      <StatusBadge status={a.syncStatus} error={a.lastSyncError} />
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Last sync: {formatTime(a.lastSyncAt)}
                      {a.lastSyncError && (
                        <span className="ml-2 text-red-600 truncate max-w-xs" title={a.lastSyncError}>
                          {a.lastSyncError}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onSync(a.id)}
                      disabled={syncingId === a.id || a.syncStatus === 'running'}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-[6px] border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
                    >
                      {syncingId === a.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5" />
                      )}
                      Sync now
                    </button>
                    <button
                      type="button"
                      onClick={() => onDisconnect(a.id, a.email)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-[6px] border border-gray-200 text-gray-700 hover:bg-red-50 hover:text-red-700 hover:border-red-200"
                    >
                      <Unplug className="w-3.5 h-3.5" />
                      Disconnect
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="bg-gray-50 border border-gray-200 rounded-[8px] p-4 text-sm text-gray-600">
        <p className="font-medium text-gray-800 mb-1">How it works</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Only headers + snippets are stored. Email bodies are fetched on demand and never persisted.</li>
          <li>High-confidence labels (≥80%) auto-advance the matching Application stage.</li>
          <li>Lower-confidence and unmatched messages land in the Inbox tab on the Pipeline page for one-click confirm.</li>
          <li>Disconnect at any time — we revoke our token with Google and wipe the stored credential.</li>
        </ul>
      </section>
    </div>
  );
}

function StatusBadge({ status, error }: { status: 'idle' | 'running' | 'error'; error?: string | null }) {
  if (status === 'running')
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-blue-50 text-blue-700">
        <Loader2 className="w-3 h-3 animate-spin" /> syncing
      </span>
    );
  if (status === 'error' || error)
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-red-50 text-red-700">
        <AlertCircle className="w-3 h-3" /> error
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-emerald-50 text-emerald-700">
      <CheckCircle2 className="w-3 h-3" /> connected
    </span>
  );
}
