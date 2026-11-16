/**
 * Generated resumes filters, kept in the URL so a reload or a shared link keeps them.
 *
 * Pure mapping only: URL values (strings, possibly junk) -> typed filters -> the `GET /resume/jobs` request.
 * URL keys: `profile`, `company`, `q` (job description search), `page`, `size`. The page's `job` deep link (open that
 * resume's drawer) is not a filter and is never touched by these keys.
 */
import { DEFAULT_PAGE_SIZE, PAGE_SIZES } from '../components/Pagination';

export type GeneratedKey = 'profile' | 'company' | 'q' | 'page' | 'size';
export type GeneratedUrlValues = Record<GeneratedKey, string>;

export const GENERATED_URL_DEFAULTS: GeneratedUrlValues = {
  profile: '',
  company: '',
  q: '',
  page: '1',
  size: String(DEFAULT_PAGE_SIZE),
};

export type GeneratedFilters = {
  /** Profile (account) id, '' = every profile. */
  profile: string;
  company: string;
  /** Job description search; the server treats spaces as AND. */
  q: string;
  page: number;
  size: number;
};

/** URL values -> typed filters. Never throws; bad values fall back to the defaults. */
export function parseGeneratedValues(values: GeneratedUrlValues): GeneratedFilters {
  const page = Number.parseInt(values.page, 10);
  const size = Number.parseInt(values.size, 10);
  return {
    profile: values.profile.trim(),
    company: values.company,
    q: values.q,
    page: Number.isFinite(page) && page > 1 ? page : 1,
    size: PAGE_SIZES.includes(size) ? size : DEFAULT_PAGE_SIZE,
  };
}

/** `GET /resume/jobs`: company and q are trimmed, and empty filters are left out, as the page has always sent them. */
export function generatedListParams(f: GeneratedFilters) {
  return {
    page: f.page,
    limit: f.size,
    accountId: f.profile || undefined,
    company: f.company.trim() || undefined,
    q: f.q.trim() || undefined,
  };
}

/** Whether anything the bar shows differs from its default (the Clear button). */
export function generatedCanClear(f: GeneratedFilters): boolean {
  return !!f.profile || !!f.company.trim() || !!f.q.trim();
}

/** What Clear puts back: the bar's own keys (the page, per-page size and the `job` deep link are not filters). */
export const GENERATED_CLEAR_KEYS: GeneratedKey[] = ['profile', 'company', 'q'];
