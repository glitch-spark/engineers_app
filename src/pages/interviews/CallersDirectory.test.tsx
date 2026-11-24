// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SWRConfig } from 'swr';
import CallersDirectory from './CallersDirectory';
import { callerPickerOptions } from '../../lib/useCallers';

const m = vi.hoisted(() => ({
  listCallers: vi.fn(), getCallerOverview: vi.fn(), updateCaller: vi.fn(),
  listCallerTeams: vi.fn(), getCallerTeamsConnection: vi.fn(),
}));
vi.mock('../../api/endpoints', async () => ({
  ...(await vi.importActual<typeof import('../../api/endpoints')>('../../api/endpoints')),
  ...m,
}));
vi.mock('../../lib/notify', () => ({ notify: { success: vi.fn(), error: vi.fn() } }));

const base = { color: 'sky', archived: false, slackUserId: '', teamId: '', teamName: '' };
const ana = { ...base, _id: 'u1', kind: 'user', name: 'Ana Platform' };
const omar = { ...base, _id: 'c1', kind: 'external', name: 'Omar' };
const lee = { ...base, _id: 'c2', kind: 'external', name: 'Lee', teamId: 't1', teamName: "Jamil's group" };
const team = { _id: 't1', name: "Jamil's group", managerCallerId: 'c1', channelId: 'C1', reminderChannelId: 'C2', dailyTime: '06:00', timezone: 'America/Chicago', memberIds: ['c2'], archived: false };

const renderIt = () => render(
  <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
    <MemoryRouter><CallersDirectory /></MemoryRouter>
  </SWRConfig>,
);

beforeEach(() => {
  m.listCallers.mockResolvedValue({ callers: [ana, omar, lee], canManage: true });
  m.getCallerOverview.mockResolvedValue({});
  m.listCallerTeams.mockResolvedValue([team]);
  m.getCallerTeamsConnection.mockResolvedValue({ connected: true, workspace: 'Acme' });
  m.updateCaller.mockResolvedValue(omar);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('CallersDirectory', () => {
  it('does not list platform users (People in the app)', async () => {
    renderIt();
    await screen.findByRole('link', { name: 'Omar' });
    expect(screen.queryByText('Ana Platform')).toBeNull();
    expect(screen.queryByText('People in the app')).toBeNull();
  });

  it('groups rows by team with Individual callers last, and marks the manager', async () => {
    renderIt();
    await screen.findByRole('link', { name: 'Omar' });
    const heads = screen.getAllByRole('columnheader', { name: /·/ }).map((h) => h.textContent);
    expect(heads).toEqual(["Jamil's group · 1", 'Individual callers · 1']);
    const lee = screen.getByRole('link', { name: 'Lee' }).closest('tr')!;
    expect(lee.compareDocumentPosition(screen.getByRole('link', { name: 'Omar' }).closest('tr')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    cleanup();
    m.listCallers.mockResolvedValue({ callers: [omar, { ...lee, teamId: 't1' }, { ...omar, _id: 'c3', name: 'Mo', teamId: 't1', teamName: "Jamil's group" }], canManage: true });
    m.listCallerTeams.mockResolvedValue([{ ...team, managerCallerId: 'c3', memberIds: ['c2', 'c3'] }]);
    renderIt();
    await waitFor(() => expect(within(screen.getByRole('link', { name: 'Mo' }).closest('tr')!).getByText('Manager')).toBeTruthy());
  });

  it('shows Slack chip states: linked, add for team member, dash for individual', async () => {
    m.listCallers.mockResolvedValue({
      callers: [omar, lee, { ...omar, _id: 'c4', name: 'Zed', slackUserId: 'U9' }, { ...lee, _id: 'c5', name: 'Kim', slackUserId: 'U8' }],
      canManage: true,
    });
    renderIt();
    await screen.findAllByRole('button', { name: /\+ Team|group/ });
    await screen.findAllByRole('columnheader', { name: /·/ });
    const row = async (n: string) => (await screen.findByRole('link', { name: n })).closest('tr')!;
    expect(within(await row('Lee')).getByRole('button', { name: '⚠ Add Slack ID' })).toBeTruthy();
    expect(within(await row('Omar')).queryByRole('button', { name: /Slack|Linked/ })).toBeNull();
    expect(within(await row('Zed')).getByRole('button', { name: '✓ Linked' }).getAttribute('title')).toBe('U9');
    expect(within(await row('Kim')).getByRole('button', { name: '✓ Linked' })).toBeTruthy();
    expect(within(await row('Omar')).getByRole('button', { name: /\+ Team/ })).toBeTruthy();
  });

  it('opens the caller panel with Slack focused from the Add Slack ID chip', async () => {
    renderIt();
    fireEvent.click(await screen.findByRole('button', { name: '⚠ Add Slack ID' }));
    const input = await screen.findByLabelText('Slack member ID');
    await waitFor(() => expect(document.activeElement).toBe(input));
  });

  it('opens the caller panel with Team focused from a Team chip', async () => {
    renderIt();
    const chip = await within((await screen.findByRole('link', { name: 'Omar' })).closest('tr')!).getByRole('button', { name: '+ Team' });
    fireEvent.click(chip);
    const sel = await screen.findByLabelText('Team');
    await waitFor(() => expect(document.activeElement).toBe(sel));
  });

  it('saves a caller Slack ID and team', async () => {
    renderIt();
    await screen.findByRole('link', { name: 'Omar' });
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Omar' }));
    fireEvent.click(await screen.findByText('Edit'));
    fireEvent.change(screen.getByLabelText('Slack member ID'), { target: { value: 'U07Q3KD2M9A' } });
    const sel = screen.getByLabelText('Team') as HTMLSelectElement;
    await waitFor(() => expect(sel.querySelector('option[value="t1"]')).toBeTruthy());
    fireEvent.change(sel, { target: { value: 't1' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Save' }).find((b) => b.getAttribute('form') === 'caller-edit-form')!);
    await waitFor(() => expect(m.updateCaller).toHaveBeenCalledWith('c1', expect.objectContaining({ slackUserId: 'U07Q3KD2M9A', teamId: 't1' })));
  });

  it('does not resend an unchanged (possibly archived) team when saving other fields', async () => {
    m.listCallers.mockResolvedValue({ callers: [lee], canManage: true });
    m.listCallerTeams.mockResolvedValue([{ ...team, archived: true }]);
    renderIt();
    await screen.findByRole('link', { name: 'Lee' });
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Lee' }));
    fireEvent.click(await screen.findByText('Edit'));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Lee B' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Save' }).find((b) => b.getAttribute('form') === 'caller-edit-form')!);
    await waitFor(() => expect(m.updateCaller).toHaveBeenCalled());
    const body = m.updateCaller.mock.calls[0][1];
    expect(body).not.toHaveProperty('teamId');
    expect(body).not.toHaveProperty('slackUserId');
  });

  it('refetches teams after a caller is saved so member chips update', async () => {
    renderIt();
    await screen.findByRole('link', { name: 'Omar' });
    const before = m.listCallerTeams.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Omar' }));
    fireEvent.click(await screen.findByText('Edit'));
    fireEvent.change(screen.getByLabelText('Slack member ID'), { target: { value: 'U07Q3KD2M9A' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Save' }).find((b) => b.getAttribute('form') === 'caller-edit-form')!);
    await waitFor(() => expect(m.listCallerTeams.mock.calls.length).toBeGreaterThan(before));
  });

  it('hides team UI and requests without canManage', async () => {
    m.listCallers.mockResolvedValue({ callers: [ana, omar, lee], canManage: false });
    renderIt();
    await screen.findByRole('link', { name: 'Omar' });
    expect(screen.queryByText('Slack')).toBeNull();
    expect(screen.queryByText('Caller teams')).toBeNull();
    expect(screen.queryByRole('button', { name: /\+ Team/ })).toBeNull();
    expect(screen.queryByText(/Individual callers/)).toBeNull();
    expect(m.listCallerTeams).not.toHaveBeenCalled();
    expect(m.getCallerTeamsConnection).not.toHaveBeenCalled();
  });
});

describe('caller picker', () => {
  it('tags team members in the caller picker', () => {
    const opts = callerPickerOptions({ people: [], external: [omar as never, { ...lee, name: 'Omar' } as never] });
    expect(opts.map((o) => o.label)).toContain("Omar · Jamil's group");
  });
});
