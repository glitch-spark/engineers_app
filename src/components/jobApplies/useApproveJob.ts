import { useCallback, useState } from 'react';
import * as api from '../../api/endpoints';
import { notify } from '../../lib/notify';
import { useRunRefresh } from './useRunRefresh';

/**
 * Approve a job so it moves to Worth applying (or undo that). Shared by the job lists and the Job info panel.
 * Refreshes everything the run shows, because the job changes bucket and the counts follow.
 */
export function useApproveJob(runId: string, onChanged?: () => void) {
  const refresh = useRunRefresh(runId);
  const [busyId, setBusyId] = useState<string | null>(null);

  const setApproved = useCallback(
    async (rowId: string, approved: boolean): Promise<boolean> => {
      setBusyId(rowId);
      try {
        await api.setJobApplyRowInclude(rowId, approved);
        await refresh();
        onChanged?.();
        notify.success(approved ? 'Moved to Worth applying' : 'Approval undone');
        return true;
      } catch (err) {
        notify.error(err, approved ? 'Could not approve the job' : 'Could not undo the approval');
        return false;
      } finally {
        setBusyId(null);
      }
    },
    [refresh, onChanged],
  );

  return { setApproved, busyId };
}
