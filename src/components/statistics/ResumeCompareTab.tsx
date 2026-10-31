import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import useSWR from 'swr';
import { Download, ExternalLink } from 'lucide-react';
import { BASE_URL } from '../../api/client';
import * as api from '../../api/endpoints';
import type { CompareEntry, CompareRow, ResumeCompare } from '../../api/endpoints';
import { safeHref } from '../../lib/safeHref';
import { stageLabel } from '../../lib/stageBadge';
import { bandClass } from '../jobApplies/format';
import { FilterBar, filterParams, filtersError, type StatsFilters } from './controls';

function shortDay(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** One profile's resume in a cell: score, tailored / fixed, and its download. */
/** `several`: the cell lists more than one profile, so it says which one got the interview. */
function Entry({ e, several }: { e: CompareEntry; several: boolean }) {
  const tip = [
    e.profileName,
    e.kind === 'fixed' ? 'Fixed resume' : e.kind === 'tailored' ? `Tailored${e.promptName ? ` · prompt ${e.promptName}` : ''}` : '',
    e.score ? `Score ${e.score.total} (${e.score.band})` : e.resumeJobId ? 'Not scored' : 'No resume for this job',
    e.score?.missing.length ? `Not in the resume: ${e.score.missing.join(', ')}` : '',
    e.interviewed ? 'Got the interview' : '',
  ].filter(Boolean).join('\n');
  return (
    <div className="flex items-center gap-1.5 whitespace-nowrap" title={tip}>
      {e.score ? (
        <span className={bandClass(e.score.band)} aria-label={`Score ${e.score.total}`}>{e.score.total}</span>
      ) : (
        <span className="text-xs text-faint">{e.resumeJobId ? 'No score' : 'No resume'}</span>
      )}
      {e.kind && <span className="text-xs text-muted">{e.kind === 'fixed' ? 'Fixed' : 'Tailored'}</span>}
      {e.link && (
        <a href={`${BASE_URL}${e.link}`} className="btn-icon" aria-label={`Download ${e.profileName || 'the'} resume`} title="Download resume">
          <Download className="h-3.5 w-3.5" aria-hidden />
        </a>
      )}
      {e.profileName && <span className="max-w-[9rem] truncate text-[11px] text-faint">{e.profileName}</span>}
      {/* Several profiles in one cell: say which one got the interview. */}
      {several && e.interviewed && (
        <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">interview</span>
      )}
    </div>
  );
}

function JobCell({ row }: { row: CompareRow }) {
  const href = safeHref(row.jobUrl);
  return (
    <div className="min-w-[13rem] max-w-[18rem]">
      <div className="flex items-center gap-1">
        <span className="truncate font-medium text-strong" title={row.company}>{row.company || 'Untitled company'}</span>
        {href && (
          <a href={href} target="_blank" rel="noreferrer" className="shrink-0 text-muted hover:text-strong" aria-label={`Open the ${row.company} job post`}>
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        )}
      </div>
      <div className="mt-0.5 space-y-0.5 text-xs text-muted">
        {row.interviews.map((i, n) => (
          <div key={n} className="truncate">
            <span className="font-medium text-emerald-700 dark:text-emerald-400">{i.name}</span> · {stageLabel(i.stage)}{' '}
            {shortDay(i.date)}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Resume compare: the jobs that got an interview, one row each, and one column per user with their resume for the
 * same job and its score. A cell that got the interview is highlighted.
 */
export default function ResumeCompareTab({ filters, onFilters }: { filters: StatsFilters; onFilters: (f: StatsFilters) => void }) {
  const params = filterParams(filters);
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);
  const { data, error, isLoading } = useSWR(
    filtersError(filters) ? null : ['resume-compare', params.region, params.period, params.date, params.to, q],
    () => api.getResumeCompare({ ...params, q: q || undefined }),
    { keepPreviousData: true },
  );

  return (
    <div className="space-y-4">
      <FilterBar value={filters} onChange={onFilters}>
        <input
          type="search"
          className="input !w-56"
          placeholder="Search company…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search company"
        />
        {isLoading && data && <span className="spinner spinner-sm" role="status" aria-label="Loading" />}
      </FilterBar>
      <p className="text-xs text-muted">
        Jobs that got an interview in this period. Each column is a person’s resume for the same job and its score;
        the highlighted cell got the interview. “—” means no resume for that job. A region shows its profiles’
        interviews and resumes.
      </p>

      {error ? (
        <p className="panel p-6 text-sm text-red-700 dark:text-red-400">Couldn’t load the comparison. Try again.</p>
      ) : !data ? (
        <p className="panel flex items-center gap-2 p-6 text-sm text-muted" role="status">
          <span className="spinner spinner-sm" aria-hidden /> Loading…
        </p>
      ) : (
        <CompareTable data={data} />
      )}
    </div>
  );
}

/**
 * The max height that ends the box just above the window's bottom edge, so its bottom - and its horizontal scrollbar -
 * is always on screen. Follows window resizes and page scrolls (whatever element scrolls the page).
 */
function useFitToWindow(ref: RefObject<HTMLElement>, deps: unknown[], gap = 16): number | undefined {
  const [height, setHeight] = useState<number>();
  useLayoutEffect(() => {
    const fit = () => {
      const el = ref.current;
      if (el) setHeight(Math.max(320, Math.floor(window.innerHeight - el.getBoundingClientRect().top - gap)));
    };
    fit();
    window.addEventListener('resize', fit);
    window.addEventListener('scroll', fit, true); // capture: the app scrolls an inner element, not the window
    return () => {
      window.removeEventListener('resize', fit);
      window.removeEventListener('scroll', fit, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return height;
}

function CompareTable({ data }: { data: ResumeCompare }) {
  const box = useRef<HTMLDivElement>(null);
  const height = useFitToWindow(box, [data]);
  if (data.rows.length === 0) {
    return <p className="panel p-6 text-center text-sm text-muted">No interviews with a job link in this period.</p>;
  }
  return (
    // Its own scroll box (down and right) so the user row and the job column stay pinned while scrolling.
    <div ref={box} className="table-wrap overflow-auto" style={{ maxHeight: height }}>
      <table className="min-w-full text-sm">
        <caption className="sr-only">Each user’s resume and score for the jobs that got an interview, {data.label}</caption>
        <thead className="table-head">
          <tr>
            <th scope="col" className="sticky left-0 top-0 z-30 bg-zinc-50 px-3 py-2.5 text-left shadow-[inset_-1px_-1px_0_rgb(228_228_231)] dark:bg-zinc-900 dark:shadow-[inset_-1px_-1px_0_rgb(39_39_42)]">
              Job · interview
            </th>
            {data.users.map((u) => (
              <th
                key={u.userId}
                scope="col"
                className={`sticky top-0 z-20 whitespace-nowrap bg-zinc-50 px-3 py-2.5 text-left shadow-[inset_0_-1px_0_rgb(228_228_231)] dark:bg-zinc-900 dark:shadow-[inset_0_-1px_0_rgb(39_39_42)] ${u.isMe ? 'text-sky-700 dark:text-sky-400' : ''}`}
              >
                {u.isMe ? `${u.name} (you)` : u.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row) => (
            <tr key={row.key} className="table-row align-top">
              <th scope="row" className="sticky left-0 z-10 bg-white px-3 py-2.5 text-left font-normal shadow-[inset_-1px_0_0_rgb(228_228_231)] dark:bg-zinc-950 dark:shadow-[inset_-1px_0_0_rgb(39_39_42)]">
                <JobCell row={row} />
              </th>
              {data.users.map((u) => {
                const entries = row.cells[u.userId] ?? [];
                const won = entries.some((e) => e.interviewed);
                return (
                  <td
                    key={u.userId}
                    className={`px-3 py-2.5 ${won ? 'bg-emerald-50 ring-1 ring-inset ring-emerald-300 dark:bg-emerald-950/30 dark:ring-emerald-800' : ''}`}
                  >
                    {entries.length === 0 ? (
                      <span className="text-faint" aria-label="No resume for this job">—</span>
                    ) : (
                      <div className="space-y-1">
                        {won && <span className="badge badge-success">Interview</span>}
                        {entries.map((e, n) => <Entry key={e.resumeJobId ?? `i${n}`} e={e} several={entries.length > 1} />)}
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
