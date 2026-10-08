import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { CheckCheck, ChevronDown, ChevronRight, Copy, Download, ExternalLink, FileText, Keyboard, Loader2, Sparkles, Square, X } from 'lucide-react';
import * as api from '../api/endpoints';
import type { JobApplyAppliedFilter, JobApplyMarkRef, JobApplyRow, JobApplySuggestion, JobApplyView } from '../api/endpoints';
import PageHeader from '../components/PageHeader';
import Select from '../components/Select';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import ModelSelect from '../components/ModelSelect';
import RowDetail from '../components/jobApplies/RowDetail';
import Pagination, { PAGE_SIZES } from '../components/jobApplies/Pagination';
import Suggestions, { type AppliedFile, firstReadyTailored, orderedProfiles } from '../components/jobApplies/Suggestions';
import ApplyWorkflow from '../components/jobApplies/ApplyWorkflow';
import { APPLIED_UI } from '../components/jobApplies/appliedUi';
import RunSummary from '../components/jobApplies/RunSummary';
import StepTrack, { type Step } from '../components/jobApplies/StepTrack';
import ScreeningReport from '../components/jobApplies/ScreeningReport';
import SourceLine from '../components/jobApplies/SourceLine';
import ExportSheetDialog from '../components/jobApplies/ExportSheetDialog';
import JobInfoPanel from '../components/jobApplies/JobInfoPanel';
import { useRunRefresh } from '../components/jobApplies/useRunRefresh';
import Segmented from '../components/jobApplies/Segmented';
import {
  ROW_STATUS_LABEL,
  TONE_CLASS,
  ageDays,
  collectLinks,
  formatDate,
  gateChip,
  isActive,
  runStep,
  locationLabel,
} from '../components/jobApplies/format';
import { notify } from '../lib/notify';
import { formatUsd } from '../lib/modelCost';
import { useModelChoice, type ModelChoice } from '../lib/useModelChoice';
import { safeHref } from '../lib/safeHref';

const APPLIED_FILTERS: { value: JobApplyAppliedFilter; label: string }[] = [
  { value: 'no', label: 'To apply' },
  { value: 'yes', label: 'Applied' },
  { value: 'any', label: 'Any' },
];
const PAGE_SIZE_KEY = 'jobApplies.pageSize';
const SHORTCUTS: [string, string][] = [
  ['j / k', 'Next / previous job'],
  ['o', 'Open the job posting in a new tab'],
  ['t', 'Tailor a resume for every profile on this job that doesn’t have one'],
  ['d', 'Download the first ready tailored PDF, otherwise the top uploaded PDF'],
  ...(APPLIED_UI
    ? ([
        ['1 – 9', 'Toggle “applied” for suggestion 1–9'],
        ['a', 'Mark the job applied for every profile with a resume ready (tailored, else the matching upload), and go to the next job'],
      ] as [string, string][])
    : []),
  ['x', APPLIED_UI ? 'Select / unselect the job (for copying links, tailoring or marking several at once)' : 'Select / unselect the job (for copying links or tailoring several at once)'],
  ['c', 'Copy the links of the selected jobs (or of this job when none are selected)'],
  ['Enter', 'Show / hide the score breakdown'],
  ['?', 'Show this list'],
];

function readPageSize(): number {
  try {
    const n = Number(window.localStorage.getItem(PAGE_SIZE_KEY));
    return PAGE_SIZES.includes(n) ? n : 50;
  } catch {
    return 50;
  }
}

function localMidnightIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return 'open';
  }
}

const pickedModel = (c: ModelChoice) => c.options.find((o) => o.id === c.value);

/** Job Applies always tailors resumes with this model (the server enforces it); only the cover letter model is picked. */
const RESUME_MODEL = { id: 'openai:gpt-4o-mini', label: 'GPT-4o mini' };

function capitalize(s?: string | null): string {
  return s ? s[0].toUpperCase() + s.slice(1) : '';
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

function Flags({ row, profileNames }: { row: JobApplyRow; profileNames: Record<string, string> }) {
  if (row.status === 'fetch_failed' || row.status === 'llm_failed') {
    return (
      <span className="badge-danger" title={row.statusReason ?? undefined}>
        {ROW_STATUS_LABEL[row.status]}
      </span>
    );
  }
  if (row.status === 'pending' || row.status === 'fetched') return <span className="hint">{ROW_STATUS_LABEL[row.status]}…</span>;
  const chips = row.gates.map(gateChip).filter((c): c is NonNullable<typeof c> => c !== null);
  for (const pg of row.profileGates) {
    for (const g of pg.gates) {
      if (g.result === 'fail') {
        chips.push({
          label: `${profileNames[pg.accountId] ?? 'Profile'}: ${g.name === 'workAuth' ? 'work auth' : 'location'}`,
          tone: 'fail',
          title: g.reason,
        });
      }
    }
  }
  if (chips.length === 0) return <span className="hint">—</span>;
  return (
    <ul className="flex flex-wrap gap-1">
      {chips.map((c, i) => (
        <li key={i} className={TONE_CLASS[c.tone]} title={c.title}>
          {c.label}
        </li>
      ))}
    </ul>
  );
}

type RowsPage = Awaited<ReturnType<typeof api.listJobApplyRows>>;

export default function JobApplyRun() {
  const { runId = '' } = useParams();
  const [view, setView] = useState<JobApplyView>('suggested');
  const [appliedFilter, setAppliedFilter] = useState<JobApplyAppliedFilter>(APPLIED_UI ? 'no' : 'any');
  const [accountId, setAccountId] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(readPageSize);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Tailored resumes picked for download (resume job ids); kept across buckets and pages.
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [downloadingPicked, setDownloadingPicked] = useState(false);
  const [pickingProfile, setPickingProfile] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [thresholdDraft, setThresholdDraft] = useState<number | null>(null);
  const [busy, setBusy] = useState<'cancel' | 'retry' | 'bulk' | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [confirmTailorAll, setConfirmTailorAll] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [infoRow, setInfoRow] = useState<string | null>(null);
  // An earlier step opened from the step track (null: the run's own step).
  const [stepView, setStepView] = useState<Step | null>(null);
  const [tailorCoverLetter, setTailorCoverLetter] = useState(false);
  const [tailorProfiles, setTailorProfiles] = useState<Set<string>>(new Set());
  // The jobs the open tailor dialog is for: the ones that were selected when it opened, or null for every suggested job.
  const [tailorRowIds, setTailorRowIds] = useState<string[] | null>(null);
  const [tailorPreview, setTailorPreview] = useState<{ queued: number; skippedCap: number } | null>(null);
  // Picked in the tailor dialog and remembered (shared with the Resume page). '' when the model list can't load: the
  // server then uses its default.
  const coverLetterModel = useModelChoice('cover_letter');
  // Only for RESUME_MODEL's cost estimate in the tailor dialog (same request and cache as the Resume page's picker).
  const { data: resumeModels } = useSWR(['resume-models', 'resume'], () => api.listResumeModels('resume'), {
    shouldRetryOnError: false,
    revalidateOnFocus: false,
  });
  const [since] = useState(localMidnightIso);
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());

  const tailoringPending = (r?: api.JobApplyRun) => !!r?.tailoring && r.tailoring.queued + r.tailoring.inProgress > 0;
  const { data: run, mutate: mutateRun } = useSWR(
    ['job-apply-run', runId, since],
    () => api.getJobApplyRun(runId, since),
    { refreshInterval: (latest) => (latest && (isActive(latest.status) || tailoringPending(latest)) ? 3000 : 0) },
  );
  const active = run ? isActive(run.status) : false;
  const refreshRun = useRunRefresh(runId);
  // Jobs other people corrected or approved since this run read them: bring them up to date once per status (no fetch,
  // no AI call).
  const syncedFor = useRef('');
  useEffect(() => {
    if (!run || active) return;
    const mark = `${runId}:${run.status}`;
    if (syncedFor.current === mark) return;
    syncedFor.current = mark;
    api
      .syncJobApplyRunInfo(runId)
      .then(async (res) => {
        if (!res.updated) return;
        await refreshRun();
        notify.info(`${res.updated} job${res.updated === 1 ? '' : 's'} updated from corrections and approvals made by others`);
      })
      .catch(() => undefined);
  }, [run, active, runId, refreshRun]);
  const polling = active || tailoringPending(run);

  const { data: rowsData, isLoading: rowsLoading, mutate: mutateRows } = useSWR(
    run ? ['job-apply-rows', runId, view, appliedFilter, accountId, page, pageSize, run.threshold] : null,
    () => api.listJobApplyRows(runId, { view, applied: appliedFilter, accountId, page, limit: pageSize }),
    { refreshInterval: polling ? 3000 : 0, keepPreviousData: true },
  );
  const rows = useMemo(() => rowsData?.rows ?? [], [rowsData]);
  const pagination = rowsData?.pagination;

  const profileNames = useMemo(
    () => Object.fromEntries((run?.profiles ?? []).map((p) => [p.accountId, p.name])),
    [run?.profiles],
  );
  const resumesById = useMemo(() => new Map((run?.resumes ?? []).map((r) => [r.resumeId, r])), [run?.resumes]);
  const healthByResume = useMemo(
    () => Object.fromEntries((run?.resumes ?? []).map((r) => [r.resumeId, r.health])),
    [run?.resumes],
  );

  // Debounced threshold change: PATCH the run, then the rows key (which includes the threshold) refetches.
  const threshold = thresholdDraft ?? run?.threshold ?? 75;
  const debounce = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (thresholdDraft === null || !run || thresholdDraft === run.threshold) return;
    window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(async () => {
      try {
        const updated = await api.updateJobApplyRun(runId, { threshold: thresholdDraft });
        await mutateRun({ ...updated, appliedInRun: run.appliedInRun, appliedSince: run.appliedSince }, { revalidate: false });
        setThresholdDraft(null);
        setPage(1);
      } catch (err) {
        notify.error(err, 'Could not update the minimum score');
      }
    }, 400);
    return () => window.clearTimeout(debounce.current);
  }, [thresholdDraft, run, runId, mutateRun]);

  // Keep the keyboard focus on a row that exists; scroll it into view.
  useEffect(() => {
    if (rows.length && (!focusedId || !rows.some((r) => r._id === focusedId))) setFocusedId(rows[0]._id);
  }, [rows, focusedId]);
  useEffect(() => {
    if (focusedId) rowRefs.current.get(focusedId)?.scrollIntoView({ block: 'nearest' });
  }, [focusedId]);

  const resetPaging = () => {
    setPage(1);
    setExpanded(null);
    setSelected(new Set());
  };
  const changePageSize = (n: number) => {
    setPageSize(n);
    resetPaging();
    try {
      window.localStorage.setItem(PAGE_SIZE_KEY, String(n));
    } catch {
      /* storage unavailable */
    }
  };
  const goToPage = (p: number) => {
    setPage(p);
    setExpanded(null);
    setSelected(new Set());
    setFocusedId(null);
  };

  const sameFile = (m: { resumeId?: string | null; tailoredJobId?: string | null }, f: AppliedFile) =>
    f.tailoredJobId ? m.tailoredJobId === f.tailoredJobId : !!f.resumeId && m.resumeId === f.resumeId;

  /** Optimistic: the row shows the change at once; on failure the server state is reloaded. */
  const toggleFile = useCallback(
    async (row: JobApplyRow, file: AppliedFile, applied: boolean, label: string, { undo = true } = {}) => {
      if (row.appliedResumes.some((m) => sameFile(m, file)) === applied) return;
      await mutateRows(
        (prev: RowsPage | undefined) =>
          prev && {
            ...prev,
            rows: prev.rows.map((r) => {
              if (r._id !== row._id) return r;
              const marks = applied
                ? [...r.appliedResumes, { ...file, at: new Date().toISOString() }]
                : r.appliedResumes.filter((m) => !sameFile(m, file));
              const stillMarked = marks.some((m) => m.accountId === file.accountId);
              const applications = r.applications.map((a) =>
                a.accountId !== file.accountId ? a : { ...a, state: stillMarked ? ('applied' as const) : ('ready' as const) },
              );
              const done = applications.length ? applications.every((a) => a.state === 'applied') : marks.length > 0;
              return { ...r, applied: done, appliedResumes: marks, applications };
            }),
          },
        { revalidate: false },
      );
      const delta = applied ? 1 : -1;
      void mutateRun(
        (prev) => prev && { ...prev, appliedInRun: (prev.appliedInRun ?? 0) + delta, appliedSince: (prev.appliedSince ?? 0) + delta },
        { revalidate: false },
      );
      try {
        await api.setJobApplyResumeApplied(row._id, { ...file, applied });
        void mutateRun();
        if (applied && undo) {
          toast(
            (t) => (
              <span className="flex items-center gap-3">
                <span>
                  Applied: {row.title || 'job'} · {label}
                </span>
                <button
                  type="button"
                  className="font-semibold text-sky-700 underline dark:text-sky-400"
                  onClick={() => {
                    toast.dismiss(t.id);
                    void toggleFile({ ...row, appliedResumes: [...row.appliedResumes, { ...file, at: null }] }, file, false, label, { undo: false });
                  }}
                >
                  Undo
                </button>
              </span>
            ),
            { duration: 4000, style: { fontSize: '0.875rem' } },
          );
        }
      } catch (err) {
        notify.error(err, 'Could not save — reloaded the list');
        void mutateRows();
        void mutateRun();
      }
    },
    [mutateRows, mutateRun],
  );
  const toggleApplied = useCallback(
    (row: JobApplyRow, s: JobApplySuggestion, applied: boolean) =>
      toggleFile(row, { accountId: s.accountId, resumeId: s.resumeId }, applied, `${profileNames[s.accountId] ?? 'Profile'} · ${s.filename}`),
    [toggleFile, profileNames],
  );

  // Tailor requests in flight (row + profile): a second click or `t` press waits for the first.
  const tailoringNow = useRef(new Set<string>());
  const tailor = useCallback(
    async (row: JobApplyRow, accountId: string) => {
      const key = `${row._id}:${accountId}`;
      if (tailoringNow.current.has(key)) return;
      tailoringNow.current.add(key);
      try {
        const { tailored } = await api.tailorJobApplyRow(row._id, { accountId });
        await mutateRows(
          (prev: RowsPage | undefined) =>
            prev && {
              ...prev,
              rows: prev.rows.map((r) =>
                r._id === row._id ? { ...r, tailored: [...r.tailored.filter((t) => t.accountId !== accountId), tailored] } : r,
              ),
            },
          { revalidate: false },
        );
        void mutateRun();
      } catch (err) {
        notify.error(err, 'Could not start tailoring');
      } finally {
        tailoringNow.current.delete(key);
      }
    },
    [mutateRows, mutateRun],
  );

  /** Tailor for every profile this job is open to that has no tailored resume yet (or only a failed one). */
  const tailorRow = useCallback(
    async (row: JobApplyRow) => {
      for (const acc of orderedProfiles(row)) {
        const t = row.tailored.find((x) => x.accountId === acc);
        if (!t || t.status === 'failed') await tailor(row, acc);
      }
    },
    [tailor],
  );

  const downloadTailored = useCallback(async (row: JobApplyRow, t: api.JobApplyTailored) => {
    if (t.status !== 'completed') return;
    const company = (row.company || row.title || 'job').replace(/[^\w .()-]+/g, '_');
    const who = (profileNames[t.accountId] ?? 'Profile').replace(/[^\w .()-]+/g, '_');
    try {
      await api.downloadTailoredResume(t.jobId, `Resume (${company}) - ${who}.pdf`);
    } catch (err) {
      notify.error(err, 'Could not download the tailored resume');
    }
  }, [profileNames]);

  const pick = useCallback((jobId: string, on: boolean) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(jobId);
      else next.delete(jobId);
      return next;
    });
  }, []);

  const readyOnPage = useMemo(
    () => rows.flatMap((r) => r.tailored.filter((t) => t.status === 'completed').map((t) => t.jobId)),
    [rows],
  );

  /** Pick every ready tailored resume of one profile in the whole run (all pages and buckets). */
  const pickProfile = useCallback(
    async (acc: string) => {
      if (!acc) return;
      setPickingProfile(true);
      try {
        const { jobIds } = await api.listReadyTailored(runId, acc);
        const name = profileNames[acc] ?? 'this profile';
        if (!jobIds.length) {
          notify.info(`No tailored resumes ready for ${name} yet`);
          return;
        }
        setPicked((prev) => new Set([...prev, ...jobIds]));
        notify.success(`Selected ${jobIds.length} resume${jobIds.length === 1 ? '' : 's'} for ${name}`);
      } catch (err) {
        notify.error(err, 'Could not select that profile’s resumes');
      } finally {
        setPickingProfile(false);
      }
    },
    [runId, profileNames],
  );

  /** Same download as the Resume page: <Profile>/<Company>/Resume.pdf into a picked folder, else one zip. */
  const downloadPicked = useCallback(async () => {
    const ids = [...picked];
    if (!ids.length) return;
    setDownloadingPicked(true);
    try {
      await api.bulkDownloadResumeJobs(ids);
      notify.success(`Downloaded ${ids.length} resume${ids.length === 1 ? '' : 's'}`);
    } catch (err) {
      notify.error(err, 'Could not download the selected resumes');
    } finally {
      setDownloadingPicked(false);
    }
  }, [picked]);

  const download = useCallback(
    async (s: { accountId: string; resumeId: string }) => {
      if (!resumesById.get(s.resumeId)?.hasFile) {
        notify.info('The original file isn’t stored for this resume');
        return;
      }
      const tab = window.open('', '_blank'); // opened now, while this is still a user action, so it isn't blocked
      try {
        const { url } = await api.getAccountResumeFileUrl(s.accountId, s.resumeId);
        const href = safeHref(url);
        if (!href) throw new Error('The file link is not a web address');
        if (tab) tab.location.href = href;
        else window.location.href = href;
      } catch (err) {
        tab?.close();
        notify.error(err, 'Could not download the resume');
      }
    },
    [resumesById],
  );

  const toggleSelected = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const undoToast = (text: string, marks: JobApplyMarkRef[]) =>
    toast(
      (t) => (
        <span className="flex items-center gap-3">
          <span>{text}</span>
          <button
            type="button"
            className="font-semibold text-sky-700 underline dark:text-sky-400"
            onClick={async () => {
              toast.dismiss(t.id);
              try {
                await api.unmarkJobApplied(runId, marks);
                await Promise.all([mutateRows(), mutateRun()]);
              } catch (err) {
                notify.error(err, 'Could not undo');
              }
            }}
          >
            Undo
          </button>
        </span>
      ),
      { duration: 8000, style: { fontSize: '0.875rem' } },
    );

  const applicationsText = (n: number) => `${n} application${n === 1 ? '' : 's'}`;

  /** Mark every ready application applied: on all suggested jobs, or on the selected ones. */
  const bulkMark = async (scope: 'selected' | 'all') => {
    setBusy('bulk');
    setConfirmAll(false);
    try {
      const res = await api.markTopJobApplied(
        runId,
        scope === 'all' ? { all: true, accountId } : { rowIds: [...selected], accountId },
      );
      setSelected(new Set());
      await Promise.all([mutateRows(), mutateRun()]);
      if (!res.marked) {
        notify.info('Nothing to mark: no ready application on those jobs (already applied, still tailoring, or no resume).');
        return;
      }
      undoToast(`Marked ${applicationsText(res.marked)} applied`, res.marks);
    } catch (err) {
      notify.error(err, 'Could not mark the jobs applied');
    } finally {
      setBusy(null);
    }
  };

  /** `a`: mark this job's ready applications applied, at once on screen, then save. */
  const markRow = useCallback(
    async (row: JobApplyRow) => {
      const ready = row.applications.filter((a) => a.state === 'ready' && (!accountId || a.accountId === accountId));
      if (!ready.length) return;
      const readyIds = new Set(ready.map((a) => a.accountId));
      const patchRow = (fn: (r: JobApplyRow) => JobApplyRow) =>
        mutateRows((prev: RowsPage | undefined) => prev && { ...prev, rows: prev.rows.map((r) => (r._id === row._id ? fn(r) : r)) }, {
          revalidate: false,
        });
      await patchRow((r) => {
        const applications = r.applications.map((a) => (readyIds.has(a.accountId) ? { ...a, state: 'applied' as const } : a));
        return { ...r, applications, applied: applications.every((a) => a.state === 'applied') };
      });
      try {
        const res = await api.markTopJobApplied(runId, { rowIds: [row._id], accountId });
        const at = new Date().toISOString();
        await patchRow((r) => ({ ...r, appliedResumes: [...r.appliedResumes, ...res.marks.map((m) => ({ ...m, at }))] }));
        void mutateRun();
        if (res.marked) {
          const who = res.marks.map((m) => profileNames[m.accountId] ?? 'Profile').join(', ');
          undoToast(`Applied: ${row.title || 'job'} · ${who}`, res.marks);
        }
      } catch (err) {
        notify.error(err, 'Could not save — reloaded the list');
        void mutateRows();
        void mutateRun();
      }
    },
    [accountId, mutateRows, mutateRun, profileNames, runId],
  );

  // Keyboard flow for fast applying (see SHORTCUTS).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (stepView !== null) return; // an earlier step is shown: the shortcuts act on step 3's table
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || isTyping(e.target)) return;
      if (e.key === '?') {
        e.preventDefault();
        setShowHelp((v) => !v);
        return;
      }
      if (document.documentElement.classList.contains('dialog-open') || !rows.length) return;
      const idx = Math.max(0, rows.findIndex((r) => r._id === focusedId));
      const row = rows[idx];
      const move = (delta: number) => {
        const next = idx + delta;
        if (next >= 0 && next < rows.length) setFocusedId(rows[next]._id);
        else if (next >= rows.length && pagination?.hasNext) goToPage(page + 1);
        else if (next < 0 && pagination?.hasPrev) goToPage(page - 1);
      };
      const key = e.key.toLowerCase();
      if (key === 'j') move(1);
      else if (key === 'k') move(-1);
      else if (key === 'o' && safeHref(row.url)) window.open(safeHref(row.url), '_blank', 'noopener');
      else if (key === 't') void tailorRow(row);
      else if (key === 'd') {
        const ready = firstReadyTailored(row);
        if (ready) void downloadTailored(row, ready);
        else if (row.suggestions[0]) void download(row.suggestions[0]);
      }
      else if (key === 'x') toggleSelected(row._id);
      else if (key === 'c') void copyLinks(selectedRows.length ? selectedRows : [row]);
      else if (e.key === 'Enter') setExpanded((cur) => (cur === row._id ? null : row._id));
      else if (APPLIED_UI && key === 'a') {
        // Every profile with a resume ready; ones already applied are left (no second application / bid).
        void markRow(row);
        move(1);
      } else if (APPLIED_UI && /^[1-9]$/.test(e.key)) {
        const s = row.suggestions[Number(e.key) - 1];
        if (!s) return;
        void toggleApplied(row, s, !row.appliedResumes.some((m) => m.resumeId === s.resumeId));
      } else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  /** Open the tailor dialog for the given jobs (the selected ones), or for every suggested job with `null`. */
  const openTailor = (rowIds: string[] | null) => {
    setTailorRowIds(rowIds);
    setTailorProfiles(new Set((run?.profiles ?? []).map((p) => p.accountId)));
    setTailorPreview(null);
    setConfirmTailorAll(true);
  };
  // Exact count for the dialog, from a dry run with the profiles ticked.
  useEffect(() => {
    if (!confirmTailorAll) return;
    let cancelled = false;
    setTailorPreview(null);
    api
      .tailorAllJobApplies(runId, { accountIds: [...tailorProfiles], ...(tailorRowIds && { rowIds: tailorRowIds }), dryRun: true })
      .then((res) => !cancelled && setTailorPreview(res))
      .catch(() => !cancelled && setTailorPreview({ queued: 0, skippedCap: 0 }));
    return () => {
      cancelled = true;
    };
  }, [confirmTailorAll, tailorProfiles, tailorRowIds, runId]);

  const selectedRows = rows.filter((r) => selected.has(r._id));

  /** Copy these jobs' posting links, one per line (each link once). */
  const copyLinks = useCallback(async (jobs: JobApplyRow[]) => {
    const { links, skipped } = collectLinks(jobs);
    if (!links.length) {
      notify.info('None of those jobs has a link to copy');
      return;
    }
    try {
      await navigator.clipboard.writeText(links.join('\n'));
      notify.success(`Copied ${links.length} link${links.length === 1 ? '' : 's'}${skipped ? ` · ${skipped} left out (no link, or repeated)` : ''}`);
    } catch (err) {
      notify.error(err, 'Could not copy the links');
    }
  }, []);

  // Typical LLM spend of one tailored resume (plus its cover letter when asked) with these models; null if unknown.
  const resumeCostUsd = resumeModels?.models.find((m) => m.id === RESUME_MODEL.id)?.estCostUsd;
  const letterCostUsd = tailorCoverLetter ? pickedModel(coverLetterModel)?.estCostUsd : 0;
  const perTailorUsd = resumeCostUsd == null || letterCostUsd == null ? null : resumeCostUsd + letterCostUsd;

  const tailorAll = async () => {
    setConfirmTailorAll(false);
    setBusy('bulk');
    try {
      const res = await api.tailorAllJobApplies(runId, {
        accountIds: [...tailorProfiles],
        ...(tailorRowIds && { rowIds: tailorRowIds }),
        coverLetter: tailorCoverLetter,
        coverLetterModel: tailorCoverLetter ? coverLetterModel.value || undefined : undefined,
      });
      if (tailorRowIds) setSelected(new Set());
      notify.success(
        res.queued
          ? `Tailoring ${res.queued} resume${res.queued === 1 ? '' : 's'}${res.skippedCap ? ` · ${res.skippedCap} skipped (daily limit)` : ''}${res.skipped ? ` · ${res.skipped} skipped (profile has no HTML template?)` : ''}`
          : res.skippedCap
            ? `Daily limit reached · ${res.skippedCap} not queued`
            : 'Every job to apply to already has a tailored resume',
      );
      await Promise.all([mutateRows(), mutateRun()]);
    } catch (err) {
      notify.error(err, 'Could not start tailoring');
    } finally {
      setBusy(null);
    }
  };

  const onCancel = async () => {
    setBusy('cancel');
    try {
      await api.cancelJobApplyRun(runId);
      await mutateRun();
    } catch (err) {
      notify.error(err, 'Could not cancel the run');
    } finally {
      setBusy(null);
    }
  };

  const onRetry = async () => {
    setBusy('retry');
    try {
      const res = await api.retryJobApplyRun(runId);
      notify.info(`Retrying ${res.reset} job${res.reset === 1 ? '' : 's'}`);
      await mutateRun();
      await mutateRows();
    } catch (err) {
      notify.error(err, 'Could not retry');
    } finally {
      setBusy(null);
    }
  };

  if (!run) {
    return (
      <div>
        <PageHeader title="Job Applies" backTo="/job-applies" />
        <p role="status" className="flex items-center gap-2 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading run…
        </p>
      </div>
    );
  }

  // Screen phase: progress while jobs are checked, then the report where profiles are picked per location group.
  if (run.phase === 'screen') {
    const c = run.counts;
    const done = Math.min(c.total, c.extracted + c.failed);
    return (
      <div className="space-y-5">
        <PageHeader
          title={run.fileName}
          backTo="/job-applies"
          action={
            active ? (
              <button type="button" className="btn-outline btn-sm" onClick={onCancel} disabled={busy !== null}>
                {busy === 'cancel' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Square className="h-4 w-4" aria-hidden />}
                Cancel
              </button>
            ) : undefined
          }
        />
        <StepTrack
          current={stepView ?? runStep(run)}
          reached={runStep(run)}
          onStep={(s) => setStepView(s === runStep(run) ? null : s)}
          hint={
            stepView === 1
              ? 'Every job and what the check found. Go to ② to pick who applies.'
              : run.status === 'screened'
                ? 'Pick who applies in each market, then score. Next: the best resume per job, ready to tailor and apply.'
                : 'Opening every link and reading each job. Next: you pick which profiles apply in each market.'
          }
        />
        {(run.status !== 'screened' || stepView === 1) && <SourceLine run={run} />}
        {run.status === 'screened' && stepView === 1 ? (
          <ScreeningReport runId={runId} checksOnly onRunChanged={() => void mutateRun()} />
        ) : run.status === 'screened' ? (
          <ScreeningReport runId={runId} onStarted={() => void mutateRun()} onRunChanged={() => void mutateRun()} />
        ) : active ? (
          <section className="panel space-y-3 p-6" aria-label="Checking jobs">
            <p className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300" role="status">
              <Loader2 className="h-4 w-4 animate-spin text-sky-600" aria-hidden />
              Checking {done} / {c.total} jobs · {c.extracted} read · {c.failed} couldn’t be used so far
            </p>
            <div
              className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
              role="progressbar"
              aria-valuenow={c.total ? Math.round((done / c.total) * 100) : 0}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Checking jobs"
            >
              <div className="h-full rounded-full bg-sky-600 dark:bg-sky-400" style={{ width: `${c.total ? (done / c.total) * 100 : 0}%` }} />
            </div>
            <p className="hint">You can leave this page: the check keeps running, and the run shows “Ready to review” when it’s done.</p>
          </section>
        ) : (
          <RunSummary run={run} onView={() => undefined} onRetry={onRetry} retrying={busy === 'retry'} />
        )}
      </div>
    );
  }

  const profileOptions = [
    { value: '', label: 'All profiles' },
    ...(run.profiles ?? []).map((p) => ({ value: p.accountId, label: p.name })),
  ];
  const allOnPageSelected = rows.length > 0 && rows.every((r) => selected.has(r._id));
  // The profiles picked for a job's location group(s), for its Location cell.
  const pickedFor = (row: JobApplyRow) =>
    [
      ...new Set([
        ...(row.markets?.length ? row.markets : ['none']).flatMap((m) => run.assignments[m] ?? []),
        ...(run.assignments['*'] ?? []),
      ]),
    ]
      .map((id) => profileNames[id])
      .filter(Boolean)
      .join(', ');

  const header = (
    <PageHeader
      title={run.fileName}
      backTo="/job-applies"
      action={
        <>
          <button type="button" className="btn-outline btn-sm" onClick={() => setShowHelp(true)}>
            <Keyboard className="h-4 w-4" aria-hidden />
            Shortcuts
          </button>
          {active && (
            <button type="button" className="btn-outline btn-sm" onClick={onCancel} disabled={busy !== null}>
              {busy === 'cancel' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Square className="h-4 w-4" aria-hidden />}
              Cancel run
            </button>
          )}
        </>
      }
    />
  );
  const track = (
    <StepTrack
      current={stepView ?? 3}
      reached={run.screenedAt ? 3 : undefined}
      onStep={(s) => setStepView(s === 3 ? null : s)}
      hint={
        stepView === 1
          ? 'Every job and what the check found.'
          : stepView === 2
            ? active
              ? 'Scoring is running with these picks. You can change them once it’s done.'
              : 'Change who applies in each location group, then score again. Your tailored resumes and sheet rows stay.'
            : active
              ? 'Scoring your resumes against each job. Next: export to your sheet, tailor the rest, apply.'
              : 'Export to your sheet and tailor the jobs that need it, then download the resumes you want.'
      }
    />
  );

  // An earlier step, opened from the step track: ① what the check found, ② the picks (change them, score again).
  if (stepView !== null) {
    return (
      <div className="space-y-5">
        {header}
        {track}
        <button type="button" className="btn-outline btn-sm" onClick={() => setStepView(null)}>
          <ChevronRight className="h-4 w-4 rotate-180" aria-hidden /> Back to ③ Tailor &amp; apply
        </button>

        {stepView === 1 ? (
          <>
            <SourceLine run={run} />
            <ScreeningReport runId={runId} checksOnly readOnly />
          </>
        ) : active ? (
          <ScreeningReport runId={runId} readOnly assignments={run.assignments} />
        ) : (
          <ScreeningReport
            runId={runId}
            rescore={{ assignments: run.assignments, selection: run.selection, threshold: run.threshold }}
            onStarted={() => {
              setStepView(null);
              void mutateRun();
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {header}
      {track}

      <RunSummary
        run={run}
        onView={(v) => {
          setView(v);
          setAppliedFilter('any');
          resetPaging();
        }}
        onRetry={onRetry}
        retrying={busy === 'retry'}
      />

      <div className="toolbar space-y-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <Segmented
            label="Jobs"
            value={view}
            onChange={(v) => {
              setView(v);
              resetPaging();
            }}
            options={[
              { value: 'suggested', label: 'Suggested', count: run.suggested },
              { value: 'all', label: 'All', count: run.counts.total },
              { value: 'excluded', label: 'Excluded', count: run.excludedCount ?? run.counts.excluded },
              { value: 'failed', label: 'Failed', count: run.counts.failed },
            ]}
          />
          {APPLIED_UI && (
            <Segmented
              label="Status"
              value={appliedFilter}
              onChange={(v) => {
                setAppliedFilter(v);
                resetPaging();
              }}
              options={APPLIED_FILTERS}
            />
          )}
        </div>
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <div className="w-56">
            <Select
              value={accountId}
              onChange={(v) => {
                setAccountId(v);
                resetPaging();
              }}
              options={profileOptions}
              ariaLabel="Profile"
            />
          </div>
          <div className="min-w-[14rem] flex-1 sm:max-w-xs">
            <label htmlFor="threshold" className="form-label">
              Minimum score <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{threshold}</span>
            </label>
            <input
              id="threshold"
              type="range"
              min={50}
              max={95}
              value={threshold}
              onChange={(e) => setThresholdDraft(Number(e.target.value))}
              className="w-full accent-sky-600"
            />
          </div>
        </div>
      </div>

      {run.applications && (
        <ApplyWorkflow
          counts={run.applications}
          profileFilter={accountId ? { accountId, name: profileNames[accountId] ?? 'this profile' } : undefined}
          busy={busy !== null}
          tailorModel={RESUME_MODEL.label}
          onTailor={() => openTailor(null)}
          onExport={() => setShowExport(true)}
          onMark={APPLIED_UI ? () => setConfirmAll(true) : undefined}
        />
      )}

      {/* The job's info opens beside the table, on the right (above it on narrow screens), as in the step-2 lists. */}
      <div className="flex flex-col-reverse gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1 space-y-5">
          <div className="flex min-h-[2rem] flex-wrap items-center justify-between gap-3">
            {selected.size > 0 ? (
              <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Selected jobs">
                <span className="text-sm font-medium text-zinc-800 dark:text-zinc-100">{selected.size} selected</span>
                <button type="button" className="btn-outline btn-sm" onClick={() => void copyLinks(selectedRows)}>
                  <Copy className="h-4 w-4" aria-hidden />
                  Copy links
                </button>
                <button type="button" className="btn-outline btn-sm" onClick={() => openTailor([...selected])} disabled={busy !== null}>
                  <Sparkles className="h-4 w-4" aria-hidden />
                  Tailor
                </button>
                {APPLIED_UI && (
                  <button type="button" className="btn btn-sm" onClick={() => void bulkMark('selected')} disabled={busy !== null}>
                    {busy === 'bulk' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <CheckCheck className="h-4 w-4" aria-hidden />}
                    Mark applied
                  </button>
                )}
                <button type="button" className="btn-outline btn-sm" onClick={() => setSelected(new Set())}>
                  <X className="h-4 w-4" aria-hidden />
                  Clear
                </button>
              </div>
            ) : (
              <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
                {pagination ? pagination.total : '…'} job{pagination?.total === 1 ? '' : 's'}
                {appliedFilter === 'no' ? ' to apply to' : appliedFilter === 'yes' ? ' applied' : ''}
              </p>
            )}
            <Pagination info={pagination} onPage={goToPage} label="Pages (top)" />
          </div>

          {(picked.size > 0 || readyOnPage.length > 0 || (run.profiles ?? []).length > 0) && (
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Resumes selected for download">
              <span className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
                {picked.size > 0 ? `${picked.size} resume${picked.size === 1 ? '' : 's'} selected` : 'Resumes'}
              </span>
              {(run.profiles ?? []).length > 0 && (
                <select
                  className="select focus-ring w-auto py-1 text-sm"
                  aria-label="Select every ready tailored resume of a profile"
                  value=""
                  disabled={pickingProfile}
                  onChange={(e) => void pickProfile(e.target.value)}
                >
                  <option value="">{pickingProfile ? 'Selecting…' : 'Select profile…'}</option>
                  {(run.profiles ?? []).map((p) => (
                    <option key={p.accountId} value={p.accountId}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}
              {picked.size > 0 && (
                <button type="button" className="btn btn-sm" onClick={() => void downloadPicked()} disabled={downloadingPicked}>
                  {downloadingPicked ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Download className="h-4 w-4" aria-hidden />}
                  Download selected ({picked.size})
                </button>
              )}
              {readyOnPage.some((id) => !picked.has(id)) && (
                <button
                  type="button"
                  className="btn-outline btn-sm"
                  onClick={() => setPicked((prev) => new Set([...prev, ...readyOnPage]))}
                >
                  Select all on this page
                </button>
              )}
              {picked.size > 0 && (
                <button type="button" className="btn-outline btn-sm" onClick={() => setPicked(new Set())}>
                  <X className="h-4 w-4" aria-hidden />
                  Clear
                </button>
              )}
            </div>
          )}

          <div className="table-wrap">
            {rowsLoading && rows.length === 0 ? (
              <p role="status" className="flex items-center gap-2 p-6 text-sm text-muted">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading jobs…
              </p>
            ) : rows.length === 0 ? (
              <p className="p-6 text-sm text-muted">
                {active
                  ? 'Jobs appear here as they are processed.'
                  : appliedFilter === 'no' && view === 'suggested'
                    ? 'Nothing left to apply to here. Switch to “All” or lower the minimum score.'
                    : 'No jobs match this view.'}
              </p>
            ) : (
              <table className="min-w-full text-sm">
                <thead className="table-head whitespace-nowrap">
                  <tr>
                    <th className="w-8 px-3 py-2 font-medium">
                      <input
                        type="checkbox"
                        checked={allOnPageSelected}
                        onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r._id)) : new Set())}
                        aria-label="Select all jobs on this page"
                      />
                    </th>
                    <th className="w-10 px-3 py-2 font-medium">#</th>
                    <th className="px-3 py-2 font-medium">Job</th>
                    <th className="px-3 py-2 font-medium">Posted</th>
                    <th className="px-3 py-2 font-medium">Work mode</th>
                    <th className="px-3 py-2 font-medium">Location</th>
                    <th className="px-3 py-2 font-medium">Flags</th>
                    <th className="px-3 py-2 font-medium">Apply with</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const isOpen = expanded === row._id;
                    const isFocused = focusedId === row._id;
                    const age = ageDays(row.postedDate);
                    return (
                      <Fragment key={row._id}>
                        <tr
                          ref={(el) => {
                            if (el) rowRefs.current.set(row._id, el);
                            else rowRefs.current.delete(row._id);
                          }}
                          onClick={() => setFocusedId(row._id)}
                          className={`table-row align-top ${APPLIED_UI && row.applied ? 'opacity-60' : ''} ${
                            isFocused ? 'bg-sky-50/70 shadow-[inset_3px_0_0_0] shadow-sky-600 dark:bg-sky-950/30 dark:shadow-sky-400' : ''
                          }`}
                          aria-current={isFocused ? 'true' : undefined}
                        >
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={selected.has(row._id)}
                              onChange={() => toggleSelected(row._id)}
                              aria-label={`Select ${row.title || 'job'}`}
                            />
                          </td>
                          <td className="px-3 py-2 tabular-nums text-zinc-500">{row.rowIndex}</td>
                          <td className="max-w-xs px-3 py-2">
                            <div className="flex items-start gap-1.5">
                              <button
                                type="button"
                                className="btn-icon -ml-1.5"
                                aria-expanded={isOpen}
                                aria-label={isOpen ? 'Hide score breakdown' : 'Show score breakdown'}
                                onClick={() => setExpanded(isOpen ? null : row._id)}
                                disabled={!row.topScore && row.status !== 'scored' && row.status !== 'excluded'}
                              >
                                {isOpen ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />}
                              </button>
                              <div className="min-w-0">
                                {/* wrap rather than truncate: a one-line title holds the column at full width and pushes
                                    Apply with past the table's edge on narrower screens */}
                                <p className="line-clamp-2 font-medium text-zinc-800 dark:text-zinc-100" title={row.title || undefined}>
                                  {row.title || 'Untitled role'}
                                </p>
                                <p className="line-clamp-1 text-xs text-zinc-500">
                                  {row.company}
                                  {safeHref(row.url) && (
                                    <a
                                      href={safeHref(row.url)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="ml-1 inline-flex items-center gap-0.5 text-sky-700 hover:underline dark:text-sky-400"
                                    >
                                      {row.company ? 'open' : hostOf(row.url ?? '')}
                                      <ExternalLink className="h-3 w-3" aria-hidden />
                                      <span className="sr-only">(opens in a new tab)</span>
                                    </a>
                                  )}
                                  <button
                                    type="button"
                                    className="btn-icon ml-1 inline-flex align-middle"
                                    onClick={() => setInfoRow(row._id)}
                                    aria-label="Job info and description"
                                    title="Job info and description"
                                  >
                                    <FileText className="h-3.5 w-3.5" aria-hidden />
                                  </button>
                                  {row.humanEdited && <span className="badge-info ml-1 align-middle">Edited</span>}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2">
                            {row.postedDate ? (
                              <>
                                {formatDate(row.postedDate)}
                                {age !== null && <span className="hint block">{age === 0 ? 'today' : `${age}d ago`}</span>}
                              </>
                            ) : (
                              <span className="hint">Unknown</span>
                            )}
                          </td>
                          <td className="px-3 py-2">{capitalize(row.workMode) || <span className="hint">—</span>}</td>
                          <td className="max-w-[10rem] px-3 py-2">
                            {row.groupKey ? (
                              locationLabel(row.groupKey)
                            ) : row.allowedLocations.length ? (
                              row.allowedLocations.map((l) => l.value).join(', ')
                            ) : (
                              <span className="hint">Not stated</span>
                            )}
                            {row.status === 'unassigned' ? (
                              <p className="hint">No profile picked</p>
                            ) : (
                              row.groupKey &&
                              run.screenedAt &&
                              !run.autoStart && (
                                <p className="hint line-clamp-2" title={pickedFor(row)}>
                                  {pickedFor(row)}
                                </p>
                              )
                            )}
                          </td>
                          <td className="max-w-[14rem] px-3 py-2">
                            <Flags row={row} profileNames={profileNames} />
                          </td>
                          <td className="px-3 py-2">
                            <Suggestions
                              row={row}
                              threshold={run.threshold}
                              profileNames={profileNames}
                              hasFile={(id) => !!resumesById.get(id)?.hasFile}
                              onDownload={(s) => void download(s)}
                              tailorModel={RESUME_MODEL.label}
                              onTailor={(acc) => void tailor(row, acc)}
                              onTailorAll={() => void tailorRow(row)}
                              onDownloadTailored={(t) => void downloadTailored(row, t)}
                              isPicked={(id) => picked.has(id)}
                              onPick={pick}
                            />
                          </td>
                        </tr>
                        {isOpen && (
                          <tr>
                            <td colSpan={8} className="bg-zinc-50/60 px-4 py-4 dark:bg-zinc-900/40">
                              <RowDetail rowId={row._id} profileNames={profileNames} healthByResume={healthByResume} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Pagination info={pagination} onPage={goToPage} pageSize={pageSize} onPageSize={changePageSize} label="Pages (bottom)" />
            <button type="button" className="hint hover:text-zinc-800 dark:hover:text-zinc-200" onClick={() => setShowHelp(true)}>
              Press <kbd className="rounded border border-zinc-300 px-1 font-mono dark:border-zinc-600">?</kbd> for keyboard shortcuts
            </button>
          </div>
        </div>
        {infoRow && (
          <JobInfoPanel
            rowId={infoRow}
            runId={runId}
            onClose={() => setInfoRow(null)}
            canEdit
          />
        )}
      </div>

      <ConfirmDialog
        open={confirmAll}
        title="Mark as applied?"
        body={(() => {
          const c = run.applications;
          const ready = accountId ? c?.byProfile.find((p) => p.accountId === accountId)?.ready ?? 0 : c?.ready ?? 0;
          const left = accountId ? 0 : (c?.tailoring ?? 0) + (c?.needsResume ?? 0);
          return (
            <div className="space-y-2">
              <p>
                <span className="font-semibold">{applicationsText(ready)}</span>
                {accountId ? ` of ${profileNames[accountId] ?? 'this profile'}` : ''} will be marked applied, across all pages: each
                profile with its tailored resume when it’s ready, otherwise its matching uploaded resume.
              </p>
              {left > 0 && <p className="hint">{applicationsText(left)} still tailoring or without a resume are left as they are.</p>}
              <p className="hint">You can undo it right after.</p>
            </div>
          );
        })()}
        confirmLabel="Mark applied"
        busy={busy === 'bulk'}
        onConfirm={() => void bulkMark('all')}
        onCancel={() => setConfirmAll(false)}
      />

      <ConfirmDialog
        open={confirmTailorAll}
        title={tailorRowIds ? `Tailor resumes for ${tailorRowIds.length} selected job${tailorRowIds.length === 1 ? '' : 's'}` : 'Tailor resumes'}
        body={
          <div className="space-y-4">
            <fieldset className="space-y-1.5">
              <legend className="form-label mb-1">For these profiles</legend>
              {(run.profiles ?? []).map((p) => (
                <label key={p.accountId} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={tailorProfiles.has(p.accountId)}
                    onChange={() =>
                      setTailorProfiles((prev) => {
                        const next = new Set(prev);
                        if (next.has(p.accountId)) next.delete(p.accountId);
                        else next.add(p.accountId);
                        return next;
                      })
                    }
                  />
                  {p.name}
                </label>
              ))}
            </fieldset>
            <div>
              <span className="form-label mb-1 block">Resume model</span>
              <p className="text-sm">
                {RESUME_MODEL.label} <span className="text-zinc-500">· always used for tailoring in Job Applies</span>
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={tailorCoverLetter} onChange={(e) => setTailorCoverLetter(e.target.checked)} />
              Also write a cover letter for each (doubles the AI calls)
            </label>
            {tailorCoverLetter && (
              <ModelSelect label="Cover letter model" choice={coverLetterModel} labelClassName="form-label mb-1 block" />
            )}
            <p className="text-sm">
              {tailorPreview === null ? (
                <span className="inline-flex items-center gap-1.5 text-zinc-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Counting…
                </span>
              ) : tailorPreview.queued ? (
                <>
                  <span className="font-semibold">{tailorPreview.queued}</span> tailored resume{tailorPreview.queued === 1 ? '' : 's'} will be
                  generated (one per job and profile, skipping ones that already have one)
                  {tailorPreview.skippedCap ? `; ${tailorPreview.skippedCap} more are over today’s limit` : ''}.
                  {perTailorUsd != null && (
                    <span className="hint block mt-1">About {formatUsd(perTailorUsd * tailorPreview.queued)} in AI costs.</span>
                  )}
                </>
              ) : (
                'Nothing to tailor: these jobs already have tailored resumes for these profiles, aren’t open to them, or today’s limit is reached.'
              )}
            </p>
          </div>
        }
        confirmLabel={tailorPreview?.queued ? `Tailor ${tailorPreview.queued}` : 'Start tailoring'}
        busy={busy === 'bulk'}
        onConfirm={() => {
          if (tailorPreview?.queued) void tailorAll();
        }}
        onCancel={() => setConfirmTailorAll(false)}
      />

      <ExportSheetDialog
        open={showExport}
        runId={runId}
        onClose={() => setShowExport(false)}
        onExported={() => {
          void mutateRows();
          void mutateRun();
        }}
      />

      <Modal open={showHelp} onClose={() => setShowHelp(false)} title="Keyboard shortcuts" size="sm">
        <p className="hint mb-3">The highlighted job is the one the keys act on. Click a row to highlight it.</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          {SHORTCUTS.map(([k, what]) => (
            <Fragment key={k}>
              <dt>
                <kbd className="rounded-md border border-zinc-300 bg-zinc-50 px-1.5 py-0.5 font-mono text-xs dark:border-zinc-600 dark:bg-zinc-800">
                  {k}
                </kbd>
              </dt>
              <dd className="text-zinc-700 dark:text-zinc-300">{what}</dd>
            </Fragment>
          ))}
        </dl>
      </Modal>
    </div>
  );
}
