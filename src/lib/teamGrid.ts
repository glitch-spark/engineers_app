import { hasTarget } from '../api/endpoints';
import type { PlanItem, PlanItemIn, PlanItemKind, TeamWeekRowIn, TeamWeekUser } from '../api/endpoints';

export type Scope = 'routine' | 'goal';
export type TargetKey = 'bidsSelf' | 'bidsBidder' | 'interviewsSelf';
/** `options`: a Choice column's options (its first member's); absent for other kinds. */
export interface Column { key: string; text: string; kind: PlanItemKind; scope: Scope; options?: string[] }
/** pinned = columns added in this session (kept even if fewer than two people have them). */
export interface GridState { users: TeamWeekUser[]; pinned: Column[] }

const MAX_ITEMS = 20;
type Cell = { has: boolean; target: number | null };
type ListKey = 'routines' | 'weeklyGoals';

const listKey = (scope: Scope): ListKey => (scope === 'routine' ? 'routines' : 'weeklyGoals');
const norm = (t: string) => t.trim().replace(/\s+/g, ' ');
const tidy = (t: string) => norm(t);
/** `{ options }` for a choice, nothing for other kinds (spread into items and columns). */
const opts = (kind: PlanItemKind, options?: string[]) => (kind === 'choice' ? { options: options ?? [] } : {});

export const columnKey = (text: string, kind: PlanItemKind, scope: Scope): string =>
  `${scope}|${kind}|${norm(text).toLowerCase()}`;

/** A person's own item (`addedBy: 'self'`) never matches a column or another item: it gets a key nothing else has. */
const itemKey = (i: PlanItemIn, scope: Scope) => (i.addedBy === 'self' ? '\0own' : columnKey(i.text, i.kind, scope));
const SCOPES: Scope[] = ['routine', 'goal'];

export function columns(s: GridState): Column[] {
  const out: Column[] = [];
  for (const scope of SCOPES) {
    const seen = new Map<string, { col: Column; users: Set<string> }>();
    for (const u of s.users) {
      for (const i of u[listKey(scope)]) {
        if (i.addedBy === 'self') continue;
        const key = itemKey(i, scope);
        const e = seen.get(key) ?? { col: { key, text: tidy(i.text), kind: i.kind, scope, ...opts(i.kind, i.options) }, users: new Set() };
        e.users.add(u.userId);
        seen.set(key, e);
      }
    }
    const pinned = s.pinned.filter((p) => p.scope === scope);
    for (const p of pinned) if (!seen.has(p.key)) seen.set(p.key, { col: p, users: new Set() });
    const pinKeys = new Set(pinned.map((p) => p.key));
    for (const e of seen.values()) if (e.users.size >= 2 || pinKeys.has(e.col.key)) out.push(e.col);
  }
  return out;
}

/** `index` is the item's position in that user's list for `scope` (what `removeOwnItem` takes). */
export function ownItems(s: GridState, userId: string): { scope: Scope; item: PlanItemIn; index: number }[] {
  const u = s.users.find((x) => x.userId === userId);
  if (!u) return [];
  const shared = new Set(columns(s).map((c) => c.key));
  return SCOPES.flatMap((scope) =>
    u[listKey(scope)].flatMap((item, index) => (shared.has(itemKey(item, scope)) ? [] : [{ scope, item, index }])),
  );
}

const userHas = (u: TeamWeekUser, key: string) =>
  SCOPES.some((scope) => u[listKey(scope)].some((i) => itemKey(i, scope) === key));
const columnTaken = (s: GridState, key: string) => columns(s).some((c) => c.key === key);

/** A column, or anyone's item, already has this key (rename / retype). */
export const keyTaken = (s: GridState, key: string): boolean => columnTaken(s, key) || s.users.some((u) => userHas(u, key));

/** Adding for everyone: only a column blocks (one person's item becomes the column); for one person: only their item. */
export const addTaken = (s: GridState, key: string, userId?: string): boolean =>
  userId ? s.users.some((u) => u.userId === userId && userHas(u, key)) : columnTaken(s, key);

const mapUsers = (s: GridState, f: (u: TeamWeekUser) => TeamWeekUser): GridState => ({ ...s, users: s.users.map(f) });
const mapUser = (s: GridState, userId: string, f: (u: TeamWeekUser) => TeamWeekUser): GridState =>
  mapUsers(s, (u) => (u.userId === userId ? f(u) : u));

const findItem = (u: TeamWeekUser, c: Column) => u[listKey(c.scope)].find((i) => itemKey(i, c.scope) === c.key);

export function cell(s: GridState, userId: string, c: Column): Cell {
  const u = s.users.find((x) => x.userId === userId);
  const i = u && findItem(u, c);
  return { has: !!i, target: i && hasTarget(c.kind) ? i.target : null };
}

const applyCell = (u: TeamWeekUser, c: Column, v: Cell): TeamWeekUser => {
  const k = listKey(c.scope);
  const list = u[k];
  const present = list.some((i) => itemKey(i, c.scope) === c.key);
  const target = hasTarget(c.kind) ? v.target : null;
  if (!v.has) return present ? { ...u, [k]: list.filter((i) => itemKey(i, c.scope) !== c.key) } : u;
  if (present) {
    if (!hasTarget(c.kind)) return u;
    return { ...u, [k]: list.map((i) => (itemKey(i, c.scope) === c.key ? { ...i, target } : i)) };
  }
  if (list.length >= MAX_ITEMS) return u;
  return { ...u, [k]: [...list, { text: c.text, kind: c.kind, target, archived: false, ...opts(c.kind, c.options) }] };
};

export const setCell = (s: GridState, userId: string, c: Column, v: Cell): GridState =>
  mapUser(s, userId, (u) => applyCell(u, c, v));

export const fillColumn = (s: GridState, c: Column, v: Cell): GridState => mapUsers(s, (u) => applyCell(u, c, v));

export const setTarget = (s: GridState, userId: string, k: TargetKey, n: number): GridState =>
  mapUser(s, userId, (u) => ({ ...u, goal: { ...u.goal, [k]: n } }));

export const fillTarget = (s: GridState, k: TargetKey, n: number): GridState =>
  mapUsers(s, (u) => ({ ...u, goal: { ...u.goal, [k]: n } }));

export function addColumn(s: GridState, text: string, kind: PlanItemKind, scope: Scope, options?: string[]): GridState {
  const key = columnKey(text, kind, scope);
  if (s.pinned.some((p) => p.key === key)) return s;
  return { ...s, pinned: [...s.pinned, { key, text: tidy(text), kind, scope, ...opts(kind, options) }] };
}

/** An item joining an existing column takes the column's options; otherwise the given ones. */
const optionsFor = (s: GridState, key: string, options?: string[]) => {
  const own = columns(s).find((c) => c.key === key)?.options;
  return own?.length ? own : options;
};

export const addOwnItem = (
  s: GridState, userId: string, text: string, kind: PlanItemKind, scope: Scope, target: number | null, options?: string[],
): GridState => {
  const k = listKey(scope);
  const u = s.users.find((x) => x.userId === userId);
  if (!u || u[k].length >= MAX_ITEMS) return s;
  const o = opts(kind, optionsFor(s, columnKey(text, kind, scope), options));
  const item: PlanItemIn = { text: tidy(text), kind, target: hasTarget(kind) ? target : null, archived: false, ...o };
  return mapUser(s, userId, (x) => ({ ...x, [k]: [...x[k], item] }));
};

/** `index` is the position within that user's list for `scope`. */
export const removeOwnItem = (s: GridState, userId: string, scope: Scope, index: number): GridState => {
  const k = listKey(scope);
  return mapUser(s, userId, (u) => ({ ...u, [k]: u[k].filter((_, i) => i !== index) }));
};

/** `target`: null / absent keeps the item's target where both kinds have one. */
type Dest = { text: string; kind: PlanItemKind; scope: Scope; options?: string[]; target?: number | null };

/** What the caller believes sits at `index`: its id when it has one, else text + kind. */
export type Expect = { id?: string; text: string; kind: PlanItemKind };
const STALE = 'That item changed — open Move again';
/** The item at `index` if it is still the expected one (the list may have shifted since the form opened). */
export function movable(s: GridState, userId: string, scope: Scope, index: number, e: Expect): PlanItemIn | undefined {
  const it = s.users.find((x) => x.userId === userId)?.[listKey(scope)][index];
  const id = it && 'id' in it ? it.id : undefined;
  return it && (e.id ? id === e.id : it.text === e.text && it.kind === e.kind) ? it : undefined;
}

/** Why chip `index` of `userId`'s `scope` list cannot move to `to`, or null. */
export function moveBlocked(s: GridState, userId: string, scope: Scope, index: number, to: Dest, e: Expect): string | null {
  const u = s.users.find((x) => x.userId === userId);
  if (!u || !movable(s, userId, scope, index, e)) return STALE;
  const name = u.name || u.userId;
  const key = columnKey(to.text, to.kind, to.scope);
  const taken = SCOPES.some((sc) => u[listKey(sc)].some((i, n) => !(sc === scope && n === index) && itemKey(i, sc) === key));
  if (taken) return `${name} already has ${tidy(to.text)}`;
  if (to.scope !== scope && u[listKey(to.scope)].length >= MAX_ITEMS) return `${name}'s list is full (${MAX_ITEMS} items)`;
  return null;
}

/** Same kind and scope: a rename (id and target kept). Otherwise the id is dropped (the server archives and recreates). */
export function moveToColumn(s: GridState, userId: string, scope: Scope, index: number, to: Dest, e: Expect): GridState {
  const it = movable(s, userId, scope, index, e);
  if (!it || it.addedBy === 'self' || moveBlocked(s, userId, scope, index, to, e)) return s;
  const text = tidy(to.text);
  const key = columnKey(text, to.kind, to.scope);
  const o = opts(to.kind, optionsFor(s, key, to.options));
  const pin = columns(s).some((c) => c.key === key) ? s : addColumn(s, text, to.kind, to.scope, o.options);
  if (to.kind === it.kind && to.scope === scope) {
    return mapUser(pin, userId, (x) => ({ ...x, [listKey(scope)]: x[listKey(scope)].map((i, n) => (n === index ? { ...i, text, ...o, ...(to.target != null && hasTarget(to.kind) ? { target: to.target } : {}) } : i)) }));
  }
  const moved: PlanItemIn = { text, kind: to.kind, target: hasTarget(to.kind) ? to.target ?? (hasTarget(it.kind) ? it.target : null) : null, archived: false, ...o };
  const from = listKey(scope);
  const dest = listKey(to.scope);
  return mapUser(pin, userId, (x) => {
    const kept = { ...x, [from]: x[from].filter((_, n) => n !== index) };
    return { ...kept, [dest]: [...kept[dest], moved] };
  });
}

const rewritePinned = (s: GridState, c: Column, next: Column | null): Column[] =>
  s.pinned.flatMap((p) => (p.key !== c.key ? [p] : next ? [next] : []));

export function renameColumn(s: GridState, c: Column, text: string): GridState {
  const next = { ...c, text: tidy(text), key: columnKey(text, c.kind, c.scope) };
  const k = listKey(c.scope);
  const users = s.users.map((u) => ({
    ...u,
    [k]: u[k].map((i) => (itemKey(i, c.scope) === c.key ? { ...i, text: next.text } : i)),
  }));
  return { users, pinned: rewritePinned(s, c, next) };
}

/** People who have the column's item but whose list for `scope` is full: `retypeColumn` would drop their item. */
export const retypeBlocked = (s: GridState, c: Column, scope: Scope): TeamWeekUser[] =>
  c.scope === scope ? [] : s.users.filter((u) => findItem(u, c) && u[listKey(scope)].length >= MAX_ITEMS);

/** New items get `options` (choice) and `target` (count / hours; null = none). */
export function retypeColumn(
  s: GridState, c: Column, kind: PlanItemKind, scope: Scope, options?: string[], target: number | null = null,
): GridState {
  const o = opts(kind, options);
  const next: Column = { key: columnKey(c.text, kind, scope), text: c.text, kind, scope, ...o };
  const from = listKey(c.scope);
  const to = listKey(scope);
  const users = s.users.map((u) => {
    const hit = u[from].some((i) => itemKey(i, c.scope) === c.key);
    if (!hit) return u;
    const kept = { ...u, [from]: u[from].filter((i) => itemKey(i, c.scope) !== c.key) };
    if (kept[to].length >= MAX_ITEMS) return kept;
    // no id: the server archives the old item and creates this one
    return { ...kept, [to]: [...kept[to], { text: c.text, kind, target: hasTarget(kind) ? target : null, archived: false, ...o }] };
  });
  return { users, pinned: rewritePinned(s, c, next) };
}

/** A choice column's options for every member (ids kept: a plain edit server-side). */
export function setColumnOptions(s: GridState, c: Column, options: string[]): GridState {
  const k = listKey(c.scope);
  const users = s.users.map((u) => (findItem(u, c) ? { ...u, [k]: u[k].map((i) => (itemKey(i, c.scope) === c.key ? { ...i, options } : i)) } : u));
  return { users, pinned: rewritePinned(s, c, { ...c, options }) };
}

/** A count / hours column's target for every member (ids kept). */
export const setColumnTarget = (s: GridState, c: Column, target: number): GridState =>
  hasTarget(c.kind) ? mapUsers(s, (u) => (findItem(u, c) ? applyCell(u, c, { has: true, target }) : u)) : s;

export const removeColumn = (s: GridState, c: Column): GridState => ({
  users: s.users.map((u) => applyCell(u, c, { has: false, target: null })),
  pinned: rewritePinned(s, c, null),
});

export const setOwnWeek = (s: GridState, userId: string, on: boolean): GridState =>
  mapUser(s, userId, (u) => ({ ...u, plansOwnWeek: on }));

export const isEmptyRow = (u: TeamWeekUser): boolean =>
  u.goal.bidsSelf === 0 && u.goal.bidsBidder === 0 && u.goal.interviewsSelf === 0 &&
  u.routines.length === 0 && u.weeklyGoals.length === 0;

const toItems = (l: (PlanItem | PlanItemIn)[]): PlanItemIn[] =>
  l.map((i) => ({ ...('id' in i && i.id ? { id: i.id } : {}), text: i.text, kind: i.kind, target: i.target, archived: i.archived, ...opts(i.kind, i.options) }));

/** Saved live own items that are gone from `u`: the server keeps any own item it is not told was removed. */
const removedOwn = (u: TeamWeekUser, was?: TeamWeekUser): string[] => {
  const kept = new Set([...u.routines, ...u.weeklyGoals].map((i) => ('id' in i ? i.id : undefined)));
  return was ? [...was.routines, ...was.weeklyGoals].filter((i) => i.addedBy === 'self' && !i.archived && !kept.has(i.id)).map((i) => i.id) : [];
};

const toRow = (u: TeamWeekUser, was?: TeamWeekUser): TeamWeekRowIn => ({
  userId: u.userId,
  plansOwnWeek: u.plansOwnWeek,
  goal: { bidsSelf: u.goal.bidsSelf, bidsBidder: u.goal.bidsBidder, interviewsSelf: u.goal.interviewsSelf },
  routines: toItems(u.routines),
  weeklyGoals: toItems(u.weeklyGoals),
  exists: u.exists,
  removedIds: removedOwn(u, was),
});

export function rowsToSave(saved: TeamWeekUser[], s: GridState): TeamWeekRowIn[] {
  const out: TeamWeekRowIn[] = [];
  for (const u of s.users) {
    const was = saved.find((x) => x.userId === u.userId);
    // The server skips a plan-less empty row but still writes its switch.
    if (!u.exists && isEmptyRow(u) && (!was || was.plansOwnWeek === u.plansOwnWeek)) continue;
    const row = toRow(u, was);
    if (!u.exists || !was || JSON.stringify(toRow(was)) !== JSON.stringify(row)) out.push(row);
  }
  return out;
}

export function changed(
  prev: TeamWeekUser[] | undefined, s: GridState, userId: string, c: Column | TargetKey,
): { was: string } | null {
  const p = prev?.find((u) => u.userId === userId);
  const cur = s.users.find((u) => u.userId === userId);
  if (!p || !cur) return null;
  if (typeof c === 'string') return p.goal[c] === cur.goal[c] ? null : { was: String(p.goal[c]) };
  const was = cell({ users: [p], pinned: [] }, userId, c);
  const now = cell(s, userId, c);
  if (was.has === now.has && was.target === now.target) return null;
  return { was: !was.has ? '—' : hasTarget(c.kind) && was.target !== null ? String(was.target) : '✓' };
}

export function weekStatus(saved: TeamWeekUser[], s: GridState): 'published' | 'draft' | 'none' {
  if (s.users.every(isEmptyRow) && !s.users.some((u) => u.exists)) return 'none';
  const ok = s.users.filter((u) => !isEmptyRow(u)).every((u) => u.exists);
  return ok && rowsToSave(saved, s).length === 0 ? 'published' : 'draft';
}
