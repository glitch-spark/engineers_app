// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../api/endpoints';
import DashboardPage from './Dashboard';

let role = 'staff';
vi.mock('../auth/useAuth', () => ({ useAuth: () => ({ user: { id: 'boss', role } }) }));
vi.mock('../api/endpoints', () => ({ getTeamToday: vi.fn(), lookupUsers: vi.fn() }));
vi.mock('../components/home/TodayCard', () => ({ default: () => <div>today-stub</div> }));
vi.mock('../components/home/WeekCard', () => ({ default: () => <div>week-stub</div> }));
vi.mock('../components/home/MetricsCard', () => ({ default: () => <div>metrics-stub</div> }));
vi.mock('../components/dashboard/TeamOverview', () => ({ default: () => <div>team-stub</div> })); // not rendered now; kept so a return is caught
vi.mock('../components/home/PersonPage', () => ({
  default: (p: { userId: string; name: string; day: string; today: string }) => <div data-testid="person">{`${p.userId}|${p.name}|${p.day}|${p.today}`}</div>,
}));

const users = [
  { _id: 'u1', name: 'Yuari', email: null, role: 'staff', isActive: true },
  { _id: 'u2', name: 'Puma', email: null, role: 'staff', isActive: true },
  { _id: 'u9', name: 'Gone', email: null, role: 'staff', isActive: false },
];
const people = [
  { userId: 'u1', name: 'Yuari', bids: { done: 183, target: 270 }, todos: { done: 1, total: 4 }, pending: 28, state: 'red' },
  { userId: 'u2', name: 'Puma', bids: { done: 186, target: 200 }, todos: { done: 1, total: 3 }, pending: 10, state: 'amber' },
];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-20T12:00:00-06:00')); // a Friday
  localStorage.clear();
  role = 'admin';
  vi.mocked(api.getTeamToday).mockResolvedValue({ day: '2026-11-20', people } as never);
  vi.mocked(api.lookupUsers).mockResolvedValue({ users } as never);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.useRealTimers(); vi.restoreAllMocks(); });

function Where() {
  const { search } = useLocation();
  return <p data-testid="where">{search}</p>;
}
const renderIt = (url = '/dashboard') => render(
  <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
    <MemoryRouter initialEntries={[url]}><DashboardPage /><Where /></MemoryRouter>
  </SWRConfig>,
);
const person = () => screen.findByTestId('person');
const list = () => within(screen.getByRole('navigation', { name: 'People' })).getAllByRole('button');

describe('Home', () => {
  it('staff see Today, This week and This month only: no team', () => {
    role = 'staff';
    renderIt();
    expect(screen.getByText('today-stub')).toBeTruthy();
    expect(screen.getByText('week-stub')).toBeTruthy();
    expect(screen.getByText('metrics-stub')).toBeTruthy();
    expect(screen.queryByText('team-stub')).toBeNull();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(api.getTeamToday).not.toHaveBeenCalled();
    expect(api.lookupUsers).not.toHaveBeenCalled();
  });

  it('an admin always gets the team: the names at once, nobody picked, no Me / Team switch, no cards of their own', async () => {
    vi.mocked(api.getTeamToday).mockReturnValue(new Promise(() => {}) as never); // the slow summary never arrives
    renderIt();
    await waitFor(() => expect(list().map((b) => b.textContent)).toEqual(['Puma', 'Yuari'])); // A–Z, the inactive one left out
    expect(list().map((b) => b.getAttribute('aria-current'))).toEqual([null, null]);
    expect(screen.getByText('Pick a person to see their bids, interviews, to-dos, goals and pending items.')).toBeTruthy();
    expect(screen.queryByTestId('person')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull(); // nothing says "loading" for the details
    expect(screen.queryByRole('radio', { name: 'Me' })).toBeNull();
    expect(screen.queryByRole('radio', { name: 'Team' })).toBeNull();
    expect(screen.queryByText('today-stub')).toBeNull();
    expect(screen.queryByText('team-stub')).toBeNull(); // the Team totals table is off for now
    expect(screen.getByText('Fri, Nov 20')).toBeTruthy();
  });

  it("fills in each name's dot, pending count and bids when the day's summary arrives", async () => {
    renderIt();
    expect(await screen.findByLabelText('28 pending')).toBeTruthy();
    expect(api.getTeamToday).toHaveBeenCalledWith('2026-11-20');
    expect(list().map((b) => b.textContent)).toEqual(['Puma10186 / 200 bids · 1 of 3 to-dos', 'Yuari28183 / 270 bids · 1 of 4 to-dos']);
  });

  it('keeps the names when the summary fails', async () => {
    vi.mocked(api.getTeamToday).mockRejectedValue(new Error('down'));
    renderIt();
    await waitFor(() => expect(list().map((b) => b.textContent)).toEqual(['Puma', 'Yuari']));
  });

  it('says so, with a retry, when the names cannot be read', async () => {
    vi.mocked(api.lookupUsers).mockRejectedValueOnce(new Error('down'));
    renderIt();
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(list()).toHaveLength(2));
  });

  it('picking a person puts them in the URL and loads their page', async () => {
    renderIt();
    await waitFor(() => expect(list()).toHaveLength(2));
    fireEvent.click(list()[0]);
    expect((await person()).textContent).toBe('u2|Puma|2026-11-20|2026-11-20');
    expect(screen.getByTestId('where').textContent).toBe('?user=u2');
    expect(list().map((b) => b.getAttribute('aria-current'))).toEqual(['true', null]);
  });

  it('a link with ?user= opens that person', async () => {
    renderIt('/dashboard?user=u1');
    expect((await person()).textContent).toContain('u1|');
    await waitFor(() => expect(screen.getByTestId('person').textContent).toBe('u1|Yuari|2026-11-20|2026-11-20'));
  });

  it('the narrow form picks from a dropdown and steps with previous / next', async () => {
    renderIt();
    await waitFor(() => expect(list()).toHaveLength(2));
    expect((screen.getByLabelText('Viewing') as HTMLSelectElement).value).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Next person' }));
    expect((await person()).textContent).toContain('u2|Puma');
    fireEvent.click(screen.getByRole('button', { name: 'Next person' }));
    await waitFor(() => expect(screen.getByTestId('person').textContent).toContain('u1|Yuari'));
    expect((screen.getByRole('button', { name: 'Next person' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Previous person' }));
    await waitFor(() => expect(screen.getByTestId('person').textContent).toContain('u2|Puma'));
  });

  it('Yesterday changes the day the reads ask for, sits in the URL, and Today goes back', async () => {
    renderIt('/dashboard?user=u1');
    await person();
    fireEvent.click(screen.getByRole('radio', { name: 'Yesterday' }));
    await waitFor(() => expect(api.getTeamToday).toHaveBeenCalledWith('2026-11-19'));
    expect(screen.getByTestId('person').textContent).toContain('|2026-11-19|2026-11-20');
    expect(screen.getByTestId('where').textContent).toBe('?user=u1&day=yesterday');
    expect(screen.getByText('Thu, Nov 19')).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: 'Today' }));
    expect(screen.getByTestId('where').textContent).toBe('?user=u1');
  });
});
