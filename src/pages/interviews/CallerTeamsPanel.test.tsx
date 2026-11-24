// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SWRConfig } from 'swr';
import CallerTeamsPanel from './CallerTeamsPanel';

const m = vi.hoisted(() => ({
  listCallers: vi.fn(), listCallerTeams: vi.fn(), createCallerTeam: vi.fn(),
  getCallerTeamsConnection: vi.fn(), testCallerTeam: vi.fn(),
}));
vi.mock('../../api/endpoints', async () => ({
  ...(await vi.importActual<typeof import('../../api/endpoints')>('../../api/endpoints')),
  ...m,
}));
vi.mock('../../lib/notify', () => ({ notify: { success: vi.fn(), error: vi.fn() } }));

const base = { color: 'sky', archived: false, slackUserId: '', teamId: '', teamName: '', kind: 'external' };
const team = { _id: 't1', name: "Jamil's group", managerCallerId: 'c1', channelId: 'C1', reminderChannelId: 'C2', dailyTime: '06:00', timezone: 'America/Chicago', memberIds: ['c2'], archived: false };

const renderIt = () => render(
  <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}><CallerTeamsPanel /></SWRConfig>,
);

beforeEach(() => {
  m.listCallers.mockResolvedValue({ callers: [{ ...base, _id: 'c1', name: 'Omar' }, { ...base, _id: 'c2', name: 'Lee' }], canManage: true });
  m.listCallerTeams.mockResolvedValue([team]);
  m.getCallerTeamsConnection.mockResolvedValue({ connected: true, workspace: 'Acme' });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('CallerTeamsPanel', () => {
  it('creates a team with manager and channels', async () => {
    m.createCallerTeam.mockResolvedValue({ ...team, _id: 't2' });
    renderIt();
    const card = within(await screen.findByLabelText('New team'));
    await waitFor(() => expect(card.getByRole('option', { name: 'Omar' })).toBeTruthy());
    fireEvent.change(card.getByLabelText('Team name'), { target: { value: 'Sam group' } });
    fireEvent.change(card.getByLabelText('Manager'), { target: { value: 'c1' } });
    fireEvent.change(card.getByLabelText('Team channel ID'), { target: { value: 'C111' } });
    fireEvent.change(card.getByLabelText('Reminder channel ID'), { target: { value: 'C222' } });
    fireEvent.click(card.getByRole('button', { name: 'Create team' }));
    await waitFor(() => expect(m.createCallerTeam).toHaveBeenCalledWith({
      name: 'Sam group', managerCallerId: 'c1', channelId: 'C111', reminderChannelId: 'C222', dailyTime: '06:00',
    }));
  });

  it('shows connection state', async () => {
    renderIt();
    expect(await screen.findByText('Connected: Acme ✓')).toBeTruthy();
    cleanup();
    m.getCallerTeamsConnection.mockResolvedValue({ connected: false, workspace: null });
    renderIt();
    expect(await screen.findByText('Not connected — set SLACK_CALLERS_BOT_TOKEN')).toBeTruthy();
  });

  it('shows each channel result of Send test post', async () => {
    m.testCallerTeam.mockResolvedValue({ channel: { ok: true, error: null }, reminderChannel: { ok: false, error: 'channel_not_found' } });
    renderIt();
    fireEvent.click(await screen.findByRole('button', { name: 'Send test post' }));
    expect(await screen.findByText('Team channel: Posted ✓')).toBeTruthy();
    expect(screen.getByText('Reminder channel: Failed: channel_not_found')).toBeTruthy();
  });
});
