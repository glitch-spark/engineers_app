/** Transactions filters, kept in the URL so a reload or a shared link keeps them. */
import { customError, legacyPreset, presetOptions, rangeFor, type DatePreset, type DateRange } from './dateRange';
import { DEFAULT_PAGE_SIZE, PAGE_SIZES } from '../components/Pagination';
import type { TransactionListParams } from '../api/endpoints';

/** The standard presets; Transactions may show future days (a monthly bill dated later this month). */
export const TX_PRESETS = presetOptions();
export const TX_DEFAULT_RANGE: DatePreset = 'this_month';
/** Owner filter value for "every user" (an empty value in the URL would read as the default). */
export const ALL_USERS = 'all';

export type PayMethodFilter = '' | 'coin' | 'card';

export type TxKey = 'user' | 'method' | 'payer' | 'range' | 'from' | 'to' | 'page' | 'size';
export type TxUrlValues = Record<TxKey, string>;

export type TxFilters = {
  /** Owner id, or 'all'. */
  user: string;
  method: PayMethodFilter;
  /** Payer id ('' = anyone). */
  payer: string;
  range: DatePreset;
  from: string;
  to: string;
  page: number;
  size: number;
};

/**
 * The User filter's default: admins open on every user's transactions, staff on their own (every user while the
 * signed-in user is unknown). The other functions take this value as `userId`.
 */
export function txDefaultUser(userId: string, isAdmin: boolean): string {
  return isAdmin ? ALL_USERS : userId || ALL_USERS;
}

/**
 * URL defaults (left out of the URL). `from` / `to` default to '' as the shared date control requires. `userId` is the
 * User default (`txDefaultUser`).
 */
export function txUrlDefaults(userId: string): TxUrlValues {
  return {
    user: userId || ALL_USERS,
    method: '',
    payer: '',
    range: TX_DEFAULT_RANGE,
    from: '',
    to: '',
    page: '1',
    size: String(DEFAULT_PAGE_SIZE),
  };
}

const KNOWN_PRESETS = TX_PRESETS.map((o) => o.value as string);

/** The preset an odd URL value stands for: old names are mapped, anything not offered falls back to This month. */
export function normalizeTxRange(raw: string): DatePreset {
  const mapped: string = legacyPreset(raw) ?? raw;
  return KNOWN_PRESETS.includes(mapped) ? (mapped as DatePreset) : TX_DEFAULT_RANGE;
}

/** URL values (strings, possibly junk) -> typed filters. Never throws; bad values fall back to the defaults. */
export function parseTxValues(values: TxUrlValues, userId: string): TxFilters {
  const range = normalizeTxRange(values.range);
  const page = Number.parseInt(values.page, 10);
  const size = Number.parseInt(values.size, 10);
  return {
    user: values.user || userId || ALL_USERS,
    method: values.method === 'coin' || values.method === 'card' ? values.method : '',
    payer: values.payer,
    range,
    // Only a Custom range reads from / to; they are kept as typed so the bar can say what is wrong with them.
    from: range === 'custom' ? values.from : '',
    to: range === 'custom' ? values.to : '',
    page: Number.isFinite(page) && page > 1 ? page : 1,
    size: PAGE_SIZES.includes(size) ? size : DEFAULT_PAGE_SIZE,
  };
}

/** The days the Date range stands for on `today` (`YYYY-MM-DD`, local), or null for a partial or invalid Custom range. */
export function txRange(f: Pick<TxFilters, 'range' | 'from' | 'to'>, today: string): DateRange | null {
  if (f.range === 'custom') return customError(f.from, f.to) === null ? { from: f.from, to: f.to } : null;
  return rangeFor(f.range, today, { allowFuture: true });
}

/**
 * The list request, or null while the Date range is invalid (nothing to ask for). `from` / `to` are inclusive local
 * days (`YYYY-MM-DD`), as the page has always sent them.
 */
export function txListParams(f: TxFilters, today: string): TransactionListParams | null {
  const days = txRange(f, today);
  if (!days) return null;
  return {
    page: f.page,
    limit: f.size,
    from: days.from,
    to: days.to,
    ...(f.user && f.user !== ALL_USERS ? { userId: f.user } : {}),
    ...(f.payer ? { payerId: f.payer } : {}),
    ...(f.method ? { payMethod: f.method } : {}),
  };
}

/** Whether anything the bar shows differs from its default (the Clear button). */
export function txCanClear(f: TxFilters, userId: string): boolean {
  return f.user !== (userId || ALL_USERS) || !!f.method || !!f.payer || f.range !== TX_DEFAULT_RANGE;
}

/** What Clear puts back: the bar's own keys (the page and per-page size are not filters). */
export const TX_CLEAR_KEYS: TxKey[] = ['user', 'method', 'payer', 'range', 'from', 'to'];

/** Whose 12-month net income the Transactions page charts: admins follow the User filter (All users = everyone,
 * sent as `all`); staff always see their own (the endpoint refuses anyone else). `{}` = the signed-in user. */
export function netChartUser(filterUser: string, meId: string, isAdmin: boolean): { userId?: string } {
  if (!isAdmin || filterUser === meId) return {};
  return { userId: filterUser === ALL_USERS ? 'all' : filterUser };
}
