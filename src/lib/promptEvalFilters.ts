/**
 * Prompt Eval filters, kept in the URL so a reload or a shared link keeps them.
 *
 * Both tabs live on one page URL (`/resume/eval`), next to the page's own `tab`, `ids` and `with` keys, so the keys
 * must not clash with those:
 *  - Runs tab: `account` (the Profile filter).
 *  - Job descriptions tab: `role`, `archived` (`1` = shown), `q`.
 * Defaults are left out of the URL. Pure mapping only; URL values may be junk and fall back to the defaults.
 */
import { EVAL_ROLES, type EvalRole } from '../api/endpoints';

// ---- the Runs tab -----------------------------------------------------------

export type RunsKey = 'account';
export type RunsUrlValues = Record<RunsKey, string>;
export const RUNS_URL_DEFAULTS: RunsUrlValues = { account: '' };
export type RunsFilters = { account: string };

/** URL values -> typed filters. An account id is only an id; the server decides whether it matches any runs. */
export function parseRunsValues(values: RunsUrlValues): RunsFilters {
  return { account: values.account.trim() };
}

/** `GET /resume/eval/runs`. */
export function runsListParams(f: RunsFilters): { accountId?: string; limit: number } {
  return { accountId: f.account || undefined, limit: 50 };
}

export function runsCanClear(f: RunsFilters): boolean {
  return !!f.account;
}

export const RUNS_CLEAR_KEYS: RunsKey[] = ['account'];

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
