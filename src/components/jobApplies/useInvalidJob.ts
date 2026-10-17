import { useCallback, useState } from 'react';
import * as api from '../../api/endpoints';
import { notify } from '../../lib/notify';
import { useRunRefresh } from './useRunRefresh';

/**
 * Move a Worth applying job to Invalid role (or back). Refreshes everything the run shows, because the job changes
 * bucket and the counts follow.
 */
export function useInvalidJob(runId: string, onChanged?: () => void) {
  const refresh = useRunRefresh(runId);
  const [busyId, setBusyId] = useState<string | null>(null);

  const setInvalid = useCallback(
    async (rowId: string, invalid: boolean): Promise<boolean> => {
      setBusyId(rowId);
      try {
        await api.setJobApplyRowInvalid(rowId, invalid);
        await refresh();
        onChanged?.();
        notify.success(invalid ? 'Moved to Invalid role' : 'Moved back to Worth applying');
        return true;
      } catch (err) {
        notify.error(err, invalid ? 'Could not move the job to Invalid role' : 'Could not move the job back');
        return false;
      } finally {
        setBusyId(null);
      }
    },
    [refresh, onChanged],
  );

  return { setInvalid, busyId };
}
