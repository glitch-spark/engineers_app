// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import RoundFields from './RoundFields';
import { roundFromEntry, type RoundFormState } from '../../lib/interviewForm';

vi.mock('./CallerFields', () => ({ default: () => null }));

afterEach(cleanup);

const round = (over: Record<string, unknown> = {}, patch: Partial<RoundFormState> = {}): RoundFormState => ({
  ...roundFromEntry({ id: 'r1', stage: 'tech1', status: 'scheduled', scheduledAt: '2026-11-16T18:30:00Z', ...over }, 'UTC'),
  ...patch,
});

function show(r: RoundFormState, props: { reschedule?: boolean } = {}) {
  const onChange = vi.fn();
  render(<RoundFields round={r} onChange={onChange} idPrefix="t" tz="UTC" {...props} />);
  return onChange;
}

describe('RoundFields reasons', () => {
  it('an old canceled round with no reason shows an empty reason select', () => {
    show(round({ status: 'canceled', statusNote: 'role filled' }));
    expect((screen.getByLabelText(/Why was it canceled\?/) as HTMLSelectElement).value).toBe('');
    expect((screen.getByLabelText('Details (optional)') as HTMLTextAreaElement).value).toBe('role filled');
  });

  it('shows the saved reason with its helper text, and reports a new pick', () => {
    const onChange = show(round({ status: 'canceled', statusReason: 'me' }));
    expect((screen.getByLabelText(/Why was it canceled\?/) as HTMLSelectElement).value).toBe('me');
    expect(screen.getByText("I didn't confirm the time clearly with the company or the caller.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Why was it canceled\?/), { target: { value: 'technical' } });
    expect(onChange).toHaveBeenCalledWith({ statusReason: 'technical' });
  });

  it('a rejected round offers the rejected reasons; passed and scheduled offer none', () => {
    show(round({ status: 'rejected' }));
    const select = screen.getByLabelText(/Why was it rejected\?/) as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toContain('other_candidate');
    cleanup();
    show(round({ status: 'passed' }));
    expect(screen.queryByLabelText(/Why was it/)).toBeNull();
    expect(screen.getByLabelText("Caller's feedback")).toBeTruthy();
  });

  it('changing the status clears the reason', () => {
    const onChange = show(round({ status: 'canceled', statusReason: 'me' }));
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'scheduled' } });
    expect(onChange).toHaveBeenCalledWith({ status: 'scheduled', statusReason: '' });
  });

  it('asks why it was rescheduled only when told to', () => {
    show(round());
    expect(screen.queryByLabelText(/Why was it rescheduled\?/)).toBeNull();
    cleanup();
    const onChange = show(round(), { reschedule: true });
    const select = screen.getByLabelText(/Why was it rescheduled\?/) as HTMLSelectElement;
    expect([...select.options].map((o) => o.text).filter((t) => t !== 'Pick a reason')).toEqual([
      'Company', 'Me', 'Caller', "Job doesn't match", 'Technical issue', 'Just fixing the time',
    ]);
    fireEvent.change(select, { target: { value: 'caller' } });
    expect(onChange).toHaveBeenCalledWith({ rescheduleReason: 'caller' });
  });
});
