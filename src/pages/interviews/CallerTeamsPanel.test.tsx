// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SWRConfig } from 'swr';
import CallerTeamsPanel from './CallerTeamsPanel';
import { notify } from '../../lib/notify';

const m = vi.hoisted(() => ({
  listCallers: vi.fn(), listCallerTeams: vi.fn(), createCallerTeam: vi.fn(), updateCallerTeam: vi.fn(), updateCaller: vi.fn(),
  getCallerTeamsConnection: vi.fn(), testCallerTeam: vi.fn(),
}));
vi.mock('../../api/endpoints', async () => ({
  ...(await vi.importActual<typeof import('../../api/endpoints')>('../../api/endpoints')),
  ...m,
}));
vi.mock('../../lib/notify', () => ({ notify: { success: vi.fn(), error: vi.fn() } }));

const base = { color: 'sky', archived: false, slackUserId: '', teamId: '', teamName: '', kind: 'external' };
const omar = { ...base, _id: 'c1', name: 'Omar', slackUserId: 'U1', teamId: 't1', teamName: "Jamil's group" };
const lee = { ...base, _id: 'c2', name: 'Lee', teamId: 't1', teamName: "Jamil's group" };
const sam = { ...base, _id: 'c3', name: 'Sam' };
const kim = { ...base, _id: 'c4', name: 'Kim', teamId: 't9', teamName: 'Other team' };
const team = { _id: 't1', name: "Jamil's group", managerCallerId: 'c1', channelId: 'C1', reminderChannelId: 'C2', dailyTime: '06:00', timezone: 'America/Chicago', memberIds: ['c1', 'c2'], archived: false };

const renderIt = () => render(
  <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}><CallerTeamsPanel /></SWRConfig>,
);
const panel = async () => within(await screen.findByRole('dialog'));

beforeEach(() => {
  m.listCallers.mockResolvedValue({ callers: [omar, lee, sam, kim], canManage: true });
  m.listCallerTeams.mockResolvedValue([team]);
  m.getCallerTeamsConnection.mockResolvedValue({ connected: true, workspace: 'Acme' });
  m.updateCaller.mockResolvedValue({});
  m.updateCallerTeam.mockResolvedValue(team);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('CallerTeamsPanel', () => {
  it('renders a card with manager, members and the missing Slack ID count', async () => {
    renderIt();
    const card = within(await screen.findByLabelText("Team Jamil's group"));
    expect(await card.findByText('1 missing Slack ID')).toBeTruthy();
    expect(card.getByText('2 callers · daily list 6:00 AM CT')).toBeTruthy();
    expect(card.getByText('Omar · manager')).toBeTruthy();
    expect(card.getByText('Lee ⚠')).toBeTruthy();
    expect(card.getAllByText('not tested')).toHaveLength(2);
    expect(card.getByText('C1')).toBeTruthy();
  });

  it('shows connection state', async () => {
    renderIt();
    expect(await screen.findByText('Connected to Acme')).toBeTruthy();
    cleanup();
    m.getCallerTeamsConnection.mockResolvedValue({ connected: false, workspace: null });
    renderIt();
    expect(await screen.findByText('Not connected — set SLACK_CALLERS_BOT_TOKEN')).toBeTruthy();
  });

  it('creates a team, then assigns the checked members', async () => {
    m.createCallerTeam.mockResolvedValue({ ...team, _id: 't2' });
    m.listCallerTeams.mockResolvedValue([team, { ...team, _id: 't9', name: 'Other team', memberIds: ['c4'] }]);
    renderIt();
    fireEvent.click(await screen.findByRole('button', { name: 'New team' }));
    await screen.findByText('Other team');
    const p = await panel();
    await waitFor(() => expect(p.getByRole('option', { name: 'Sam' })).toBeTruthy());
    fireEvent.change(p.getByLabelText('Team name'), { target: { value: 'Sam group' } });
    fireEvent.change(p.getByLabelText('Manager'), { target: { value: 'c3' } });
    fireEvent.change(p.getByLabelText('Team channel ID'), { target: { value: 'C111' } });
    fireEvent.change(p.getByLabelText('Reminder channel ID'), { target: { value: 'C222' } });
    expect(p.getByText('in Other team')).toBeTruthy();
    fireEvent.click(p.getByRole('checkbox', { name: /Sam/ }));
    fireEvent.click(p.getByRole('checkbox', { name: /Kim/ }));
    fireEvent.click(p.getByRole('button', { name: 'Create team' }));
    await waitFor(() => expect(m.updateCaller).toHaveBeenCalledTimes(2));
    expect(m.createCallerTeam).toHaveBeenCalledWith({ name: 'Sam group', managerCallerId: 'c3', channelId: 'C111', reminderChannelId: 'C222', dailyTime: '06:00', timezone: 'America/Chicago' });
    expect(m.updateCaller).toHaveBeenNthCalledWith(1, 'c3', { teamId: 't2' });
    expect(m.updateCaller).toHaveBeenNthCalledWith(2, 'c4', { teamId: 't2' });
    expect(m.createCallerTeam.mock.invocationCallOrder[0]).toBeLessThan(m.updateCaller.mock.invocationCallOrder[0]);
  });

  it('adds and removes members when editing a team', async () => {
    renderIt();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit team' }));
    const p = await panel();
    expect((p.getByRole('checkbox', { name: /Omar/ }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(p.getByRole('checkbox', { name: /Lee/ }));
    fireEvent.click(p.getByRole('checkbox', { name: /Sam/ }));
    fireEvent.click(p.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(m.updateCaller).toHaveBeenCalledTimes(2));
    expect(m.updateCallerTeam).toHaveBeenCalledWith('t1', expect.objectContaining({ name: "Jamil's group" }));
    expect(m.updateCaller).toHaveBeenCalledWith('c2', { teamId: '' });
    expect(m.updateCaller).toHaveBeenCalledWith('c3', { teamId: 't1' });
  });

  it('notifies on a partial failure and still revalidates', async () => {
    const onChanged = vi.fn();
    m.updateCaller.mockRejectedValue(new Error('boom'));
    render(<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}><CallerTeamsPanel onChanged={onChanged} /></SWRConfig>);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit team' }));
    const p = await panel();
    fireEvent.click(p.getByRole('checkbox', { name: /Sam/ }));
    fireEvent.click(p.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(notify.error).toHaveBeenCalled();
  });

  it('archives only after an in-panel confirmation', async () => {
    renderIt();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit team' }));
    const p = await panel();
    fireEvent.click(p.getByRole('button', { name: 'Archive team' }));
    expect(m.updateCallerTeam).not.toHaveBeenCalled();
    fireEvent.click(p.getByRole('button', { name: 'Confirm archive' }));
    await waitFor(() => expect(m.updateCallerTeam).toHaveBeenCalledWith('t1', { archived: true }));
  });

  it('shows each channel result of Send test post on the card', async () => {
    m.testCallerTeam.mockResolvedValue({ channel: { ok: true, error: null }, reminderChannel: { ok: false, error: 'channel_not_found' } });
    renderIt();
    fireEvent.click(await screen.findByRole('button', { name: 'Send test post' }));
    expect(await screen.findByText('✓ works')).toBeTruthy();
    expect(screen.getByText('✕ channel_not_found')).toBeTruthy();
    expect(screen.getByText(/^Tested /)).toBeTruthy();
  });

  it('asks before discarding edits, and not when nothing changed', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderIt();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit team' }));
    let p = await panel();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(confirm).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    fireEvent.click(await screen.findByRole('button', { name: 'Edit team' }));
    p = await panel();
    fireEvent.click(p.getByRole('checkbox', { name: /Sam/ }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeNull();
    confirm.mockRestore();
  });

  it('ignores Escape while saving', async () => {
    m.updateCallerTeam.mockReturnValue(new Promise(() => {}));
    renderIt();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit team' }));
    const p = await panel();
    fireEvent.click(p.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(m.updateCallerTeam).toHaveBeenCalled());
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeNull();
  });

  it('does not label a caller on an archived team as being in it', async () => {
    m.listCallerTeams.mockResolvedValue([team, { ...team, _id: 't9', name: 'Other team', archived: true }]);
    renderIt();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit team' }));
    const p = await panel();
    expect(p.queryByText('in Other team')).toBeNull();
    expect(p.getAllByText('no Slack ID')).toHaveLength(3);
  });
});
