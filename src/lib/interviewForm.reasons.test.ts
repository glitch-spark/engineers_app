import { describe, expect, it } from 'vitest';
import type { InterviewStageEntry } from '../api/endpoints';
import { asksReschedule, blankRound, missingFields, roundFromEntry, roundPayload } from './interviewForm';
import { CANCEL_REASONS, REJECT_REASONS, RESCHEDULE_REASONS, statusReasonPrompt, statusWhy } from './stageBadge';

const entry = (over: Partial<InterviewStageEntry> = {}): InterviewStageEntry => ({
  id: 'r1', stage: 'tech1', status: 'scheduled', scheduledAt: '2026-11-16T18:30:00Z', endsAt: '2026-11-16T19:30:00Z', ...over,
});

describe('status reasons', () => {
  it('has the agreed keys', () => {
    expect(CANCEL_REASONS.map((r) => r.value)).toEqual(['company', 'me', 'caller', 'job_mismatch', 'technical']);
    expect(REJECT_REASONS.map((r) => r.value)).toEqual([
      'no_reason', 'no_answer', 'location', 'language', 'technical_answers', 'experience', 'background', 'test', 'pay',
      'other_candidate', 'av', 'other',
    ]);
    expect(RESCHEDULE_REASONS.at(-1)?.label).toBe('Just fixing the time');
    expect(RESCHEDULE_REASONS).toHaveLength(6);
  });

  it('asks a reason for canceled and rejected only', () => {
    expect(statusReasonPrompt('canceled')?.question).toBe('Why was it canceled?');
    expect(statusReasonPrompt('rejected')?.question).toBe('Why was it rejected?');
    expect(statusReasonPrompt('passed')).toBeNull();
    expect(statusReasonPrompt('scheduled')).toBeNull();
  });

  it('shows the reason label, then the details', () => {
    expect(statusWhy('canceled', 'company', 'role filled')).toEqual({ label: 'Reason', text: 'Company — role filled' });
    expect(statusWhy('rejected', 'no_answer', '')).toEqual({ label: 'Reason', text: 'No answer from the company' });
    // Old rounds: a note alone, as before; nothing at all when both are missing.
    expect(statusWhy('rejected', null, 'too junior')).toEqual({ label: 'Feedback', text: 'too junior' });
    expect(statusWhy('canceled', undefined, undefined)).toBeNull();
    expect(statusWhy('canceled', 'not_a_key', '  ')).toBeNull();
  });
});

describe('round form: status reason', () => {
  it('an old canceled round with no reason loads with an empty reason', () => {
    expect(roundFromEntry(entry({ status: 'canceled' }), 'UTC').statusReason).toBe('');
    expect(roundFromEntry(entry({ status: 'canceled', statusReason: null }), 'UTC').statusReason).toBe('');
  });

  it('sends the picked reason with canceled / rejected', () => {
    const r = { ...roundFromEntry(entry({ status: 'canceled', statusReason: 'caller' }), 'UTC') };
    expect(roundPayload(r, 'UTC').statusReason).toBe('caller');
  });

  it('drops the reason when the status moves away from canceled', () => {
    const r = { ...roundFromEntry(entry({ status: 'canceled', statusReason: 'caller' }), 'UTC'), status: 'scheduled' as const };
    expect('statusReason' in roundPayload(r, 'UTC')).toBe(false);
    // A canceled key is not a rejected reason either.
    expect('statusReason' in roundPayload({ ...r, status: 'rejected' }, 'UTC')).toBe(false);
  });

  it('requires a reason for canceled / rejected, not for passed', () => {
    const base = { ...blankRound({ stage: 'intro' }, 'UTC') };
    expect(missingFields('editRound', null, { ...base, status: 'canceled' })).toEqual(['Reason it was canceled']);
    expect(missingFields('editRound', null, { ...base, status: 'rejected', statusReason: 'pay' })).toEqual([]);
    expect(missingFields('editRound', null, { ...base, status: 'passed' })).toEqual([]);
  });
});

describe('asksReschedule', () => {
  const form = (e: InterviewStageEntry) => roundFromEntry(e, 'UTC');

  it('asks for an existing scheduled round whose start changed', () => {
    const e = entry();
    expect(asksReschedule(e, form(e), 'UTC')).toBe(false);
    expect(asksReschedule(e, { ...form(e), time: '19:00' }, 'UTC')).toBe(true);
    expect(asksReschedule(e, { ...form(e), date: '2026-11-17' }, 'UTC')).toBe(true);
    // Only the length changed: the start is the same.
    expect(asksReschedule(e, { ...form(e), durationMin: 30 }, 'UTC')).toBe(false);
  });

  it('never asks for a new round, a round that is not scheduled, or one being canceled in the same save', () => {
    expect(asksReschedule(undefined, { ...blankRound({}, 'UTC'), time: '19:00' }, 'UTC')).toBe(false);
    const done = entry({ status: 'completed' });
    expect(asksReschedule(done, { ...form(done), time: '19:00' }, 'UTC')).toBe(false);
    const e = entry();
    expect(asksReschedule(e, { ...form(e), time: '19:00', status: 'canceled' }, 'UTC')).toBe(false);
  });
});
