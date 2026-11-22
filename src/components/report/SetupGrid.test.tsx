// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SWRConfig } from 'swr';
import * as api from '../../api/endpoints';
import type { PlanItem, PlanItemKind, TeamWeekUser } from '../../api/endpoints';
import SetupGrid from './SetupGrid';

vi.mock('../../api/endpoints', async (orig) => ({ ...(await orig<object>()), getTeamWeek: vi.fn(), putTeamWeek: vi.fn() }));
const getTeamWeek = vi.mocked(api.getTeamWeek);
const putTeamWeek = vi.mocked(api.putTeamWeek);

const WEEK = '2026-11-23';
const PREV = '2026-11-16';
const item = (id: string, text: string, kind: PlanItemKind = 'check', target: number | null = null): PlanItem => ({
  id, text, kind, target, archived: false, addedBy: 'admin',
});
const person = (userId: string, over: Partial<TeamWeekUser> = {}): TeamWeekUser => ({
  userId, name: userId, plansOwnWeek: false, exists: true, goal: { bidsSelf: 0, bidsBidder: 0, interviewsSelf: 0 },
  routines: [], weeklyGoals: [], ...over,
});
const team = (): TeamWeekUser[] => [
  person('Ana', { goal: { bidsSelf: 600, bidsBidder: 0, interviewsSelf: 2 }, routines: [item('r1', 'Email')], weeklyGoals: [item('g1', 'Proposals', 'count', 250)] }),
  person('Ben', { routines: [item('r2', 'Email')], weeklyGoals: [item('g2', 'Proposals', 'count', 100), item('g3', 'Solo')] }),
];
const serve = (now: TeamWeekUser[], prev: TeamWeekUser[] = team()) =>
  getTeamWeek.mockImplementation(async (w) => ({ weekStart: w, users: w === WEEK ? now : prev }));

const show = () =>
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, focusThrottleInterval: 0 }}>
      <SetupGrid week={WEEK} />
    </SWRConfig>,
  );
const ready = () => screen.findByRole('rowheader', { name: /Ana/ });
const input = (name: string) => screen.getByLabelText(name) as HTMLInputElement;
const type = (name: string, value: string) => fireEvent.change(input(name), { target: { value } });
const publishBtn = () => screen.getByRole('button', { name: 'Publish week' }) as HTMLButtonElement;

beforeEach(() => {
  vi.clearAllMocks();
  serve(team());
  putTeamWeek.mockImplementation(async (_w, rows) => ({ results: rows.map((r) => ({ userId: r.userId, ok: true, error: null })) }));
});
afterEach(cleanup);

describe('SetupGrid', () => {
  it('loads this week and last week and shows people as rows and shared items as columns', async () => {
    show();
    await ready();
    expect(getTeamWeek).toHaveBeenCalledWith(WEEK);
    expect(getTeamWeek).toHaveBeenCalledWith(PREV);
    expect(screen.getByRole('rowheader', { name: /Ben/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Email/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Proposals/ })).toBeTruthy();
    expect(input('Ana Bids self').value).toBe('600');
    expect(input('Ben Proposals').value).toBe('100');
    expect((input('Ana Email') as HTMLInputElement).checked).toBe(true);
    // Solo is Ben's alone: a chip, not a column
    expect(screen.queryByRole('button', { name: /^Solo/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Remove Solo from Ben' })).toBeTruthy();
  });

  it('shows the status chip: "Draft · copied from last week" when a row has no saved plan, "Published" when all saved, "Not planned yet" when empty', async () => {
    show();
    await ready();
    expect(screen.getByText('Published')).toBeTruthy();
    cleanup();

    serve([...team(), person('Cy', { exists: false, routines: [item('r9', 'Email')] })]);
    show();
    await ready();
    expect(screen.getByText('Draft · copied from last week')).toBeTruthy();
    cleanup();

    serve([person('Ana', { exists: false }), person('Ben', { exists: false })]);
    show();
    await ready();
    expect(screen.getByText('Not planned yet')).toBeTruthy();
  });

  it('typing a target marks the cell changed with "was 600"', async () => {
    show();
    await ready();
    expect(screen.queryByText('was 600')).toBeNull();
    type('Ana Bids self', '650');
    expect(input('Ana Bids self').value).toBe('650');
    expect(screen.getByText('was 600')).toBeTruthy();
  });

  it('the Fill all row sets the column for everyone', async () => {
    show();
    await ready();
    type('Fill all Proposals', '300');
    expect(input('Ana Proposals').value).toBe('300');
    expect(input('Ben Proposals').value).toBe('300');
    type('Fill all Interviews', '4');
    expect(input('Ben Interviews').value).toBe('4');
    fireEvent.click(input('Fill all Email'));
    fireEvent.click(input('Fill all Email'));
    expect(input('Ana Email').checked).toBe(false);
    expect(input('Ben Email').checked).toBe(false);
  });

  it('Add item for everyone adds a column; for one person adds a chip under "Only this person"', async () => {
    show();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: '+ item' }));
    fireEvent.change(screen.getByLabelText('Item name'), { target: { value: 'Calls' } });
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'count' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByRole('button', { name: /^Calls/ })).toBeTruthy();
    expect(input('Ana Calls').value).toBe('');

    fireEvent.click(screen.getByRole('button', { name: 'Add item for Ben' }));
    expect((screen.getByLabelText('For') as HTMLSelectElement).value).toBe('Ben');
    fireEvent.change(screen.getByLabelText('Item name'), { target: { value: 'Mine' } });
    fireEvent.change(screen.getByLabelText('When'), { target: { value: 'goal' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByRole('button', { name: 'Remove Mine from Ben' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Mine from Ben' }));
    expect(screen.queryByRole('button', { name: 'Remove Mine from Ben' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Remove Solo from Ben' })).toBeTruthy();
  });

  it('rejects an empty name and a name that is already an item of that type', async () => {
    show();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: '+ item' }));
    fireEvent.change(screen.getByLabelText('Item name'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByRole('alert').textContent).toMatch(/Enter a name/);
    fireEvent.change(screen.getByLabelText('Item name'), { target: { value: ' email ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByRole('alert').textContent).toMatch(/already/);
  });

  it('adding a name only one person has: for everyone it becomes a column with their cell ticked; for another person too; for that person it is refused', async () => {
    const add = (who: string | null, name: string) => {
      fireEvent.click(screen.getByRole('button', { name: who ? `Add item for ${who}` : '+ item' }));
      fireEvent.change(screen.getByLabelText('Item name'), { target: { value: name } });
      fireEvent.change(screen.getByLabelText('When'), { target: { value: 'goal' } });
      fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    };
    show();
    await ready();
    add(null, 'Solo');
    expect(screen.getByRole('button', { name: /^Solo/ })).toBeTruthy();
    expect(input('Ben Solo').checked).toBe(true);
    expect(input('Ana Solo').checked).toBe(false);
    cleanup();

    show();
    await ready();
    add('Ben', 'solo');
    expect(screen.getByRole('alert').textContent).toMatch(/already/);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    add('Ana', 'Solo');
    expect(input('Ana Solo').checked).toBe(true);
    expect(input('Ben Solo').checked).toBe(true);
  });

  it('reports dirty changes to onDirtyChange', async () => {
    const onDirtyChange = vi.fn();
    render(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, focusThrottleInterval: 0 }}>
        <SetupGrid week={WEEK} onDirtyChange={onDirtyChange} />
      </SWRConfig>,
    );
    await ready();
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    type('Ana Bids self', '650');
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  });

  it('the column menu renames, re-types, switches daily / weekly and removes', async () => {
    show();
    await ready();
    const menu = async (col: RegExp, action: string) => {
      fireEvent.click(screen.getByRole('button', { name: col }));
      fireEvent.click(await screen.findByRole('menuitem', { name: action }));
    };
    await menu(/^Email/, 'Rename');
    fireEvent.change(screen.getByLabelText('Item name'), { target: { value: 'Inbox' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('button', { name: /^Inbox/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Email/ })).toBeNull();

    await menu(/^Inbox/, 'Change type');
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'hours' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('button', { name: /^Inbox.*hours/ })).toBeTruthy();
    expect(input('Ana Inbox').type).toBe('number');

    await menu(/^Inbox/, 'Make weekly goal');
    expect(screen.getByRole('button', { name: /^Inbox.*week/ })).toBeTruthy();

    await menu(/^Inbox/, 'Remove from this week');
    expect(screen.queryByRole('button', { name: /^Inbox/ })).toBeNull();
    expect(screen.queryByLabelText('Ana Inbox')).toBeNull();
  });

  it('blocks a daily / weekly switch when someone already has 20 items there', async () => {
    const full = Array.from({ length: 20 }, (_, i) => item(`f${i}`, `Goal ${i}`));
    serve([person('Ana', { routines: [item('r1', 'Email')], weeklyGoals: full }), person('Ben', { routines: [item('r2', 'Email')] })]);
    show();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: /^Email/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Make weekly goal' }));
    expect(screen.getByRole('alert').textContent).toMatch(/Ana already has 20 weekly goals/);
    expect(screen.getByRole('button', { name: /^Email.*daily/ })).toBeTruthy();
  });

  it('chip menu "Move into column…" moves the chip into an existing column or a new name', async () => {
    show();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Solo of Ben' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Move into column…' }));
    expect((screen.getByLabelText('Item name') as HTMLInputElement).value).toBe('Solo');
    expect([...document.querySelectorAll('datalist option')].map((o) => o.getAttribute('value'))).toEqual(['Email', 'Proposals']);
    fireEvent.change(screen.getByLabelText('Item name'), { target: { value: 'Brand new' } });
    fireEvent.click(screen.getByRole('button', { name: 'Move' }));
    expect(screen.getByRole('button', { name: /^Brand new/ })).toBeTruthy();
    expect(input('Ben Brand new').checked).toBe(true);
    expect(screen.queryByRole('button', { name: 'Remove Solo from Ben' })).toBeNull();
  });

  it('own items (added by the person) have no Move action', async () => {
    const t = team();
    t[1].weeklyGoals.push({ ...item('g9', 'Mine'), addedBy: 'self' });
    serve(t);
    show();
    await ready();
    expect(screen.queryByRole('button', { name: 'Actions for Mine of Ben' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Actions for Solo of Ben' })).toBeTruthy();
  });

  it('a blocked move shows the message and changes nothing', async () => {
    const t = team();
    t[0].weeklyGoals.push(item('g8', 'Solo'));
    t[0].weeklyGoals.push(item('g7', 'Other'));
    serve(t);
    show();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Other of Ana' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Move into column…' }));
    fireEvent.change(screen.getByLabelText('Item name'), { target: { value: 'solo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Move' }));
    expect(screen.getByRole('alert').textContent).toBe('Ana already has solo');
    expect(screen.getByRole('button', { name: 'Remove Other from Ana' })).toBeTruthy();
  });

  it('closes the move form when an earlier chip is removed, so nothing else is moved', async () => {
    const t = team();
    t[1].weeklyGoals = [item('g3', 'Solo'), item('g4', 'Later')];
    t[1].weeklyGoals.unshift(item('g2', 'Proposals', 'count', 100));
    serve(t);
    show();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Later of Ben' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Move into column…' }));
    expect(screen.getByLabelText('Item name')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Solo from Ben' }));
    expect(screen.queryByLabelText('Item name')).toBeNull();
    expect(screen.getByRole('button', { name: 'Remove Later from Ben' })).toBeTruthy();
  });

  it('Publish week sends only rowsToSave and re-reads the week', async () => {
    serve([...team(), person('Cy', { exists: false, routines: [item('r9', 'Email')] })]);
    show();
    await ready();
    type('Ana Bids self', '650');
    fireEvent.click(publishBtn());
    await waitFor(() => expect(putTeamWeek).toHaveBeenCalledTimes(1));
    const [w, rows] = putTeamWeek.mock.calls[0];
    expect(w).toBe(WEEK);
    expect(rows.map((r) => r.userId)).toEqual(['Ana', 'Cy']);
    expect(rows[0].goal.bidsSelf).toBe(650);
    await waitFor(() => expect(getTeamWeek.mock.calls.filter(([x]) => x === WEEK).length).toBe(2));
  });

  it('a failed row shows its error beside the person and stays edited; saved rows are not re-sent on the next Publish', async () => {
    show();
    await ready();
    type('Ana Bids self', '650');
    type('Ben Bids self', '70');
    putTeamWeek.mockResolvedValueOnce({ results: [{ userId: 'Ana', ok: true, error: null }, { userId: 'Ben', ok: false, error: 'Too many items' }] });
    const after = team();
    after[0].goal.bidsSelf = 650;
    serve(after);
    fireEvent.click(publishBtn());
    const ben = screen.getByRole('rowheader', { name: /Ben/ });
    expect((await within(ben).findByRole('alert')).textContent).toBe('Too many items');
    await waitFor(() => expect(getTeamWeek.mock.calls.filter(([x]) => x === WEEK).length).toBe(2));
    expect(input('Ben Bids self').value).toBe('70');
    expect(input('Ana Bids self').value).toBe('650');

    fireEvent.click(publishBtn());
    await waitFor(() => expect(putTeamWeek).toHaveBeenCalledTimes(2));
    expect(putTeamWeek.mock.calls[1][1].map((r) => r.userId)).toEqual(['Ben']);
  });

  for (const anaSaves of [true, false]) {
    it(`a failed row is kept only for the re-read after Publish, not on a later reload (Ana ${anaSaves ? 'saved' : 'untouched'})`, async () => {
      show();
      await ready();
      if (anaSaves) type('Ana Bids self', '650');
      type('Ben Bids self', '70');
      putTeamWeek.mockResolvedValueOnce({ results: [
        ...(anaSaves ? [{ userId: 'Ana', ok: true, error: null }] : []), { userId: 'Ben', ok: false, error: 'Too many items' },
      ] });
      const after = team();
      if (anaSaves) after[0].goal.bidsSelf = 650;
      serve(after);
      fireEvent.click(publishBtn());
      await within(screen.getByRole('rowheader', { name: /Ben/ })).findByRole('alert');
      await waitFor(() => expect(getTeamWeek.mock.calls.filter(([x]) => x === WEEK).length).toBe(2));
      expect(input('Ben Bids self').value).toBe('70');
      // The admin puts Ben back; Ben then edits his own week; the grid reloads on focus.
      type('Ben Bids self', '');
      const later = team();
      if (anaSaves) later[0].goal.bidsSelf = 650;
      later[1].goal.bidsSelf = 55;
      serve(later);
      window.dispatchEvent(new Event('focus'));
      await waitFor(() => expect(input('Ben Bids self').value).toBe('55'));
      expect(publishBtn().disabled).toBe(true);
    });
  }

  it('the grid is disabled while Publish is in flight', async () => {
    show();
    await ready();
    type('Ana Bids self', '650');
    putTeamWeek.mockReturnValueOnce(new Promise(() => {}));
    fireEvent.click(publishBtn());
    // A disabled <fieldset> disables its controls (`:disabled`); their own `disabled` property stays false.
    const off = (el: Element) => el.matches(':disabled');
    await waitFor(() => expect(off(input('Ben Bids self'))).toBe(true));
    expect(off(input('Ana Email'))).toBe(true);
    expect(off(input('Fill all Proposals'))).toBe(true);
    expect(off(screen.getByRole('button', { name: '+ item' }))).toBe(true);
  });

  it('a thrown publish error shows "Could not publish the week."', async () => {
    show();
    await ready();
    type('Ana Bids self', '650');
    putTeamWeek.mockRejectedValueOnce(new Error('boom'));
    fireEvent.click(publishBtn());
    expect((await screen.findByText('Could not publish the week.')).getAttribute('role')).toBe('alert');
    expect(input('Ana Bids self').value).toBe('650');
  });

  it('Publish is disabled while saving and when there is nothing to save', async () => {
    show();
    await ready();
    expect(publishBtn().disabled).toBe(true);
    type('Ana Bids self', '650');
    expect(publishBtn().disabled).toBe(false);
    putTeamWeek.mockReturnValueOnce(new Promise(() => {}));
    fireEvent.click(publishBtn());
    await waitFor(() => expect((screen.getByRole('button', { name: /Publishing/ }) as HTMLButtonElement).disabled).toBe(true));
  });

  it('leaving with unsaved edits asks first', async () => {
    show();
    await ready();
    const leave = () => {
      const e = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(e);
      return e.defaultPrevented;
    };
    expect(leave()).toBe(false);
    type('Ana Bids self', '650');
    expect(leave()).toBe(true);
  });

  it('load failure shows "Couldn\'t load the team." with Retry', async () => {
    getTeamWeek.mockRejectedValue(new Error('down'));
    show();
    expect((await screen.findByRole('alert')).textContent).toMatch("Couldn't load the team.");
    serve(team());
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await ready();
  });

  it('an own item chip reads "added by <name>" and can still be removed by the admin', async () => {
    const t = team();
    t[1].routines.push({ ...item('r9', 'Email'), addedBy: 'self' }, { ...item('r8', 'Notes'), addedBy: 'self' });
    serve(t);
    show();
    await ready();
    expect(screen.getAllByText(/added by Ben/)).toHaveLength(2);
    expect(screen.queryByText(/added by Ana/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Notes from Ben' }));
    expect(screen.queryByRole('button', { name: 'Remove Notes from Ben' })).toBeNull();
    expect(screen.getAllByText(/added by Ben/)).toHaveLength(1);
  });
});
