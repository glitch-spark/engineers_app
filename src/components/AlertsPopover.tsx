import { useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useSWR, { mutate as globalMutate } from 'swr';
import { Bell, CalendarDays, CreditCard, Zap } from 'lucide-react';
import * as api from '../api/endpoints';
import type { AppAlert } from '../api/endpoints';
import { notify } from '../lib/notify';
import Modal from './Modal';

const UNREAD_KEY = 'alerts-unread';
const LIST_KEY = 'alerts-list';

const ACTION_HINT: Record<string, string> = {
  paid: 'Paid this month — skip reminder',
  go: 'Log this month’s charge',
  stop: 'Stop reminders for this subscription',
};

function KindIcon({ kind }: { kind: AppAlert['kind'] }) {
  const cls = 'h-3.5 w-3.5 shrink-0 text-zinc-500 dark:text-zinc-400';
  if (kind === 'card_renewal') return <CreditCard className={cls} aria-hidden />;
  if (kind === 'weekly_plan') return <CalendarDays className={cls} aria-hidden />;
  return <Zap className={cls} aria-hidden />;
}

function displayTitle(alert: AppAlert | undefined | null): string {
  const title = alert?.title;
  if (!title) return '';
  return title.replace(/\s*·\s*\*{0,4}\s*\d{4}\s*$/, '').trim() || title;
}

function resolutionLabel(resolution?: AppAlert['resolution']): string | null {
  if (resolution === 'paid') return 'Paid this month';
  if (resolution === 'stopped') return 'Stopped';
  if (resolution === 'opened') return 'Opened';
  return null;
}

export default function AlertsPopover() {
  const navigate = useNavigate();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [pending, setPending] = useState<{ alert: AppAlert; key: 'paid' | 'stop' } | null>(null);
  const [saving, setSaving] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const confirmOpen = pending !== null;

  const { data: unreadData } = useSWR(UNREAD_KEY, api.alertsUnreadCount, {
    refreshInterval: 30_000,
  });
  const unread = unreadData?.count ?? 0;

  const { data, isLoading, mutate } = useSWR(open ? LIST_KEY : null, api.listAlerts);
  const alerts = data?.alerts ?? [];

  const closeInbox = () => {
    if (!open) return;
    setOpen(false);
    setClosing(true);
    window.setTimeout(() => {
      setClosing(false);
      btnRef.current?.focus();
    }, 150);
  };

  useEffect(() => {
    if (!open || confirmOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) closeInbox();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeInbox();
    };
    document.addEventListener('click', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, confirmOpen]);

  const refreshCounts = () => {
    void globalMutate(UNREAD_KEY);
    void mutate();
  };

  const runAction = async (alert: AppAlert, key: string) => {
    try {
      await api.runAlertAction(alert._id, key);
      if (key === 'go' && alert.href) {
        closeInbox();
        navigate(alert.href);
      }
      refreshCounts();
    } catch {
      notify.error('Could not update alert');
    }
  };

  const onAction = (alert: AppAlert, key: string) => {
    if (key === 'paid' || key === 'stop') {
      setPending({ alert, key });
      closeInbox();
      return;
    }
    void runAction(alert, key);
  };

  const confirmPending = async () => {
    if (!pending) return;
    setSaving(true);
    try {
      await api.runAlertAction(pending.alert._id, pending.key);
      setPending(null);
      refreshCounts();
    } catch {
      notify.error('Could not update alert');
    } finally {
      setSaving(false);
    }
  };

  const onMarkAll = async () => {
    try {
      await api.markAllAlertsRead();
      refreshCounts();
    } catch {
      notify.error('Could not mark alerts read');
    }
  };

  const panelClass = [
    't-dropdown absolute right-0 z-50 mt-2 w-[22.5rem] overflow-hidden rounded-lg border border-zinc-200/80 bg-white shadow-modal dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-none',
    open ? 'is-open' : '',
    closing ? 'is-closing' : '',
  ].filter(Boolean).join(' ');

  const confirmTitle = pending?.key === 'stop' ? 'Stop this reminder?' : 'Skip this month?';
  const confirmBody = !pending
    ? ''
    : pending.key === 'paid'
      ? `No transaction will be created. ${displayTitle(pending.alert)} won’t remind you again until next month.`
      : `Reminders for ${displayTitle(pending.alert)} will stop. Log another monthly charge to turn them back on.`;
  const confirmCta = pending?.key === 'paid' ? 'Skip month' : 'Stop reminders';

  return (
    <div className="relative" ref={wrapRef}>
      <button
        ref={btnRef}
        type="button"
        className="shell-icon-btn relative"
        aria-label={unread > 0 ? `Alerts, ${unread} unread` : 'Alerts'}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          if (open || closing) closeInbox();
          else setOpen(true);
        }}
      >
        <Bell className="h-4 w-4" aria-hidden />
        <span className="t-badge" data-open={unread > 0 ? 'true' : 'false'}>
          <span className="t-badge-dot">{unread > 9 ? '9+' : unread || ''}</span>
        </span>
      </button>

      {(open || closing) && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Alerts"
          data-origin="top-right"
          className={panelClass}
        >
          <div className="flex items-center justify-between px-3 py-2.5">
            <p className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">Alerts</p>
            {unread > 0 && (
              <button type="button" className="text-[11px] font-medium text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200" onClick={onMarkAll}>
                Mark all read
              </button>
            )}
          </div>

          <ul className="max-h-[24rem] overflow-y-auto border-t border-zinc-100 dark:border-zinc-800">
            {isLoading && (
              <li className="px-3 py-6 text-sm text-zinc-500">Loading…</li>
            )}
            {!isLoading && alerts.length === 0 && (
              <li className="px-3 py-8 text-center text-sm text-zinc-500">Caught up.</li>
            )}
            {alerts.map((alert) => {
              const status = resolutionLabel(alert.resolution);
              const last4 = typeof alert.meta?.cardLast4 === 'string' ? alert.meta.cardLast4 : null;
              return (
                <li
                  key={alert._id}
                  className={`border-t border-zinc-100 px-3 py-2.5 first:border-t-0 dark:border-zinc-800 ${
                    alert.unread ? 'bg-zinc-50/80 dark:bg-zinc-900/50' : ''
                  }`}
                >
                  <div className="flex gap-2.5">
                    <div className="mt-0.5">
                      <KindIcon kind={alert.kind} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[13px] font-medium leading-snug text-zinc-900 dark:text-zinc-100">
                          {displayTitle(alert)}
                          {last4 ? <span className="ml-1.5 font-mono text-[11px] font-normal text-zinc-500">****{last4}</span> : null}
                        </p>
                        {alert.unread && (
                          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" aria-label="Unread" />
                        )}
                      </div>
                      {status && (
                        <p className="mt-0.5 text-[11px] font-medium text-zinc-500">{status}</p>
                      )}
                      {alert.body && !status && (
                        <p className="mt-0.5 text-[12px] leading-snug text-zinc-500 dark:text-zinc-400">{alert.body}</p>
                      )}
                      {alert.actions && alert.actions.length > 0 && (
                        <div className="mt-2 grid grid-cols-3 gap-1">
                          {alert.actions.map((action) => (
                            <button
                              key={action.key}
                              type="button"
                              title={ACTION_HINT[action.key] || action.label}
                              aria-label={ACTION_HINT[action.key] || action.label}
                              className={action.key === 'go' ? 'alert-action alert-action-primary' : 'alert-action'}
                              onClick={() => onAction(alert, action.key)}
                            >
                              {action.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <Modal
        open={confirmOpen}
        size="sm"
        onClose={() => { if (!saving) setPending(null); }}
        title={confirmTitle}
      >
        <p className="text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-300">{confirmBody}</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            className="alert-action !py-2"
            disabled={saving}
            onClick={() => setPending(null)}
          >
            Cancel
          </button>
          <button
            type="button"
            className={pending?.key === 'stop' ? 'alert-action !border-red-700 !bg-red-700 !py-2 !text-white hover:!bg-red-600' : 'alert-action alert-action-primary !py-2'}
            disabled={saving}
            onClick={() => void confirmPending()}
          >
            {saving ? 'Saving…' : confirmCta}
          </button>
        </div>
      </Modal>
    </div>
  );
}
