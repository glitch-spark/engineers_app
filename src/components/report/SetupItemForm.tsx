import { useEffect, useState, type FormEvent } from 'react';
import { hasTarget } from '../../api/endpoints';
import type { PlanItemKind } from '../../api/endpoints';
import { columnKey, type Column, type Scope } from '../../lib/teamGrid';
import type { Days } from '../../lib/planDays';
import DaysPicker from './DaysPicker';
import { OptionsField, optionsError } from './PlanItemsEditor';

export type ItemFormMode =
  | { mode: 'add'; userId: string | null; scope?: Scope }
  | { mode: 'rename'; col: Column }
  | { mode: 'type'; col: Column }
  | { mode: 'days'; col: Column }
  | { mode: 'move'; userId: string; index: number; from: Column; itemId?: string; personName: string };

export interface ItemFormValues {
  text: string;
  kind: PlanItemKind;
  scope: Scope;
  /** '' = everyone (a new column). */
  userId: string;
  target: number | null;
  /** Choice only. */
  options: string[];
  /** Daily to-dos only: null = Mon–Sat. */
  days: Days;
}

export const TYPES: { kind: PlanItemKind; name: string; hint: string }[] = [
  { kind: 'check', name: 'Checkbox', hint: 'Tick when done.' },
  { kind: 'count', name: 'Number', hint: 'Enter a count against a target, e.g. 40 / 50 emails.' },
  { kind: 'hours', name: 'Hours', hint: 'Enter time spent against a target, e.g. 1.5 / 2h.' },
  { kind: 'log', name: 'Profile log', hint: 'Pick a profile and write what changed; one row per profile.' },
  { kind: 'text', name: 'Text', hint: 'Write a short answer with details (up to 500 characters).' },
  { kind: 'choice', name: 'Choice', hint: 'Pick one option you list, plus an optional note.' },
];
export const typeName = (k: PlanItemKind) => TYPES.find((t) => t.kind === k)?.name ?? k;

/** The grid's inline form: add an item (everyone or one person), rename a column, change its type, or move a chip. */
export default function SetupItemForm({
  form, people, columns = [], onSubmit, onCancel, onOptionsInvalid,
}: {
  form: ItemFormMode;
  people: { id: string; name: string }[];
  /** The grid's columns: the move form's name suggestions, and the options of a Choice column an item would join. */
  columns?: Column[];
  /** Returns an error to show, or null when applied. */
  onSubmit: (v: ItemFormValues) => string | null;
  onCancel: () => void;
  /** Told while the Choice options typed here would be refused (the grid holds Publish). */
  onOptionsInvalid?: (bad: boolean) => void;
}) {
  const col = form.mode === 'add' ? null : form.mode === 'move' ? form.from : form.col;
  const [v, setV] = useState<ItemFormValues>({
    text: col?.text ?? '', kind: col?.kind ?? 'check', scope: col?.scope ?? (form.mode === 'add' ? form.scope : undefined) ?? 'routine',
    userId: form.mode === 'add' ? form.userId ?? '' : '', target: null, options: col?.options ?? [], days: col?.days ?? null,
  });
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<ItemFormValues>) => setV({ ...v, ...patch });

  // An item that lands in an existing Choice column takes that column's options.
  const joins = form.mode === 'move' || (form.mode === 'add' && v.userId)
    ? columns.find((c) => c.key === columnKey(v.text, v.kind, v.scope))
    : undefined;
  // A joined column without options (bad data) falls back to the field.
  const joinsOptions = joins?.options?.length ? joins.options : null;
  const daysOnly = form.mode === 'days';
  const showOptions = form.mode !== 'rename' && !daysOnly && v.kind === 'choice' && !joinsOptions;
  // Joining an existing column takes its days.
  const showDays = v.scope === 'routine' && (daysOnly || ((form.mode === 'add' || form.mode === 'move') && !joins));
  const showTarget = !daysOnly && hasTarget(v.kind) && (form.mode === 'type' || form.mode === 'move' || (form.mode === 'add' && !!v.userId));
  const optionsBad = showOptions && optionsError(v.options) !== null;
  useEffect(() => {
    onOptionsInvalid?.(optionsBad);
    return () => onOptionsInvalid?.(false);
  }, [optionsBad, onOptionsInvalid]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!optionsBad) setError(onSubmit(v));
  };

  const title = form.mode === 'add' ? 'Add item' : form.mode === 'move' ? `Move ${col?.text} for ${form.personName}` : form.mode === 'rename' ? `Rename ${col?.text}` : daysOnly ? `Days for ${col?.text}` : `Change type of ${col?.text}`;
  const names = [...new Set([...columns].sort((a, b) => Number(b.scope === v.scope) - Number(a.scope === v.scope)).map((c) => c.text))];

  return (
    <form
      noValidate
      onSubmit={submit}
      aria-label={title}
      className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900"
    >
      {form.mode !== 'type' && !daysOnly && (
        <label className="form-label flex flex-col gap-1">
          Item name
          <input
            className="input w-56"
            maxLength={200}
            value={v.text}
            autoFocus
            placeholder="e.g. LinkedIn connects"
            list={form.mode === 'move' ? 'move-column-names' : undefined}
            onChange={(e) => set({ text: e.target.value })}
          />
          {form.mode === 'move' && (
            <datalist id="move-column-names">{names.map((n) => <option key={n} value={n} />)}</datalist>
          )}
        </label>
      )}
      {(form.mode === 'add' || form.mode === 'move') && (
        <label className="form-label flex flex-col gap-1">
          Group
          <select className="input w-64" value={v.scope} onChange={(e) => set({ scope: e.target.value as Scope })}>
            <option value="routine">Daily to-do (on the days you pick)</option>
            <option value="goal">Weekly to-do (once this week)</option>
          </select>
        </label>
      )}
      {form.mode === 'add' && (
        <label className="form-label flex flex-col gap-1">
          For
          <select className="input w-48" value={v.userId} onChange={(e) => set({ userId: e.target.value })}>
            <option value="">Everyone (new column)</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name} only</option>)}
          </select>
        </label>
      )}
      {form.mode !== 'rename' && !daysOnly && (
        <fieldset className="m-0 basis-full border-0 p-0">
          <legend className="form-label mb-1">Type</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {TYPES.map((t) => (
              <label
                key={t.kind}
                className={`flex cursor-pointer gap-2 rounded-lg border bg-white p-2 text-left dark:bg-zinc-950 ${
                  v.kind === t.kind ? 'border-zinc-900 ring-1 ring-zinc-900 dark:border-zinc-100 dark:ring-zinc-100' : 'border-zinc-300 dark:border-zinc-700'
                }`}
              >
                <input type="radio" name="item-type" className="mt-0.5" checked={v.kind === t.kind} autoFocus={form.mode === 'type' && v.kind === t.kind}
                  onChange={() => set({ kind: t.kind })} />
                <span>
                  <b className="block text-sm text-strong">{t.name}</b>
                  <span className="text-xs text-muted">{t.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {form.mode === 'add' && !v.userId && hasTarget(v.kind) && (
        <p className="basis-full text-xs text-muted">Set targets in the cells or with Fill all</p>
      )}
      {showTarget && (
        <div className="flex items-end gap-2">
          <label className="form-label flex flex-col gap-1">
            Target
            <input
              type="number"
              min={0}
              step={v.kind === 'hours' ? 'any' : 1}
              className="input w-24"
              value={v.target ?? ''}
              onChange={(e) => {
                const n = Number(e.target.value);
                set({ target: e.target.value === '' || !(n >= 0) ? null : n });
              }}
            />
          </label>
          <span className="pb-2 text-xs text-muted">{v.scope === 'routine' ? 'per day' : 'this week'}</span>
        </div>
      )}
      {showDays && <DaysPicker value={v.days} onChange={(days) => set({ days })} />}
      {showOptions && <OptionsField options={v.options} label="Choice" onChange={(options) => set({ options })} />}
      {form.mode !== 'rename' && !daysOnly && v.kind === 'choice' && joinsOptions && (
        <p className="basis-full text-xs text-muted">Uses the column&apos;s options: {joinsOptions.join(' / ')}</p>
      )}
      <div className="flex gap-2">
        <button type="submit" className="btn text-sm" disabled={optionsBad}>{form.mode === 'add' ? 'Add' : form.mode === 'move' ? 'Move' : 'Save'}</button>
        <button type="button" className="btn-outline text-sm" onClick={onCancel}>Cancel</button>
      </div>
      {error && <p className="w-full text-sm text-red-600 dark:text-red-400" role="alert">{error}</p>}
    </form>
  );
}
