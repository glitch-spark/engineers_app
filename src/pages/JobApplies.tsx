import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { Loader2, Plus, X } from 'lucide-react';
import * as api from '../api/endpoints';
import type { JobApplyRun } from '../api/endpoints';
import PageHeader from '../components/PageHeader';
import ConfirmDialog from '../components/ConfirmDialog';
import NewRunPanel from '../components/jobApplies/NewRunPanel';
import RunCard from '../components/jobApplies/RunCard';
import StepTrack from '../components/jobApplies/StepTrack';
import { isActive, runGroup } from '../components/jobApplies/format';
import { notify } from '../lib/notify';

const GROUPS: { key: ReturnType<typeof runGroup>; title: string }[] = [
  { key: 'needs', title: 'Needs you' },
  { key: 'progress', title: 'In progress' },
  { key: 'finished', title: 'Finished' },
];

export default function JobApplies() {
  const { data, isLoading, mutate } = useSWR('job-apply-runs', api.listJobApplyRuns, {
    refreshInterval: (latest) => (latest?.runs.some((r) => isActive(r.status)) ? 3000 : 0),
  });
  const runs = data?.runs ?? [];
  const [showNew, setShowNew] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<JobApplyRun | null>(null);
  const [deleting, setDeleting] = useState(false);

  // First visit (no runs yet): open the sheet form under the explained steps.
  useEffect(() => {
    if (data && data.runs.length === 0) setShowNew(true);
  }, [data]);

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await api.deleteJobApplyRun(pendingDelete._id);
      notify.success('Run deleted');
      setPendingDelete(null);
      await mutate();
    } catch (err) {
      notify.error(err, 'Could not delete the run');
    } finally {
      setDeleting(false);
    }
  };

  const firstTime = !!data && runs.length === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Job Applies"
        action={
          !firstTime && (
            <button type="button" className={showNew ? 'btn-outline btn-sm' : 'btn btn-sm'} onClick={() => setShowNew((v) => !v)}>
              {showNew ? <X className="h-4 w-4" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
              {showNew ? 'Close' : 'New run'}
            </button>
          )
        }
      />
      {firstTime ? <StepTrack large /> : <StepTrack />}
      {showNew && <NewRunPanel />}

      {isLoading && runs.length === 0 ? (
        <p role="status" className="flex items-center gap-2 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading runs…
        </p>
      ) : (
        GROUPS.map(({ key, title }) => {
          const group = runs.filter((r) => runGroup(r) === key);
          if (group.length === 0) return null;
          return (
            <section key={key} aria-labelledby={`runs-${key}`} className="space-y-2">
              <h2 id={`runs-${key}`} className="section-title">
                {title} <span className="font-normal text-zinc-500">· {group.length}</span>
              </h2>
              <ul className="grid gap-3 lg:grid-cols-2">
                {group.map((run) => (
                  <RunCard key={run._id} run={run} onDelete={setPendingDelete} />
                ))}
              </ul>
            </section>
          );
        })
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete run?"
        body={<p>"{pendingDelete?.fileName}" and its {pendingDelete?.counts.total ?? 0} jobs will be deleted.</p>}
        confirmLabel="Delete"
        tone="danger"
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
