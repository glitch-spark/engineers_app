// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import InterviewForm from './InterviewForm';

const createInterview = vi.fn();
vi.mock('../../api/endpoints', async (orig) => ({ ...(await orig<object>()), createInterview: (...a: unknown[]) => createInterview(...a) }));
vi.mock('../../auth/useAuth', () => ({ useAuth: () => ({ user: { id: 'me', role: 'staff' } }) }));
vi.mock('../../lib/useInterviewTimezone', () => ({ useInterviewTimezone: () => ({ tz: 'UTC' }) }));
vi.mock('../../lib/notify', () => ({ notify: { success: vi.fn(), error: vi.fn() }, messageOf: () => '' }));
// The form's fields are not under test: a job link box stands in for ApplicationFields, nothing for the round.
vi.mock('./ApplicationFields', () => ({
  default: ({ app, onChange }: { app: { jobUrl: string }; onChange: (p: object) => void }) => (
    <input aria-label="Job link" value={app.jobUrl} onChange={(e) => onChange({ jobUrl: e.target.value })} />
  ),
}));
vi.mock('./RoundFields', () => ({ default: () => null }));
vi.mock('../../lib/interviewForm', async (orig) => ({ ...(await orig<object>()), missingFields: () => [] }));

const NOTE = /No job link or resume — this interview can't be counted/;
const show = () => render(<InterviewForm mode="new" onSaved={vi.fn()} onCancel={vi.fn()} />);
const save = () => fireEvent.submit(document.querySelector('form')!);

beforeEach(() => { createInterview.mockReset(); createInterview.mockResolvedValue({ _id: 'iv' }); });
afterEach(cleanup);

describe('InterviewForm job link prompt', () => {
  it('asks once when there is no job link or resume, then saves on the second Save', async () => {
    show();
    save();
    expect(screen.getByText(NOTE)).toBeTruthy();
    expect(createInterview).not.toHaveBeenCalled();
    save();
    await waitFor(() => expect(createInterview).toHaveBeenCalledTimes(1));
  });

  it('saves straight away with a job link', async () => {
    show();
    fireEvent.change(screen.getByLabelText('Job link'), { target: { value: 'https://jobs.lever.co/acme/1' } });
    save();
    await waitFor(() => expect(createInterview).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(NOTE)).toBeNull();
  });
});
