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
vi.mock('../components/home/MetricsCard', () => ({ default: () => <div>metrics-stub</div> }));
vi.mock('../components/dashboard/TeamOverview', () => ({ default: () => <div>team-stub</div> })); // not rendered now; kept so a return is caught
vi.mock('../components/home/PersonPage', () => ({
  default: (p: { mode: string; userId?: string; name?: string; day: string; today: string; onPickDay: (day: string) => void }) => (
    <div>
      <div data-testid="person" data-mode={p.mode}>{`${p.userId}|${p.name}|${p.day}|${p.today}`}</div>
      <button type="button" onClick={() => p.onPickDay('2026-11-17')}>pick-tuesday</button>
    </div>
  ),
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
  it("staff get the same page for themselves at once: Week and Day filters but no User, then This month; no team", async () => {
    role = 'staff';
    renderIt();
    const page = screen.getByTestId('person'); // no "pick a person" step
    expect(page.getAttribute('data-mode')).toBe('owner');
    expect(page.textContent).toBe('undefined|undefined|2026-11-20|2026-11-20'); // their own: no userId
    const filters = screen.getByRole('group', { name: 'Filters' });
    expect(within(filters).queryByLabelText('User')).toBeNull();
    expect(within(filters).getByRole('group', { name: 'Week' })).toBeTruthy();
    expect(within(filters).getAllByRole('radio').map((d) => d.getAttribute('aria-label'))).toEqual(['Mon, Nov 16', 'Tue, Nov 17', 'Wed, Nov 18', 'Thu, Nov 19', 'Fri, Nov 20']);
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Back to today' })).toBeNull();
    const month = screen.getByText('metrics-stub');
    expect(page.compareDocumentPosition(month) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy(); // at the bottom
    expect(screen.queryByText('team-stub')).toBeNull();
    expect(screen.queryByText(/Pick a person/)).toBeNull();
    expect(api.getTeamToday).not.toHaveBeenCalled();
    expect(api.lookupUsers).not.toHaveBeenCalled();
  });

  it('staff pick a day or a week the same way; Back to today and Clear both return', async () => {
    role = 'staff';
    renderIt();
    fireEvent.click(screen.getByRole('radio', { name: 'Wed, Nov 18' }));
    expect(screen.getByTestId('where').textContent).toBe('?day=2026-11-18');
    expect(screen.getByTestId('person').textContent).toBe('undefined|undefined|2026-11-18|2026-11-20');
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByTestId('where').textContent).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Previous week' }));
    expect(screen.getByTestId('where').textContent).toBe('?day=2026-11-13');
    fireEvent.click(screen.getByRole('button', { name: 'Back to today' }));
    expect(screen.getByTestId('where').textContent).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'pick-tuesday' }));
    expect(screen.getByTestId('person').textContent).toBe('undefined|undefined|2026-11-17|2026-11-20');
  });

  it("a ?user= in a staff link is ignored: the page stays their own", () => {
    role = 'staff';
    renderIt('/dashboard?user=u2&day=yesterday');
    expect(screen.getByTestId('person').textContent).toBe('undefined|undefined|2026-11-19|2026-11-20');
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
    expect(screen.queryByText('metrics-stub')).toBeNull(); // This month is the owner's only
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
    expect(screen.getByTestId('person').getAttribute('data-mode')).toBe('admin');
    expect(screen.queryByText('metrics-stub')).toBeNull();
    expect(screen.getByTestId('where').textContent).toBe('?user=u2');
    expect(user.value).toBe('u2');
  });

  it('a link with ?user= opens that person', async () => {
    renderIt('/dashboard?user=u1');
    await waitFor(() => expect(screen.getByTestId('person').textContent).toBe('u1|Yuari|2026-11-20|2026-11-20'));
  });

  const where = () => screen.getByTestId('where').textContent;
  const shown = () => screen.getByTestId('person').textContent!.split('|').slice(2).join('|');
  const days = () => within(screen.getByRole('radiogroup', { name: 'Day' })).getAllByRole('radio') as HTMLInputElement[];
  const week = () => screen.getByRole('group', { name: 'Week' });
  const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement;

  it('the filter bar shows the week and its five days: today picked and labelled, nothing to clear, next week not offered', async () => {
    renderIt('/dashboard?user=u1');
    await person();
    expect(within(week()).getByText('Nov 16 – Nov 20')).toBeTruthy();
    expect(button('Next week').disabled).toBe(true);
    expect(button('Previous week').disabled).toBe(false);
    expect(days().map((d) => [d.getAttribute('aria-label'), d.checked, d.disabled, d.getAttribute('aria-current')])).toEqual([
      ['Mon, Nov 16', false, false, null], ['Tue, Nov 17', false, false, null], ['Wed, Nov 18', false, false, null],
      ['Thu, Nov 19', false, false, null], ['Fri, Nov 20', true, false, 'date'],
    ]);
    expect(within(screen.getByRole('radiogroup', { name: 'Day' })).getByText('today')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Back to today' })).toBeNull();
    expect(shown()).toBe('2026-11-20|2026-11-20');
    expect(screen.queryByLabelText('Day', { selector: 'select' })).toBeNull(); // the Today / Yesterday select is gone
  });

  it('days still to come cannot be picked', async () => {
    vi.setSystemTime(new Date('2026-11-18T12:00:00-06:00')); // a Wednesday
    renderIt('/dashboard?user=u1');
    await person();
    expect(days().map((d) => [d.checked, d.disabled, d.getAttribute('aria-current')])).toEqual([
      [false, false, null], [false, false, null], [true, false, 'date'], [false, true, null], [false, true, null],
    ]);
  });

  it('picking a day puts it in the URL and on the page; Back to today shows only then and returns', async () => {
    renderIt('/dashboard?user=u1');
    await person();
    fireEvent.click(screen.getByRole('radio', { name: 'Wed, Nov 18' }));
    await waitFor(() => expect(shown()).toBe('2026-11-18|2026-11-20'));
    expect(where()).toBe('?user=u1&day=2026-11-18');
    expect(days().map((d) => d.checked)).toEqual([false, false, true, false, false]);
    fireEvent.click(button('Back to today'));
    expect(where()).toBe('?user=u1');
    expect(shown()).toBe('2026-11-20|2026-11-20');
    expect(screen.queryByRole('button', { name: 'Back to today' })).toBeNull();
  });

  it("a day picked on the person's page (a bar, a to-dos column) lands in the URL too", async () => {
    renderIt('/dashboard?user=u1');
    await person();
    fireEvent.click(button('pick-tuesday'));
    expect(where()).toBe('?user=u1&day=2026-11-17');
    expect(shown()).toBe('2026-11-17|2026-11-20');
  });

  it('Previous week picks that week\'s Friday, any number of weeks back; Next week comes back and picks today in the current week', async () => {
    renderIt('/dashboard?user=u1');
    await person();
    fireEvent.click(button('Previous week'));
    expect(where()).toBe('?user=u1&day=2026-11-13');
    expect(within(week()).getByText('Nov 9 – Nov 13')).toBeTruthy();
    expect(days().map((d) => [d.getAttribute('aria-label'), d.checked, d.disabled, d.getAttribute('aria-current')])).toEqual([
      ['Mon, Nov 9', false, false, null], ['Tue, Nov 10', false, false, null], ['Wed, Nov 11', false, false, null],
      ['Thu, Nov 12', false, false, null], ['Fri, Nov 13', true, false, null],
    ]);
    expect(button('Next week').disabled).toBe(false);
    expect(button('Back to today')).toBeTruthy();
    fireEvent.click(button('Previous week'));
    expect(where()).toBe('?user=u1&day=2026-11-06');
    expect(within(week()).getByText('Nov 2 – Nov 6')).toBeTruthy();
    fireEvent.click(button('Next week'));
    expect(where()).toBe('?user=u1&day=2026-11-13');
    fireEvent.click(button('Next week'));
    expect(where()).toBe('?user=u1');
    expect(shown()).toBe('2026-11-20|2026-11-20');
    expect(button('Next week').disabled).toBe(true);
  });

  it('Clear resets the person and the day, and shows whenever either is set', async () => {
    renderIt('/dashboard?user=u1&day=2026-11-18');
    await person();
    fireEvent.click(button('Clear'));
    expect(where()).toBe('');
    expect(screen.queryByTestId('person')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: 'Mon, Nov 16' }));
    expect(where()).toBe('?day=2026-11-16');
    expect(button('Clear')).toBeTruthy();
  });

  it.each([
    ['day=2026-11-18', '2026-11-18', '?user=u1&day=2026-11-18'],
    ['day=yesterday', '2026-11-19', '?user=u1&day=yesterday'], // an old link
    ['day=2026-11-03', '2026-11-03', '?user=u1&day=2026-11-03'], // weeks back
    ['day=2026-11-15', '2026-11-13', '?user=u1&day=2026-11-15'], // a Sunday: its week's Friday
    ['day=2026-11-21', '2026-11-20', '?user=u1&day=2026-11-21'], // the future: today
    ['day=2027-01-04', '2026-11-20', '?user=u1&day=2027-01-04'],
    ['day=nonsense', '2026-11-20', '?user=u1&day=nonsense'], // malformed: today
    ['day=2026-13-45', '2026-11-20', '?user=u1&day=2026-13-45'],
    ['day=2026-02-30', '2026-11-20', '?user=u1&day=2026-02-30'],
  ])('a link with ?%s shows %s', async (query, day, url) => {
    renderIt(`/dashboard?user=u1&${query}`);
    await person();
    expect(shown()).toBe(`${day}|2026-11-20`);
    expect(where()).toBe(url); // a link is not rewritten on arrival
    expect(days().filter((d) => d.checked).map((d) => d.value)).toEqual([day]);
    expect(!!screen.queryByRole('button', { name: 'Back to today' })).toBe(day !== '2026-11-20');
  });

  it('on a weekend the week just ended shows with its Friday picked: every day can be picked, none is today, nothing to go back to', async () => {
    vi.setSystemTime(new Date('2026-11-22T12:00:00-06:00')); // a Sunday
    renderIt('/dashboard?user=u1');
    await person();
    expect(shown()).toBe('2026-11-20|2026-11-22');
    expect(within(week()).getByText('Nov 16 – Nov 20')).toBeTruthy();
    expect(days().map((d) => [d.checked, d.disabled, d.getAttribute('aria-current')])).toEqual([
      [false, false, null], [false, false, null], [false, false, null], [false, false, null], [true, false, null],
    ]);
    expect(button('Next week').disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Back to today' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeNull(); // the person
    fireEvent.click(screen.getByRole('radio', { name: 'Thu, Nov 19' }));
    expect(where()).toBe('?user=u1&day=2026-11-19');
    fireEvent.click(button('Back to today'));
    expect(where()).toBe('?user=u1');
  });
});
