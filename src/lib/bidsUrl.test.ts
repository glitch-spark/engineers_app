import { describe, expect, it } from 'vitest';
import {
  REVIEW_EXIT, REVIEW_SWITCH_OPTIONS, ownerOptions, ownerScope, ownerSelectValue, pendingQuery, reviewFromUrl,
  reviewPatch, reviewSwitchScope, reviewSwitchValue, sectionFromUrl, sectionPatch,
} from './bidsUrl';
import type { ReportClock } from './bidderFilters';

// Wed Nov 25, 2026: the first Mon..Sun pay week after the switch (Nov 23..29).
const AFTER: ReportClock = {
  today: '2026-11-25', payWeekStart: '2026-11-23', payWeekEnd: '2026-11-29', previousPayWeekStart: '2026-11-15',
  timezone: 'America/Chicago',
};
const TODAY = AFTER.today;
const url = (qs: string) => {
  const p = new URLSearchParams(qs);
  return (k: string) => p.get(k);
};

describe('sections', () => {
  it('reads the tab, defaulting to Bidders', () => {
    expect(sectionFromUrl(url(''))).toBe('bidders');
    expect(sectionFromUrl(url('section=mine'))).toBe('mine');
    expect(sectionFromUrl(url('section=pay'))).toBe('pay');
    expect(sectionFromUrl(url('section=junk'))).toBe('bidders');
  });
  it('a tab change drops the Bidders-only filters and the old show key', () => {
    expect(sectionPatch('bidders')).toEqual({ section: null, show: null, q: null, archived: null });
    expect(sectionPatch('mine')).toEqual({ section: 'mine', show: null, q: null, archived: null });
    expect(sectionPatch('pay')).toEqual({ section: 'pay', show: null, q: null, archived: null });
  });
});

describe('owner', () => {
  it('scopes the owner by role', () => {
    expect(ownerScope('', true, 'u1')).toEqual({ ownerId: 'u1', all: false });
    expect(ownerScope('all', true, 'u1')).toEqual({ ownerId: undefined, all: true });
    expect(ownerScope('u2', true, 'u1')).toEqual({ ownerId: 'u2', all: false });
    expect(ownerScope('u2', false, 'u1')).toEqual({ ownerId: undefined, all: false });
    expect(ownerScope('all', false, 'u1')).toEqual({ ownerId: undefined, all: false });
    expect(ownerScope('', true, undefined)).toEqual({ ownerId: undefined, all: false });
  });
  it('shows the own id as Me', () => {
    expect(ownerSelectValue('u1', 'u1')).toBe('');
    expect(ownerSelectValue('u2', 'u1')).toBe('u2');
    expect(ownerSelectValue('all', 'u1')).toBe('all');
    expect(ownerSelectValue('', 'u1')).toBe('');
  });
  it('lists Me, the others by label (case-insensitive), then All owners', () => {
    expect(
      ownerOptions([{ _id: 'u2', name: 'Zed' }, { _id: 'u1', name: 'Pat' }, { _id: 'u3', email: 'a@x.io' }], 'u1'),
    ).toEqual([
      { value: '', label: 'Me' },
      { value: 'u3', label: 'a@x.io' },
      { value: 'u2', label: 'Zed' },
      { value: 'all', label: 'All owners' },
    ]);
    expect(
      ownerOptions([{ _id: 'b', name: 'bob' }, { _id: 'a', name: 'Alice' }, { _id: 'c', name: 'Carl' }], undefined)
        .map((o) => o.label),
    ).toEqual(['Me', 'Alice', 'bob', 'Carl', 'All owners']);
    expect(ownerOptions([{ _id: 'u9', name: ' ', email: null }], 'u1')[1]).toEqual({ value: 'u9', label: 'u9' });
  });
});

describe('review scopes', () => {
  it('reads each scope', () => {
    expect(reviewFromUrl(url('mode=focus&review=all'), TODAY)).toEqual({ scope: { kind: 'all' }, bidderId: null });
    expect(reviewFromUrl(url('mode=focus&review=day&at=2026-11-24'), TODAY)?.scope).toEqual({ kind: 'day', day: '2026-11-24' });
    expect(reviewFromUrl(url('mode=focus&review=day'), TODAY)?.scope).toEqual({ kind: 'day', day: '2026-11-25' });
    expect(reviewFromUrl(url('mode=focus&review=day&at=junk'), TODAY)?.scope).toEqual({ kind: 'day', day: '2026-11-25' });
    expect(reviewFromUrl(url('mode=focus&review=week&at=2026-11-14&reviewBidder=b1'), TODAY)).toEqual({
      scope: { kind: 'week', at: '2026-11-14' }, bidderId: 'b1',
    });
    expect(reviewFromUrl(url('mode=focus&review=range'), TODAY)).toEqual({ scope: { kind: 'range' }, bidderId: null });
  });
  it('is not a review without mode=focus, or for the day panel walk', () => {
    expect(reviewFromUrl(url('mode=focus&bid=x&day=2026-11-24'), TODAY)).toBeNull();
    expect(reviewFromUrl(url('review=all'), TODAY)).toBeNull();
    expect(reviewFromUrl(url(''), TODAY)).toBeNull();
    expect(reviewFromUrl(url('mode=other&review=all'), TODAY)).toBeNull();
  });
  it('reviewBidder wins over bidder', () => {
    expect(reviewFromUrl(url('mode=focus&review=all&bidder=b2&reviewBidder=b1'), TODAY)?.bidderId).toBe('b1');
    expect(reviewFromUrl(url('mode=focus&review=all&bidder=b2'), TODAY)?.bidderId).toBe('b2');
  });
});

describe('old links', () => {
  it('show=self opens My bids; other show values open Bidders', () => {
    expect(sectionFromUrl(url('show=self'))).toBe('mine');
    expect(sectionFromUrl(url('show=bidders'))).toBe('bidders');
    expect(sectionFromUrl(url('show=all'))).toBe('bidders');
    expect(sectionFromUrl(url('section=pay&show=self'))).toBe('pay');
  });
  it('mode=focus without review is the pay week of week', () => {
    expect(reviewFromUrl(url('mode=focus&week=2026-11-22&bidder=b1'), TODAY)).toEqual({
      scope: { kind: 'week', at: '2026-11-22' }, bidderId: 'b1',
    });
    expect(reviewFromUrl(url('mode=focus'), TODAY)).toEqual({ scope: { kind: 'week', at: null }, bidderId: null });
    expect(reviewFromUrl(url('mode=focus&week=junk'), TODAY)?.scope).toEqual({ kind: 'week', at: null });
    expect(reviewFromUrl(url('mode=focus&review=junk&week=2026-11-22'), TODAY)?.scope).toEqual({
      kind: 'week', at: '2026-11-22',
    });
  });
});

describe('patches', () => {
  it('writes the review keys, and bid is always cleared', () => {
    expect(reviewPatch({ kind: 'range' }, 'b1')).toEqual({
      mode: 'focus', review: 'range', at: null, reviewBidder: 'b1', bid: null,
    });
    expect(reviewPatch({ kind: 'day', day: '2026-11-25' })).toEqual({
      mode: 'focus', review: 'day', at: '2026-11-25', reviewBidder: null, bid: null,
    });
    expect(reviewPatch({ kind: 'week', at: null }).at).toBeNull();
    expect(reviewPatch({ kind: 'week', at: '2026-11-22' }).at).toBe('2026-11-22');
    expect(reviewPatch({ kind: 'all' }).at).toBeNull();
  });
  it('REVIEW_EXIT clears every review key', () => {
    expect(REVIEW_EXIT).toEqual({ mode: null, bid: null, review: null, at: null, reviewBidder: null });
  });
});

describe('switch', () => {
  it('lists the four views', () => {
    expect(REVIEW_SWITCH_OPTIONS).toEqual([
      { value: 'today', label: 'Today' },
      { value: 'week', label: 'This pay week' },
      { value: 'range', label: 'Range' },
      { value: 'all', label: 'All pending' },
    ]);
  });
  it('maps a scope to a switch value, null when it is a different day or week', () => {
    expect(reviewSwitchValue({ kind: 'day', day: '2026-11-25' }, AFTER)).toBe('today');
    expect(reviewSwitchValue({ kind: 'day', day: '2026-11-24' }, AFTER)).toBeNull();
    expect(reviewSwitchValue({ kind: 'week', at: null }, AFTER)).toBe('week');
    expect(reviewSwitchValue({ kind: 'week', at: '2026-11-27' }, AFTER)).toBe('week');
    expect(reviewSwitchValue({ kind: 'week', at: '2026-11-22' }, AFTER)).toBeNull();
    expect(reviewSwitchValue({ kind: 'range' }, AFTER)).toBe('range');
    expect(reviewSwitchValue({ kind: 'all' }, AFTER)).toBe('all');
  });
  it('maps a switch value to a scope', () => {
    expect(reviewSwitchScope('today', AFTER)).toEqual({ kind: 'day', day: '2026-11-25' });
    expect(reviewSwitchScope('week', AFTER)).toEqual({ kind: 'week', at: null });
    expect(reviewSwitchScope('range', AFTER)).toEqual({ kind: 'range' });
    expect(reviewSwitchScope('all', AFTER)).toEqual({ kind: 'all' });
  });
});

describe('pending queries', () => {
  it('builds the /bids/pending query for each scope', () => {
    expect(pendingQuery({ scope: { kind: 'all' }, bidderId: null }, null, 'u1')).toEqual({ period: 'all', ownerId: 'u1' });
    expect(pendingQuery({ scope: { kind: 'day', day: '2026-11-24' }, bidderId: null }, null, undefined)).toEqual({
      period: 'day', date: '2026-11-24',
    });
    expect(pendingQuery({ scope: { kind: 'week', at: null }, bidderId: null }, null, undefined)).toEqual({ period: 'week' });
    expect(pendingQuery({ scope: { kind: 'week', at: '2026-11-14' }, bidderId: 'b1' }, null, undefined)).toEqual({
      period: 'week', date: '2026-11-14', bidderId: 'b1',
    });
    expect(
      pendingQuery({ scope: { kind: 'range' }, bidderId: null }, { period: 'month', date: '2026-10-01' }, undefined),
    ).toEqual({ period: 'month', date: '2026-10-01' });
    expect(pendingQuery({ scope: { kind: 'range' }, bidderId: null }, null, undefined)).toBeNull();
  });
  it('leaves undefined keys out and carries weeks, to and the bidder for a range', () => {
    const q = pendingQuery({ scope: { kind: 'week', at: null }, bidderId: null }, null, undefined)!;
    expect(Object.keys(q)).toEqual(['period']);
    expect(
      pendingQuery({ scope: { kind: 'range' }, bidderId: 'b1' }, { period: 'week', date: '2026-11-22', weeks: 2 }, 'u1'),
    ).toEqual({ period: 'week', date: '2026-11-22', weeks: 2, ownerId: 'u1', bidderId: 'b1' });
    expect(
      pendingQuery(
        { scope: { kind: 'range' }, bidderId: null },
        { period: 'custom', date: '2026-11-01', to: '2026-11-09' },
        undefined,
      ),
    ).toEqual({ period: 'custom', date: '2026-11-01', to: '2026-11-09' });
  });
});
