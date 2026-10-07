import { useState } from 'react';
import { CalendarClock, Copy, ExternalLink, FileText, NotebookPen, PhoneCall, Video } from 'lucide-react';
import type { InterviewStageEntry } from '../../api/endpoints';
import { formatInZone, zoneAbbrev } from '../../lib/interviewTimezone';
import { meetingLink, notesPreview, relativeWhen, spotlightRound, stagesReached, wordCount } from '../../lib/interviewPanelInfo';
import { notify } from '../../lib/notify';
import {
  INTERVIEW_STATUSES,
  interviewStatusBadgeClass,
  interviewStatusLabel,
  normalizeInterviewStatus,
  stageBadgeClass,
  stageLabel,
} from '../../lib/stageBadge';
import { STATUS_DOT } from '../../pages/interviews/RoundTrail';
import ActionMenu from '../ActionMenu';
import ConfirmedBadge, { needsConfirmBadge } from './ConfirmedBadge';
import { CALLER_METHOD_OPTIONS, type Interview } from './types';

function when(iso: string | null | undefined, end: string | null | undefined, tz: string): string {
  if (!iso) return 'No date';
  const s = new Date(iso);
  if (isNaN(s.getTime())) return 'No date';
  const day = formatInZone(s, tz, { weekday: 'short', month: 'short', day: 'numeric' });
  const t = (d: Date) => formatInZone(d, tz, { hour: 'numeric', minute: '2-digit' });
  const e = end ? new Date(end) : null;
  const range = e && !isNaN(e.getTime()) ? `${t(s)} – ${t(e)}` : t(s);
  return `${day} · ${range} ${zoneAbbrev(s, tz)}`;
}

function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.length > 28 ? `${u.pathname.slice(0, 27)}…` : u.pathname;
    return `${u.host}${path === '/' ? '' : path}`;
  } catch {
    return url;
  }
}

function methodLabel(method?: string | null): string {
  return CALLER_METHOD_OPTIONS.find((m) => m.value === method)?.label ?? 'Method TBD';
}

function QuickAdd({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="text-sm text-sky-700 hover:underline dark:text-sky-400">
      + {label}
    </button>
  );
}

/** Read view of an interview: spotlight round, details and a timeline of rounds. */
export default function InterviewSummary({
  iv,
  tz,
  canEdit,
  onStatus,
  onConfirm,
  onEditRound,
  onDeleteRound,
  onEditDetails,
}: {
  iv: Interview;
  tz: string;
  canEdit: boolean;
  onStatus: (roundId: string, status: string) => void;
  onConfirm: (roundId: string, confirmed: boolean) => void;
  onEditRound: (roundId: string) => void;
  onDeleteRound: (roundId: string) => void;
  onEditDetails: () => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const now = new Date();
  const history = iv.stageHistory ?? [];
  const rounds = [...history].reverse();
  const spot = spotlightRound(history, now);
  const progress = stagesReached(history);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      notify.success('Link copied');
    } catch {
      notify.error('Could not copy the link');
    }
  };

  const toggle = (id: string) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const spotRound = spot?.round as InterviewStageEntry | undefined;
  const link = meetingLink(spotRound?.caller);

  return (
    <div className="flex-1 space-y-5 overflow-y-auto p-4">
      {spot && spotRound && (
        <section
          aria-label={spot.kind === 'next' ? 'Next round' : 'Last round'}
          className={`rounded-xl border p-3 ${spot.kind === 'next'
            ? 'border-sky-200 bg-sky-50/70 dark:border-sky-900 dark:bg-sky-950/30'
            : 'border-zinc-200 bg-zinc-50/70 dark:border-zinc-800 dark:bg-zinc-900/40'}`}
        >
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
            <CalendarClock size={13} aria-hidden />
            {spot.kind === 'next' ? 'Next round' : 'Last round'}
            {spotRound.scheduledAt && (
              <span className="normal-case tracking-normal font-medium text-body">
                · {relativeWhen(new Date(spotRound.scheduledAt), now, tz)}
              </span>
            )}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className={`badge ${stageBadgeClass(spotRound.stage)}`}>{stageLabel(spotRound.stage)}</span>
            <span className="text-sm tabular-nums text-body">{when(spotRound.scheduledAt, spotRound.endsAt, tz)}</span>
            {spot.kind === 'last' && (
              <span className={`badge ${interviewStatusBadgeClass(spotRound.status)}`}>{interviewStatusLabel(spotRound.status)}</span>
            )}
          </div>
          <div className="mt-1.5 text-sm">
            {spotRound.interviewerName
              ? <span className="text-body">with {spotRound.interviewerName}</span>
              : canEdit && spot.kind === 'next' && <QuickAdd label="Add interviewer" onClick={() => onEditRound(spotRound.id)} />}
          </div>
          {spotRound.caller?.enabled && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <PhoneCall size={14} className="text-sky-600" aria-hidden />
              <span>Caller: {spotRound.caller.callerName && spotRound.caller.callerName !== 'TBD' ? spotRound.caller.callerName : 'TBD'}</span>
              <span className="text-muted">· {methodLabel(spotRound.caller.method)}</span>
              {needsConfirmBadge(spotRound.status, spotRound.scheduledAt, now) && <ConfirmedBadge confirmed={spotRound.confirmed} />}
              {canEdit && spot.kind === 'next' && needsConfirmBadge(spotRound.status, spotRound.scheduledAt, now) && (
                <button type="button" className="btn-outline btn-sm"
                  onClick={() => onConfirm(spotRound.id, !spotRound.confirmed)}>
                  {spotRound.confirmed ? 'Unconfirm' : 'Mark confirmed'}
                </button>
              )}
              {link && spot.kind === 'next' && (
                <span className="ml-auto flex gap-1.5">
                  <button type="button" className="btn-outline btn-sm" onClick={() => copy(link)}>
                    <Copy size={13} aria-hidden /> Copy link
                  </button>
                  <a href={link} target="_blank" rel="noreferrer" className="btn btn-sm">
                    <Video size={13} aria-hidden /> Join
                  </a>
                </span>
              )}
            </div>
          )}
        </section>
      )}

      <section aria-label="Details">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Details</h3>
        <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
          <dt className="text-muted">Position</dt>
          <dd>{iv.appliedPosition || (canEdit ? <QuickAdd label="Add position" onClick={onEditDetails} /> : '—')}</dd>
          <dt className="text-muted">Job post</dt>
          <dd className="min-w-0">
            {iv.jobUrl ? (
              <a href={iv.jobUrl} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1 text-sky-700 hover:underline dark:text-sky-400">
                <span className="truncate">{shortUrl(iv.jobUrl)}</span>
                <ExternalLink size={12} className="shrink-0" aria-hidden />
              </a>
            ) : canEdit ? <QuickAdd label="Add job link" onClick={onEditDetails} /> : '—'}
          </dd>
          {iv.createdAt && (
            <>
              <dt className="text-muted">Created</dt>
              <dd className="tabular-nums">
                {formatInZone(new Date(iv.createdAt), tz, { month: 'short', day: 'numeric', year: 'numeric' })}
                {iv.updatedAt && <span className="text-muted"> · updated {relativeWhen(new Date(iv.updatedAt), now, tz)}</span>}
              </dd>
            </>
          )}
        </dl>
      </section>

      <section aria-label="Rounds">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Rounds ({rounds.length})</h3>
          <ol className="flex items-center gap-2 text-[11px]" aria-label="Stages reached">
            {progress.map((s) => (
              <li key={s.key} className={`inline-flex items-center gap-1 ${s.reached ? 'text-body' : 'text-faint'}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${s.reached ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-600'}`} aria-hidden />
                {s.label}<span className="sr-only">{s.reached ? ' reached' : ' not reached'}</span>
              </li>
            ))}
          </ol>
        </div>
        <ol className="relative space-y-3 border-l border-zinc-200 pl-4 dark:border-zinc-800">
          {rounds.map((e) => {
            const status = normalizeInterviewStatus(e.status);
            const preview = notesPreview(e.note);
            const words = wordCount(e.transcript);
            const open = expanded.has(e.id);
            return (
              <li key={e.id} className="relative">
                <span className={`absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-zinc-950 ${STATUS_DOT[status] ?? 'bg-zinc-300'}`} aria-hidden />
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-strong">{stageLabel(e.stage)}</span>
                  <span className="text-xs tabular-nums text-muted">{when(e.scheduledAt, e.endsAt, tz)}</span>
                  <span className="ml-auto flex items-center gap-1">
                    {canEdit ? (
                      <select
                        aria-label={`Status of ${stageLabel(e.stage)}`}
                        className={`select focus-ring !h-7 !w-auto !py-0 !text-xs ${interviewStatusBadgeClass(status)}`}
                        value={status}
                        onChange={(ev) => onStatus(e.id, ev.target.value)}
                      >
                        {INTERVIEW_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                    ) : (
                      <span className={`badge ${interviewStatusBadgeClass(status)}`}>{interviewStatusLabel(status)}</span>
                    )}
                    {canEdit && (
                      <ActionMenu
                        label={`Actions for ${stageLabel(e.stage)} round`}
                        items={[
                          { label: 'Edit round', onSelect: () => onEditRound(e.id) },
                          { label: 'Delete round', danger: true, onSelect: () => onDeleteRound(e.id) },
                        ]}
                      />
                    )}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                  {e.interviewerName && <span>with {e.interviewerName}</span>}
                  {e.caller?.enabled && (
                    <span className="inline-flex items-center gap-1">
                      <PhoneCall size={12} aria-hidden /> {e.caller.callerName && e.caller.callerName !== 'TBD' ? e.caller.callerName : 'Caller TBD'}
                      {needsConfirmBadge(e.status, e.scheduledAt, now) && <ConfirmedBadge confirmed={e.confirmed} />}
                    </span>
                  )}
                  {words > 0 && (
                    <span className="inline-flex items-center gap-1"><FileText size={12} aria-hidden /> Transcript · {words.toLocaleString()} words</span>
                  )}
                </div>
                {preview && (
                  <div className="mt-1.5 rounded-lg bg-zinc-50 px-2.5 py-1.5 text-xs text-body dark:bg-zinc-900/60">
                    <p className={open ? 'whitespace-pre-wrap' : 'line-clamp-2'}>
                      <NotebookPen size={12} className="mr-1 inline text-muted" aria-hidden />
                      {open ? e.note : preview}
                    </p>
                    {(e.note || '').trim().length > 140 && (
                      <button type="button" className="mt-0.5 text-[11px] font-medium text-sky-700 hover:underline dark:text-sky-400"
                        aria-expanded={open} onClick={() => toggle(e.id)}>
                        {open ? 'Show less' : 'Show more'}
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
