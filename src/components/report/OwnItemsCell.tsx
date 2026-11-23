import type { PlanItemIn } from '../../api/endpoints';
import type { Scope } from '../../lib/teamGrid';
import ActionMenu from '../ActionMenu';

type Own = { scope: Scope; item: PlanItemIn; index: number };

/** One group's "Only this person" cell: a person's items outside any column, as chips, and a "+" (shown on row hover;
 *  always on touch screens and when focused). */
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
  const word = scope === 'routine' ? 'daily to-do' : 'weekly to-do';
  return (
    <td data-group={scope} className={`${className} min-w-[12rem] max-w-[18rem] text-left`}>
      <div className="flex flex-wrap items-center gap-1">
        {items.map((o) => (
          <span key={o.index} className={`inline-flex max-w-full items-center rounded-md border px-1.5 py-0.5 text-xs ${scope === 'routine' ? 'border-violet-200 bg-violet-50 text-violet-900 dark:border-violet-800 dark:bg-violet-900/30 dark:text-violet-100' : 'border-cyan-200 bg-cyan-50 text-cyan-900 dark:border-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-100'}`}>
            <span className="truncate" title={o.item.text}>
            {o.item.text}
            {(o.item.kind === 'count' || o.item.kind === 'hours') && o.item.target != null && ` · ${o.item.target}${o.item.kind === 'hours' ? 'h' : ''}`}
            {o.item.addedBy === 'self' && <span className="text-muted"> · added by {name}</span>}
            </span>
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
        <button type="button" aria-label={`Add ${word} for ${name}`} title={`Add a ${word} for ${name} only`} onClick={onAdd}
          className="h-6 w-6 rounded-md border border-dashed border-zinc-300 text-sm leading-none text-muted hover:border-zinc-500 hover:text-strong focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 dark:border-zinc-700">
          +
        </button>
      </div>
    </td>
  );
}
