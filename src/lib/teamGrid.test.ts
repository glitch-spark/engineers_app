import { describe, expect, it } from 'vitest';
import type { PlanItem, PlanItemKind, TeamWeekUser } from '../api/endpoints';
import {
  addColumn, addOwnItem, cell, changed, columnKey, columns, fillColumn, isEmptyRow, ownItems, removeColumn,
  removeOwnItem, moveToColumn, moveBlocked, setColumnOptions, setColumnTarget, renameColumn, retypeColumn, retypeBlocked, keyTaken, addTaken, rowsToSave, setCell, setOwnWeek, setTarget, fillTarget, weekStatus,
  type GridState,
} from './teamGrid';

let n = 0;
const item = (text: string, kind: PlanItemKind = 'check', target: number | null = null): PlanItem => ({
  id: `i${++n}`, text, kind, target, archived: false, options: [], addedBy: 'admin',
});
const own = (text: string, kind: PlanItemKind = 'check', target: number | null = null): PlanItem => ({ ...item(text, kind, target), addedBy: 'self' });
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
    expect(Object.keys(row).sort()).toEqual(['exists', 'goal', 'plansOwnWeek', 'removedIds', 'routines', 'userId', 'weeklyGoals']);
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

  it("a person's own item never joins a column, even with the same name as an admin column", () => {
    const s = st([user('A', [item('Email'), own('Email')]), user('B', [item('Email')]), user('C', [own('Email')]), user('D', [own('Email')])]);
    expect(columns(s).map((c) => c.text)).toEqual(['Email']);
    expect(cell(s, 'C', columns(s)[0]).has).toBe(false);
    expect(ownItems(s, 'C').map((o) => o.item.addedBy)).toEqual(['self']);
    expect(ownItems(s, 'A').map((o) => o.item.addedBy)).toEqual(['self']);
    // two people's own items alone make no column
    expect(columns(st([user('C', [own('Solo')]), user('D', [own('Solo')])]))).toEqual([]);
  });

  it('own items do not block an admin add or rename, and survive column edits', () => {
    const s = st([user('A', [item('Email'), own('Email')]), user('C', [own('Calls')])]);
    expect(addTaken(s, columnKey('Calls', 'check', 'routine'))).toBe(false);
    expect(addTaken(s, columnKey('Calls', 'check', 'routine'), 'C')).toBe(false);
    expect(keyTaken(s, columnKey('Calls', 'check', 'routine'))).toBe(false);
    const off = setCell(s, 'A', col('Email'), { has: false, target: null });
    expect(off.users[0].routines.map((i) => i.addedBy)).toEqual(['self']);
  });

  it('own items keep their id in rowsToSave and are not sent when untouched', () => {
    const mine = own('Mine');
    const saved = [user('A', [item('Email'), mine]), user('B')];
    const s = st(saved);
    expect(rowsToSave(saved, s)).toEqual([]);
    const gone = removeOwnItem(s, 'A', 'routine', 1);
    const [sent] = rowsToSave(saved, gone);
    expect(sent.userId).toBe('A');
    expect(sent.routines.map((i) => i.id)).toEqual([saved[0].routines[0].id]);
    expect(sent.removedIds).toEqual([mine.id]);
    expect(rowsToSave(saved, s)).toEqual([]);
    const edited = setTarget(s, 'A', 'bidsSelf', 5);
    expect(rowsToSave(saved, edited)[0].routines.map((i) => i.id)).toEqual([saved[0].routines[0].id, mine.id]);
    expect(rowsToSave(saved, edited)[0].removedIds).toEqual([]);
  });

  describe('moveToColumn', () => {
    const ex = (s: GridState, u: string, scope: 'routine' | 'goal', i: number) => {
      const it = s.users.find((x) => x.userId === u)![scope === 'routine' ? 'routines' : 'weeklyGoals'][i];
      return { id: 'id' in it ? it.id : undefined, text: it.text, kind: it.kind };
    };
    const outreach = (kind: PlanItemKind = 'count', scope: 'routine' | 'goal' = 'routine') => ({ text: 'Citizen outreach', kind, scope });

    it('a same-kind move renames the chip and keeps id and target', () => {
      const puma = item('Citizen Contact with Gmail', 'count', 250);
      const s = st([user('Puma', [puma])]);
      const t = moveToColumn(s, 'Puma', 'routine', 0, outreach(), ex(s, 'Puma', 'routine', 0));
      const c = columns(t)[0];
      expect(c.text).toBe('Citizen outreach');
      expect(cell(t, 'Puma', c)).toEqual({ has: true, target: 250 });
      expect(rowsToSave([], t)[0].routines[0]).toMatchObject({ id: puma.id, text: 'Citizen outreach', target: 250 });
    });

    it('a different kind or scope drops the id and keeps the target only when both kinds have one', () => {
      const a = item('Calls', 'count', 5);
      const s = st([user('A', [a, item('Z')])]);
      const hours = moveToColumn(s, 'A', 'routine', 0, outreach('hours'), ex(s, 'A', 'routine', 0));
      expect(hours.users[0].routines.map((i) => i.text)).toEqual(['Z', 'Citizen outreach']);
      expect(hours.users[0].routines[1]).toMatchObject({ kind: 'hours', target: 5 });
      expect('id' in hours.users[0].routines[1]).toBe(false);
      const goal = moveToColumn(s, 'A', 'routine', 0, outreach('check', 'goal'), ex(s, 'A', 'routine', 0));
      expect(goal.users[0].weeklyGoals[0]).toMatchObject({ kind: 'check', target: null });
      expect(goal.users[0].routines).toHaveLength(1);
      expect(rowsToSave([], goal)[0].weeklyGoals[0]).not.toHaveProperty('id');
    });

    it('a new name pins a new column', () => {
      const s0 = st([user('A', [item('X')])]);
      const t = moveToColumn(s0, 'A', 'routine', 0, { text: ' New  name ', kind: 'check', scope: 'routine' }, ex(s0, 'A', 'routine', 0));
      expect(columns(t).map((c) => c.text)).toEqual(['New name']);
    });

    it('two people moved into one name form one column', () => {
      let s = st([user('A', [item('x1')]), user('B', [item('x2')])]);
      s = moveToColumn(s, 'A', 'routine', 0, { text: 'Same', kind: 'check', scope: 'routine' }, ex(s, 'A', 'routine', 0));
      s = moveToColumn(s, 'B', 'routine', 0, { text: 'same', kind: 'check', scope: 'routine' }, ex(s, 'B', 'routine', 0));
      expect(columns(s)).toHaveLength(1);
      expect(ownItems(s, 'A')).toEqual([]);
      expect(cell(s, 'B', columns(s)[0]).has).toBe(true);
    });

    it('is blocked when the person already has the item or the destination list is full; blocked moves change nothing', () => {
      const full = Array.from({ length: 20 }, (_, i) => item(`f${i}`));
      const s = st([user('A', [item('Email'), item('Other')], full), user('B', [item('Email')])]);
      const to = { text: 'email', kind: 'check' as const, scope: 'routine' as const };
      expect(moveBlocked(s, 'A', 'routine', 1, to, ex(s, 'A', 'routine', 1))).toBe('A already has email');
      expect(moveToColumn(s, 'A', 'routine', 1, to, ex(s, 'A', 'routine', 1))).toBe(s);
      const toGoal = { text: 'Other', kind: 'check' as const, scope: 'goal' as const };
      expect(moveBlocked(s, 'A', 'routine', 1, toGoal, ex(s, 'A', 'routine', 1))).toBe("A's list is full (20 items)");
      expect(moveBlocked(s, 'A', 'routine', 1, { text: 'Other', kind: 'count', scope: 'routine' }, ex(s, 'A', 'routine', 1))).toBeNull();
    });

    it('refuses when the item at the index is not the expected one or the index is out of range', () => {
      const s = st([user('A', [item('First'), item('Second')])]);
      const e = ex(s, 'A', 'routine', 0);
      const to = { text: 'Dest', kind: 'check' as const, scope: 'routine' as const };
      const shifted = removeOwnItem(s, 'A', 'routine', 0);
      expect(moveToColumn(shifted, 'A', 'routine', 0, to, e)).toBe(shifted);
      expect(moveBlocked(shifted, 'A', 'routine', 0, to, e)).toMatch(/changed/);
      expect(moveToColumn(s, 'A', 'routine', 5, to, e)).toBe(s);
      expect(moveBlocked(s, 'A', 'routine', 5, to, e)).toMatch(/changed/);
      // no id: falls back to text + kind
      expect(moveToColumn(s, 'A', 'routine', 0, to, { text: 'Second', kind: 'check' })).toBe(s);
    });

    it('never moves an item the person added', () => {
      const s = st([user('A', [own('Mine')])]);
      expect(moveToColumn(s, 'A', 'routine', 0, outreach('check'), ex(s, 'A', 'routine', 0))).toBe(s);
    });
  });
  describe('choice columns', () => {
    const choice = (text: string, options: string[], id?: string): PlanItem => ({ ...item(text, 'choice'), options, ...(id ? { id } : {}) });
    const ex = (s: GridState, u: string, scope: 'routine' | 'goal', i: number) => {
      const it = s.users.find((x) => x.userId === u)![scope === 'routine' ? 'routines' : 'weeklyGoals'][i];
      return { id: it.id, text: it.text, kind: it.kind };
    };

    it("a column carries its first member's options; a member with other options still joins it", () => {
      const s = st([user('A', [choice('Client', ['Done', 'Blocked'])]), user('B', [choice('client', ['Yes', 'No'])])]);
      expect(columns(s)).toEqual([{ key: columnKey('Client', 'choice', 'routine'), text: 'Client', kind: 'choice', scope: 'routine', options: ['Done', 'Blocked'] }]);
      expect(ownItems(s, 'B')).toEqual([]);
      expect(columns(st([user('A', [item('E')]), user('B', [item('E')])]))[0]).not.toHaveProperty('options');
    });

    it("setting a column's options updates every member, keeps ids, and leaves others alone", () => {
      const a = choice('Client', ['Done', 'Blocked']);
      const b = choice('Client', ['Yes', 'No']);
      const s = st([user('A', [a]), user('B', [b]), user('C', [item('Other')])]);
      const t = setColumnOptions(s, columns(s)[0], ['Ok', 'Late']);
      expect(t.users[0].routines[0]).toMatchObject({ id: a.id, options: ['Ok', 'Late'] });
      expect(t.users[1].routines[0]).toMatchObject({ id: b.id, options: ['Ok', 'Late'] });
      expect(t.users[2]).toBe(s.users[2]);
      expect(columns(t)[0].options).toEqual(['Ok', 'Late']);
    });

    it('setting options on a pinned empty column updates the pin', () => {
      const s = addColumn(st([user('A')]), 'Client', 'choice', 'goal', ['Yes', 'No']);
      expect(columns(s)[0].options).toEqual(['Yes', 'No']);
      expect(columns(setColumnOptions(s, columns(s)[0], ['A', 'B']))[0].options).toEqual(['A', 'B']);
    });

    it("ticking a cell or Fill all gives new items the column's options", () => {
      let s = addColumn(st([user('A'), user('B')]), 'Client', 'choice', 'routine', ['Yes', 'No']);
      s = setCell(s, 'A', columns(s)[0], { has: true, target: null });
      expect(s.users[0].routines[0]).toMatchObject({ kind: 'choice', options: ['Yes', 'No'], target: null });
      s = fillColumn(s, columns(s)[0], { has: true, target: null });
      expect(s.users[1].routines[0].options).toEqual(['Yes', 'No']);
    });

    it("adding for one person takes the given options, or the column's when it joins one", () => {
      const s = st([user('A', [choice('Client', ['Done', 'Blocked'])]), user('B', [choice('Client', ['Done', 'Blocked'])]), user('C')]);
      const t = addOwnItem(s, 'C', 'Mood', 'choice', 'goal', 5, ['Good', 'Bad']);
      expect(t.users[2].weeklyGoals[0]).toMatchObject({ kind: 'choice', options: ['Good', 'Bad'], target: null });
      const u = addOwnItem(s, 'C', 'client', 'choice', 'routine', null, ['X', 'Y']);
      expect(u.users[2].routines[0].options).toEqual(['Done', 'Blocked']);
      expect(addOwnItem(s, 'C', 'Plain', 'check', 'routine', null, ['X', 'Y']).users[2].routines[0].options).toBeUndefined();
    });

    it('retyping to choice gives every member the options; switching group keeps them', () => {
      const s = st([user('A', [item('Client')]), user('B', [item('Client')])]);
      const t = retypeColumn(s, columns(s)[0], 'choice', 'routine', ['Yes', 'No']);
      expect(t.users[0].routines[0]).toMatchObject({ kind: 'choice', options: ['Yes', 'No'] });
      expect(t.users[0].routines[0]).not.toHaveProperty('id');
      expect(columns(t)[0].options).toEqual(['Yes', 'No']);
      const g = retypeColumn(t, columns(t)[0], 'choice', 'goal', columns(t)[0].options);
      expect(g.users[1].weeklyGoals[0].options).toEqual(['Yes', 'No']);
      expect(columns(retypeColumn(t, columns(t)[0], 'check', 'routine'))[0]).not.toHaveProperty('options');
    });

    it("moving into choice: a new column takes the given options; an existing one its own; a same-kind move keeps the id", () => {
      const s = st([user('A', [choice('Client', ['Done', 'Blocked'])]), user('B', [choice('Client', ['Done', 'Blocked'])]), user('C', [item('Solo'), choice('Pick', ['P', 'Q'])])]);
      const fresh = moveToColumn(s, 'C', 'routine', 0, { text: 'Mood', kind: 'choice', scope: 'routine', options: ['Good', 'Bad'] }, ex(s, 'C', 'routine', 0));
      expect(fresh.users[2].routines.at(-1)).toMatchObject({ text: 'Mood', kind: 'choice', options: ['Good', 'Bad'] });
      expect(columns(fresh).find((c) => c.text === 'Mood')?.options).toEqual(['Good', 'Bad']);
      const joined = moveToColumn(s, 'C', 'routine', 0, { text: 'client', kind: 'choice', scope: 'routine', options: ['X', 'Y'] }, ex(s, 'C', 'routine', 0));
      expect(joined.users[2].routines.at(-1)!.options).toEqual(['Done', 'Blocked']);
      const renamed = moveToColumn(s, 'C', 'routine', 1, { text: 'Client', kind: 'choice', scope: 'routine', options: ['X', 'Y'] }, ex(s, 'C', 'routine', 1));
      expect(renamed.users[2].routines[1]).toMatchObject({ id: s.users[2].routines[1].id, text: 'Client', options: ['Done', 'Blocked'] });
    });

    it('Publish sends choice options and no options for other kinds', () => {
      const s = st([user('A', [choice('Client', ['Yes', 'No']), item('E')], [], false)]);
      const [row] = rowsToSave([], s);
      expect(row.routines[0].options).toEqual(['Yes', 'No']);
      expect(row.routines[1]).not.toHaveProperty('options');
      const s0 = st([user('A', [choice('C', ['Yes', 'No'])]), user('B', [choice('C', ['Yes', 'No'])])]);
      const t = setColumnOptions(s0, columns(s0)[0], ['A', 'B']);
      expect(rowsToSave(s0.users, t).map((r) => r.routines[0])).toMatchObject([
        { id: s0.users[0].routines[0].id, options: ['A', 'B'] }, { id: s0.users[1].routines[0].id, options: ['A', 'B'] },
      ]);
    });
    it('a column with empty options does not hand them to a joining item', () => {
      const s = addColumn(st([user('A')]), 'Client', 'choice', 'routine', []);
      expect(addOwnItem(s, 'A', 'Client', 'choice', 'routine', null, ['Yes', 'No']).users[0].routines[0].options).toEqual(['Yes', 'No']);
    });
  });

  describe('targets from the item form', () => {
    it('retyping to Number/Hours gives every member the target (none when blank)', () => {
      const s = st([user('A', [item('Calls')]), user('B', [item('Calls')])]);
      const t = retypeColumn(s, columns(s)[0], 'count', 'routine', undefined, 40);
      expect(t.users.map((u) => u.routines[0].target)).toEqual([40, 40]);
      expect(retypeColumn(s, columns(s)[0], 'count', 'routine').users[0].routines[0].target).toBeNull();
      expect(retypeColumn(s, columns(s)[0], 'text', 'routine', undefined, 40).users[0].routines[0].target).toBeNull();
    });

    it("setColumnTarget sets every member's target and keeps ids; others untouched", () => {
      const a = item('Calls', 'count', 5);
      const s = st([user('A', [a]), user('B', [item('Calls', 'count', 7)]), user('C')]);
      const t = setColumnTarget(s, columns(s)[0], 9);
      expect(t.users[0].routines[0]).toMatchObject({ id: a.id, target: 9 });
      expect(t.users[1].routines[0].target).toBe(9);
      expect(t.users[2]).toBe(s.users[2]);
    });

    it('a move applies the entered target; blank keeps the existing one', () => {
      const s = st([user('A', [item('Calls', 'count', 5), item('Hrs', 'hours', 2)])]);
      const e = (i: number) => ({ id: s.users[0].routines[i].id, text: s.users[0].routines[i].text, kind: s.users[0].routines[i].kind });
      expect(moveToColumn(s, 'A', 'routine', 0, { text: 'Outreach', kind: 'count', scope: 'routine', target: 8 }, e(0)).users[0].routines[0]).toMatchObject({ id: s.users[0].routines[0].id, target: 8 });
      expect(moveToColumn(s, 'A', 'routine', 0, { text: 'Outreach', kind: 'count', scope: 'routine', target: null }, e(0)).users[0].routines[0].target).toBe(5);
      expect(moveToColumn(s, 'A', 'routine', 1, { text: 'Hrs', kind: 'count', scope: 'goal', target: 3 }, e(1)).users[0].weeklyGoals[0].target).toBe(3);
    });
  });
});
