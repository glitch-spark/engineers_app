/** Pure helpers for the interview side panel's summary (next round, timeline, details). */
import type { InterviewCaller, InterviewStageEntry } from '../api/endpoints';
import { countryName } from './countries';
import { formatInZone, zonedDateKey } from './interviewTimezone';
import { normalizeInterviewStage, normalizeInterviewStatus } from './stageBadge';

type RoundLike = Pick<InterviewStageEntry, 'id' | 'stage' | 'scheduledAt' | 'status'>;

/** The round to spotlight: the earliest upcoming scheduled round, else the most recent past one. */
export function spotlightRound<T extends RoundLike>(
  rounds: T[],
  now: Date,
): { kind: 'next' | 'last'; round: T } | null {
  const dated = rounds
    .filter((r) => r.scheduledAt && !isNaN(new Date(r.scheduledAt).getTime()))
    .map((r) => ({ r, t: new Date(r.scheduledAt as string).getTime() }));
  const upcoming = dated
    .filter(({ r, t }) => t >= now.getTime() && normalizeInterviewStatus(r.status) === 'scheduled')
    .sort((a, b) => a.t - b.t);
  if (upcoming.length) return { kind: 'next', round: upcoming[0].r };
  const past = dated.sort((a, b) => b.t - a.t);
  return past.length ? { kind: 'last', round: past[0].r } : null;
}

function dayDiff(a: Date, b: Date, tz: string): number {
  const toUtcDay = (d: Date) => {
    const [y, m, day] = zonedDateKey(d, tz).split('-').map(Number);
    return Date.UTC(y, m - 1, day);
  };
  return Math.round((toUtcDay(a) - toUtcDay(b)) / 86400000);
}

/** "in 45 min", "today at 5:30 PM", "tomorrow at …", "in 3 days", "yesterday", "12 days ago", "on Oct 20". */
export function relativeWhen(when: Date, now: Date, tz: string): string {
  const mins = Math.round((when.getTime() - now.getTime()) / 60000);
  const days = dayDiff(when, now, tz);
  const time = formatInZone(when, tz, { hour: 'numeric', minute: '2-digit' });
  const date = formatInZone(when, tz, { month: 'short', day: 'numeric' });
  if (mins >= 0) {
    if (mins < 60) return `in ${mins} min`;
    if (days === 0) return `today at ${time}`;
    if (days === 1) return `tomorrow at ${time}`;
    if (days < 7) return `in ${days} days`;
    return `on ${date}`;
  }
  if (days === 0) return 'today';
  if (days === -1) return 'yesterday';
  if (days > -30) return `${-days} days ago`;
  return `on ${date}`;
}

const STAGE_GROUPS: { key: string; label: string; stages: string[] }[] = [
  { key: 'intro', label: 'Intro', stages: ['intro'] },
  { key: 'tech', label: 'Tech', stages: ['tech_round_1', 'tech_round_2', 'live_coding', 'system_design', 'home_assessment'] },
  { key: 'hiring', label: 'Hiring', stages: ['cultural'] },
  { key: 'panel', label: 'Panel', stages: ['panel'] },
  { key: 'final', label: 'Final', stages: ['final'] },
];

/** Pipeline progress: which stage groups have a round that wasn't canceled. */
export function stagesReached(rounds: RoundLike[]): { key: string; label: string; reached: boolean }[] {
  const held = new Set(
    rounds
      .filter((r) => normalizeInterviewStatus(r.status) !== 'canceled')
      .map((r) => normalizeInterviewStage(r.stage)),
  );
  return STAGE_GROUPS.map((g) => ({ key: g.key, label: g.label, reached: g.stages.some((s) => held.has(s)) }));
}

/** A joinable URL from the caller's method value (video links only). */
export function meetingLink(caller?: Pick<InterviewCaller, 'enabled' | 'method' | 'methodValue'> | null): string | null {
  const value = (caller?.methodValue || '').trim();
  return caller?.enabled && /^https?:\/\//i.test(value) ? value : null;
}

/** First ~140 characters of a note on one line. */
export function notesPreview(note?: string | null): string {
  const flat = (note || '').replace(/\s+/g, ' ').trim();
  return flat.length > 140 ? `${flat.slice(0, 139)}…` : flat;
}

export function wordCount(text?: string | null): number {
  const t = (text || '').trim();
  return t ? t.split(/\s+/).length : 0;
}

/** "Tuoc Nguyen · United States" (country name, since flag emoji don't render on Windows). */
export function profileText(account?: { name?: string; email?: string; country?: string | null; region?: string | null } | null): string {
  if (!account) return '';
  const name = (account.name || account.email || '').trim();
  const where = countryName(account.country) || (account.region || '').trim();
  return [name, where].filter(Boolean).join(' · ');
}
