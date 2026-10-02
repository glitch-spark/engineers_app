import { useState } from 'react';
import useSWR from 'swr';
import { Link } from 'react-router-dom';
import { ExternalLink, Loader2, Trash2 } from 'lucide-react';
import * as api from '../api/endpoints';
import type { JobApplyRun } from '../api/endpoints';
import PageHeader from '../components/PageHeader';
import ConfirmDialog from '../components/ConfirmDialog';
import NewRunPanel from '../components/jobApplies/NewRunPanel';
import ProgressBar from '../components/jobApplies/ProgressBar';
import { RUN_STATUS_BADGE, RUN_STATUS_LABEL, expiresHint, formatDate, isActive } from '../components/jobApplies/format';
import { notify } from '../lib/notify';

export default function JobApplies() {
  const { data, isLoading, mutate } = useSWR('job-apply-runs', api.listJobApplyRuns, {
    refreshInterval: (latest) => (latest?.runs.some((r) => isActive(r.status)) ? 3000 : 0),
  });
  const runs = data?.runs ?? [];
  const [pendingDelete, setPendingDelete] = useState<JobApplyRun | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  return (
    <div className="space-y-6">
      <PageHeader title="Job Applies" />
      <NewRunPanel />

      <section aria-labelledby="runs-title" className="space-y-3">
        <h2 id="runs-title" className="section-title">Runs</h2>
        <div className="table-wrap">
          {isLoading && runs.length === 0 ? (
            <p role="status" className="flex items-center gap-2 p-6 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading...
            </p>
          ) : runs.length === 0 ? (
            <p className="p-6 text-sm text-muted">No runs yet. Upload a job sheet above to start one.</p>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="table-head">
                <tr>
                  <th className="px-3 py-2 font-medium">Sheet</th>
                  <th className="px-3 py-2 font-medium">Started</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Progress</th>
                  <th className="px-3 py-2 font-medium text-right">Suggested jobs</th>
                  <th className="px-3 py-2 font-medium text-right">Min score</th>
                  <th className="w-12 px-3 py-2 font-medium text-right">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run._id} className="table-row">
                    <td className="px-3 py-2">
                      <Link to={`/job-applies/${run._id}`} className="font-medium text-sky-700 hover:underline dark:text-sky-400">
                        {run.fileName}
                      </Link>
                      {run.sourceUrl && (
                        <a
                          href={run.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-icon ml-1 align-middle"
                          title="Open the Google Sheet"
                        >
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                          <span className="sr-only">Open the Google Sheet (new tab)</span>
                        </a>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {formatDate(run.createdAt)}
                      {expiresHint(run.expiresAt) && <span className="hint block">{expiresHint(run.expiresAt)}</span>}
                    </td>
                    <td className="px-3 py-2">
                      <span className={RUN_STATUS_BADGE[run.status]}>{RUN_STATUS_LABEL[run.status]}</span>
                      {run.counts.failed > 0 && <span className="hint ml-2">{run.counts.failed} failed</span>}
                    </td>
                    <td className="px-3 py-2">
                      <ProgressBar run={run} />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{run.suggested}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{run.threshold}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        className="btn-icon"
                        onClick={() => setPendingDelete(run)}
                        disabled={isActive(run.status)}
                        title={isActive(run.status) ? 'Cancel the run before deleting it' : 'Delete run'}
                        aria-label={`Delete run ${run.fileName}`}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete run?"
        body={<p>"{pendingDelete?.fileName}" and its {pendingDelete?.counts.total ?? 0} scored jobs will be deleted.</p>}
        confirmLabel="Delete"
        tone="danger"
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
