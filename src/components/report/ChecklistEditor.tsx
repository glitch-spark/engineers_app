import { Plus, X } from 'lucide-react';
import type { ChecklistItem } from '../../api/endpoints';

const MAX_ITEMS = 20;
const MAX_LENGTH = 200;

/** Goal checklist: tick an item when it's done, edit text inline, add or remove rows. */
export default function ChecklistEditor({
  items,
  onChange,
  readOnly = false,
  allowTick = true,
  label = 'Goals',
}: {
  items: ChecklistItem[];
  onChange?: (next: ChecklistItem[]) => void;
  readOnly?: boolean;
  allowTick?: boolean;
  label?: string;
}) {
  const update = (index: number, patch: Partial<ChecklistItem>) =>
    onChange?.(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  const remove = (index: number) => onChange?.(items.filter((_, i) => i !== index));
  const add = () => {
    if (items.length < MAX_ITEMS) onChange?.([...items, { text: '', done: false }]);
  };

  if (readOnly) {
    return items.length ? (
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-sm">
            <span aria-hidden className={item.done ? 'text-success-600' : 'text-muted'}>{item.done ? '✓' : '○'}</span>
            <span className={item.done ? 'text-muted line-through' : 'text-body'}>{item.text}</span>
            <span className="sr-only">{item.done ? '(done)' : '(not done)'}</span>
          </li>
        ))}
      </ul>
    ) : (
      <p className="text-sm text-muted">No goals listed.</p>
    );
  }

  return (
    <div className="space-y-1.5">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          {allowTick && (
            <input
              type="checkbox"
              className="h-4 w-4 shrink-0"
              checked={item.done}
              aria-label={`Mark "${item.text || `${label} item ${i + 1}`}" done`}
              onChange={(e) => update(i, { done: e.target.checked })}
            />
          )}
          <input
            type="text"
            className="input flex-1"
            value={item.text}
            maxLength={MAX_LENGTH}
            placeholder="Describe the goal"
            aria-label={`${label} item ${i + 1}`}
            onChange={(e) => update(i, { text: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
          />
          <button type="button" className="btn-icon" aria-label={`Remove ${label} item ${i + 1}`} onClick={() => remove(i)}>
            <X size={14} aria-hidden />
          </button>
        </div>
      ))}
      {items.length < MAX_ITEMS && (
        <button type="button" className="btn-outline text-xs" onClick={add}>
          <Plus size={14} className="mr-1" aria-hidden /> Add item
        </button>
      )}
    </div>
  );
}

/** Items without text are dropped before saving. */
export function cleanItems(items: ChecklistItem[]): ChecklistItem[] {
  return items.map((i) => ({ ...i, text: i.text.trim() })).filter((i) => i.text);
}
