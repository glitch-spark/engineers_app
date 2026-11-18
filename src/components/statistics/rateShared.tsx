/** Small pieces shared by the Statistics tabs: the server-update note, headline tiles, series colors and `pct`. */

/** The page is newer than the server it talks to (the frontend deploys before the backend is approved): say so
 * instead of crashing on fields the older server doesn't send. */
export function ServerUpdateNote() {
  return (
    <p className="panel p-6 text-sm text-muted" role="status">
      These statistics need the latest server update. Reload this page once the backend is deployed.
    </p>
  );
}

/** A row of headline numbers. */
export function StatTiles({ tiles }: { tiles: { label: string; value: string }[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((t) => (
        <div key={t.label} className="stat-card p-4">
          <p className="stat-card-label">{t.label}</p>
          <p className="stat-card-value mt-1 tabular-nums">{t.value}</p>
        </div>
      ))}
    </div>
  );
}

/**
 * Series colors, validated with the dataviz palette checker on this app's surfaces (white / zinc-950): You = blue,
 * Team = orange (categorical slots 1 and 2). Other users are a neutral gray: identity there comes from each dot's
 * name label and the table, not color.
 */
export function seriesColors(dark: boolean) {
  return dark
    ? { me: '#3987e5', team: '#d95926', other: '#a1a1aa', surface: '#09090b' }
    : { me: '#2a78d6', team: '#eb6834', other: '#71717a', surface: '#ffffff' };
}

export function pct(rate: number | null | undefined): string {
  if (rate == null) return '—';
  const v = rate * 100;
  return `${v > 0 && v < 1 ? v.toFixed(2) : v.toFixed(1)}%`; // plan-based rates are often under 1%
}
