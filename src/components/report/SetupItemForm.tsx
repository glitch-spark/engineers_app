import { useState, type FormEvent } from 'react';
import { hasTarget } from '../../api/endpoints';
import type { PlanItemKind } from '../../api/endpoints';
import type { Column, Scope } from '../../lib/teamGrid';

export type ItemFormMode =
  | { mode: 'add'; userId: string | null }
  | { mode: 'rename'; col: Column }
  | { mode: 'type'; col: Column }
  | { mode: 'move'; userId: string; index: number; from: Column; itemId?: string; personName: string };

export interface ItemFormValues {
  text: string;
  kind: PlanItemKind;
  scope: Scope;
  /** '' = everyone (a new column). */
  userId: string;
  target: number | null;
}

const KINDS: [PlanItemKind, string][] = [
  ['count', 'Count (number)'], ['hours', 'Hours'], ['check', 'Checkbox'], ['log', 'Log (profile + note)'],
];

/** The grid's inline form: add an item (everyone or one person), rename a column, or change its type. */
export default function SetupItemForm({
  form, people, columnNames = [], onSubmit, onCancel,
}: {
  form: ItemFormMode;
  people: { id: string; name: string }[];
  /** Suggestions for the move form's name. */
  columnNames?: string[];
  /** Returns an error to show, or null when applied. */
  onSubmit: (v: ItemFormValues) => string | null;
  onCancel: () => void;
}) {
  const col = form.mode === 'add' ? null : form.mode === 'move' ? form.from : form.col;
  const [v, setV] = useState<ItemFormValues>({
    text: col?.text ?? '', kind: col?.kind ?? 'check', scope: col?.scope ?? 'routine',
    userId: form.mode === 'add' ? form.userId ?? '' : '', target: null,
  });
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<ItemFormValues>) => setV({ ...v, ...patch });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(onSubmit(v));
  };

  const title = form.mode === 'add' ? 'Add item' : form.mode === 'move' ? `Move ${col?.text} for ${form.personName}` : form.mode === 'rename' ? `Rename ${col?.text}` : `Change type of ${col?.text}`;

  return (
    <form
      noValidate
      onSubmit={submit}
      aria-label={title}
      className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900"
    >
      {form.mode !== 'type' && (
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
            <datalist id="move-column-names">{columnNames.map((n) => <option key={n} value={n} />)}</datalist>
          )}
        </label>
      )}
      {form.mode !== 'rename' && (
        <label className="form-label flex flex-col gap-1">
          Type
          <select className="input w-44" value={v.kind} autoFocus={form.mode === 'type'}
            onChange={(e) => set({ kind: e.target.value as PlanItemKind })}>
            {KINDS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </label>
      )}
      {(form.mode === 'add' || form.mode === 'move') && (
        <label className="form-label flex flex-col gap-1">
          When
          <select className="input w-48" value={v.scope} onChange={(e) => set({ scope: e.target.value as Scope })}>
            <option value="routine">Every day (routine)</option>
            <option value="goal">Once this week (goal)</option>
          </select>
        </label>
      )}
      {form.mode === 'add' && (
        <>
          <label className="form-label flex flex-col gap-1">
            For
            <select className="input w-48" value={v.userId} onChange={(e) => set({ userId: e.target.value })}>
              <option value="">Everyone (new column)</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name} only</option>)}
            </select>
          </label>
          {v.userId && hasTarget(v.kind) && (
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
          )}
        </>
      )}
      <div className="flex gap-2">
        <button type="submit" className="btn text-sm">{form.mode === 'add' ? 'Add' : form.mode === 'move' ? 'Move' : 'Save'}</button>
        <button type="button" className="btn-outline text-sm" onClick={onCancel}>Cancel</button>
      </div>
      {error && <p className="w-full text-sm text-red-600 dark:text-red-400" role="alert">{error}</p>}
    </form>
  );
}
