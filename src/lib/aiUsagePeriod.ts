/** Bounds for the AI usage card. A date range (the shared filter's) becomes local midnights in the viewer's time
 * zone, sent as UTC instants (`to` exclusive) together with the zone name, so the backend buckets hours/days the
 * same way. */

export function viewerTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

function fromInput(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** [from, to) as ISO UTC for an inclusive `YYYY-MM-DD` range: local midnight of `from` to local midnight after `to`. */
export function aiUsageRange(range: { from: string; to: string }): { from: string; to: string } {
  return { from: fromInput(range.from).toISOString(), to: addDays(fromInput(range.to), 1).toISOString() };
}

/** Axis label for a backend bucket key: "13:00" for hours, "Oct 14" for days. */
export function bucketLabel(bucket: string): string {
  if (bucket.includes('T')) return bucket.slice(11, 16);
  return fromInput(bucket).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
