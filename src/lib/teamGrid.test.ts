import { describe, expect, it } from 'vitest';
import type { PlanItem, PlanItemKind, TeamWeekUser } from '../api/endpoints';
import {
  addColumn, addOwnItem, cell, changed, columnKey, columns, fillColumn, isEmptyRow, ownItems, removeColumn,
  removeOwnItem, renameColumn, retypeColumn, retypeBlocked, keyTaken, addTaken, rowsToSave, setCell, setOwnWeek, setTarget, fillTarget, weekStatus,
  type GridState,
} from './teamGrid';

let n = 0;
const item = (text: string, kind: PlanItemKind = 'check', target: number | null = null): PlanItem => ({
  id: `i${++n}`, text, kind, target, archived: false, addedBy: 'admin',
});
const user = (userId: string, routines: PlanItem[] = [], weeklyGoals: PlanItem[] = [], exists = true): TeamWeekUser => ({
  userId, name: userId, plansOwnWeek: false, exists, goal: { bidsSelf: 0, bidsBidder: 0, interviewsSelf: 0 }, routines, weeklyGoals,
});
const st = (users: TeamWeekUser[]): GridState => ({ users, pinned: [] });
const col = (text: string, kind: PlanItemKind = 'check', scope: 'routine' | 'goal' = 'routine') => ({
  key: columnKey(text, kind, scope), text, kind, scope,
});

describe('teamGrid', () => {
  it('same name in two people is one column; a name one person has is an own item', () => {
    const s = st([user('A', [item('Email'), item('Solo')]), user('B', [item('Email')]), user('C')]);
    expect(columns(s).map((c) => c.text)).toEqual(['Email']);
    expect(ownItems(s, 'A').map((o) => o.item.text)).toEqual(['Solo']);
    expect(ownItems(s, 'B')).toEqual([]);
  });

  it('names match ignoring case and extra spaces', () => {
    const s = st([user('A', [item('Email  outreach')]), user('B', [item('email outreach')])]);
    expect(columns(s).map((c) => c.text)).toEqual(['Email  outreach'.trim().replace(/\s+/g, ' ')]);
  });

  it('different kind is a different column', () => {
    const s = st([user('A', [item('Outreach', 'count', 5)]), user('B', [item('Outreach', 'check')])]);
    expect(columns(s)).toEqual([]);
    expect(ownItems(s, 'A')).toHaveLength(1);
    expect(ownItems(s, 'B')).toHaveLength(1);
  });

  it('a routine and a weekly goal with the same name are different columns', () => {
    const s = st([user('A', [item('X')]), user('B', [], [item('X')])]);
    expect(columns(s)).toEqual([]);
  });

  it('lists routines before goals', () => {
    const s = st([user('A', [item('R')], [item('G')]), user('B', [item('R')], [item('G')])]);
    expect(columns(s).map((c) => c.scope)).toEqual(['routine', 'goal']);
  });

  it('an added column stays while only one cell is filled', () => {
    let s = st([user('A'), user('B')]);
    s = addColumn(s, 'Call', 'check', 'routine');
    expect(columns(s)).toHaveLength(1);
    s = setCell(s, 'A', columns(s)[0], { has: true, target: null });
    expect(columns(s)).toHaveLength(1);
    expect(cell(s, 'A', columns(s)[0]).has).toBe(true);
    expect(cell(s, 'B', columns(s)[0]).has).toBe(false);
  });

  it('setCell adds, re-targets and removes the item for that person only', () => {
    const c = col('Bids', 'count');
    const s0 = st([user('A', [item('Bids', 'count', 3)]), user('B', [item('Bids', 'count', 3)]), user('C')]);
    const s1 = setCell(s0, 'C', c, { has: true, target: 7 });
    expect(s1.users[2].routines).toMatchObject([{ text: 'Bids', kind: 'count', target: 7 }]);
    expect(s1.users[2].routines[0].id).toBeUndefined();
    expect(s0.users[2].routines).toEqual([]);
    const s2 = setCell(s1, 'A', c, { has: true, target: 9 });
    expect(cell(s2, 'A', c)).toEqual({ has: true, target: 9 });
    expect(s2.users[0].routines[0].id).toBe(s0.users[0].routines[0].id);
    expect(cell(s2, 'B', c).target).toBe(3);
    const s3 = setCell(s2, 'A', c, { has: false, target: null });
    expect(cell(s3, 'A', c)).toEqual({ has: false, target: null });
    expect(cell(s3, 'B', c).has).toBe(true);
  });

  it('check cell has null target', () => {
    const s = st([user('A', [item('E')])]);
    expect(cell(s, 'A', col('E'))).toEqual({ has: true, target: null });
  });

  it('fillColumn sets every person and skips a person already at 20 items', () => {
    const full = Array.from({ length: 20 }, (_, i) => item(`f${i}`));
    const s = fillColumn(st([user('A', full), user('B'), user('C')]), col('New'), { has: true, target: null });
    expect(s.users[0].routines).toHaveLength(20);
    expect(s.users[1].routines).toHaveLength(1);
    expect(s.users[2].routines).toHaveLength(1);
  });

  it('renameColumn keeps each item id; retypeColumn drops ids and moves the item to the other list when the scope changes', () => {
    const a = item('Old'), b = item('old');
    const s = st([user('A', [a]), user('B', [b])]);
    const r = renameColumn(s, columns(s)[0], 'New');
    expect(r.users.map((u) => u.routines[0])).toMatchObject([{ id: a.id, text: 'New' }, { id: b.id, text: 'New' }]);
    const t = retypeColumn(r, columns(r)[0], 'count', 'goal');
    expect(t.users[0].routines).toEqual([]);
    expect(t.users[0].weeklyGoals).toHaveLength(1);
    expect(t.users[0].weeklyGoals[0]).toMatchObject({ text: 'New', kind: 'count', target: null });
    expect(t.users[0].weeklyGoals[0].id).toBeUndefined();
  });

  it('retype and rename keep a pinned column', () => {
    let s = addColumn(st([user('A'), user('B')]), 'P', 'check', 'routine');
    s = renameColumn(s, columns(s)[0], 'Q');
    s = retypeColumn(s, columns(s)[0], 'hours', 'goal');
    expect(columns(s)).toMatchObject([{ text: 'Q', kind: 'hours', scope: 'goal' }]);
  });

  it('removeColumn removes the item from everyone who has it', () => {
    let s = st([user('A', [item('X'), item('Y')]), user('B', [item('x')])]);
    s = removeColumn(s, columns(s)[0]);
    expect(s.users[0].routines.map((i) => i.text)).toEqual(['Y']);
    expect(s.users[1].routines).toEqual([]);
    expect(columns(s)).toEqual([]);
  });

  it('own items add and remove, capped at 20', () => {
    let s = addOwnItem(st([user('A')]), 'A', 'Solo', 'count', 'goal', 4);
    expect(s.users[0].weeklyGoals).toMatchObject([{ text: 'Solo', kind: 'count', target: 4 }]);
    s = removeOwnItem(s, 'A', 'goal', 0);
    expect(s.users[0].weeklyGoals).toEqual([]);
    const full = st([user('A', Array.from({ length: 20 }, (_, i) => item(`f${i}`)))]);
    expect(addOwnItem(full, 'A', 'z', 'check', 'routine', null)).toBe(full);
  });

  it('targets and switch', () => {
    let s = setTarget(st([user('A'), user('B')]), 'A', 'bidsSelf', 5);
    s = fillTarget(s, 'interviewsSelf', 2);
    s = setOwnWeek(s, 'B', true);
    expect(s.users[0].goal).toEqual({ bidsSelf: 5, bidsBidder: 0, interviewsSelf: 2 });
    expect(s.users[1].goal.interviewsSelf).toBe(2);
    expect(s.users[1].plansOwnWeek).toBe(true);
  });

  it('isEmptyRow', () => {
    expect(isEmptyRow(user('A'))).toBe(true);
    expect(isEmptyRow(user('A', [item('x')]))).toBe(false);
    const u = user('A');
    u.goal.bidsBidder = 1;
    expect(isEmptyRow(u)).toBe(false);
  });

  it('rowsToSave: untouched saved rows are left out; a draft row is included; an empty row without a plan is left out; a toggled switch alone is included', () => {
    const saved = [user('A', [item('x')]), user('B', [item('y')], [], false), user('C', [], [], false), user('D')];
    const s = st(saved);
    expect(rowsToSave(saved, s).map((r) => r.userId)).toEqual(['B']);
    const s2 = setOwnWeek(s, 'D', true);
    expect(rowsToSave(saved, s2).map((r) => r.userId)).toEqual(['B', 'D']);
    const s3 = setTarget(s, 'A', 'bidsSelf', 1);
    expect(rowsToSave(saved, s3).map((r) => r.userId)).toEqual(['A', 'B']);
  });

  it('rowsToSave sends goal as bidsSelf, bidsBidder, interviewsSelf only', () => {
    const saved = [user('A')];
    const s = setTarget(st(saved), 'A', 'bidsSelf', 1);
    const [row] = rowsToSave(saved, s);
    expect(Object.keys(row).sort()).toEqual(['exists', 'goal', 'plansOwnWeek', 'routines', 'userId', 'weeklyGoals']);
    expect(Object.keys(row.goal).sort()).toEqual(['bidsBidder', 'bidsSelf', 'interviewsSelf']);
  });

  it('changed: a different target reads "was 600"; a newly given item reads "was —"; an unchanged cell is null; no previous week → null', () => {
    const prev = [user('A', [item('Bids', 'count', 600), item('Mail')]), user('B')];
    const prevB = prev[1];
    prevB.goal.bidsSelf = 4;
    const s = st([user('A', [item('Bids', 'count', 700), item('Mail'), item('New')]), user('B')]);
    s.users[1].goal.bidsSelf = 5;
    expect(changed(prev, s, 'A', col('Bids', 'count'))).toEqual({ was: '600' });
    expect(changed(prev, s, 'A', col('New'))).toEqual({ was: '—' });
    expect(changed(prev, s, 'A', col('Mail'))).toBeNull();
    expect(changed(prev, s, 'B', 'bidsSelf')).toEqual({ was: '4' });
    expect(changed(prev, s, 'B', 'bidsBidder')).toBeNull();
    expect(changed(undefined, s, 'A', col('New'))).toBeNull();
    expect(changed(prev, s, 'Z', 'bidsSelf')).toBeNull();
    const gone = st([user('A')]);
    expect(changed(prev, gone, 'A', col('Mail'))).toEqual({ was: '✓' });
  });

  it('weekStatus: all non-empty rows saved and unedited → published; a draft or an edit → draft; nobody has anything → none', () => {
    const saved = [user('A', [item('x')]), user('B')];
    expect(weekStatus(saved, st(saved))).toBe('published');
    expect(weekStatus(saved, setTarget(st(saved), 'A', 'bidsSelf', 1))).toBe('draft');
    const draft = [user('A', [item('x')], [], false), user('B', [], [], false)];
    expect(weekStatus(draft, st(draft))).toBe('draft');
    const none = [user('A', [], [], false), user('B', [], [], false)];
    expect(weekStatus(none, st(none))).toBe('none');
  });

  it('rowsToSave includes a toggled switch on an empty row with no saved plan', () => {
    const saved = [user('C', [], [], false)];
    expect(rowsToSave(saved, setOwnWeek(st(saved), 'C', true)).map((r) => r.userId)).toEqual(['C']);
  });

  it('rowsToSave keeps item ids after a rename and omits them after a retype', () => {
    const a = item('Old'), b = item('old');
    const saved = [user('A', [a]), user('B', [b])];
    const r = renameColumn(st(saved), columns(st(saved))[0], 'New');
    expect(rowsToSave(saved, r).map((x) => x.routines[0])).toMatchObject([{ id: a.id, text: 'New' }, { id: b.id, text: 'New' }]);
    const t = retypeColumn(r, columns(r)[0], 'count', 'routine');
    expect(rowsToSave(saved, t).map((x) => 'id' in x.routines[0])).toEqual([false, false]);
  });

  it('ownItems gives each item its index within that scope', () => {
    const s = st([user('A', [item('Shared'), item('R1')], [item('G1')]), user('B', [item('Shared')])]);
    expect(ownItems(s, 'A').map((o) => [o.scope, o.index])).toEqual([['routine', 1], ['goal', 0]]);
    expect(removeOwnItem(s, 'A', 'routine', ownItems(s, 'A')[0].index).users[0].routines.map((i) => i.text)).toEqual(['Shared']);
  });

  it('retypeBlocked names the people whose other list is full; same-scope retype never blocks', () => {
    const full = Array.from({ length: 20 }, (_, i) => item(`g${i}`));
    const s = st([user('A', [item('X')], full), user('B', [item('X')])]);
    const c = columns(s)[0];
    expect(retypeBlocked(s, c, 'goal').map((u) => u.userId)).toEqual(['A']);
    expect(retypeBlocked(s, c, 'routine')).toEqual([]);
  });

  it('keyTaken: a column or anyone\'s item with that key', () => {
    const s = addColumn(st([user('A', [item('Solo')]), user('B')]), 'Pin', 'count', 'goal');
    expect(keyTaken(s, columnKey(' solo ', 'check', 'routine'))).toBe(true);
    expect(keyTaken(s, columnKey('pin', 'count', 'goal'))).toBe(true);
    expect(keyTaken(s, columnKey('Solo', 'check', 'goal'))).toBe(false);
  });

  it('rowsToSave rows carry the loaded exists, so the server can refuse a carry-over row over a plan saved since', () => {
    const saved = [user('A', [item('x')]), user('B', [item('y')], [], false)];
    const s = setTarget(st(saved), 'A', 'bidsSelf', 1);
    expect(rowsToSave(saved, s).map((r) => [r.userId, r.exists])).toEqual([['A', true], ['B', false]]);
  });

  it('addTaken: for everyone only a column blocks; for one person only their own item blocks', () => {
    const s = addColumn(st([user('A', [item('Solo')]), user('B')]), 'Pin', 'count', 'goal');
    const solo = columnKey('Solo', 'check', 'routine');
    expect(addTaken(s, solo)).toBe(false);
    expect(addTaken(s, columnKey('pin', 'count', 'goal'))).toBe(true);
    expect(addTaken(s, solo, 'B')).toBe(false);
    expect(addTaken(s, solo, 'A')).toBe(true);
    const all = addColumn(s, 'Solo', 'check', 'routine');
    expect(cell(all, 'A', columns(all).find((c) => c.key === solo)!).has).toBe(true);
  });
});
