/**
 * Users list filters, kept in the URL so a reload or a shared link keeps them.
 *
 * Pure mapping only: URL values (strings, possibly junk) -> typed filters -> the `GET /users` request. The server does
 * the searching and filtering; the page sends what the bar says.
 *
 * URL keys: `role`, `status`, `q`, `page`, `size` (defaults are left out).
 */
import { DEFAULT_PAGE_SIZE, PAGE_SIZES } from '../components/Pagination';

export const USER_ROLE_OPTIONS = [
  { value: 'staff', label: 'Staff' },
  { value: 'interview_manager', label: 'Interview manager' },
  { value: 'admin', label: 'Admin' },
];

export const USER_ROLE_FILTER_OPTIONS = [{ value: '', label: 'All roles' }, ...USER_ROLE_OPTIONS];

export const USER_STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Pending approval' },
];

export type UserKey = 'role' | 'status' | 'q' | 'page' | 'size';
export type UserUrlValues = Record<UserKey, string>;

export const USER_URL_DEFAULTS: UserUrlValues = {
  role: '',
  status: '',
  q: '',
  page: '1',
  size: String(DEFAULT_PAGE_SIZE),
};

export type UserFilters = { role: string; status: string; q: string; page: number; size: number };

const KNOWN_ROLES = USER_ROLE_OPTIONS.map((o) => o.value);
const KNOWN_STATUSES = USER_STATUS_OPTIONS.map((o) => o.value).filter(Boolean);

/** URL values -> typed filters. Never throws; bad values fall back to the defaults. */
export function parseUserValues(values: UserUrlValues): UserFilters {
  const page = Number.parseInt(values.page, 10);
  const size = Number.parseInt(values.size, 10);
  return {
    role: KNOWN_ROLES.includes(values.role) ? values.role : '',
    status: KNOWN_STATUSES.includes(values.status) ? values.status : '',
    q: values.q,
    page: Number.isFinite(page) && page > 1 ? page : 1,
    size: PAGE_SIZES.includes(size) ? size : DEFAULT_PAGE_SIZE,
  };
}

/** `GET /users`: empty filters are left out of the request. */
export function userListParams(f: UserFilters) {
  return {
    page: f.page,
    limit: f.size,
    ...(f.q ? { search: f.q } : {}),
    ...(f.role ? { role: f.role } : {}),
    ...(f.status ? { status: f.status } : {}),
  };
}

/** Whether anything the bar shows differs from its default (the Clear button). */
export function userCanClear(f: UserFilters): boolean {
  return !!f.role || !!f.status || !!f.q;
}

/** What Clear puts back: the bar's own keys (the page and per-page size are not filters). */
export const USER_CLEAR_KEYS: UserKey[] = ['role', 'status', 'q'];
