/**
 * What the Daily plan page shows, from the signed-in user and the URL (`user`, `view`). Pure, so it can be tested.
 *
 * - Every signed-in user may open the team table and any teammate's board (`?user=<id>`), read-only.
 * - Staff land on their own, editable board; `view=team` shows the team table; `?user=<their own id>` is their own
 *   board (editable).
 * - Admins land on the team table and every board they open is read-only (they write no plans).
 */
export type PlanView = {
  /** Whose board to read: a teammate's id, or undefined for the viewer's own (or the team table). */
  viewUser: string | undefined;
  readOnly: boolean;
  /** The team table instead of a board. */
  teamView: boolean;
};

export function planView(a: {
  isAdmin: boolean;
  userId: string | undefined;
  user: string | null;
  view: string | null;
}): PlanView {
  const raw = a.user || undefined;
  // The viewer's own id is their own board: no `userId` on the requests.
  const viewUser = raw && (a.isAdmin || raw !== a.userId) ? raw : undefined;
  const readOnly = a.isAdmin || (!!viewUser && viewUser !== a.userId);
  const teamView = !viewUser && (a.isAdmin || a.view === 'team');
  return { viewUser, readOnly, teamView };
}
