// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import RoundCallerPicker from './RoundCallerPicker';
import type { Interview } from './types';

const callers = vi.hoisted(() => ({ canManage: true }));
const assign = vi.hoisted(() => vi.fn());

vi.mock('../../auth/useAuth', () => ({ useAuth: () => ({ user: { id: 'me', role: 'admin' } }) }));
vi.mock('../../api/endpoints', () => ({ assignRoundCaller: assign }));
vi.mock('../../lib/notify', () => ({ notify: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../../lib/useCallers', async () => {
  const actual = await vi.importActual<typeof import('../../lib/useCallers')>('../../lib/useCallers');
  const ana = { _id: 'ana1', kind: 'user', name: 'Ana', color: 'sky', archived: false };
  const bo = { _id: 'bo1', kind: 'external', name: 'Bo', color: 'rose', archived: false };
  return {
    ...actual,
    useCallers: () => ({
      callers: [ana, bo], people: [ana], external: [bo],
      byId: new Map([[ana._id, ana], [bo._id, bo]]),
      canManage: callers.canManage, isLoading: false, mutate: vi.fn(),
    }),
  };
});

function iv(caller: Record<string, unknown>): Interview {
  return {
    _id: 'iv1', accountId: 'a1', createdBy: 'owner', scheduledAt: '2030-01-01T10:00:00Z',
    companyName: 'Acme',
    stageHistory: [{ id: 'r1', stage: 'tech1', status: 'scheduled', scheduledAt: '2030-01-01T10:00:00Z', caller: { enabled: true, ...caller } }],
  } as unknown as Interview;
}

beforeEach(() => { callers.canManage = true; assign.mockReset(); });
afterEach(cleanup);

describe('RoundCallerPicker', () => {
  it('manager changes the caller and it saves at once', async () => {
    const saved = iv({ callerId: 'ana1', callerName: 'Ana' });
    assign.mockResolvedValue(saved);
    const onSaved = vi.fn();
    render(<RoundCallerPicker interview={iv({ callerId: 'bo1', callerName: 'Bo' })} roundId="r1" onSaved={onSaved} />);
    expect(screen.getByText('Bo')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Change caller' }));
    fireEvent.change(screen.getByLabelText('Caller for Tech round 1'), { target: { value: 'ana1' } });
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved));
    expect(assign).toHaveBeenCalledWith('iv1', 'r1', 'ana1');
    expect(screen.queryByLabelText('Caller for Tech round 1')).toBeNull();
  });

  it('unassigned round says Assign caller', () => {
    render(<RoundCallerPicker interview={iv({ callerId: null, callerName: 'TBD' })} roundId="r1" onSaved={vi.fn()} />);
    expect(screen.getByText('No caller yet')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Assign caller' })).toBeTruthy();
  });

  it('non-manager sees the name only', () => {
    callers.canManage = false;
    render(<RoundCallerPicker interview={iv({ callerId: 'bo1', callerName: 'Bo' })} roundId="r1" onSaved={vi.fn()} />);
    expect(screen.getByText('Bo')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('Cancel closes the picker without saving', () => {
    const onSaved = vi.fn();
    render(<RoundCallerPicker interview={iv({ callerId: 'bo1', callerName: 'Bo' })} roundId="r1" onSaved={onSaved} />);
    fireEvent.click(screen.getByRole('button', { name: 'Change caller' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByLabelText('Caller for Tech round 1')).toBeNull();
    expect(screen.getByRole('button', { name: 'Change caller' })).toBeTruthy();
    expect(assign).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });
});
