import { Fragment, useEffect, useState, type ReactNode } from 'react';
import type { NeedsInputItem, TodayInterview } from '../../api/endpoints';
import { formatInZone, parseServerTime } from '../../lib/interviewTimezone';
import { stageLabel } from '../../lib/stageBadge';
import { shortDay } from '../interview/useNeedsInputActions';

const MINUTE_MS = 60000;
export const roundKey = (r: { interviewId: string; roundId: string }) => `${r.interviewId}:${r.roundId}`;

/** The current time, refreshed once a minute, so "In 2 hours" does not go stale between fetches. */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setTimeout(() => setNow(Date.now()), MINUTE_MS);
    return () => clearTimeout(t);
  }, [now]);
  return now;
}

/**
 * Where a round of today stands right now. A round nobody marked moves from upcoming to happening to ended with
 * the clock, so those three are read from its times; an answered round keeps the state the server gave.
 */
export function roundState(iv: TodayInterview, now: number): TodayInterview['state'] {
  if (iv.state !== 'upcoming' && iv.state !== 'now' && iv.state !== 'unmarked') return iv.state;
  const start = parseServerTime(iv.scheduledAt).getTime();
  const end = iv.endsAt ? parseServerTime(iv.endsAt).getTime() : NaN;
  if (isNaN(start) || isNaN(end)) return iv.state;
  return now < start ? 'upcoming' : now < end ? 'now' : 'unmarked';
}

/** A round of today as the row the answer buttons and dialogs work on ("How did it go?"). */
export const asNeedsInput = (iv: TodayInterview): NeedsInputItem => ({
  interviewId: iv.interviewId, roundId: iv.roundId, companyName: iv.companyName, profileName: iv.profileName,
  ownerId: '', ownerName: null, stage: iv.stage, status: iv.status, scheduledAt: iv.scheduledAt, endsAt: iv.endsAt,
  need: 'outcome',
});

const STEP_ENDED: Record<string, string> = { passed: ' ✓ passed', rejected: ' ✗ rejected', canceled: ' canceled', held: '' };
const OK = 'font-semibold text-emerald-600 dark:text-emerald-400';

/**
 * One round of the day: time, company, profile, who takes it, the steps so far, and where it stands right now.
 * `children` go under it (the owner's answer buttons); the admin's page for one person passes none.
 */
export default function TodayRound({ iv, now, tz, children }: { iv: TodayInterview; now: number; tz: string; children?: ReactNode }) {
  const clock = (iso: string) => formatInZone(parseServerTime(iso), tz, { hour: 'numeric', minute: '2-digit' });
  const state = roundState(iv, now);
  const who = iv.who.kind === 'self'
    ? 'Self'
    : !iv.who.assigned ? 'Caller: not assigned yet' : `Caller: ${iv.who.name || 'assigned'}${iv.who.confirmed ? ' ✓ confirmed' : ''}`;

  const status = () => {
    switch (state) {
      case 'upcoming': {
        const minutes = Math.max(1, Math.ceil((parseServerTime(iv.scheduledAt).getTime() - now) / MINUTE_MS));
        const hours = Math.round(minutes / 60);
        const left = minutes < 60 ? `${minutes} minute${minutes === 1 ? '' : 's'}` : `${hours} hour${hours === 1 ? '' : 's'}`;
        return <span className="text-muted">In {left}</span>;
      }
      case 'now': return <span className="font-semibold text-accent-700 dark:text-accent-300">Happening now</span>;
      case 'unmarked':
        return <span className="font-semibold text-amber-700 dark:text-amber-400">Ended {iv.endsAt ? `${clock(iv.endsAt)} ` : ''}· not marked</span>;
      case 'completed': return <span className={OK}>Completed ✓</span>;
      case 'passed': return <span className={OK}>Passed ✓</span>;
      case 'rejected': return <span className="font-semibold text-red-600 dark:text-red-400">Rejected</span>;
      case 'canceled': return <span className="text-muted">Canceled</span>;
      default: {
        const day = shortDay(iv.rescheduledTo, tz);
        return <span className="text-muted">Rescheduled{day ? ` to ${day}` : ''}</span>;
      }
    }
  };

  return (
    <li className="py-2 pl-3 text-sm">
      <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5">
        <span className="min-w-0">
          <span className="font-medium text-strong">{clock(iv.scheduledAt)} · {iv.companyName || 'Untitled company'}</span>
          <span className="text-xs text-muted">{iv.profileName ? ` · ${iv.profileName}` : ''} · {who}</span>
        </span>
        <span className="text-xs">{status()}</span>
      </div>
      <div className="mt-0.5 text-xs text-muted">
        {iv.steps.map((step, i) => (
          <Fragment key={i}>
            {i > 0 && ' → '}
            {step.state === 'today'
              ? <span className="rounded bg-sky-50 px-1 font-semibold text-sky-700 dark:bg-sky-950 dark:text-sky-400">{stageLabel(step.stage)} · today</span>
              : `${stageLabel(step.stage)}${STEP_ENDED[step.state] ?? ''}`}
          </Fragment>
        ))}
      </div>
      {children}
    </li>
  );
}
