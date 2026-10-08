import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ExternalLink, Trash2 } from 'lucide-react';
import type { JobApplyRun } from '../../api/endpoints';
import Pagination from './Pagination';
import Segmented from './Segmented';
import { APPLIED_UI } from './appliedUi';
import { expiresHint, formatDateTime, isActive, runGroup, runStep } from './format';
import { safeHref } from '../../lib/safeHref';

type Tab = ReturnType<typeof runGroup> | 'all';
const TABS: { value: Tab; label: string }[] = [
  { value: 'needs', label: 'Needs you' },
  { value: 'progress', label: 'In progress' },
  { value: 'finished', label: 'Finished' },
  { value: 'all', label: 'All' },
];
const SIZES = [10, 25, 50];

/** What the run's row says: its step and what's left, and the one thing to do next. */
export function runRow(run: JobApplyRun): { status: string; links: string; action: string | null } {
  const step = runStep(run);
  const active = isActive(run.status);
  const s = run.summary;
  const c = run.counts;
  const links = `${c.total} link${c.total === 1 ? '' : 's'}` + (s && step > 1 ? ` · ${s.worth} worth applying` : '');
  if (step === 1) {
    const done = Math.min(c.total, c.extracted + c.failed);
    return { status: active ? `① Checking ${done} / ${c.total}` : `① Check ${run.status}`, links, action: null };
  }
  if (step === 2) return { status: '② Pick profiles', links, action: 'Review & pick profiles' };
  if (active) return { status: `③ Scoring ${c.scored} / ${c.total}`, links, action: null };
  if (run.status !== 'done') return { status: `③ ${run.status}`, links, action: null };
  if (s && s.toApply > 0) {
    const parts = [`${s.toApply} to apply`, APPLIED_UI ? `${s.applied} applied` : '', s.tailoring ? `${s.tailoring} tailoring` : ''];
    return { status: `③ Tailor & apply · ${parts.filter(Boolean).join(' · ')}`, links, action: 'Continue applying' };
  }
  return {
    status: APPLIED_UI && s && s.applied ? `Finished · ${s.applied} applied` : s ? 'Finished' : 'Finished · nothing suggested',
    links,
    action: null,
  };
}

/**
 * The Job Applies runs (spec 2026-10-03 follow-up): one table, newest first, filtered by Needs you / In progress /
 * Finished / All and paged. Each row: the Google Sheet (or uploaded file), run date, links, status, actions.
 */
export default function RunsTable({ runs, onDelete }: { runs: JobApplyRun[]; onDelete: (run: JobApplyRun) => void }) {
  const counts = { needs: 0, progress: 0, finished: 0, all: runs.length };
  for (const r of runs) counts[runGroup(r)] += 1;
  const [tab, setTab] = useState<Tab | null>(null);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(SIZES[0]);
  // Start on Needs you, or All when nothing needs you.
  const shown: Tab = tab ?? (counts.needs > 0 ? 'needs' : 'all');
  const list = shown === 'all' ? runs : runs.filter((r) => runGroup(r) === shown);
  const totalPages = Math.max(1, Math.ceil(list.length / size));
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);
  const pageRuns = list.slice((page - 1) * size, page * size);
  const info = { page, limit: size, total: list.length, totalPages, hasPrev: page > 1, hasNext: page < totalPages };

  return (
    <section aria-label="Runs" className="space-y-3">
      <Segmented
        label="Runs"
        value={shown}
        options={TABS.map((t) => ({ ...t, count: counts[t.value] }))}
        onChange={(v) => {
          setTab(v);
          setPage(1);
        }}
      />
      <div className="table-wrap">
        {pageRuns.length === 0 ? (
          <p className="p-6 text-sm text-muted">No runs here.</p>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="table-head whitespace-nowrap">
              <tr>
                <th className="px-3 py-2 font-medium">Google Sheet</th>
                <th className="px-3 py-2 font-medium">Run date</th>
                <th className="px-3 py-2 font-medium">Links</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {pageRuns.map((run) => {
                const row = runRow(run);
                const to = `/job-applies/${run._id}`;
                const expires = expiresHint(run.expiresAt);
                return (
                  <tr key={run._id} className="table-row align-middle">
                    <td className="max-w-xs px-3 py-2">
                      {safeHref(run.sourceUrl) ? (
                        <a
                          href={safeHref(run.sourceUrl)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex max-w-full items-center gap-1 font-medium text-sky-700 hover:underline dark:text-sky-400"
                          title={run.sourceUrl ?? undefined}
                        >
                          <span className="truncate">{run.fileName}</span>
                          <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          <span className="sr-only">(opens the Google Sheet in a new tab)</span>
                        </a>
                      ) : (
                        <span className="block truncate font-medium text-zinc-900 dark:text-zinc-100" title="Uploaded file">
                          {run.fileName}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {formatDateTime(run.createdAt)}
                      {expires && <span className="hint block">{expires}</span>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">{row.links}</td>
                    <td className="px-3 py-2">{row.status}</td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <span className="flex items-center justify-end gap-2">
                        {!isActive(run.status) && (
                          <button
                            type="button"
                            className="btn-icon"
                            onClick={() => onDelete(run)}
                            title="Delete run"
                            aria-label={`Delete run ${run.fileName}`}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </button>
                        )}
                        {row.action ? (
                          <Link to={to} className="btn btn-sm">
                            {row.action} <ArrowRight className="h-4 w-4" aria-hidden />
                          </Link>
                        ) : (
                          <Link to={to} className="btn-outline btn-sm">
                            Open
                          </Link>
                        )}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <Pagination
        info={info}
        onPage={setPage}
        pageSize={size}
        onPageSize={(n) => {
          setSize(n);
          setPage(1);
        }}
        sizes={SIZES}
        label="Runs pages"
      />
    </section>
  );
}
