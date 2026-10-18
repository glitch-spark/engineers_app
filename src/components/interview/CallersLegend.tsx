import { Settings2 } from 'lucide-react';
import { useCallers } from '../../lib/useCallers';
import { CALLER_DOT, UNASSIGNED_CHIP } from '../../lib/callerColors';

/** Callers tab (List and Calendar): each caller's colour, and Manage callers for Admin / interview managers. */
export default function CallersLegend({ onManage }: { onManage: () => void }) {
  const { callers, canManage } = useCallers();
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs" aria-label="Caller colours">
        {callers.map((c) => (
          <li key={c._id} className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${CALLER_DOT[c.color] ?? 'bg-zinc-400'}`} aria-hidden />
            {c.name}
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-full border ${UNASSIGNED_CHIP}`} aria-hidden />
          No caller yet
        </li>
      </ul>
      {canManage && (
        <button type="button" className="btn-outline btn-sm" onClick={onManage}>
          <Settings2 size={14} aria-hidden /> Manage callers
        </button>
      )}
    </div>
  );
}
