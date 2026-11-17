/** Marks money that couldn't be read for part of the period (a Bid Track listing failed): the figure beside it is
 * "—" rather than a partial sum, and this says why. */
export function PayReadNote({ error }: { error?: string | null }) {
  if (!error) return null;
  return (
    <span className="ml-1 text-xs text-amber-700 dark:text-amber-400" title="Couldn't read Bid Track for part of this period"
      role="img" aria-label="Couldn't read Bid Track for part of this period">⚠</span>
  );
}
