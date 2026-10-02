/** Pure state helpers for the Application + Round interview form. */
import type { CallerInput, InterviewStageEntry, RoundInput } from '../api/endpoints';
import { INTERVIEW_STAGE_ORDER, normalizeInterviewStatus, type InterviewStatusValue } from './stageBadge';
import { browserZone, fromZoned, zonedDateKey, zonedTime } from './interviewTimezone';

export type InterviewFormMode = 'new' | 'editDetails' | 'addRound' | 'editRound';

export type ApplicationFormState = {
  accountId: string;
  companyName: string;
  appliedPosition: string;
  jobUrl: string;
};

export type RoundFormState = {
  stage: string;
  /** Local YYYY-MM-DD. */
  date: string;
  /** Local HH:MM. */
  time: string;
  durationMin: number;
  status: InterviewStatusValue;
  interviewerName: string;
  note: string;
  transcript: string;
  callerEnabled: boolean;
  callerName: string;
  callerMethod: string;
  callerMethodValue: string;
  callerCoworkerIds: string[];
};

export const DEFAULT_START_TIME = '10:00';
export const DEFAULT_DURATION_MIN = 60;
export const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120];

export function blankApplication(): ApplicationFormState {
  return { accountId: '', companyName: '', appliedPosition: '', jobUrl: '' };
}

/** `tz` is the IANA zone the form's date and time are read in (default: browser). */
export function blankRound(
  opts: { date?: string; time?: string; stage?: string } = {},
  tz: string = browserZone(),
): RoundFormState {
  return {
    stage: opts.stage ?? '',
    date: opts.date ?? zonedDateKey(new Date(), tz),
    time: opts.time ?? DEFAULT_START_TIME,
    durationMin: DEFAULT_DURATION_MIN,
    status: 'scheduled',
    interviewerName: '',
    note: '',
    transcript: '',
    callerEnabled: false,
    callerName: '',
    callerMethod: '',
    callerMethodValue: '',
    callerCoworkerIds: [],
  };
}

export function roundFromEntry(e: InterviewStageEntry, tz: string = browserZone()): RoundFormState {
  const start = e.scheduledAt ? new Date(e.scheduledAt) : null;
  const end = e.endsAt ? new Date(e.endsAt) : null;
  const valid = start && !isNaN(start.getTime());
  const minutes = valid && end && !isNaN(end.getTime()) ? Math.round((end.getTime() - start.getTime()) / 60000) : 0;
  const caller = e.caller;
  return {
    stage: e.stage || '',
    date: valid ? zonedDateKey(start, tz) : '',
    time: valid ? zonedTime(start, tz) : DEFAULT_START_TIME,
    durationMin: minutes > 0 ? minutes : DEFAULT_DURATION_MIN,
    status: normalizeInterviewStatus(e.status) || 'scheduled',
    interviewerName: e.interviewerName || '',
    note: e.note || '',
    transcript: e.transcript || '',
    callerEnabled: !!caller?.enabled,
    callerName: caller?.callerName && caller.callerName !== 'TBD' ? caller.callerName : '',
    callerMethod: caller?.method || '',
    callerMethodValue: caller?.methodValue || '',
    callerCoworkerIds: caller?.coworkerIds ?? [],
  };
}

/** Date + time read in `tz` → UTC ISO; end = start + duration. */
export function roundPayload(r: RoundFormState, tz: string = browserZone()): RoundInput {
  const start = fromZoned(r.date, r.time || DEFAULT_START_TIME, tz);
  const end = new Date(start.getTime() + (r.durationMin || DEFAULT_DURATION_MIN) * 60000);
  const caller: CallerInput | undefined = r.callerEnabled
    ? {
      enabled: true,
      callerName: r.callerName.trim(),
      method: r.callerMethod || undefined,
      methodValue: r.callerMethodValue.trim(),
      coworkerIds: r.callerCoworkerIds,
    }
    : undefined;
  return {
    stage: r.stage,
    scheduledAt: start.toISOString(),
    endsAt: end.toISOString(),
    status: r.status,
    interviewerName: r.interviewerName.trim(),
    note: r.note,
    transcript: r.transcript,
    ...(caller ? { caller } : {}),
  };
}

/** Next unused stage after the latest round, in pipeline order ('' when none is left). */
export function nextStage(history: { stage: string }[]): string {
  const order = INTERVIEW_STAGE_ORDER as readonly string[];
  const used = new Set(history.map((h) => h.stage));
  const tip = history[history.length - 1]?.stage;
  const from = tip ? order.indexOf(tip) + 1 : 0;
  return order.slice(Math.max(from, 0)).find((s) => !used.has(s)) ?? '';
}

/** Labels of required fields that are still empty for this form mode. */
export function missingFields(
  mode: InterviewFormMode,
  app: ApplicationFormState | null,
  round: RoundFormState | null,
): string[] {
  const out: string[] = [];
  if ((mode === 'new' || mode === 'editDetails') && app) {
    if (!app.accountId) out.push('Profile');
    if (!app.companyName.trim()) out.push('Company');
  }
  if (mode !== 'editDetails' && round) {
    if (!round.stage) out.push('Stage');
    if (!round.date) out.push('Date');
    if (!round.time) out.push('Start time');
  }
  return out;
}
