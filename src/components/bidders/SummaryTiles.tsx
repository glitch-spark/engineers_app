import type { ReactNode } from 'react';

export interface Tile {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  /** A button under the value, e.g. "Review all". */
  action?: { label: string; onClick: () => void };
  tone?: 'default' | 'warning' | 'success' | 'danger';
}

const TONE: Record<NonNullable<Tile['tone']>, string> = {
  default: '',
  success: 'text-emerald-700 dark:text-emerald-300',
  warning: 'text-amber-700 dark:text-amber-300',
  danger: 'text-red-700 dark:text-red-300',
};

/** A row of stat cards (2 per row on phones, up to 4 on wide screens). */
export default function SummaryTiles({ tiles }: { tiles: Tile[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((t) => (
        <div key={t.label} className="stat-card flex flex-col p-4">
          <p className="stat-card-label">{t.label}</p>
          <p className={`stat-card-value mt-1 ${TONE[t.tone ?? 'default']}`}>{t.value}</p>
          {t.hint && <p className="mt-1 text-xs text-muted">{t.hint}</p>}
          {t.action && (
            <button type="button" className="btn-outline mt-3 self-start text-xs" onClick={t.action.onClick}>
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
