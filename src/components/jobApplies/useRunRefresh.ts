import { useCallback } from 'react';
import { useSWRConfig } from 'swr';

/** Revalidate everything a Job Applies run shows (run, rows, buckets, screening, job details): a correction can move
 *  jobs between buckets and change the counts. */
export function useRunRefresh(runId: string) {
  const { mutate } = useSWRConfig();
  return useCallback(
    () =>
      mutate(
        (key) =>
          Array.isArray(key) &&
          typeof key[0] === 'string' &&
          key[0].startsWith('job-apply') &&
          (key[0] === 'job-apply-row' || key[1] === runId),
      ),
    [mutate, runId],
  );
}
