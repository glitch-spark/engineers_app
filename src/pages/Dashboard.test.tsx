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
const picker = () => screen.findByLabelText('User') as Promise<HTMLSelectElement>;
const names = (el: HTMLSelectElement) => [...el.options].map((o) => o.text);

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

  it('an admin gets a User filter at the top like other pages: the names at once, nobody picked, no cards of their own', async () => {
    renderIt();
    const user = await picker();
    await waitFor(() => expect(names(user)).toEqual(['Pick a person', 'Puma', 'Yuari'])); // A–Z, the inactive one left out
    expect(user.value).toBe('');
    expect(within(screen.getByRole('group', { name: 'Filters' })).getByLabelText('User')).toBe(user);
    expect(screen.queryByRole('navigation', { name: 'People' })).toBeNull(); // no list down the side
    expect(screen.getByText('Pick a person to see their bids, interviews, to-dos, goals and pending items.')).toBeTruthy();
    expect(screen.queryByTestId('person')).toBeNull();
    expect(screen.queryByRole('radio', { name: 'Me' })).toBeNull();
    expect(screen.queryByText('today-stub')).toBeNull();
    expect(screen.queryByText('team-stub')).toBeNull(); // the Team totals table is off for now
    expect(api.getTeamToday).not.toHaveBeenCalled(); // nothing slow is read before a person is picked
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull();
  });

  it('says so, with a retry, when the names cannot be read', async () => {
    vi.mocked(api.lookupUsers).mockRejectedValueOnce(new Error('down'));
    renderIt();
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    await waitFor(async () => expect(names(await picker())).toHaveLength(3));
  });

  it('picking a person puts them in the URL and loads their page', async () => {
    renderIt();
    const user = await picker();
    await waitFor(() => expect(names(user)).toHaveLength(3));
    fireEvent.change(user, { target: { value: 'u2' } });
    expect((await person()).textContent).toBe('u2|Puma|2026-11-20|2026-11-20');
    expect(screen.getByTestId('where').textContent).toBe('?user=u2');
    expect(user.value).toBe('u2');
  });

  it('a link with ?user= opens that person', async () => {
    renderIt('/dashboard?user=u1');
    await waitFor(() => expect(screen.getByTestId('person').textContent).toBe('u1|Yuari|2026-11-20|2026-11-20'));
  });

  it('Day is a filter too: Yesterday changes the day the person page asks for and sits in the URL; Clear resets both', async () => {
    renderIt('/dashboard?user=u1');
    await person();
    const day = screen.getByLabelText('Day') as HTMLSelectElement;
    expect(names(day)).toEqual(['Today · Fri, Nov 20', 'Yesterday · Thu, Nov 19']);
    fireEvent.change(day, { target: { value: 'yesterday' } });
    await waitFor(() => expect(screen.getByTestId('person').textContent).toContain('|2026-11-19|2026-11-20'));
    expect(screen.getByTestId('where').textContent).toBe('?user=u1&day=yesterday');
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByTestId('where').textContent).toBe('');
    expect(screen.queryByTestId('person')).toBeNull();
  });
});
