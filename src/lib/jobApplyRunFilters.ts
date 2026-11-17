/**
 * Job Applies runs list: the Needs you / In progress / Finished / All tabs and the paging, kept in the URL so a reload
 * or a shared link keeps them.
 *
 * URL keys: `status` (a tab; left out = the automatic one: Needs you when something needs you, else All), `page`,
 * `size`. The list itself is filtered on the client; the one-run jobs table (`JobApplyRun`) has its own sizes.
 */
import { DEFAULT_PAGE_SIZE, PAGE_SIZES } from '../components/Pagination';

export type RunTab = 'needs' | 'progress' | 'finished' | 'all';
export const RUN_TABS: RunTab[] = ['needs', 'progress', 'finished', 'all'];

export type RunKey = 'status' | 'page' | 'size';
export type RunUrlValues = Record<RunKey, string>;
export const RUN_URL_DEFAULTS: RunUrlValues = { status: '', page: '1', size: String(DEFAULT_PAGE_SIZE) };

export type RunFilters = { status: '' | RunTab; page: number; size: number };

/** URL values -> typed filters. Never throws; bad values fall back to the defaults. */
export function parseRunValues(values: RunUrlValues): RunFilters {
  const page = Number.parseInt(values.page, 10);
  const size = Number.parseInt(values.size, 10);
  return {
    status: (RUN_TABS as string[]).includes(values.status) ? (values.status as RunTab) : '',
    page: Number.isFinite(page) && page > 1 ? page : 1,
    size: PAGE_SIZES.includes(size) ? size : DEFAULT_PAGE_SIZE,
  };
}

/** The tab to show: the one in the URL, or Needs you when something needs you, else All. */
export function shownRunTab(f: Pick<RunFilters, 'status'>, needsCount: number): RunTab {
  return f.status || (needsCount > 0 ? 'needs' : 'all');
}

/** The page to show: the requested one, pulled back to the last page when the list got shorter. */
export function clampRunPage(page: number, total: number, size: number): number {
  return Math.min(page, Math.max(1, Math.ceil(total / size)));
}
