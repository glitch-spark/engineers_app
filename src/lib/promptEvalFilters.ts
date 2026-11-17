/**
 * Prompt Eval filters, kept in the URL so a reload or a shared link keeps them.
 *
 * Both tabs live on one page URL (`/resume/eval`), next to the page's own `tab`, `ids` and `with` keys, so the keys
 * must not clash with those:
 *  - Runs tab: `account` (the Profile filter), `user` (admins: the User filter; absent = the first team member, `all`).
 *  - Job descriptions tab: `role`, `archived` (`1` = shown), `q`.
 * Defaults are left out of the URL. Pure mapping only; URL values may be junk and fall back to the defaults.
 */
import { EVAL_ROLES, type EvalRole } from '../api/endpoints';

// ---- the Runs tab -----------------------------------------------------------

export type RunsKey = 'account' | 'user';
export type RunsUrlValues = Record<RunsKey, string>;
export const RUNS_URL_DEFAULTS: RunsUrlValues = { account: '', user: '' };
/** The User filter's "every user" value. An absent `user` is the admin default (the first team member). */
export const RUNS_ALL_USERS = 'all';
export type RunsFilters = {
  account: string;
  /** Admins only: whose profiles (and their runs) are shown, a user id or `all`. Staff only ever see their own. */
  user: string;
};

/**
 * URL values -> typed filters. An account id is only an id; the server decides whether it matches any runs.
 * `defaultUser` is what an absent `user` means (an admin's first team member); without one it is every user.
 */
export function parseRunsValues(values: RunsUrlValues, defaultUser = ''): RunsFilters {
  return { account: values.account.trim(), user: values.user.trim() || defaultUser || RUNS_ALL_USERS };
}

/** Whether the table narrows the server's runs to one user's profiles (`runsForUser`): an admin, a user, no profile. */
const narrowsByUser = (f: RunsFilters, isAdmin: boolean): boolean => isAdmin && !f.account && f.user !== RUNS_ALL_USERS;

/**
 * `GET /resume/eval/runs`. The server has no user filter, so when the table narrows its runs to one user's profiles it
 * asks for the most it allows (100) instead of 50.
 */
export function runsListParams(f: RunsFilters, isAdmin = false): { accountId?: string; limit: number } {
  return { accountId: f.account || undefined, limit: narrowsByUser(f, isAdmin) ? 100 : 50 };
}

/** Clear shows when a profile is picked, or (admins) a user other than the default. */
export function runsCanClear(f: RunsFilters, isAdmin = false, defaultUser = ''): boolean {
  return !!f.account || (isAdmin && f.user !== (defaultUser || RUNS_ALL_USERS));
}

export const RUNS_CLEAR_KEYS: RunsKey[] = ['account', 'user'];

/**
 * The profiles the Profile filter offers: staff their own; an admin every profile under All users, else the picked
 * user's (`createdBy`).
 */
export function runsProfiles<A extends { createdBy?: string }>(
  accounts: readonly A[], f: Pick<RunsFilters, 'user'>, isAdmin: boolean, viewerId: string | undefined,
): A[] {
  if (!isAdmin) return accounts.filter((a) => a.createdBy === viewerId);
  if (f.user === RUNS_ALL_USERS) return [...accounts];
  return accounts.filter((a) => a.createdBy === f.user);
}

/**
 * The runs the table shows. A picked profile is already the server's filter; otherwise an admin's picked user keeps
 * the runs of that user's profiles (`profileIds`). The server lists the latest runs only, so this narrows those.
 */
export function runsForUser<R extends { accountId: string }>(
  runs: readonly R[], f: RunsFilters, isAdmin: boolean, profileIds: ReadonlySet<string>,
): R[] {
  if (!narrowsByUser(f, isAdmin)) return [...runs];
  return runs.filter((r) => profileIds.has(r.accountId));
}

// ---- the Job descriptions tab -----------------------------------------------

export type JdKey = 'role' | 'archived' | 'q';
export type JdUrlValues = Record<JdKey, string>;
export const JD_URL_DEFAULTS: JdUrlValues = { role: '', archived: '', q: '' };

export type JdFilters = { role: '' | EvalRole; archived: boolean; q: string };

export function parseJdValues(values: JdUrlValues): JdFilters {
  return {
    role: (EVAL_ROLES as string[]).includes(values.role) ? (values.role as EvalRole) : '',
    archived: values.archived === '1',
    q: values.q,
  };
}

/** Whether the role and the search text (title or company, any case) match. Archived is a server filter. */
export function matchesJd(jd: { role: string; title: string; company: string }, f: JdFilters): boolean {
  if (f.role && jd.role !== f.role) return false;
  const needle = f.q.trim().toLowerCase();
  if (!needle) return true;
  return jd.title.toLowerCase().includes(needle) || jd.company.toLowerCase().includes(needle);
}

export function jdCanClear(f: JdFilters): boolean {
  return !!f.role || f.archived || !!f.q;
}

export const JD_CLEAR_KEYS: JdKey[] = ['role', 'archived', 'q'];
