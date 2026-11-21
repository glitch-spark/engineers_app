// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../api/endpoints';
import DashboardPage from './Dashboard';

let role = 'staff';
vi.mock('../auth/useAuth', () => ({ useAuth: () => ({ user: { id: 'boss', role } }) }));
vi.mock('../api/endpoints', () => ({ getTeamToday: vi.fn(), getDayPlan: vi.fn() }));
vi.mock('../components/home/TodayCard', () => ({ default: () => <div>today-stub</div> }));
vi.mock('../components/home/WeekCard', () => ({ default: () => <div>week-stub</div> }));
vi.mock('../components/home/MetricsCard', () => ({ default: () => <div>metrics-stub</div> }));
vi.mock('../components/dashboard/TeamOverview', () => ({ default: () => <div>team-stub</div> }));
vi.mock('../components/home/PersonPage', () => ({
  default: (p: { userId: string; name: string; day: string; today: string }) => <div data-testid="person">{`${p.userId}|${p.name}|${p.day}|${p.today}`}</div>,
}));

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
  vi.mocked(api.getDayPlan).mockResolvedValue({ weekSaved: true } as never);
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
const view = (name: string) => screen.getByRole('radio', { name });
const person = () => screen.findByTestId('person');
const list = () => within(screen.getByRole('navigation', { name: 'People' })).getAllByRole('button');

describe('Home', () => {
  it('staff see Today, This week and This month only: no switch, no team', () => {
    role = 'staff';
    renderIt();
    expect(screen.getByText('today-stub')).toBeTruthy();
    expect(screen.getByText('week-stub')).toBeTruthy();
    expect(screen.getByText('metrics-stub')).toBeTruthy();
    expect(screen.queryByText('team-stub')).toBeNull();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(api.getTeamToday).not.toHaveBeenCalled();
  });

  it('an admin lands on Team by default: the list, with the first person picked and their page beside it', async () => {
    renderIt();
    expect(view('Team').getAttribute('aria-checked')).toBe('true');
    expect((await person()).textContent).toBe('u1|Yuari|2026-11-20|2026-11-20');
    expect(api.getTeamToday).toHaveBeenCalledWith('2026-11-20');
    expect(list().map((b) => b.getAttribute('aria-current'))).toEqual(['true', null]);
    expect(screen.queryByText('today-stub')).toBeNull();
    expect(screen.queryByText('team-stub')).toBeNull();
    expect(screen.getByText('Fri, Nov 20')).toBeTruthy();
  });

  it('says it is loading the team while the list is on its way, not a blank page', async () => {
    vi.mocked(api.getTeamToday).mockReturnValue(new Promise(() => {}) as never);
    renderIt();
    expect((await screen.findByRole('status')).textContent).toContain('Loading the team');
    expect(screen.getByText('This can take a few seconds the first time.')).toBeTruthy();
  });

  it('Me is the page as before, with the team table below, and the choice is remembered', async () => {
    renderIt();
    await person();
    fireEvent.click(view('Me'));
    expect(screen.getByText('today-stub')).toBeTruthy();
    const metrics = screen.getByText('metrics-stub');
    expect(metrics.compareDocumentPosition(screen.getByText('team-stub')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByTestId('person')).toBeNull();
    expect(localStorage.getItem('home-view')).toBe('me');
    cleanup();
    renderIt();
    expect(await screen.findByText('today-stub')).toBeTruthy();
    expect(view('Me').getAttribute('aria-checked')).toBe('true');
    fireEvent.click(view('Team'));
    expect(localStorage.getItem('home-view')).toBe('team');
    expect(await person()).toBeTruthy();
  });

  it('an admin with no plan of their own lands on Team even when Me was remembered, and can still open Me', async () => {
    localStorage.setItem('home-view', 'me');
    vi.mocked(api.getDayPlan).mockResolvedValue({ weekSaved: false } as never);
    renderIt();
    expect(await person()).toBeTruthy();
    expect(view('Team').getAttribute('aria-checked')).toBe('true');
    expect(api.getDayPlan).toHaveBeenCalledWith('2026-11-20');
    fireEvent.click(view('Me'));
    expect(screen.getByText('today-stub')).toBeTruthy();
  });

  it('remembered Me stays Me when the own day cannot be read', async () => {
    localStorage.setItem('home-view', 'me');
    vi.mocked(api.getDayPlan).mockRejectedValue(new Error('500'));
    renderIt();
    expect(await screen.findByText('today-stub')).toBeTruthy();
  });

  it('works when the browser storage throws', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    renderIt();
    expect(await person()).toBeTruthy();
    fireEvent.click(view('Me'));
    expect(screen.getByText('today-stub')).toBeTruthy();
  });

  it('picking a person puts them in the URL and shows their page', async () => {
    renderIt();
    await person();
    fireEvent.click(list()[1]);
    expect(screen.getByTestId('where').textContent).toBe('?user=u2');
    expect((await person()).textContent).toBe('u2|Puma|2026-11-20|2026-11-20');
    expect(list().map((b) => b.getAttribute('aria-current'))).toEqual([null, 'true']);
  });

  it('a link with ?user= opens Team on that person, whatever was remembered', async () => {
    localStorage.setItem('home-view', 'me');
    renderIt('/dashboard?user=u2');
    expect((await person()).textContent).toBe('u2|Puma|2026-11-20|2026-11-20');
    expect(api.getDayPlan).not.toHaveBeenCalled();
  });

  it('the narrow form steps through people with previous / next', async () => {
    renderIt('/dashboard?user=u2');
    await person();
    fireEvent.click(screen.getByRole('button', { name: 'Previous person' }));
    expect(screen.getByTestId('where').textContent).toBe('?user=u1');
    fireEvent.click(screen.getByRole('button', { name: 'Next person' }));
    expect(screen.getByTestId('where').textContent).toBe('?user=u2');
  });

  it('Yesterday changes the day the reads ask for, sits in the URL, and Today goes back', async () => {
    renderIt('/dashboard?user=u2');
    await person();
    fireEvent.click(view('Yesterday'));
    expect(screen.getByTestId('where').textContent).toBe('?user=u2&day=yesterday');
    await waitFor(() => expect(api.getTeamToday).toHaveBeenCalledWith('2026-11-19'));
    expect((await person()).textContent).toBe('u2|Puma|2026-11-19|2026-11-20');
    expect(screen.getByText('Thu, Nov 19')).toBeTruthy();
    fireEvent.click(view('Today'));
    expect(screen.getByTestId('where').textContent).toBe('?user=u2');
    expect((await person()).textContent).toBe('u2|Puma|2026-11-20|2026-11-20');
  });

  it('going back to Me drops the person and the day from the URL', async () => {
    renderIt('/dashboard?user=u2&day=yesterday');
    await person();
    fireEvent.click(view('Me'));
    expect(screen.getByTestId('where').textContent).toBe('');
  });

  it('a failed list read says so with a retry; a person in the URL still gets their page', async () => {
    vi.mocked(api.getTeamToday).mockRejectedValueOnce(new Error('500'));
    renderIt('/dashboard?user=u2');
    expect(await screen.findByText(/Couldn.t load the team/)).toBeTruthy();
    expect((await person()).textContent).toBe('u2||2026-11-20|2026-11-20');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(list()).toHaveLength(2));
    expect((await person()).textContent).toBe('u2|Puma|2026-11-20|2026-11-20');
  });

  it('an empty team says so', async () => {
    vi.mocked(api.getTeamToday).mockResolvedValue({ day: '2026-11-20', people: [] } as never);
    renderIt();
    expect(await screen.findByText('No team members to show.')).toBeTruthy();
    expect(screen.queryByTestId('person')).toBeNull();
  });
});
