import { describe, expect, it } from 'vitest';
import { ARCHIVE_CONFIRM, BID_TRACK_STEPS, GLOSSARY, OVERLAP_NOTE, formatInviteDate, rateText, statusWords } from './bidsWords';

const now = Date.parse('2026-11-20T12:00:00Z');

describe('bidsWords', () => {
  it('writes a rate one way', () => {
    expect(rateText(0.06)).toBe('$0.06 per approved bid');
    expect(rateText(1.5)).toBe('$1.50 per approved bid');
  });

  it('writes a status one way', () => {
    expect(statusWords('active', { username: 'ana', inviteExpiresAt: null }, now).text).toBe('Active · @ana');
    expect(statusWords('active', { username: null, inviteExpiresAt: null }, now).text).toBe('Active');
    expect(statusWords('archived', undefined, now)).toEqual({ text: 'Archived', expired: false });
    expect(statusWords('invited', undefined, now).text).toBe('Invited');
    expect(statusWords('invited', { username: null, inviteExpiresAt: null }, now).text).toBe('Invited · no code yet');
  });

  it('marks an invite whose code has expired', () => {
    const past = statusWords('invited', { username: null, inviteExpiresAt: '2026-11-18T12:00:00Z' }, now);
    expect(past.expired).toBe(true);
    expect(past.text).toBe(`Invited · expires ${formatInviteDate('2026-11-18T12:00:00Z')}`);
    const future = statusWords('invited', { username: null, inviteExpiresAt: '2026-11-25T12:00:00Z' }, now);
    expect(future.expired).toBe(false);
  });

  it('has the glossary words in order', () => {
    expect(GLOSSARY.map((g) => g.word)).toEqual(['Approved', 'Pending', 'Bids', 'Pay', 'Pay week', 'My bids']);
  });

  it('never names the switch date and says both schedules', () => {
    const text = GLOSSARY.map((g) => g.means).join(' ') + OVERLAP_NOTE;
    expect(text).not.toMatch(/Nov(ember)? 22|2026-11-22/);
    expect(GLOSSARY.find((g) => g.word === 'Pay week')!.means).toMatch(/Sunday 8 pm.*Saturday 4 pm/);
    expect(OVERLAP_NOTE).toContain('Sunday 6–8 pm');
  });

  it('keeps the Bid Track install steps', () => {
    expect(BID_TRACK_STEPS).toContain('chrome://extensions');
  });

  it('has one archive confirmation', () => {
    expect(ARCHIVE_CONFIRM.title).toBe('Archive bidder?');
    expect(ARCHIVE_CONFIRM.confirmLabel).toBe('Archive');
    expect(ARCHIVE_CONFIRM.body('Lee')).toBe(
      "Archive Lee? They're signed out of Bid Track and leave the reports. History is kept, and you can restore them any time.",
    );
  });
});
