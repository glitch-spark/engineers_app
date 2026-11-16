import useSWR from 'swr';
import * as api from '../api/endpoints';
import type { ReportClock } from './bidderFilters';

/**
 * The server's report clock (`/bids/clock`): today's report day and the current / previous pay week, so the page never
 * works the schedule out itself. Re-read every 5 minutes (and on focus) to follow a daily or weekly cutoff.
 */
export function useReportClock(): { clock: ReportClock | undefined; error: unknown; retry: () => void } {
  const { data, error, mutate } = useSWR(['bid-clock'] as const, () => api.getBidClock(), { refreshInterval: 300_000 });
  return { clock: data, error, retry: () => void mutate() };
}
