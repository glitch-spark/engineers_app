/**
 * The Bids page's URL, as pure functions: the tab (`section`), the table view (`lens`), the owner (`owner`), and the review overlay's scope
 * (`mode=focus`, `review`, `at`, `reviewBidder`). Nothing here reads the router, so the page passes a getter and
 * writes the patches these return (a `null` value removes its key; defaults are never written).
 *
 * Old links keep working: `show=self` opens My bids, `show=bidders|all` the Bidders tab, and `mode=focus` without
 * `review` is the pay week of `week` (or the current one). `mode=focus` with `bid` is the day panel's walk, not a
 * review. `view` is not used here (the page already owns it) and `tab` belongs to the bidder view.
 */
import type * as api from '../api/endpoints';
import type { BidderPeriodRequest, ReportClock } from './bidderFilters';
import { isValidDate } from './dateRange.ts';

export type UrlGet = (key: string) => string | null;

// ---- tabs ------------------------------------------------------------------

export type BidsSection = 'bidders' | 'mine' | 'pay';

/** `section` wins; then the old `show=self` opens My bids; anything else is the Bidders tab. */
export function sectionFromUrl(get: UrlGet): BidsSection {
  const section = get('section');
  if (section === 'mine' || section === 'pay') return section;
  return get('show') === 'self' ? 'mine' : 'bidders';
}

/** A tab change. Search and Show archived belong to the Bidders tab, and the old `show` is replaced by `section`. */
export function sectionPatch(next: BidsSection): { section: string | null; show: null; q: null; archived: null } {
  return { section: next === 'bidders' ? null : next, show: null, q: null, archived: null };
}

// ---- table view ------------------------------------------------------------

/** The Bidders table's view: Week (the default, absent from the URL) or Performance. */
export type BidsLens = 'week' | 'performance';

export const lensFromUrl = (get: UrlGet): BidsLens => (get('lens') === 'performance' ? 'performance' : 'week');

export const lensPatch = (l: BidsLens): { lens: string | null } => ({ lens: l === 'week' ? null : l });

// ---- owner -----------------------------------------------------------------

export type OwnerScope = { ownerId: string | undefined; all: boolean };

/** `owner` values: Me (the admin's own team) and every owner. Anything else is a user id. */
export const OWNER_ME = 'me';
export const OWNER_ALL = 'all';

/**
 * What the `owner` value means. Only an admin picks an owner: absent = `defaultOwner` (the first team member, see
 * useFirstTeamMember), else their own id; `me` = their own id; `all` = every owner (no `ownerId`); anything else = that
 * user. Staff always see their own, whatever the URL says.
 */
export function ownerScope(
  raw: string, isAdmin: boolean, userId: string | undefined, defaultOwner?: string,
): OwnerScope {
  if (!isAdmin) return { ownerId: undefined, all: false };
  if (raw === OWNER_ALL) return { ownerId: undefined, all: true };
  if (raw === OWNER_ME) return { ownerId: userId, all: false };
  return { ownerId: raw || defaultOwner || userId, all: false };
}

/** The owner select's value: what an absent `owner` stands for, with the own id (an old link) shown as Me. */
export function ownerSelectValue(raw: string, userId: string | undefined, defaultOwner?: string): string {
  const value = raw || defaultOwner || OWNER_ME;
  return userId !== undefined && value === userId ? OWNER_ME : value;
}

/** Me, the other users sorted by label (name, else email, else id; case-insensitive), then All owners. */
export function ownerOptions(
  users: { _id: string; name?: string | null; email?: string | null }[],
  userId: string | undefined,
): { value: string; label: string }[] {
  const others = users
    .filter((u) => u._id !== userId)
    .map((u) => ({ value: u._id, label: u.name?.trim() || u.email?.trim() || u._id }))
    .sort((a, b) => {
      const x = a.label.toLowerCase();
      const y = b.label.toLowerCase();
      return x < y ? -1 : x > y ? 1 : a.value < b.value ? -1 : a.value > b.value ? 1 : 0;
    });
  return [{ value: OWNER_ME, label: 'Me' }, ...others, { value: OWNER_ALL, label: 'All owners' }];
}

// ---- review ----------------------------------------------------------------

export type ReviewScope =
  | { kind: 'day'; day: string }
  | { kind: 'week'; at: string | null }
  | { kind: 'range' }
  | { kind: 'all' };
export type ReviewTarget = { scope: ReviewScope; bidderId: string | null };

const validDay = (s: string | null): s is string => s !== null && isValidDate(s);

/**
 * The review overlay the URL asks for, or null. It needs `mode=focus`, and `bid` there is the day panel's walk (a
 * single-bid view), not a review. Without `review` (an old link) it is the pay week of `week`, else the current one.
 * `reviewBidder` (or the old `bidder`) filters the overlay to one bidder.
 */
export function reviewFromUrl(get: UrlGet, today: string): ReviewTarget | null {
  if (get('mode') !== 'focus' || get('bid')) return null;
  const bidderId = get('reviewBidder') || get('bidder') || null;
  const at = get('at');
  switch (get('review')) {
    case 'all': return { scope: { kind: 'all' }, bidderId };
    case 'range': return { scope: { kind: 'range' }, bidderId };
    case 'day': return { scope: { kind: 'day', day: validDay(at) ? at : today }, bidderId };
    case 'week': return { scope: { kind: 'week', at: validDay(at) ? at : null }, bidderId };
    default: {
      const week = get('week');
      return { scope: { kind: 'week', at: validDay(week) ? week : null }, bidderId };
    }
  }
}

/** Opens a review. `bid` is cleared so it can't turn into the day panel's walk. */
export function reviewPatch(
  scope: ReviewScope,
  bidderId?: string | null,
): { mode: 'focus'; review: string; at: string | null; reviewBidder: string | null; bid: null } {
  const at = scope.kind === 'day' ? scope.day : scope.kind === 'week' ? scope.at : null;
  return { mode: 'focus', review: scope.kind, at, reviewBidder: bidderId ?? null, bid: null };
}

/** Closing the overlay: every review key (and `bid`) removed. */
export const REVIEW_EXIT = { mode: null, bid: null, review: null, at: null, reviewBidder: null };

export type ReviewSwitch = 'today' | 'week' | 'range' | 'all';
export const REVIEW_SWITCH_OPTIONS: { value: ReviewSwitch; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This pay week' },
  { value: 'range', label: 'Range' },
  { value: 'all', label: 'All pending' },
];

/** Which switch option the scope is, or null when it is another day or pay week (no option is selected). */
export function reviewSwitchValue(scope: ReviewScope, clock: ReportClock): ReviewSwitch | null {
  switch (scope.kind) {
    case 'day': return scope.day === clock.today ? 'today' : null;
    case 'week':
      return scope.at === null || (scope.at >= clock.payWeekStart && scope.at <= clock.payWeekEnd) ? 'week' : null;
    case 'range': return 'range';
    case 'all': return 'all';
  }
}

export function reviewSwitchScope(v: ReviewSwitch, clock: ReportClock): ReviewScope {
  switch (v) {
    case 'today': return { kind: 'day', day: clock.today };
    case 'week': return { kind: 'week', at: null };
    case 'range': return { kind: 'range' };
    case 'all': return { kind: 'all' };
  }
}

/**
 * The `/bids/pending` query for a review, or null when there is nothing to ask for yet (a range review needs the
 * list's period request, which is null while a Custom range is partial). Keys that would be undefined are left out.
 */
export function pendingQuery(
  t: ReviewTarget,
  request: BidderPeriodRequest | null,
  ownerId: string | undefined,
): api.PendingQuery | null {
  const { scope } = t;
  let q: api.PendingQuery;
  switch (scope.kind) {
    case 'all': q = { period: 'all' }; break;
    case 'day': q = { period: 'day', date: scope.day }; break;
    case 'week': q = scope.at ? { period: 'week', date: scope.at } : { period: 'week' }; break;
    case 'range': {
      if (!request) return null;
      q = { period: request.period };
      if (request.date) q.date = request.date;
      if (request.to) q.to = request.to;
      if (request.weeks) q.weeks = request.weeks;
      break;
    }
  }
  if (ownerId) q.ownerId = ownerId;
  if (t.bidderId) q.bidderId = t.bidderId;
  return q;
}
