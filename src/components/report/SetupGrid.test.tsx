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
  id, text, kind, target, archived: false, options: [], addedBy: 'admin',
});
const person = (userId: string, over: Partial<TeamWeekUser> = {}): TeamWeekUser => ({
  userId, name: userId, plansOwnWeek: false, exists: true, goal: { bidsSelf: 0, bidsBidder: 0, interviewsSelf: 0 },
  satGoal: { bidsSelf: 0, bidsBidder: 0 }, routines: [], weeklyGoals: [], ...over,
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
/** Which group (data-group on the cell) a control sits in. */
const cellGroup = (el: Element) => (el.closest('td, th') as HTMLElement | null)?.dataset.group;
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
    expect(input('Ana Bids / day').value).toBe('120');
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

  it('typing a target marks the cell changed with "was 120"', async () => {
    show();
    await ready();
    expect(screen.queryByText('was 120')).toBeNull();
    type('Ana Bids / day', '650');
    expect(input('Ana Bids / day').value).toBe('650');
    expect(screen.getByText('was 120')).toBeTruthy();
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
    fireEvent.click(screen.getByRole('button', { name: '+ Add item' }));
    fireEvent.change(screen.getByLabelText('Item name'), { target: { value: 'Calls' } });
    fireEvent.click(screen.getByRole('radio', { name: /^Number/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByRole('button', { name: /^Calls/ })).toBeTruthy();
    expect(input('Ana Calls').value).toBe('');

    fireEvent.click(screen.getByRole('button', { name: 'Add weekly to-do for Ben' }));
    expect((screen.getByLabelText('For') as HTMLSelectElement).value).toBe('Ben');
    expect((screen.getByLabelText('Group') as HTMLSelectElement).value).toBe('goal');
    fireEvent.change(screen.getByLabelText('Item name'), { target: { value: 'Mine' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByRole('button', { name: 'Remove Mine from Ben' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Mine from Ben' }));
    expect(screen.queryByRole('button', { name: 'Remove Mine from Ben' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Remove Solo from Ben' })).toBeTruthy();
  });

  it('rejects an empty name and a name that is already an item of that type', async () => {
    show();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: '+ Add item' }));
    fireEvent.change(screen.getByLabelText('Item name'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByRole('alert').textContent).toMatch(/Enter a name/);
    fireEvent.change(screen.getByLabelText('Item name'), { target: { value: ' email ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByRole('alert').textContent).toMatch(/already/);
  });

  it('adding a name only one person has: for everyone it becomes a column with their cell ticked; for another person too; for that person it is refused', async () => {
    const add = (who: string | null, name: string) => {
      fireEvent.click(screen.getByRole('button', { name: who ? `Add weekly to-do for ${who}` : '+ Add item' }));
      fireEvent.change(screen.getByLabelText('Item name'), { target: { value: name } });
      if (!who) fireEvent.change(screen.getByLabelText('Group'), { target: { value: 'goal' } });
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
    type('Ana Bids / day', '650');
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
    fireEvent.click(screen.getByRole('radio', { name: /^Hours/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('button', { name: /^Inbox.*Hours/ })).toBeTruthy();
    expect(input('Ana Inbox').type).toBe('number');

    await menu(/^Inbox/, 'Make weekly to-do');
    expect(cellGroup(input('Ana Inbox'))).toBe('goal');

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
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Make weekly to-do' }));
    expect(screen.getByRole('alert').textContent).toMatch(/Ana already has 20 weekly to-dos/);
    expect(cellGroup(input('Ana Email'))).toBe('routine');
  });

  it('chip menu "Move into column…" moves the chip into an existing column or a new name', async () => {
    show();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Solo of Ben' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Move into column…' }));
    expect((screen.getByLabelText('Item name') as HTMLInputElement).value).toBe('Solo');
    expect([...document.querySelectorAll('datalist option')].map((o) => o.getAttribute('value'))).toEqual(['Proposals', 'Email']);
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
    type('Ana Bids / day', '650');
    fireEvent.click(publishBtn());
    await waitFor(() => expect(putTeamWeek).toHaveBeenCalledTimes(1));
    const [w, rows] = putTeamWeek.mock.calls[0];
    expect(w).toBe(WEEK);
    expect(rows.map((r) => r.userId)).toEqual(['Ana', 'Cy']);
    expect(rows[0].goal.bidsSelf).toBe(3250);
    await waitFor(() => expect(getTeamWeek.mock.calls.filter(([x]) => x === WEEK).length).toBe(2));
  });

  it('a failed row shows its error beside the person and stays edited; saved rows are not re-sent on the next Publish', async () => {
    show();
    await ready();
    type('Ana Bids / day', '650');
    type('Ben Bids / day', '70');
    putTeamWeek.mockResolvedValueOnce({ results: [{ userId: 'Ana', ok: true, error: null }, { userId: 'Ben', ok: false, error: 'Too many items' }] });
    const after = team();
    after[0].goal.bidsSelf = 3250;
    serve(after);
    fireEvent.click(publishBtn());
    const ben = screen.getByRole('rowheader', { name: /Ben/ });
    expect((await within(ben).findByRole('alert')).textContent).toBe('Too many items');
    await waitFor(() => expect(getTeamWeek.mock.calls.filter(([x]) => x === WEEK).length).toBe(2));
    expect(input('Ben Bids / day').value).toBe('70');
    expect(input('Ana Bids / day').value).toBe('650');

    fireEvent.click(publishBtn());
    await waitFor(() => expect(putTeamWeek).toHaveBeenCalledTimes(2));
    expect(putTeamWeek.mock.calls[1][1].map((r) => r.userId)).toEqual(['Ben']);
  });

  for (const anaSaves of [true, false]) {
    it(`a failed row is kept only for the re-read after Publish, not on a later reload (Ana ${anaSaves ? 'saved' : 'untouched'})`, async () => {
      show();
      await ready();
      if (anaSaves) type('Ana Bids / day', '650');
      type('Ben Bids / day', '70');
      putTeamWeek.mockResolvedValueOnce({ results: [
        ...(anaSaves ? [{ userId: 'Ana', ok: true, error: null }] : []), { userId: 'Ben', ok: false, error: 'Too many items' },
      ] });
      const after = team();
      if (anaSaves) after[0].goal.bidsSelf = 3250;
      serve(after);
      fireEvent.click(publishBtn());
      await within(screen.getByRole('rowheader', { name: /Ben/ })).findByRole('alert');
      await waitFor(() => expect(getTeamWeek.mock.calls.filter(([x]) => x === WEEK).length).toBe(2));
      expect(input('Ben Bids / day').value).toBe('70');
      // The admin puts Ben back; Ben then edits his own week; the grid reloads on focus.
      type('Ben Bids / day', '');
      const later = team();
      if (anaSaves) later[0].goal.bidsSelf = 3250;
      later[1].goal.bidsSelf = 275;
      serve(later);
      window.dispatchEvent(new Event('focus'));
      await waitFor(() => expect(input('Ben Bids / day').value).toBe('55'));
      expect(publishBtn().disabled).toBe(true);
    });
  }

  it('the grid is disabled while Publish is in flight', async () => {
    show();
    await ready();
    type('Ana Bids / day', '650');
    putTeamWeek.mockReturnValueOnce(new Promise(() => {}));
    fireEvent.click(publishBtn());
    // A disabled <fieldset> disables its controls (`:disabled`); their own `disabled` property stays false.
    const off = (el: Element) => el.matches(':disabled');
    await waitFor(() => expect(off(input('Ben Bids / day'))).toBe(true));
    expect(off(input('Ana Email'))).toBe(true);
    expect(off(input('Fill all Proposals'))).toBe(true);
    expect(off(screen.getByRole('button', { name: '+ Add item' }))).toBe(true);
  });

  it('a thrown publish error shows "Could not publish the week."', async () => {
    show();
    await ready();
    type('Ana Bids / day', '650');
    putTeamWeek.mockRejectedValueOnce(new Error('boom'));
    fireEvent.click(publishBtn());
    expect((await screen.findByText('Could not publish the week.')).getAttribute('role')).toBe('alert');
    expect(input('Ana Bids / day').value).toBe('650');
  });

  it('Publish is disabled while saving and when there is nothing to save', async () => {
    show();
    await ready();
    expect(publishBtn().disabled).toBe(true);
    type('Ana Bids / day', '650');
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
    type('Ana Bids / day', '650');
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
  describe('daily / weekly to-dos split and the type picker', () => {
    const choice = (id: string, text: string, options: string[]): PlanItem => ({ ...item(id, text, 'choice'), options });
    const openAdd = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

    it('shows both group headers with no columns, and an "Only this person" cell per group', async () => {
      serve([person('Ana', { routines: [item('r1', 'Inbox')], weeklyGoals: [item('g1', 'Launch')] }), person('Ben')]);
      show();
      await ready();
      expect(screen.getByRole('columnheader', { name: 'Daily to-dos' })).toBeTruthy();
      expect(screen.getByRole('columnheader', { name: 'Weekly to-dos' })).toBeTruthy();
      const own = screen.getAllByRole('columnheader', { name: 'Only this person' });
      expect(own.map(cellGroup)).toEqual(['routine', 'goal']);
      expect(cellGroup(screen.getByRole('button', { name: 'Remove Inbox from Ana' }))).toBe('routine');
      expect(cellGroup(screen.getByRole('button', { name: 'Remove Launch from Ana' }))).toBe('goal');
      expect(cellGroup(screen.getByRole('button', { name: 'Add daily to-do for Ana' }))).toBe('routine');
      expect(cellGroup(screen.getByRole('button', { name: 'Add weekly to-do for Ana' }))).toBe('goal');
    });

    it('chips keep their target ("2h", "50") and drop the daily / week suffix', async () => {
      serve([person('Ana', { routines: [item('r1', 'Interview prep', 'hours', 2)], weeklyGoals: [item('g1', 'Emails', 'count', 50), item('g2', 'Launch')] }), person('Ben')]);
      show();
      await ready();
      const chip = (name: string) => screen.getByRole('button', { name: `Remove ${name} from Ana` }).parentElement!.textContent;
      expect(chip('Interview prep')).toMatch(/^Interview prep · 2h/);
      expect(chip('Emails')).toMatch(/^Emails · 50/);
      for (const n of ['Interview prep', 'Emails', 'Launch']) expect(chip(n)).not.toMatch(/daily|week/);
    });

    it('the picker offers the six types with their copy; Number/Hours show a target, Choice the options with presets', async () => {
      show();
      await ready();
      openAdd('Add daily to-do for Ana');
      expect((screen.getByLabelText('Group') as HTMLSelectElement).value).toBe('routine');
      expect([...(screen.getByLabelText('Group') as HTMLSelectElement).options].map((o) => o.text))
        .toEqual(['Daily to-do (on the days you pick)', 'Weekly to-do (once this week)']);
      expect(screen.getAllByRole('radio').map((r) => r.closest('label')!.textContent)).toEqual([
        'CheckboxTick when done.',
        'NumberEnter a count against a target, e.g. 40 / 50 emails.',
        'HoursEnter time spent against a target, e.g. 1.5 / 2h.',
        'Profile logPick a profile and write what changed; one row per profile.',
        'TextWrite a short answer with details (up to 500 characters).',
        'ChoicePick one option you list, plus an optional note.',
      ]);
      expect((screen.getByRole('radio', { name: /^Checkbox/ }) as HTMLInputElement).checked).toBe(true);
      expect(screen.queryByLabelText('Target')).toBeNull();
      fireEvent.click(screen.getByRole('radio', { name: /^Hours/ }));
      expect(screen.getByLabelText('Target')).toBeTruthy();
      fireEvent.click(screen.getByRole('radio', { name: /^Text/ }));
      expect(screen.queryByLabelText('Target')).toBeNull();
      expect(screen.queryByLabelText('Choice options')).toBeNull();
      fireEvent.click(screen.getByRole('radio', { name: /^Choice/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Yes, No' }));
      expect(input('Choice options').value).toBe('Yes, No');
      fireEvent.click(screen.getByRole('button', { name: 'Done, Blocked, N/A' }));
      expect(input('Choice options').value).toBe('Done, Blocked, N/A');
    });

    it('a Choice item for one person is added with its options and published with them', async () => {
      show();
      await ready();
      openAdd('Add weekly to-do for Ana');
      fireEvent.change(screen.getByLabelText('Item name'), { target: { value: 'Client check' } });
      fireEvent.click(screen.getByRole('radio', { name: /^Choice/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Yes, No' }));
      fireEvent.click(screen.getByRole('button', { name: 'Add' }));
      expect(cellGroup(screen.getByRole('button', { name: 'Remove Client check from Ana' }))).toBe('goal');
      fireEvent.click(publishBtn());
      await waitFor(() => expect(putTeamWeek).toHaveBeenCalledTimes(1));
      expect(putTeamWeek.mock.calls[0][1][0].weeklyGoals.at(-1)).toMatchObject({ text: 'Client check', kind: 'choice', options: ['Yes', 'No'] });
    });

    it('invalid Choice options block the form (inline message) and Publish (with a reason)', async () => {
      show();
      await ready();
      type('Ana Bids / day', '650');
      expect(publishBtn().disabled).toBe(false);
      openAdd('+ Add item');
      fireEvent.change(screen.getByLabelText('Item name'), { target: { value: 'Mood' } });
      fireEvent.click(screen.getByRole('radio', { name: /^Choice/ }));
      type('Choice options', 'Only one');
      expect(screen.getByRole('alert').textContent).toMatch(/2 to 6 options/);
      expect((screen.getByRole('button', { name: 'Add' }) as HTMLButtonElement).disabled).toBe(true);
      expect(publishBtn().disabled).toBe(true);
      expect(publishBtn().title).toMatch(/Choice options/);
      type('Choice options', 'Good, Bad');
      expect(publishBtn().disabled).toBe(false);
      fireEvent.click(screen.getByRole('button', { name: 'Add' }));
      expect(screen.getByRole('button', { name: /^Mood.*Good \/ Bad/ })).toBeTruthy();
      expect(input('Ana Mood').type).toBe('checkbox');
    });

    it('Change type to Choice sets every cell\'s options; changing only the options keeps the ids', async () => {
      serve([person('Ana', { routines: [choice('r1', 'Client', ['Done', 'Blocked'])] }), person('Ben', { routines: [choice('r2', 'Client', ['Yes', 'No'])] })]);
      show();
      await ready();
      expect(screen.getByRole('button', { name: /^Client.*Done \/ Blocked/ })).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: /^Client/ }));
      fireEvent.click(await screen.findByRole('menuitem', { name: 'Change type' }));
      expect(input('Choice options').value).toBe('Done, Blocked');
      type('Choice options', 'Ok, Late, N/A');
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      fireEvent.click(publishBtn());
      await waitFor(() => expect(putTeamWeek).toHaveBeenCalledTimes(1));
      expect(putTeamWeek.mock.calls[0][1].map((r) => r.routines[0])).toMatchObject([
        { id: 'r1', options: ['Ok', 'Late', 'N/A'] }, { id: 'r2', options: ['Ok', 'Late', 'N/A'] },
      ]);
    });

    it('Change type from Checkbox to Choice gives the new items the options', async () => {
      show();
      await ready();
      fireEvent.click(screen.getByRole('button', { name: /^Email/ }));
      fireEvent.click(await screen.findByRole('menuitem', { name: 'Change type' }));
      fireEvent.click(screen.getByRole('radio', { name: /^Choice/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Yes, No' }));
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      fireEvent.click(publishBtn());
      await waitFor(() => expect(putTeamWeek).toHaveBeenCalledTimes(1));
      const r = putTeamWeek.mock.calls[0][1][0].routines[0];
      expect(r).toMatchObject({ text: 'Email', kind: 'choice', options: ['Yes', 'No'] });
      expect(r).not.toHaveProperty('id');
    });

    it('Move into a new Choice column takes the typed options; into an existing one shows and uses its options', async () => {
      const t = team();
      t[0].routines.push(choice('r5', 'Client', ['Done', 'Blocked']));
      t[1].routines.push(item('r7', 'Spare'));
      serve([...t, person('Cy', { routines: [choice('r6', 'Client', ['Done', 'Blocked'])] })]);
      show();
      await ready();
      const move = async (what: string) => {
        fireEvent.click(screen.getByRole('button', { name: `Actions for ${what} of Ben` }));
        fireEvent.click(await screen.findByRole('menuitem', { name: 'Move into column…' }));
      };
      await move('Solo');
      fireEvent.change(screen.getByLabelText('Item name'), { target: { value: 'Mood' } });
      fireEvent.click(screen.getByRole('radio', { name: /^Choice/ }));
      type('Choice options', 'Good, Bad');
      fireEvent.click(screen.getByRole('button', { name: 'Move' }));
      expect(screen.getByRole('button', { name: /^Mood.*Good \/ Bad/ })).toBeTruthy();

      await move('Spare');
      fireEvent.change(screen.getByLabelText('Item name'), { target: { value: 'client' } });
      fireEvent.click(screen.getByRole('radio', { name: /^Choice/ }));
      expect(screen.queryByLabelText('Choice options')).toBeNull();
      expect(screen.getByText(/column's options: Done \/ Blocked/)).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Move' }));
      expect(screen.queryByRole('button', { name: 'Remove Spare from Ben' })).toBeNull();
      fireEvent.click(publishBtn());
      await waitFor(() => expect(putTeamWeek).toHaveBeenCalledTimes(1));
      const ben = putTeamWeek.mock.calls[0][1].find((r) => r.userId === 'Ben')!;
      expect(ben.routines.filter((i) => i.kind === 'choice')).toMatchObject([{ text: 'client', options: ['Done', 'Blocked'] }]);
      expect(ben.weeklyGoals.filter((i) => i.kind === 'choice')).toMatchObject([{ text: 'Mood', options: ['Good', 'Bad'] }]);
    });

    it('Text columns use the "has item" checkbox, in cells and Fill all', async () => {
      serve([person('Ana', { weeklyGoals: [item('g1', 'Company work', 'text')] }), person('Ben', { weeklyGoals: [item('g2', 'Company work', 'text')] })]);
      show();
      await ready();
      expect(screen.getByRole('button', { name: /^Company work.*Text/ })).toBeTruthy();
      expect(input('Ana Company work').type).toBe('checkbox');
      fireEvent.click(input('Fill all Company work'));
      expect(input('Ben Company work').checked).toBe(true);
      fireEvent.click(input('Fill all Company work'));
      expect(input('Ben Company work').checked).toBe(false);
    });
    it('Target with its hint: for one person and in Change type / Move; for everyone only the hint', async () => {
      show();
      await ready();
      openAdd('+ Add item');
      fireEvent.click(screen.getByRole('radio', { name: /^Number/ }));
      expect(screen.queryByLabelText('Target')).toBeNull();
      expect(screen.getByText('Set targets in the cells or with Fill all')).toBeTruthy();
      fireEvent.change(screen.getByLabelText('For'), { target: { value: 'Ana' } });
      expect(screen.getByLabelText('Target')).toBeTruthy();
      expect(screen.getByText('per day')).toBeTruthy();
      fireEvent.change(screen.getByLabelText('Group'), { target: { value: 'goal' } });
      expect(screen.getByText('this week')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      // Change type to Number: the target goes to every member
      fireEvent.click(screen.getByRole('button', { name: /^Email/ }));
      fireEvent.click(await screen.findByRole('menuitem', { name: 'Change type' }));
      fireEvent.click(screen.getByRole('radio', { name: /^Number/ }));
      expect(screen.getByText('per day')).toBeTruthy();
      type('Target', '30');
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      expect([input('Ana Email').value, input('Ben Email').value]).toEqual(['30', '30']);

      // Same type, new target: every member, ids kept; blank changes nothing
      fireEvent.click(screen.getByRole('button', { name: /^Proposals/ }));
      fireEvent.click(await screen.findByRole('menuitem', { name: 'Change type' }));
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      expect([input('Ana Proposals').value, input('Ben Proposals').value]).toEqual(['250', '100']);
      fireEvent.click(screen.getByRole('button', { name: /^Proposals/ }));
      fireEvent.click(await screen.findByRole('menuitem', { name: 'Change type' }));
      expect(screen.getByText('this week')).toBeTruthy();
      type('Target', '80');
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      expect([input('Ana Proposals').value, input('Ben Proposals').value]).toEqual(['80', '80']);

      // Move: the target goes to the moved item
      fireEvent.click(screen.getByRole('button', { name: 'Actions for Solo of Ben' }));
      fireEvent.click(await screen.findByRole('menuitem', { name: 'Move into column…' }));
      fireEvent.change(screen.getByLabelText('Item name'), { target: { value: 'Calls' } });
      fireEvent.click(screen.getByRole('radio', { name: /^Number/ }));
      type('Target', '12');
      fireEvent.click(screen.getByRole('button', { name: 'Move' }));
      expect(input('Ben Calls').value).toBe('12');

      fireEvent.click(publishBtn());
      await waitFor(() => expect(putTeamWeek).toHaveBeenCalledTimes(1));
      expect(putTeamWeek.mock.calls[0][1].map((r) => r.weeklyGoals.find((g) => g.text === 'Proposals'))).toMatchObject([
        { id: 'g1', target: 80 }, { id: 'g2', target: 80 },
      ]);
    });

    it('a Move with a blank target keeps a same-type item\'s target', async () => {
      const t = team();
      t[1].weeklyGoals.push(item('g5', 'Mails', 'count', 9));
      serve(t);
      show();
      await ready();
      fireEvent.click(screen.getByRole('button', { name: 'Actions for Mails of Ben' }));
      fireEvent.click(await screen.findByRole('menuitem', { name: 'Move into column…' }));
      fireEvent.change(screen.getByLabelText('Item name'), { target: { value: 'Emails' } });
      fireEvent.click(screen.getByRole('button', { name: 'Move' }));
      expect(input('Ben Emails').value).toBe('9');
    });

    it('saving Change type on a Choice column aligns every member to its options', async () => {
      serve([person('Ana', { routines: [choice('r1', 'Client', ['Done', 'Blocked'])] }), person('Ben', { routines: [choice('r2', 'Client', ['Yes', 'No'])] })]);
      show();
      await ready();
      fireEvent.click(screen.getByRole('button', { name: /^Client/ }));
      fireEvent.click(await screen.findByRole('menuitem', { name: 'Change type' }));
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      fireEvent.click(publishBtn());
      await waitFor(() => expect(putTeamWeek).toHaveBeenCalledTimes(1));
      expect(putTeamWeek.mock.calls[0][1].map((r) => [r.userId, r.routines[0]])).toMatchObject([['Ben', { id: 'r2', options: ['Done', 'Blocked'] }]]);
    });

    it('joining a Choice column without options shows the options field', async () => {
      serve([...team(), person('Cy', { routines: [choice('r1', 'Client', [])] }), person('Dee', { routines: [choice('r2', 'Client', [])] })]);
      show();
      await ready();
      fireEvent.click(screen.getByRole('button', { name: 'Actions for Solo of Ben' }));
      fireEvent.click(await screen.findByRole('menuitem', { name: 'Move into column…' }));
      fireEvent.change(screen.getByLabelText('Item name'), { target: { value: 'Client' } });
      fireEvent.change(screen.getByLabelText('Group'), { target: { value: 'routine' } });
      fireEvent.click(screen.getByRole('radio', { name: /^Choice/ }));
      expect(screen.getByLabelText('Choice options')).toBeTruthy();
      expect(screen.queryByText(/column's options/)).toBeNull();
    });
  });
});
