import { useState } from 'react';
import { Archive, Plus } from 'lucide-react';
import { hasTarget } from '../../api/endpoints';
import type { PlanItemIn, PlanItemKind } from '../../api/endpoints';

const MAX_ITEMS = 20;
const MAX_LENGTH = 200;
const PRESETS = ['Done, Blocked, N/A', 'Yes, No'];

const parseOptions = (raw: string) => raw.split(',').map((o) => o.trim()).filter(Boolean);

/** An inline message when a choice item's options would be refused (2-6, each up to 40 characters, no duplicates). */
export function optionsError(options: string[]): string | null {
  if (options.length < 2 || options.length > 6) return 'Add 2 to 6 options, separated by commas.';
  if (options.some((o) => o.length > 40)) return 'Each option can be up to 40 characters.';
  if (new Set(options.map((o) => o.toLowerCase())).size < options.length) return 'Options must be different from each other.';
  return null;
}

/** True when a live choice item's options would be refused; the panel holds Save until fixed. */
export const hasOptionsError = (items: PlanItemIn[]) =>
  items.some((i) => !i.archived && i.kind === 'choice' && optionsError(i.options ?? []) !== null);

/** Comma separated options; the box keeps what was typed (a trailing comma), the item gets the parsed list. */
export function OptionsField({ options, label, onChange }: { options: string[]; label: string; onChange: (o: string[]) => void }) {
  const [raw, setRaw] = useState(options.join(', '));
  const set = (value: string) => { setRaw(value); onChange(parseOptions(value)); };
  const error = optionsError(options);
  return (
    <div className="basis-full space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          className="input min-w-[10rem] flex-1"
          value={raw}
          placeholder="Options, separated by commas"
          aria-label={`${label} options`}
          onChange={(e) => set(e.target.value)}
        />
        {PRESETS.map((p) => (
          <button key={p} type="button" className="btn-outline text-xs" onClick={() => set(p)}>{p}</button>
        ))}
      </div>
      {error && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

/** Routines (`scope="routine"`, target per day) or weekly goals (`scope="goal"`, target per week):
 *  edit text, kind and target, add rows, archive. Archived saved items stay in the list (hidden) so the save keeps their id. */
export default function PlanItemsEditor({
  items,
  scope,
  onChange,
  readOnly = false,
  lockedFor,
  label = scope === 'routine' ? 'Routine' : 'Weekly goal',
}: {
  items: PlanItemIn[];
  scope: 'routine' | 'goal';
  onChange: (next: PlanItemIn[]) => void;
  readOnly?: boolean;
  /** Rows this returns true for show read-only with a lock; the rest edit, and new rows are the person's own. */
  lockedFor?: (item: PlanItemIn) => boolean;
  label?: string;
}) {
  const live = items.map((item, index) => ({ item, index })).filter((x) => !x.item.archived);
  // Labels number the editable rows only (locked rows are plain text).
  const editable = live.filter((x) => !lockedFor?.(x.item));
  const update = (index: number, patch: Partial<PlanItemIn>) =>
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  // Unsaved rows are dropped; saved ones are flagged so the server archives them.
  const archive = (index: number) =>
    onChange(items[index].id ? items.map((item, i) => (i === index ? { ...item, archived: true } : item)) : items.filter((_, i) => i !== index));
  const add = () => {
    if (live.length < MAX_ITEMS) onChange([...items, { text: '', kind: 'check', target: null, archived: false, ...(lockedFor ? { addedBy: 'self' as const } : {}) }]);
  };

  const readOnlyRow = ({ item, index }: { item: PlanItemIn; index: number }, locked: boolean) => (
    <li key={item.id ?? index} className="text-sm text-body">
      {locked && <span role="img" aria-label="Set by your admin" title="Set by your admin" className="mr-1">🔒</span>}
      {item.text}
      {item.kind === 'choice' && !!item.options?.length && <span className="text-xs text-muted"> · {item.options.join(' / ')}</span>}
      {hasTarget(item.kind) && item.target != null && (
        <span className="text-xs text-muted"> · {item.target}{item.kind === 'hours' ? 'h' : ''} {scope === 'routine' ? 'per day' : 'this week'}</span>
      )}
    </li>
  );

  if (readOnly) {
    return live.length ? (
      <ul className="space-y-1">{live.map((x) => readOnlyRow(x, false))}</ul>
    ) : (
      <p className="text-sm text-muted">None listed.</p>
    );
  }

  return (
    <div className="space-y-1.5">
      {live.map(({ item, index }) => lockedFor?.(item) ? (
        <ul key={item.id ?? `new-${index}`}>{readOnlyRow({ item, index }, true)}</ul>
      ) : (
        <div key={item.id ?? `new-${index}`} className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            className="input min-w-[10rem] flex-1"
            value={item.text}
            maxLength={MAX_LENGTH}
            placeholder="Describe it"
            aria-label={`${label} item ${editable.findIndex((x) => x.index === index) + 1}`}
            onChange={(e) => update(index, { text: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
          />
          <select
            className="input !w-24 shrink-0"
            value={item.kind}
            aria-label={`${label} item ${editable.findIndex((x) => x.index === index) + 1} kind`}
            onChange={(e) => {
              const kind = e.target.value as PlanItemKind;
              update(index, { kind, target: hasTarget(kind) ? item.target : null, ...(kind !== 'choice' && item.options?.length ? { options: [] } : {}) });
            }}
          >
            <option value="check">Check</option>
            <option value="count">Count</option>
            <option value="hours">Hours</option>
            <option value="log">Log</option>
            <option value="text">Text</option>
            <option value="choice">Choice</option>
          </select>
          {hasTarget(item.kind) && (
            <>
              <input
                type="number"
                min={0}
                step={item.kind === 'hours' ? 0.5 : 1}
                className="input !w-20 shrink-0"
                value={item.target ?? ''}
                aria-label={`${label} item ${editable.findIndex((x) => x.index === index) + 1} target`}
                onChange={(e) => update(index, { target: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) })}
              />
              <span className="text-xs text-muted">{scope === 'routine' ? 'per day' : 'this week'}</span>
            </>
          )}
          {item.kind === 'choice' && (
            <OptionsField options={item.options ?? []} label={`${label} item ${editable.findIndex((x) => x.index === index) + 1}`} onChange={(options) => update(index, { options })} />
          )}
          <button type="button" className="btn-icon" aria-label={`Archive ${label} item ${editable.findIndex((x) => x.index === index) + 1}`} onClick={() => archive(index)}>
            <Archive size={14} aria-hidden />
          </button>
        </div>
      ))}
      {live.length < MAX_ITEMS && (
        <button type="button" className="btn-outline text-xs" onClick={add}>
          <Plus size={14} className="mr-1" aria-hidden /> {lockedFor ? 'Add my item' : 'Add item'}
        </button>
      )}
    </div>
  );
}

/** Archived and empty rows are dropped (the server archives saved ids that are omitted); only counts and hours have a target, only choices options. */
export function cleanItems(items: PlanItemIn[]): PlanItemIn[] {
  return items
    .filter((i) => !i.archived)
    .map((i) => ({ ...i, text: i.text.trim(), target: hasTarget(i.kind) ? i.target : null, ...(i.kind === 'choice' ? { options: i.options ?? [] } : {}) }))
    .filter((i) => i.text);
}
