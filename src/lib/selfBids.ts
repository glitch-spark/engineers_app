// Self bids tracked by the Bid Track extension on the Daily Plan (spec 2026-11-15-self-bids-extension-design.md):
// during the pilot the tracked count shows next to the typed one; once a profile switched, the typed number is
// "other applies" (not captured: LinkedIn, Indeed, another device), added to the tracked count by the server.

/** The line under a profile's self-bids row; null when the extension recorded nothing for it. */
export function profileSelfLine(pid: string, tracked: Record<string, number>, trackedProfiles: string[]): string | null {
  if (trackedProfiles.includes(pid)) return `Tracked ${tracked[pid] ?? 0} by the extension + other applies typed here`;
  return tracked[pid] ? `Tracked ${tracked[pid]} (extension)` : null;
}

/** What the form edits per profile: "other applies" for profiles on tracked counts (the saved day holds tracked +
 *  other there), the typed count for the rest. */
export function formSelfBids(
  byProfile: Record<string, number>, trackedProfiles: string[], other: Record<string, number>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [pid, n] of Object.entries(byProfile)) out[pid] = trackedProfiles.includes(pid) ? (other[pid] ?? 0) : n;
  return out;
}
