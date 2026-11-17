// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import RescheduleDialog from './RescheduleDialog';
import type { Interview } from './types';

const update = vi.hoisted(() => vi.fn());
const notify = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock('../../api/endpoints', () => ({ updateInterviewStage: update }));
vi.mock('../../lib/notify', () => ({ notify }));

const iv = {
  _id: 'iv1', accountId: 'a1', createdBy: 'owner', companyName: 'Acme',
  stageHistory: [{ id: 'r1', stage: 'tech1', status: 'scheduled', scheduledAt: '2026-11-16T18:30:00Z' }],
} as unknown as Interview;

beforeEach(() => { update.mockReset(); notify.success.mockReset(); notify.error.mockReset(); });
afterEach(cleanup);

function open(tz: string, onSaved = vi.fn(), onClose = vi.fn()) {
  render(<RescheduleDialog open interview={iv} roundId="r1" tz={tz} onClose={onClose} onSaved={onSaved} />);
  return { onSaved, onClose };
}

describe('RescheduleDialog', () => {
  it("opens on the round's current time", () => {
    open('America/New_York');
    expect((screen.getByLabelText('Date') as HTMLInputElement).value).toBe('2026-11-16');
    expect((screen.getByLabelText('Time') as HTMLInputElement).value).toBe('13:30');
  });

  it('sends the new time in the given zone, and only that field', async () => {
    const saved = { ...iv, _id: 'iv1' };
    update.mockResolvedValue(saved);
    const { onSaved } = open('America/Chicago');
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-11-20' } });
    fireEvent.change(screen.getByLabelText('Time'), { target: { value: '14:30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved));
    expect(update).toHaveBeenCalledWith('iv1', 'r1', { scheduledAt: '2026-11-20T20:30:00.000Z' });
    expect(notify.success).toHaveBeenCalledWith('Time updated');
  });

  it('reports a failure and stays open', async () => {
    const err = new Error('nope');
    update.mockRejectedValue(err);
    const { onSaved, onClose } = open('America/Chicago');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(notify.error).toHaveBeenCalledWith(err, 'Failed to change the time'));
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
