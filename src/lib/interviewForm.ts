/** Pure state helpers for the Application + Round interview form. */
import type { CallerInput, InterviewStageEntry, NoMatchReason, ResumeLinkInput, RoundInput } from '../api/endpoints';
import { INTERVIEW_STAGE_ORDER, normalizeInterviewStatus, type InterviewStatusValue } from './stageBadge';
import { browserZone, fromZoned, parseServerTime, zonedDateKey, zonedTime } from './interviewTimezone';

export type InterviewFormMode = 'new' | 'editDetails' | 'addRound' | 'editRound';

export type ApplicationFormState = {
  accountId: string;
  companyName: string;
  appliedPosition: string;
  jobUrl: string;
  link: LinkChoice;
};

/**
 * The resume this interview came from. `keep`: the interview's saved link, unchanged (edit). `search`: nothing picked
 * yet (the Company box searches). `match`: a picked search result. `none`: no company found, and why.
 */
export type LinkChoice =
  | { mode: 'keep' }
  | { mode: 'search' }
  | { mode: 'match'; matchId: string }
  | { mode: 'none'; reason: NoMatchReason | ''; note: string; resumeId: string };

export const NO_MATCH_REASONS: { value: NoMatchReason; label: string }[] = [
  { value: 'fixed_resume', label: 'Used a fixed resume' },
  { value: 'outside_app', label: 'Applied outside the app' },
  { value: 'recruiter', label: 'Recruiter reached out' },
  { value: 'referral', label: 'Referral' },
  { value: 'name_differs', label: 'Company name differs' },
  { value: 'other', label: 'Other' },
];

/** What the API gets for the link: nothing (keep the saved one / none picked), the pick, or the reason. */
export function linkPayload(link: LinkChoice): ResumeLinkInput | undefined {
  if (link.mode === 'match') return { matchId: link.matchId };
  if (link.mode === 'none' && link.reason) {
    return {
      none: true,
      reason: link.reason,
      note: link.note.trim(),
      ...(link.reason === 'fixed_resume' ? { resumeId: link.resumeId } : {}),
    };
  }
  return undefined;
}

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
  /** The saved caller's name (shown when it is not on the caller list). */
  callerName: string;
  /** Picked from the caller list: '' = not assigned yet, OFF_LIST_CALLER = a name not on the list. */
  callerId: string;
  /** callerId as saved: the caller is sent only when the pick changes, so a round keeps the caller it has. */
  callerIdSaved: string;
  callerMethod: string;
  callerMethodValue: string;
  /** Caller lined up (edit an existing caller round only). */
  confirmed: boolean;
};

export const DEFAULT_START_TIME = '10:00';
/** A round's caller typed before the caller list existed (e.g. "David"). */
export const OFF_LIST_CALLER = '__off_list';
export const DEFAULT_DURATION_MIN = 60;
export const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120];

export function blankApplication(): ApplicationFormState {
  return { accountId: '', companyName: '', appliedPosition: '', jobUrl: '', link: { mode: 'search' } };
}

/** `tz` is the IANA zone the form's date and time are read in (default: browser). */
export function blankRound(
  opts: { date?: string; time?: string; stage?: string; callerEnabled?: boolean } = {},
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
    callerEnabled: !!opts.callerEnabled,
    callerName: '',
    callerId: '',
    callerIdSaved: '',
    callerMethod: '',
    callerMethodValue: '',
    confirmed: false,
  };
}

export function roundFromEntry(e: InterviewStageEntry, tz: string = browserZone()): RoundFormState {
  const start = e.scheduledAt ? parseServerTime(e.scheduledAt) : null;
  const end = e.endsAt ? parseServerTime(e.endsAt) : null;
  const valid = start && !isNaN(start.getTime());
  const minutes = valid && end && !isNaN(end.getTime()) ? Math.round((end.getTime() - start.getTime()) / 60000) : 0;
  const caller = e.caller;
  const typedName = caller?.callerName && caller.callerName !== 'TBD' ? caller.callerName : '';
  const callerId = caller?.callerId || (typedName ? OFF_LIST_CALLER : '');
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
    callerName: typedName,
    callerId,
    callerIdSaved: callerId,
    callerMethod: caller?.method || '',
    callerMethodValue: caller?.methodValue || '',
    confirmed: !!e.confirmed,
  };
}

/** Date + time read in `tz` → UTC ISO; end = start + duration. */
export function roundPayload(r: RoundFormState, tz: string = browserZone()): RoundInput {
  const start = fromZoned(r.date, r.time || DEFAULT_START_TIME, tz);
  const end = new Date(start.getTime() + (r.durationMin || DEFAULT_DURATION_MIN) * 60000);
  const caller: CallerInput | undefined = r.callerEnabled
    ? {
      enabled: true,
      method: r.callerMethod || undefined,
      methodValue: r.callerMethodValue.trim(),
      // Only a changed pick is sent; left out, the round keeps its caller (or starts with none).
      ...(r.callerId !== r.callerIdSaved && r.callerId !== OFF_LIST_CALLER ? { callerId: r.callerId } : {}),
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
    // A new interview links its resume or says why there's none; editing older ones may leave it unlinked.
    if (mode === 'new' && app.link.mode === 'search') out.push('Resume match or reason');
    if (app.link.mode === 'none') {
      if (!app.link.reason) out.push('Reason');
      else if (app.link.reason === 'other' && !app.link.note.trim()) out.push('Note');
      else if (app.link.reason === 'fixed_resume' && !app.link.resumeId) out.push('Fixed resume');
    }
  }
  if (mode !== 'editDetails' && round) {
    if (!round.stage) out.push('Stage');
    if (!round.date) out.push('Date');
    if (!round.time) out.push('Start time');
  }
  return out;
}
