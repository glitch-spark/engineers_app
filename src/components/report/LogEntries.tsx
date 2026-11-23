import { Plus, X } from 'lucide-react';
import type { LogEntry, PlanProfile } from '../../api/endpoints';

const MAX_ENTRIES = 20;
const MAX_NOTE = 200;

/** What gets sent: rows with a blank note are dropped (the server rejects them). */
export const cleanEntries = (entries: LogEntry[]): LogEntry[] =>
  entries.map((e) => ({ ...e, note: e.note.trim() })).filter((e) => e.note);

/** A log item's rows for one day: which profile, and what changed. */
export default function LogEntries({
  entries, profiles, disabled, onChange,
}: {
  entries: LogEntry[];
  profiles: PlanProfile[];
  disabled: boolean;
  onChange: (next: LogEntry[]) => void;
}) {
  const set = (i: number, patch: Partial<LogEntry>) => onChange(entries.map((e, n) => (n === i ? { ...e, ...patch } : e)));
  const add = () => {
    const live = profiles.filter((p) => !p.archived);
    const next = live.find((p) => !entries.some((e) => e.profileId === p.id)) ?? live[0];
    onChange([...entries, { profileId: next?.id ?? null, note: '' }]);
  };
  return (
    <div className="mt-1 space-y-1.5 pl-6">
      {entries.map((e, i) => (
        <div key={i} className="flex items-center gap-2">
          {e.profileId !== null && (
            <select
              className="input !w-40 shrink-0"
              aria-label={`Profile ${i + 1}`}
              disabled={disabled}
              value={e.profileId}
              onChange={(ev) => set(i, { profileId: ev.target.value })}
            >
              {profiles.filter((p) => !p.archived || p.id === e.profileId).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
          <input
            type="text"
            className="input min-w-0 flex-1"
            aria-label={`What changed ${i + 1}`}
            placeholder="What changed"
            maxLength={MAX_NOTE}
            disabled={disabled}
            value={e.note}
            onChange={(ev) => set(i, { note: ev.target.value })}
          />
          {!disabled && (
            <button type="button" className="btn-icon" aria-label={`Remove entry ${i + 1}`} onClick={() => onChange(entries.filter((_, n) => n !== i))}>
              <X size={14} aria-hidden />
            </button>
          )}
        </div>
      ))}
      {!disabled && entries.length < MAX_ENTRIES && (
        <button type="button" className="text-sm font-medium text-accent-700 underline-offset-2 hover:underline dark:text-accent-300" onClick={add}>
          <Plus size={14} className="mr-1 inline" aria-hidden />Add profile
        </button>
      )}
    </div>
  );
}
