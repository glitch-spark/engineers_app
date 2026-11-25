import { useId, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import useSWR from 'swr';
import * as api from '../../api/endpoints';
import type { NeedsInputItem, PendingBidder, PendingProfile, TodayInterview } from '../../api/endpoints';
import { useAuth } from '../../auth/useAuth';
import { formatInZone, parseServerTime } from '../../lib/interviewTimezone';
import { stageLabel } from '../../lib/stageBadge';
import { useInterviewTimezone } from '../../lib/useInterviewTimezone';
import { daysWithoutResult, needsInputKey, shortDay, useNeedsInputActions } from '../interview/useNeedsInputActions';
import { asNeedsInput, roundKey, roundState, useNow } from './TodayRound';

const RED = 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300';
const AMBER = 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300';
const BLUE = 'bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-400';
const GREY = 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300';
const NEEDS: { need: NeedsInputItem['need']; tag: string; color: string }[] = [
  { need: 'outcome', tag: 'Status unknown', color: RED },
  { need: 'follow_up', tag: 'Follow-up due', color: AMBER },
  { need: 'heard_back', tag: 'Heard back?', color: BLUE },
  { need: 'reason', tag: 'No reason', color: GREY },
];
const LABEL = 'text-[11px] font-medium uppercase tracking-wider text-muted';
const LINE = 'flex flex-wrap items-center gap-x-2 gap-y-1.5 py-1.5 text-sm text-body';
const num = (n: number) => n.toLocaleString('en-US');
/** "48, 52 and 40" */
const listed = (xs: number[]) => (xs.length > 1 ? `${xs.slice(0, -1).map(num).join(', ')} and ${num(xs[xs.length - 1])}` : xs.map(num).join(''));

/** How many rows of a group the admin sees before "… n more". */
const FIRST = 5;

/**
 * The reads behind Pending items and what they add up to: the interview rows in tag order, the profile and bidder
 * flags, and the total. Shared with the admin's person page, whose Pending tile shows the same numbers (same SWR
 * keys, so nothing is read twice). `loading` until the first answer; `failed` when neither read answered.
 * `apart` (the owner's Home, and the admin's view of a person on today): the day block lists `today`'s unmarked
 * rounds and the follow-ups, so they are not in `rows` or the total; the follow-up rows come back as `followUps`.
 */
export function usePending(mode: 'owner' | 'admin', userId: string | undefined, today: TodayInterview[], apart = mode === 'owner') {
  const { user } = useAuth();
  const now = useNow();
  const pending = useSWR(['home-pending', userId ?? ''], () => api.getDashboardPending(userId), { shouldRetryOnError: false });
  // An admin's own rounds are asked for by id (without it the needs-input list is the whole team's).
  const listFor = userId ?? (user?.role === 'admin' ? user.id : undefined);
  const list = useSWR(pending.error ? ['interviews-needs-input', listFor ?? ''] : null, () => api.getNeedsInput(listFor));

  const unmarkedToday = today.filter((r) => roundState(r, now) === 'unmarked');
  const todayKeys = new Set(today.map(roundKey));
  const waiting = (pending.data?.interviews ?? list.data?.items ?? [])
    // Guard: an admin's own Home never shows someone else's round, whatever the server returned (asked for a
    // person by id, the rows are that person's).
    .filter((row) => mode === 'admin' || !!userId || user?.role !== 'admin' || row.ownerId === user.id);
  const known = new Set(waiting.map(needsInputKey));
  const interviews = apart
    ? waiting.filter((row) => !(row.need === 'outcome' && todayKeys.has(needsInputKey(row))))
    : [...waiting, ...unmarkedToday.filter((r) => !known.has(roundKey(r))).map(asNeedsInput)];
  const followUps = apart ? interviews.filter((row) => row.need === 'follow_up') : [];
  const rows = NEEDS.flatMap((n) => interviews.filter((row) => row.need === n.need && !followUps.includes(row)).map((row) => ({ row, ...n })));
  const profiles = pending.data?.profiles ?? [];
  const bidders = pending.data?.bidders ?? [];
  return {
    rows, followUps, profiles, bidders, unmarkedToday, total: rows.length + profiles.length + bidders.length,
    loading: !pending.data && (!pending.error || (!list.data && !list.error)),
    failed: !pending.data && !!pending.error && !list.data && !!list.error,
    retry: () => pending.mutate(),
  };
}

/**
 * What waits on one person: interviews that need an answer, and the flags on their profiles and bidders.
 * `owner`: its own block on the person's Home, folded until its heading is clicked (follow-up rows and `today`'s
 * unmarked rounds are rows of the Today list there, so they are not repeated). `admin`: on the admin's page for
 * `userId` (`name`), where the result buttons work but following up stays with the owner, and `today`'s unmarked
 * rounds are listed.
 * Hidden when nothing waits. `onSaved` refetches whatever the page shows, this list included (`home-pending`,
 * `interviews-needs-input`). An older server without the pending read still gives the interviews.
 */
export default function PendingItems({
  mode, userId, name, today, apart, onSaved, readOnly = false,
}: {
  mode: 'owner' | 'admin';
  userId?: string;
  name?: string;
  today: TodayInterview[];
  /** See `usePending`; default: the owner's Home. */
  apart?: boolean;
  onSaved: () => unknown;
  /** A teammate reading the list: no answer buttons. */
  readOnly?: boolean;
}) {
  const id = useId();
  const { tz } = useInterviewTimezone();
  const { rows, profiles, bidders, unmarkedToday, total } = usePending(mode, userId, today, apart);
  const { dialog, ask, button, resultButtons, outcomeButtons } = useNeedsInputActions(onSaved);
  const [open, setOpen] = useState(mode === 'admin'); // the owner's block starts folded
  // admin only: the groups folded, and the groups shown past their first rows
  const [folded, setFolded] = useState<string[]>([]);
  const [whole, setWhole] = useState<string[]>([]);
  if (!total) return dialog;

  const interviewText = (row: NeedsInputItem) => {
    const round = [stageLabel(row.stage), shortDay(row.scheduledAt, tz)].filter(Boolean).join(', ');
    if (row.need === 'outcome') {
      const live = unmarkedToday.find((r) => roundKey(r) === needsInputKey(row));
      if (!live) return `${round} · ended, never marked`;
      const ended = live.endsAt ? ` ${formatInZone(parseServerTime(live.endsAt), tz, { hour: 'numeric', minute: '2-digit' })}` : '';
      return `${stageLabel(live.stage)} · ended today${ended}, not marked`;
    }
    if (row.need === 'follow_up') {
      const days = daysWithoutResult(row);
      return `${round} · ${days === null ? 'no result yet' : `no result for ${days} days`}`;
    }
    if (row.need === 'heard_back') {
      const day = shortDay(row.followedUpAt, tz);
      return `${round} · followed up${day ? ` ${day}` : ''}`;
    }
    return `${round} · ${row.status === 'rejected' ? 'rejected' : 'canceled'} with no reason`;
  };
  const interviewButtons = (row: NeedsInputItem) => {
    if (readOnly || !row.roundId) return null; // an old round with no id of its own: the Interviews page handles it
    if (row.need === 'outcome') return outcomeButtons(row);
    if (row.need === 'reason') return [button(row, 'Add reason', () => ask(row, row.status))];
    return resultButtons(row);
  };
  const profileText = (p: PendingProfile) => {
    const days = `${num(p.idleDays)} days${p.capped ? ' or more' : ''}`;
    if (p.kind === 'no_bids') return `no bids, self or bidder, for ${days} · archive it?`;
    const extra = [
      p.bids != null && `${num(p.bids)} bids in that time`,
      p.tailorScore != null && `resume score ${Math.round(p.tailorScore)} on average`,
    ].filter(Boolean).join(', ');
    return `no interview for ${days}${extra ? ` · ${extra}` : ''}`;
  };
  const bidderText = (b: PendingBidder) => {
    if (b.kind === 'not_bidding') return b.days != null ? `no bids for ${b.days} working days` : 'no bids lately';
    if (!b.recent?.length) return 'bidding less than before';
    return `${listed(b.recent)} bids the last ${b.recent.length} days${b.before != null ? ` · ${num(Math.round(b.before))} a day before` : ''}`;
  };
  const whatToChange = `/statistics?tab=conversion&scope=me${userId ? `&user=${encodeURIComponent(userId)}` : ''}`;

  const line = (key: string, tag: string, color: string, who: string, text: string, end: ReactNode) => (
    <li key={key} className={LINE}>
      <span className={`whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${color}`}>{tag}</span>
      <span className="min-w-0 flex-1 basis-52">
        <span className="font-medium text-strong">{who}</span>
        <span className="text-muted"> · {text}</span>
      </span>
      {end}
    </li>
  );
  const group = (title: string, items: ReactNode[]) => {
    if (!items.length) return null;
    if (mode === 'owner') {
      return (
        <>
          <div className={`mt-3 ${LABEL}`}>{title} ({items.length})</div>
          <ul aria-label={title} className="divide-y divide-zinc-100 dark:divide-zinc-800">{items}</ul>
        </>
      );
    }
    // the admin's page: a group folds on its heading and lists its first rows, then "… n more" (user, 2026-11-21)
    const open = !folded.includes(title);
    const rest = whole.includes(title) ? 0 : Math.max(0, items.length - FIRST);
    return (
      <>
        <button
          type="button" aria-expanded={open} className={`mt-3 block w-full text-left ${LABEL}`}
          onClick={() => setFolded((f) => (open ? [...f, title] : f.filter((t) => t !== title)))}
        >
          <span aria-hidden>{open ? '▾ ' : '▸ '}</span>{title} ({items.length})
        </button>
        {open && <ul aria-label={title} className="divide-y divide-zinc-100 dark:divide-zinc-800">{rest ? items.slice(0, FIRST) : items}</ul>}
        {open && rest > 0 && (
          <button type="button" className="py-1 text-xs text-muted underline" onClick={() => setWhole((w) => [...w, title])}>
            … {rest} more<span className="sr-only"> {title.toLowerCase()}</span>
          </button>
        )}
      </>
    );
  };
  const link = (to: string, text: string) => <Link to={to} className="link-inline whitespace-nowrap text-xs">{text} →</Link>;

  return (
    <div role="group" aria-labelledby={id} className="panel p-4">
      {dialog}
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <h3 id={id} className="card-title">
          {mode === 'admin' ? `Pending items (${total})` : (
            <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
              <span aria-hidden>{open ? '▾ ' : '▸ '}</span>Pending items{' '}
              <span className="rounded-full bg-red-100 px-1.5 text-[11px] font-bold text-red-700 dark:bg-red-950 dark:text-red-300">{total}</span>
            </button>
          )}
        </h3>
        <span className="text-xs text-muted">{mode === 'admin' ? `Things waiting on ${name || 'this person'}` : `Older things waiting on ${userId ? name || 'this person' : 'you'}`}</span>
      </div>
      {open && (
        <>
          {group('Interviews', rows.map(({ row, tag, color }) => line(
            needsInputKey(row), tag, color, row.companyName || 'Untitled company', interviewText(row),
            <div className="flex flex-wrap gap-2">{interviewButtons(row)}</div>,
          )))}
          {group('Profiles', profiles.map((p) => (p.kind === 'no_interviews'
            ? line(`${p.accountId}:${p.kind}`, 'No interviews', RED, p.name || 'Unnamed', profileText(p), link(whatToChange, 'What to change'))
            : line(`${p.accountId}:${p.kind}`, 'No bids', GREY, p.name || 'Unnamed', profileText(p), link(`/accounts/${p.accountId}`, 'Open profile')))))}
          {group('Bidders', bidders.map((b) => line(
            `${b.bidderId}:${b.kind}`, b.kind === 'not_bidding' ? 'Not bidding' : 'Slowing down', b.kind === 'not_bidding' ? RED : AMBER,
            b.name || 'Unnamed', bidderText(b), link(`/bidders?bidder=${encodeURIComponent(b.bidderId)}`, 'Open bidder'),
          )))}
        </>
      )}
    </div>
  );
}
