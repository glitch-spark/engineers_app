import type { PlanItemIn } from '../../api/endpoints';
import type { Scope } from '../../lib/teamGrid';
import ActionMenu from '../ActionMenu';

type Own = { scope: Scope; item: PlanItemIn; index: number };

/** One group's "Only this person" cell: a person's items outside any column, as chips, and "+ add". */
export default function OwnItemsCell({
  scope, className, name, items, onAdd, onRemove, onMove,
}: {
  scope: Scope;
  className: string;
  name: string;
  items: Own[];
  onAdd: () => void;
  onRemove: (o: Own) => void;
  onMove: (o: Own) => void;
}) {
  const word = scope === 'routine' ? 'routine' : 'goal';
  return (
    <td data-group={scope} className={`${className} min-w-[14rem] text-left`}>
      <div className="flex flex-wrap items-center gap-1">
        {items.map((o) => (
          <span key={o.index} className={scope === 'routine' ? 'badge-info' : 'badge-neutral'}>
            {o.item.text}
            {(o.item.kind === 'count' || o.item.kind === 'hours') && o.item.target != null && ` · ${o.item.target}${o.item.kind === 'hours' ? 'h' : ''}`}
            {o.item.addedBy === 'self' && <span className="text-muted"> · added by {name}</span>}
            {o.item.addedBy !== 'self' && (
              <ActionMenu
                label={`Actions for ${o.item.text} of ${name}`}
                className="ml-1 text-muted hover:text-zinc-900 dark:hover:text-zinc-100"
                items={[{ label: 'Move into column…', onSelect: () => onMove(o) }]}
              />
            )}
            <button type="button" className="ml-1 text-muted hover:text-red-600" aria-label={`Remove ${o.item.text} from ${name}`}
              onClick={() => onRemove(o)}>
              ✕
            </button>
          </span>
        ))}
        <button type="button" className="text-xs underline" aria-label={`Add ${word} for ${name}`} onClick={onAdd}>
          + add {word}
        </button>
      </div>
    </td>
  );
}
