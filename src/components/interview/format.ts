const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Oct 1" for a round date (YYYY-MM-DD strings are read as local calendar dates). */
export function formatScheduledDate(iso?: string | null): string {
  if (!iso) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [, m, d] = iso.split('-').map(Number);
    return `${MONTH_NAMES[m - 1]} ${d}`;
  }
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;
}
