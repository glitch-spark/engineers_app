// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import InterviewForm from './InterviewForm';
import type { Interview } from './types';

const update = vi.fn();
const add = vi.fn();
vi.mock('../../api/endpoints', async (orig) => ({
  ...(await orig<object>()),
  updateInterviewStage: (...a: unknown[]) => update(...a),
  addInterviewStage: (...a: unknown[]) => add(...a),
}));
vi.mock('../../auth/useAuth', () => ({ useAuth: () => ({ user: { id: 'me', role: 'staff' } }) }));
vi.mock('../../lib/useInterviewTimezone', () => ({ useInterviewTimezone: () => ({ tz: 'UTC' }) }));
vi.mock('../../lib/notify', () => ({ notify: { success: vi.fn(), error: vi.fn() }, messageOf: () => '' }));
vi.mock('./ApplicationFields', () => ({ default: () => null }));
vi.mock('./CallerFields', () => ({ default: () => null }));

const iv = (status = 'scheduled', extra: Record<string, unknown> = {}) => ({
  _id: 'iv1', accountId: 'a1', createdBy: 'me', companyName: 'Acme', jobUrl: 'https://x.test/1', scheduledAt: '2026-11-16T18:30:00Z',
  stageHistory: [{
    id: 'r1', stage: 'tech1', status, scheduledAt: '2026-11-16T18:30:00Z', endsAt: '2026-11-16T19:30:00Z', ...extra,
  }],
}) as unknown as Interview;

const edit = (interview: Interview) =>
  render(<InterviewForm mode="editRound" interview={interview} roundId="r1" onSaved={vi.fn()} onCancel={vi.fn()} />);
const saveButton = () => screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement;
const body = () => update.mock.calls[0][2] as Record<string, unknown>;
const WHY = /Why was it rescheduled\?/;

beforeEach(() => { update.mockReset(); update.mockResolvedValue({ _id: 'iv1' }); add.mockReset(); add.mockResolvedValue({ _id: 'iv1' }); });
afterEach(cleanup);

describe('InterviewForm: why a round was rescheduled', () => {
  it('does not ask when the time is unchanged', async () => {
    edit(iv());
    fireEvent.change(screen.getByLabelText('Interviewer'), { target: { value: 'Sam' } });
    expect(screen.queryByLabelText(WHY)).toBeNull();
    fireEvent.click(saveButton());
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect('rescheduleReason' in body()).toBe(false);
    expect('rescheduleNote' in body()).toBe(false);
  });

  it('asks when the time of a scheduled round changes, and sends the reason and details', async () => {
    edit(iv());
    fireEvent.change(screen.getByLabelText(/^Start/), { target: { value: '20:00' } });
    expect(saveButton().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(WHY), { target: { value: 'company' } });
    fireEvent.change(screen.getByLabelText('Details (optional)'), { target: { value: ' recruiter moved it ' } });
    fireEvent.click(saveButton());
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(body()).toMatchObject({
      scheduledAt: '2026-11-16T20:00:00.000Z', status: 'scheduled', rescheduleReason: 'company', rescheduleNote: 'recruiter moved it',
    });
  });

  it('"Just fixing the time" saves the new time with no rescheduleReason', async () => {
    edit(iv());
    fireEvent.change(screen.getByLabelText(/^Date/), { target: { value: '2026-11-18' } });
    fireEvent.change(screen.getByLabelText(WHY), { target: { value: 'fix' } });
    expect(screen.queryByLabelText('Details (optional)')).toBeNull();
    fireEvent.click(saveButton());
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(body().scheduledAt).toBe('2026-11-18T18:30:00.000Z');
    expect('rescheduleReason' in body()).toBe(false);
    expect('rescheduleNote' in body()).toBe(false);
  });

  it('stops asking when the time is put back', () => {
    edit(iv());
    fireEvent.change(screen.getByLabelText(/^Start/), { target: { value: '20:00' } });
    expect(screen.getByLabelText(WHY)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/^Start/), { target: { value: '18:30' } });
    expect(screen.queryByLabelText(WHY)).toBeNull();
    expect(saveButton().disabled).toBe(false);
  });

  it('does not ask for a round that is not scheduled', async () => {
    edit(iv('completed'));
    fireEvent.change(screen.getByLabelText(/^Start/), { target: { value: '20:00' } });
    expect(screen.queryByLabelText(WHY)).toBeNull();
    fireEvent.click(saveButton());
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect('rescheduleReason' in body()).toBe(false);
  });

  it('does not ask for a new round', async () => {
    render(<InterviewForm mode="addRound" interview={iv('passed')} onSaved={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/^Start/), { target: { value: '20:00' } });
    expect(screen.queryByLabelText(WHY)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Add round' }));
    await waitFor(() => expect(add).toHaveBeenCalledTimes(1));
    expect('rescheduleReason' in (add.mock.calls[0][1] as object)).toBe(false);
  });

  it('an old canceled round opens with an empty reason and saves once one is picked', async () => {
    edit(iv('canceled', { statusNote: 'role filled' }));
    expect((screen.getByLabelText(/Why was it canceled\?/) as HTMLSelectElement).value).toBe('');
    expect(saveButton().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Why was it canceled\?/), { target: { value: 'company' } });
    fireEvent.click(saveButton());
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(body()).toMatchObject({ status: 'canceled', statusReason: 'company', statusNote: 'role filled' });
  });

  it('moving the status away from canceled drops the reason from what is sent', async () => {
    edit(iv('canceled', { statusReason: 'company', statusNote: 'role filled' }));
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'completed' } });
    fireEvent.click(saveButton());
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(body().status).toBe('completed');
    expect('statusReason' in body()).toBe(false);
  });
});
