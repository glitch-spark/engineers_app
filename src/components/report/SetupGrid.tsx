import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import useSWR from 'swr';
import * as api from '../../api/endpoints';
import { hasTarget } from '../../api/endpoints';
import type { PlanItemKind, TeamWeekUser } from '../../api/endpoints';
import { addDays, dateParam, parseDateParam } from '../../lib/reportWeek';
import {
  addColumn, addOwnItem, cell, changed, columnKey, columns, fillColumn, fillTarget, isEmptyRow, keyTaken, ownItems,
  removeColumn, removeOwnItem, renameColumn, retypeBlocked, retypeColumn, rowsToSave, setCell, setOwnWeek, setTarget,
  weekStatus, type Column, type GridState, type Scope, type TargetKey,
} from '../../lib/teamGrid';
import ActionMenu from '../ActionMenu';
import SetupItemForm, { type ItemFormMode, type ItemFormValues } from './SetupItemForm';

const TARGETS: { key: TargetKey; label: string }[] = [
  { key: 'bidsSelf', label: 'Bids self' },
  { key: 'bidsBidder', label: 'Bidder bids' },
  { key: 'interviewsSelf', label: 'Interviews' },
];
const MAX_ITEMS = 20;
const TAKEN = 'An item with that name, type and when already exists.';
const listName = (scope: Scope) => (scope === 'routine' ? 'daily routines' : 'weekly goals');
const nameOf = (u: TeamWeekUser) => u.name || u.userId;
const isBox = (kind: PlanItemKind) => !hasTarget(kind);
/** '' → null (cleared); a number ≥ 0; anything else → undefined (ignored). */
const parseNum = (raw: string): number | null | undefined => {
  if (raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

const TH = 'border border-zinc-200 px-2 py-1.5 text-xs font-medium dark:border-zinc-800';
const TD = 'border border-zinc-200 p-1 text-center align-middle dark:border-zinc-800';
const STICKY = 'sticky left-0 z-10 bg-white text-left dark:bg-zinc-950';
const NUM = 'input w-20 px-2 py-1 text-center';

function Td({ was, children }: { was?: string | null; children: ReactNode }) {
  return (
    <td className={`${TD} ${was ? 'bg-accent-50 dark:bg-accent-900/20' : ''}`}>
      {children}
      {was && <span className="block text-[10px] text-accent-700 dark:text-accent-300">was {was}</span>}
    </td>
  );
}

/** Admin: every person's week in one grid, published in one save. */
export default function SetupGrid({ week }: { week: string }) {
  const prevWeek = dateParam(addDays(parseDateParam(week) ?? new Date(), -7));
  const [state, setState] = useState<GridState | null>(null);
  const [snapshot, setSnapshot] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [publishError, setPublishError] = useState(false);
  const [menuError, setMenuError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ItemFormMode | null>(null);
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
  const routineCols = byScope('routine');
  const goalCols = byScope('goal');
  const itemCols = [...routineCols, ...goalCols];
  const people = state.users.map((u) => ({ id: u.userId, name: nameOf(u) }));

  const chip =
    status === 'published' ? ['badge-success', 'Published']
      : status === 'none' ? ['badge-neutral', 'Not planned yet']
        : state.users.some((u) => !u.exists && !isEmptyRow(u)) ? ['badge-warning', 'Draft · copied from last week']
          : ['badge-warning', 'Draft · unsaved edits'];

  const retype = (c: Column, kind: PlanItemKind, scope: Scope): string | null => {
    const key = columnKey(c.text, kind, scope);
    if (key === c.key) return null;
    if (keyTaken(state, key)) return TAKEN;
    const blocked = retypeBlocked(state, c, scope);
    if (blocked.length) {
      return `${blocked.map(nameOf).join(', ')} already ${blocked.length === 1 ? 'has' : 'have'} ${MAX_ITEMS} ${listName(scope)}.`;
    }
    setState(retypeColumn(state, c, kind, scope));
    return null;
  };

  const submitForm = (v: ItemFormValues): string | null => {
    if (!form) return null;
    const text = v.text.trim();
    if (form.mode !== 'type' && !text) return 'Enter a name.';
    if (form.mode === 'add') {
      if (keyTaken(state, columnKey(text, v.kind, v.scope))) return TAKEN;
      if (!v.userId) setState(addColumn(state, text, v.kind, v.scope));
      else {
        const u = state.users.find((x) => x.userId === v.userId);
        if (!u) return null;
        const list = v.scope === 'routine' ? u.routines : u.weeklyGoals;
        if (list.length >= MAX_ITEMS) return `${nameOf(u)} already has ${MAX_ITEMS} ${listName(v.scope)}.`;
        setState(addOwnItem(state, v.userId, text, v.kind, v.scope, v.target));
      }
    } else if (form.mode === 'rename') {
      const key = columnKey(text, form.col.kind, form.col.scope);
      if (key !== form.col.key && keyTaken(state, key)) return TAKEN;
      setState(renameColumn(state, form.col, text));
    } else {
      const err = retype(form.col, v.kind, form.col.scope);
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

  const itemCell = (u: TeamWeekUser, c: Column) => {
    const v = cell(state, u.userId, c);
    const label = `${nameOf(u)} ${c.text}`;
    return (
      <Td key={c.key} was={changed(prevUsers, state, u.userId, c)?.was}>
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
      <th key={c.key} scope="col" className={`${TH} ${isNew ? 'bg-accent-50 dark:bg-accent-900/20' : ''}`}>
        <ActionMenu
          label={`${c.text} column`}
          className="w-full rounded px-1 text-center hover:bg-zinc-100 focus-ring dark:hover:bg-zinc-800"
          items={[
            { label: 'Rename', onSelect: () => openForm({ mode: 'rename', col: c }) },
            { label: 'Change type', onSelect: () => openForm({ mode: 'type', col: c }) },
            {
              label: c.scope === 'routine' ? 'Make weekly goal' : 'Make daily routine',
              onSelect: () => { setForm(null); setMenuError(retype(c, c.kind, other)); },
            },
            { label: 'Remove from this week', danger: true, onSelect: () => { setMenuError(null); setState(removeColumn(state, c)); } },
          ]}
        >
          <span className="text-strong">{c.text} ▾</span>
          <small className="block font-normal text-muted">{c.kind} · {c.scope === 'routine' ? 'daily' : 'week'}</small>
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
        <button type="button" className="btn ml-auto text-sm" disabled={saving || toSave.length === 0} onClick={publish}>
          {saving ? 'Publishing…' : 'Publish week'}
        </button>
      </div>

      {publishError && <p className="text-sm text-red-600 dark:text-red-400" role="alert">Could not publish the week.</p>}
      {menuError && <p className="text-sm text-red-600 dark:text-red-400" role="alert">{menuError}</p>}
      {/* Locked while publishing: the re-read replaces every saved row, so later typing would be lost. */}
      <fieldset disabled={saving} className="m-0 min-w-0 space-y-3 border-0 p-0">
        {form && (
          <SetupItemForm key={JSON.stringify(form)} form={form} people={people} onSubmit={submitForm} onCancel={() => setForm(null)} />
        )}

        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead className="bg-zinc-50 text-muted dark:bg-zinc-900">
              <tr>
                <th scope="col" rowSpan={2} className={`${TH} ${STICKY}`}>Person</th>
                <th scope="col" rowSpan={2} className={TH}>Plans own week</th>
                <th scope="colgroup" colSpan={TARGETS.length} className={`${TH} uppercase tracking-wide`}>Week targets</th>
                {routineCols.length > 0 && (
                  <th scope="colgroup" colSpan={routineCols.length} className={`${TH} uppercase tracking-wide`}>Daily routines</th>
                )}
                {goalCols.length > 0 && (
                  <th scope="colgroup" colSpan={goalCols.length} className={`${TH} uppercase tracking-wide`}>Weekly goals</th>
                )}
                <th scope="col" rowSpan={2} className={TH}>Only this person</th>
                <th scope="col" rowSpan={2} className={TH}>
                  <button type="button" className="btn-outline whitespace-nowrap text-xs" onClick={() => openForm({ mode: 'add', userId: null })}>
                    + item
                  </button>
                </th>
              </tr>
              <tr>
                {TARGETS.map((t) => <th key={t.key} scope="col" className={`${TH} text-strong`}>{t.label}</th>)}
                {itemCols.map(header)}
              </tr>
            </thead>
            <tbody>
              {state.users.map((u) => {
                const name = nameOf(u);
                return (
                  <tr key={u.userId}>
                    <th scope="row" className={`${TD} ${STICKY} whitespace-nowrap px-3 font-medium text-strong`}>
                      {name}
                      {errors[u.userId] && (
                        <p className="whitespace-normal text-xs font-normal text-red-600 dark:text-red-400" role="alert">{errors[u.userId]}</p>
                      )}
                    </th>
                    <td className={TD}>
                      <input type="checkbox" aria-label={`${name} plans own week`} checked={u.plansOwnWeek}
                        onChange={(e) => setState(setOwnWeek(state, u.userId, e.target.checked))} />
                    </td>
                    {TARGETS.map((t) => (
                      <Td key={t.key} was={changed(prevUsers, state, u.userId, t.key)?.was}>
                        {numberInput(`${name} ${t.label}`, u.goal[t.key] || null, (n) => setState(setTarget(state, u.userId, t.key, n ?? 0)))}
                      </Td>
                    ))}
                    {itemCols.map((c) => itemCell(u, c))}
                    <td className={`${TD} min-w-[14rem] text-left`}>
                      <div className="flex flex-wrap items-center gap-1">
                        {ownItems(state, u.userId).map((o) => (
                          <span key={`${o.scope}${o.index}`} className={o.scope === 'routine' ? 'badge-info' : 'badge-neutral'}>
                            {o.item.text}
                            {o.item.target != null && ` · ${o.item.target}`}
                            <span className="text-muted"> · {o.scope === 'routine' ? 'daily' : 'week'}</span>
                            <button type="button" className="ml-1 text-muted hover:text-red-600" aria-label={`Remove ${o.item.text} from ${name}`}
                              onClick={() => setState(removeOwnItem(state, u.userId, o.scope, o.index))}>
                              ✕
                            </button>
                          </span>
                        ))}
                        <button type="button" className="text-xs underline" aria-label={`Add item for ${name}`}
                          onClick={() => openForm({ mode: 'add', userId: u.userId })}>
                          + add
                        </button>
                      </div>
                    </td>
                    <td className={TD} />
                  </tr>
                );
              })}
              <tr className="bg-amber-50/60 dark:bg-amber-900/10">
                <th scope="row" className={`${TD} ${STICKY} px-3 font-medium text-amber-800 dark:text-amber-300`}>Fill all ↓</th>
                <td className={TD} />
                {TARGETS.map((t) => (
                  <td key={t.key} className={TD}>
                    <input type="number" min={0} aria-label={`Fill all ${t.label}`} className={NUM}
                      onChange={(e) => { const n = parseNum(e.target.value); if (n !== undefined) setState(fillTarget(state, t.key, n ?? 0)); }} />
                  </td>
                ))}
                {itemCols.map((c) => (
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
                ))}
                <td className={TD} />
                <td className={TD} />
              </tr>
            </tbody>
          </table>
        </div>
      </fieldset>
      <p className="text-xs text-muted">
        Highlighted: new or changed since last week. Plans own week on = that person edits their own week; off = view-only for them.
        Click a column header to rename, re-type or remove it for this week.
      </p>
    </section>
  );
}
