import { Archive, Plus } from 'lucide-react';
import type { PlanItemIn, PlanItemKind } from '../../api/endpoints';

const MAX_ITEMS = 20;
const MAX_LENGTH = 200;

/** Routines (`scope="routine"`, target per day) or weekly goals (`scope="goal"`, target per week):
 *  edit text, kind and target, add rows, archive. Archived saved items stay in the list (hidden) so the save keeps their id. */
export default function PlanItemsEditor({
  items,
  scope,
  onChange,
  readOnly = false,
  label = scope === 'routine' ? 'Routine' : 'Weekly goal',
}: {
  items: PlanItemIn[];
  scope: 'routine' | 'goal';
  onChange: (next: PlanItemIn[]) => void;
  readOnly?: boolean;
  label?: string;
}) {
  const live = items.map((item, index) => ({ item, index })).filter((x) => !x.item.archived);
  const update = (index: number, patch: Partial<PlanItemIn>) =>
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  // Unsaved rows are dropped; saved ones are flagged so the server archives them.
  const archive = (index: number) =>
    onChange(items[index].id ? items.map((item, i) => (i === index ? { ...item, archived: true } : item)) : items.filter((_, i) => i !== index));
  const add = () => {
    if (live.length < MAX_ITEMS) onChange([...items, { text: '', kind: 'check', target: null, archived: false }]);
  };

  if (readOnly) {
    return live.length ? (
      <ul className="space-y-1">
        {live.map(({ item, index }) => (
          <li key={item.id ?? index} className="text-sm text-body">
            {item.text}
            {!['check', 'log'].includes(item.kind) && item.target != null && (
              <span className="text-xs text-muted"> · {item.target}{item.kind === 'hours' ? 'h' : ''} {scope === 'routine' ? 'per day' : 'this week'}</span>
            )}
          </li>
        ))}
      </ul>
    ) : (
      <p className="text-sm text-muted">None listed.</p>
    );
  }

  return (
    <div className="space-y-1.5">
      {live.map(({ item, index }, n) => (
        <div key={item.id ?? `new-${index}`} className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            className="input min-w-[10rem] flex-1"
            value={item.text}
            maxLength={MAX_LENGTH}
            placeholder="Describe it"
            aria-label={`${label} item ${n + 1}`}
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
            aria-label={`${label} item ${n + 1} kind`}
            onChange={(e) => {
              const kind = e.target.value as PlanItemKind;
              update(index, { kind, target: ['check', 'log'].includes(kind) ? null : item.target });
            }}
          >
            <option value="check">Check</option>
            <option value="count">Count</option>
            <option value="hours">Hours</option>
          </select>
          {!['check', 'log'].includes(item.kind) && (
            <>
              <input
                type="number"
                min={0}
                step={item.kind === 'hours' ? 0.5 : 1}
                className="input !w-20 shrink-0"
                value={item.target ?? ''}
                aria-label={`${label} item ${n + 1} target`}
                onChange={(e) => update(index, { target: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) })}
              />
              <span className="text-xs text-muted">{scope === 'routine' ? 'per day' : 'this week'}</span>
            </>
          )}
          <button type="button" className="btn-icon" aria-label={`Archive ${label} item ${n + 1}`} onClick={() => archive(index)}>
            <Archive size={14} aria-hidden />
          </button>
        </div>
      ))}
      {live.length < MAX_ITEMS && (
        <button type="button" className="btn-outline text-xs" onClick={add}>
          <Plus size={14} className="mr-1" aria-hidden /> Add item
        </button>
      )}
    </div>
  );
}

/** Archived and empty rows are dropped (the server archives saved ids that are omitted); a check item has no target. */
export function cleanItems(items: PlanItemIn[]): PlanItemIn[] {
  return items
    .filter((i) => !i.archived)
    .map((i) => ({ ...i, text: i.text.trim(), target: ['check', 'log'].includes(i.kind) ? null : i.target }))
    .filter((i) => i.text);
}
