import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import useSWR from 'swr';
import * as api from '../../api/endpoints';
import { hasTarget } from '../../api/endpoints';
import type { PlanItemKind, TeamWeekUser } from '../../api/endpoints';
import { addDays, dateParam, parseDateParam } from '../../lib/reportWeek';
import {
  addColumn, addOwnItem, addTaken, cell, changed, columnKey, columns, fillColumn, fillTarget, isEmptyRow, keyTaken, movable, moveBlocked, moveToColumn, ownItems,
  removeColumn, removeOwnItem, renameColumn, retypeBlocked, retypeColumn, rowsToSave, satSplit, setCell, setColumnDays, setColumnOptions, setColumnTarget,
  setOwnWeek, setSat, fillSat, setTarget, weekStatus, type Column, type GridState, type SatKey, type Scope, type TargetKey,
} from '../../lib/teamGrid';
import ActionMenu from '../ActionMenu';
import OwnItemsCell from './OwnItemsCell';
import { daysLabel } from '../../lib/planDays';
import SetupItemForm, { typeName, type ItemFormMode, type ItemFormValues } from './SetupItemForm';

const TARGETS: { key: TargetKey; label: string }[] = [
  { key: 'bidsSelf', label: 'Bids self' },
  { key: 'bidsBidder', label: 'Bidder bids' },
  { key: 'interviewsSelf', label: 'Interviews' },
];
const MAX_ITEMS = 20;
const isSat = (k: TargetKey) => k === 'bidsSelf' || k === 'bidsBidder';
const TAKEN = 'An item with that name, type and group already exists.';
const listName = (scope: Scope) => (scope === 'routine' ? 'daily to-dos' : 'weekly to-dos');
const nameOf = (u: TeamWeekUser) => u.name || u.userId;
const isBox = (kind: PlanItemKind) => !hasTarget(kind);
/** '' → null (cleared); a number ≥ 0; anything else → undefined (ignored). */
const parseNum = (raw: string): number | null | undefined => {
  if (raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

const TH = 'border-b border-zinc-200 px-2 py-1.5 text-xs font-medium dark:border-zinc-800';
const TD = 'border-b border-zinc-100 px-1.5 py-1 text-center align-middle dark:border-zinc-800';
const STICKY = 'sticky left-0 z-10 w-36 min-w-[9rem] max-w-[9rem] bg-white !text-left dark:bg-zinc-950';
/** No spinner arrows: they hide digits in a narrow box. */
const NO_SPIN = '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';
const NUM =
  `h-8 w-[4.5rem] rounded-md border border-zinc-300 bg-white px-1.5 text-center text-sm tabular-nums placeholder:text-zinc-400 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/30 dark:border-zinc-700 dark:bg-zinc-900 ${NO_SPIN}`;
const SAT_NUM = `h-6 w-14 rounded border border-zinc-300 bg-white px-1 text-center text-xs tabular-nums placeholder:text-zinc-400 focus:border-accent-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 ${NO_SPIN}`;
const SCOPES: Scope[] = ['routine', 'goal'];
/** A coloured stripe per group on its headers (the body stays plain). */
const HEAD_TINT: Record<Scope, string> = { routine: 'border-t-2 border-t-violet-400', goal: 'border-t-2 border-t-cyan-400' };
const TINT: Record<Scope, string> = { routine: '', goal: '' };
const TOGGLE =
  "relative h-4 w-7 cursor-pointer appearance-none rounded-full bg-zinc-300 transition-colors before:absolute before:left-0.5 before:top-0.5 before:h-3 before:w-3 before:rounded-full before:bg-white before:transition-transform before:content-[''] checked:bg-accent-500 checked:before:translate-x-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-500 dark:bg-zinc-600";

/** `was`: last week's value when it changed ('—' = new this week: no note, nothing new to compare). */
function Td({ was, scope, children }: { was?: string | null; scope?: Scope; children: ReactNode }) {
  const note = was && was !== '—' ? was : null;
  return (
    <td data-group={scope} className={`${TD} ${note ? 'bg-amber-50/70 dark:bg-amber-900/10' : ''}`} title={note ? `Last week: ${note}` : undefined}>
      {children}
      {note && <span className="block text-[10px] leading-tight text-amber-700 dark:text-amber-300">was {note}</span>}
    </td>
  );
}

/** Admin: every person's week in one grid, published in one save. */
export default function SetupGrid({ week, onDirtyChange }: { week: string; onDirtyChange?: (dirty: boolean) => void }) {
  const prevWeek = dateParam(addDays(parseDateParam(week) ?? new Date(), -7));
  const [state, setState] = useState<GridState | null>(null);
  const [snapshot, setSnapshot] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [publishError, setPublishError] = useState(false);
  const [menuError, setMenuError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ItemFormMode | null>(null);
  const [formOptionsBad, setFormOptionsBad] = useState(false);
  const onOptionsInvalid = useCallback((bad: boolean) => setFormOptionsBad(bad), []);
  // Rows whose save failed: kept as edited by the one re-read right after Publish, then forgotten.
  const keep = useRef<Set<string>>(new Set());

  const dirty = !!state && JSON.stringify(state) !== snapshot;
  const cur = useSWR(['team-week', week], () => api.getTeamWeek(week), {
    revalidateOnFocus: !dirty, revalidateOnReconnect: !dirty,
  });
  const prev = useSWR(['team-week', prevWeek], () => api.getTeamWeek(prevWeek), { revalidateOnFocus: false });

  useEffect(() => {
    const users = cur.data?.users;
    if (!users) return;
    // Pin the loaded columns: unticking cells must not turn a column into chips before the save.
    const base = columns({ users, pinned: [] });
    setSnapshot(JSON.stringify({ users, pinned: base }));
    const ids = keep.current;
    keep.current = new Set();
    setState((s) => {
      if (!ids.size || !s) return { users, pinned: base };
      const kept = (u: TeamWeekUser) => (ids.has(u.userId) && s.users.find((x) => x.userId === u.userId)) || u;
      return { users: users.map(kept), pinned: [...base, ...s.pinned.filter((p) => !base.some((b) => b.key === p.key))] };
    });
  }, [cur.data]);

  // Close the move form once its chip is no longer where it was (an earlier chip was removed, a cell toggled...).
  useEffect(() => {
    if (form?.mode === 'move' && state && !movable(state, form.userId, form.from.scope, form.index, { id: form.itemId, text: form.from.text, kind: form.from.kind })) setForm(null);
  }, [state, form]);

  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const prevUsers = prev.data?.users;
  const prevKeys = useMemo(
    () => new Set((prevUsers ?? []).flatMap((u) => [
      ...u.routines.map((i) => columnKey(i.text, i.kind, 'routine')),
      ...u.weeklyGoals.map((i) => columnKey(i.text, i.kind, 'goal')),
    ])),
    [prevUsers],
  );

  if (cur.error) {
    return (
      <div className="panel p-4 text-sm text-red-600 dark:text-red-400" role="alert">
        Couldn&apos;t load the team.{' '}
        <button type="button" className="underline" onClick={() => cur.mutate()}>Retry</button>
      </div>
    );
  }
  if (!state || !cur.data) {
    return (
      <div className="panel space-y-2 p-4" aria-busy="true">
        {Array.from({ length: 5 }, (_, i) => <div key={i} className="skeleton h-8 w-full" />)}
      </div>
    );
  }
  if (!state.users.length) return <div className="panel p-4 text-sm text-muted">No teammates yet.</div>;

  const saved = cur.data.users;
  const toSave = rowsToSave(saved, state);
  const status = weekStatus(saved, state);
  const cols = columns(state);
  const byScope = (scope: Scope) => cols.filter((c) => c.scope === scope);
  const people = state.users.map((u) => ({ id: u.userId, name: nameOf(u) }));

  const chip =
    status === 'published' ? ['badge-success', 'Published']
      : status === 'none' ? ['badge-neutral', 'Not planned yet']
        : state.users.some((u) => !u.exists && !isEmptyRow(u)) ? ['badge-warning', 'Draft · copied from last week']
          : ['badge-warning', 'Draft · unsaved edits'];

  /** `target`: count / hours target for every member (null = none on a new type, unchanged on the same type). */
  const retype = (c: Column, kind: PlanItemKind, scope: Scope, options = c.options, target: number | null = null): string | null => {
    const key = columnKey(c.text, kind, scope);
    if (key === c.key) {
      // Same type: a plain edit, ids kept. Saving a Choice column aligns every member to its options.
      if (kind === 'choice' && options) setState(setColumnOptions(state, c, options));
      else if (target !== null) setState(setColumnTarget(state, c, target));
      return null;
    }
    if (keyTaken(state, key)) return TAKEN;
    const blocked = retypeBlocked(state, c, scope);
    if (blocked.length) {
      return `${blocked.map(nameOf).join(', ')} already ${blocked.length === 1 ? 'has' : 'have'} ${MAX_ITEMS} ${listName(scope)}.`;
    }
    setState(retypeColumn(state, c, kind, scope, options, target));
    return null;
  };

  const submitForm = (v: ItemFormValues): string | null => {
    if (!form) return null;
    const text = v.text.trim();
    if (form.mode !== 'type' && !text) return 'Enter a name.';
    if (form.mode === 'add') {
      if (addTaken(state, columnKey(text, v.kind, v.scope), v.userId || undefined)) return TAKEN;
      if (!v.userId) setState(addColumn(state, text, v.kind, v.scope, v.options, v.days));
      else {
        const u = state.users.find((x) => x.userId === v.userId);
        if (!u) return null;
        const list = v.scope === 'routine' ? u.routines : u.weeklyGoals;
        if (list.length >= MAX_ITEMS) return `${nameOf(u)} already has ${MAX_ITEMS} ${listName(v.scope)}.`;
        setState(addOwnItem(state, v.userId, text, v.kind, v.scope, v.target, v.options, v.days));
      }
    } else if (form.mode === 'move') {
      if (text.length > 200) return 'Name is too long (200 characters max).';
      const to = { text, kind: v.kind, scope: v.scope, options: v.options, target: v.target, days: v.days };
      const exp = { id: form.itemId, text: form.from.text, kind: form.from.kind };
      const err = moveBlocked(state, form.userId, form.from.scope, form.index, to, exp);
      if (err) return err;
      setState(moveToColumn(state, form.userId, form.from.scope, form.index, to, exp));
    } else if (form.mode === 'days') {
      setState(setColumnDays(state, form.col, v.days));
    } else if (form.mode === 'rename') {
      const key = columnKey(text, form.col.kind, form.col.scope);
      if (key !== form.col.key && keyTaken(state, key)) return TAKEN;
      setState(renameColumn(state, form.col, text));
    } else {
      const err = retype(form.col, v.kind, form.col.scope, v.options, v.target);
      if (err) return err;
    }
    setForm(null);
    return null;
  };

  const openForm = (f: ItemFormMode) => {
    setMenuError(null);
    setForm(f);
  };

  const publish = async () => {
    setSaving(true);
    setPublishError(false);
    try {
      const res = await api.putTeamWeek(week, toSave);
      const failed = Object.fromEntries(
        res.results.filter((r) => !r.ok).map((r) => [r.userId, r.error || "Could not save this person's week."]),
      );
      keep.current = new Set(Object.keys(failed));
      setErrors(failed);
      const fresh = await cur.mutate();
      // An unchanged (or failed) re-read never reaches the effect: the edited rows are still in place, so forget them.
      if (!fresh || JSON.stringify(fresh.users) === JSON.stringify(saved)) keep.current = new Set();
    } catch {
      setPublishError(true);
    } finally {
      setSaving(false);
    }
  };

  const numberInput = (label: string, value: number | null, onValue: (n: number | null) => void, hours = false, placeholder?: string) => (
    <input
      type="number"
      min={0}
      step={hours ? 'any' : 1}
      aria-label={label}
      className={NUM}
      value={value ?? ''}
      placeholder={placeholder}
      onChange={(e) => {
        const n = parseNum(e.target.value);
        if (n !== undefined) onValue(n);
      }}
    />
  );

  /** Saturday's share of a bid target: blank = even over Mon–Sat; a number = Saturday's, Mon–Fri split the rest. */
  const satCell = (u: TeamWeekUser, name: string, k: TargetKey, label: string) => {
    const sat = u.satGoal?.[k as SatKey] ?? null;
    const split = satSplit(u.goal[k], sat);
    const over = sat != null && sat > u.goal[k];
    return (
      <>
        <label className="mt-1 flex items-center justify-center gap-1 text-[11px] text-muted" title="Saturday's bids. Blank = even split over Mon–Sat.">
          Sat
          <input type="number" min={0} aria-label={`${name} ${label} Saturday`} placeholder="—" value={sat ?? ''}
            className={`${SAT_NUM} ${over ? 'border-red-500' : ''}`}
            onChange={(e) => { const n = parseNum(e.target.value); if (n !== undefined) setState(setSat(state, u.userId, k as SatKey, n)); }} />
        </label>
        {over ? (
          <p className="text-[11px] text-red-600 dark:text-red-400" role="alert">More than the week</p>
        ) : split && u.goal[k] > 0 && (
          <p className="whitespace-nowrap text-[10px] leading-tight text-muted">Mon–Fri {split.weekday} · {split.sat ? `Sat ${split.sat}` : 'no Sat'}</p>
        )}
      </>
    );
  };

  const itemCell = (u: TeamWeekUser, c: Column) => {
    const v = cell(state, u.userId, c);
    const label = `${nameOf(u)} ${c.text}`;
    return (
      <Td key={c.key} scope={c.scope} was={changed(prevUsers, state, u.userId, c)?.was}>
        {isBox(c.kind) ? (
          <input type="checkbox" aria-label={label} checked={v.has}
            onChange={(e) => setState(setCell(state, u.userId, c, { has: e.target.checked, target: null }))} />
        ) : (
          numberInput(label, v.has ? v.target : null,
            (n) => setState(setCell(state, u.userId, c, { has: n !== null, target: n })),
            c.kind === 'hours', v.has ? 'target' : undefined)
        )}
      </Td>
    );
  };

  const header = (c: Column) => {
    const other: Scope = c.scope === 'routine' ? 'goal' : 'routine';
    const isNew = !!prevUsers && !prevKeys.has(c.key);
    return (
      <th key={c.key} scope="col" data-group={c.scope} className={`${TH} ${HEAD_TINT[c.scope]} min-w-[7.5rem] align-bottom`}>
        <ActionMenu
          label={`${c.text} column`}
          className="w-full rounded px-1 text-center hover:bg-zinc-100 focus-ring dark:hover:bg-zinc-800"
          items={[
            { label: 'Rename', onSelect: () => openForm({ mode: 'rename', col: c }) },
            { label: 'Change type', onSelect: () => openForm({ mode: 'type', col: c }) },
            ...(c.scope === 'routine' ? [{ label: `Runs on: ${daysLabel(c.days)}…`, onSelect: () => openForm({ mode: 'days', col: c }) }] : []),
            {
              label: c.scope === 'routine' ? 'Make weekly to-do' : 'Make daily to-do',
              onSelect: () => { setForm(null); setMenuError(retype(c, c.kind, other)); },
            },
            { label: 'Remove from this week', danger: true, onSelect: () => { setMenuError(null); setState(removeColumn(state, c)); } },
          ]}
        >
          <span className="line-clamp-2 block max-w-[10rem] break-words text-strong" title={c.text}>{c.text} ▾</span>
          <small className="block max-w-[10rem] truncate font-normal text-muted" title={c.options?.join(' / ')}>
            {typeName(c.kind)}{c.options?.length ? ` · ${c.options.join(' / ')}` : ''}
            {c.scope === 'routine' && c.days && (
              <span className="ml-1 rounded bg-violet-100 px-1 text-[10px] font-semibold text-violet-800 dark:bg-violet-900/40 dark:text-violet-200">{daysLabel(c.days)}</span>
            )}
          </small>
          {isNew && <span className="sr-only"> (new this week)</span>}
        </ActionMenu>
      </th>
    );
  };

  return (
    <section className="panel min-w-0 space-y-3 p-4" aria-label="Plan the week">
      <div className="flex flex-wrap items-center gap-3">
        <span className={chip[0]}>{chip[1]}</span>
        <span className="text-xs text-muted">
          {status === 'published' ? 'Live. Edits apply from the next unsubmitted day.' : status === 'draft' ? 'People see it once published.' : ''}
        </span>
        <button type="button" className="btn ml-auto text-sm" disabled={saving || toSave.length === 0 || formOptionsBad} onClick={publish}
          title={formOptionsBad ? 'Fix the Choice options in the form first.' : undefined}>
          {saving ? 'Publishing…' : 'Publish week'}
        </button>
      </div>

      {publishError && <p className="text-sm text-red-600 dark:text-red-400" role="alert">Could not publish the week.</p>}
      {menuError && <p className="text-sm text-red-600 dark:text-red-400" role="alert">{menuError}</p>}
      {/* Locked while publishing: the re-read replaces every saved row, so later typing would be lost. */}
      <fieldset disabled={saving} className="m-0 min-w-0 space-y-3 border-0 p-0">
        {form && (
          <SetupItemForm key={JSON.stringify(form)} form={form} people={people} columns={cols} onSubmit={submitForm} onCancel={() => setForm(null)} onOptionsInvalid={onOptionsInvalid} />
        )}

        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead className="bg-zinc-50 text-muted dark:bg-zinc-900">
              <tr>
                <th scope="col" rowSpan={2} className={`${TH} ${STICKY}`}>Person</th>
                <th scope="col" rowSpan={2} className={`${TH} w-14`} title="On: the person plans their own week. Off: you plan it and they see it view-only.">Own plan</th>
                <th scope="colgroup" colSpan={TARGETS.length} className={`${TH} border-t-2 border-t-zinc-400 text-[11px] uppercase tracking-wide`}>Week targets</th>
                {SCOPES.map((sc) => (
                  <th key={sc} scope="colgroup" colSpan={byScope(sc).length + 1} data-group={sc} className={`${TH} ${HEAD_TINT[sc]} text-[11px] uppercase tracking-wide`}>
                    {sc === 'routine' ? 'Daily to-dos' : 'Weekly to-dos'}
                  </th>
                ))}
                <th scope="col" rowSpan={2} className={TH}>
                  <button type="button" className="btn-outline whitespace-nowrap text-xs" onClick={() => openForm({ mode: 'add', userId: null })}>
                    + item
                  </button>
                </th>
              </tr>
              <tr>
                {TARGETS.map((t) => <th key={t.key} scope="col" className={`${TH} whitespace-nowrap text-strong`}>{t.label}</th>)}
                {SCOPES.map((sc) => [
                  ...byScope(sc).map(header),
                  <th key={`own-${sc}`} scope="col" data-group={sc} className={`${TH} ${HEAD_TINT[sc]} whitespace-nowrap`}>Only this person</th>,
                ])}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b-2 border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900/60">
                <th scope="row" className={`${TD} ${STICKY} px-3 text-xs font-medium text-muted`}>Fill all ↓</th>
                <td className={TD} />
                {TARGETS.map((t) => (
                  <td key={t.key} className={TD}>
                    <input type="number" min={0} aria-label={`Fill all ${t.label}`} className={NUM}
                      onChange={(e) => { const n = parseNum(e.target.value); if (n !== undefined) setState(fillTarget(state, t.key, n ?? 0)); }} />
                    {isSat(t.key) && (
                      <label className="mt-1 flex items-center justify-center gap-1 text-[11px] text-muted">
                        Sat
                        <input type="number" min={0} aria-label={`Fill all ${t.label} Saturday`} placeholder="—" className={SAT_NUM}
                          onChange={(e) => { const n = parseNum(e.target.value); if (n !== undefined) setState(fillSat(state, t.key as SatKey, n)); }} />
                      </label>
                    )}
                  </td>
                ))}
                {SCOPES.map((sc) => [
                  ...byScope(sc).map((c) => (
                    <td key={c.key} className={TD}>
                      {isBox(c.kind) ? (
                        <input type="checkbox" aria-label={`Fill all ${c.text}`}
                          onChange={(e) => setState(fillColumn(state, c, { has: e.target.checked, target: null }))} />
                      ) : (
                        <input type="number" min={0} step={c.kind === 'hours' ? 'any' : 1} aria-label={`Fill all ${c.text}`} className={NUM}
                          onChange={(e) => {
                            const n = parseNum(e.target.value);
                            if (n !== undefined) setState(fillColumn(state, c, { has: n !== null, target: n }));
                          }} />
                      )}
                    </td>
                  )),
                  <td key={`own-${sc}`} className={TD} />,
                ])}
                <td className={TD} />
              </tr>
              {state.users.map((u) => {
                const name = nameOf(u);
                const own = ownItems(state, u.userId);
                return (
                  <tr key={u.userId} className="group hover:bg-zinc-50/60 dark:hover:bg-zinc-900/40">
                    <th scope="row" className={`${TD} ${STICKY} px-3 font-medium text-strong`}>
                      <span className="block truncate" title={name}>{name}</span>
                      {errors[u.userId] && (
                        <p className="whitespace-normal text-xs font-normal text-red-600 dark:text-red-400" role="alert">{errors[u.userId]}</p>
                      )}
                    </th>
                    <td className={TD}>
                      <input type="checkbox" role="switch" className={TOGGLE} aria-label={`${name} plans own week`} checked={u.plansOwnWeek}
                        onChange={(e) => setState(setOwnWeek(state, u.userId, e.target.checked))} />
                    </td>
                    {TARGETS.map((t) => (
                      <Td key={t.key} was={changed(prevUsers, state, u.userId, t.key)?.was}>
                        {numberInput(`${name} ${t.label}`, u.goal[t.key] || null, (n) => setState(setTarget(state, u.userId, t.key, n ?? 0)))}
                        {isSat(t.key) && satCell(u, name, t.key, t.label)}
                      </Td>
                    ))}
                    {SCOPES.map((sc) => [
                      ...byScope(sc).map((c) => itemCell(u, c)),
                      <OwnItemsCell
                        key={`own-${sc}`}
                        scope={sc}
                        className={`${TD} ${TINT[sc]}`}
                        name={name}
                        items={own.filter((o) => o.scope === sc)}
                        onAdd={() => openForm({ mode: 'add', userId: u.userId, scope: sc })}
                        onRemove={(o) => setState(removeOwnItem(state, u.userId, o.scope, o.index))}
                        onMove={(o) => openForm({
                          mode: 'move', userId: u.userId, index: o.index, personName: name, itemId: 'id' in o.item ? o.item.id : undefined,
                          from: { key: '', text: o.item.text, kind: o.item.kind, scope: o.scope, days: o.item.days ?? null, ...(o.item.kind === 'choice' ? { options: o.item.options ?? [] } : {}) },
                        })}
                      />,
                    ])}
                    <td className={TD} />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </fieldset>
      <p className="text-xs text-muted">
        Amber cells changed since last week (was …). Own plan on = that person plans their own week; off = you plan it, view-only for them.
        Sat blank = bids split evenly Mon–Sat. Click a column header to rename, re-type, set its days or remove it.
      </p>
    </section>
  );
}
