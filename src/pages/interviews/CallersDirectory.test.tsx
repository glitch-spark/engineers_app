// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

  it('flags a team member without a Slack ID', async () => {
    renderIt();
    expect(await screen.findByText(/No Slack ID: shown by name, not tagged/)).toBeTruthy();
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

  it('hides team and Slack ID controls without canManage', async () => {
    m.listCallers.mockResolvedValue({ callers: [ana, omar, lee], canManage: false });
    renderIt();
    await screen.findByRole('link', { name: 'Omar' });
    expect(screen.queryByText('Slack ID')).toBeNull();
    expect(screen.queryByText('Teams')).toBeNull();
    expect(m.listCallerTeams).not.toHaveBeenCalled();
  });
});

describe('caller picker', () => {
  it('tags team members in the caller picker', () => {
    const opts = callerPickerOptions({ people: [], external: [omar as never, { ...lee, name: 'Omar' } as never] });
    expect(opts.map((o) => o.label)).toContain("Omar · Jamil's group");
  });
});
