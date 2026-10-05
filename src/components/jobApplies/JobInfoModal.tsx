import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { Loader2, RotateCcw } from 'lucide-react';
import * as api from '../../api/endpoints';
import type { JobApplyInfoPatch } from '../../api/endpoints';
import Modal from '../Modal';
import Select from '../Select';
import { COUNTRIES } from '../../lib/countries';
import { notify } from '../../lib/notify';
import { formatDate } from './format';
import { useRunRefresh } from './useRunRefresh';

const WORK_MODES = [
  { value: 'remote', label: 'Remote' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'onsite', label: 'On-site' },
  { value: 'unknown', label: 'Not stated' },
];
const CLEARANCE = [
  { value: 'none', label: 'Not required' },
  { value: 'preferred', label: 'Preferred' },
  { value: 'required', label: 'Required' },
];
const COUNTRY_CODES = new Set(COUNTRIES.map((c) => c.code));

type Location = { kind: 'country' | 'region'; value: string };

/** "US, GB, EU, Worldwide" → countries (ISO codes) and regions (anything else). */
function parseLocations(text: string): Location[] {
  return text
    .split(/[,;\n]/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((value) => (COUNTRY_CODES.has(value.toUpperCase()) ? { kind: 'country', value: value.toUpperCase() } : { kind: 'region', value }));
}

const locationsText = (list: Location[] | undefined) => (list ?? []).map((l) => l.value).join(', ');

interface Form {
  title: string;
  company: string;
  workMode: string;
  locations: string;
  postedDate: string;
  clearance: string;
  timezoneNote: string;
  jdText: string;
}

/**
 * A job as it was read, with its description, for anyone to check; admin and staff can correct it. A correction is
 * saved for the link, so everyone who uses the link sees it (and the AI isn't asked again). The description is
 * needed for a job that couldn't be fetched: paste it here.
 */
export default function JobInfoModal({
  rowId,
  runId,
  open,
  onClose,
  canEdit,
}: {
  rowId: string | null;
  runId: string;
  open: boolean;
  onClose: () => void;
  canEdit: boolean;
}) {
  const refresh = useRunRefresh(runId);
  const { data, isLoading, error } = useSWR(open && rowId ? ['job-apply-row', rowId] : null, () => api.getJobApplyRow(rowId!));
  const [form, setForm] = useState<Form | null>(null);
  const [base, setBase] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const syncedRow = useRef<string | null>(null);

  useEffect(() => {
    if (!data) return;
    const ex = (data.extraction ?? {}) as { clearance?: { level?: string } };
    const f: Form = {
      title: data.title ?? '',
      company: data.company ?? '',
      workMode: data.workMode ?? 'unknown',
      locations: locationsText(data.allowedLocations),
      postedDate: data.postedDate ? data.postedDate.slice(0, 10) : '',
      clearance: ex.clearance?.level ?? 'none',
      timezoneNote: data.timezoneNote ?? '',
      jdText: data.jdText ?? '',
    };
    setForm(f);
    setBase(f);
  }, [data]);

  // Corrected by someone after this job was read: bring the run up to date, then this window shows the correction.
  useEffect(() => {
    if (!open || !rowId || !data?.info || data.info.applied || syncedRow.current === rowId) return;
    syncedRow.current = rowId;
    api
      .syncJobApplyRunInfo(runId)
      .then((res) => (res.updated ? refresh() : undefined))
      .catch(() => undefined);
  }, [open, rowId, data, runId, refresh]);

  useEffect(() => {
    if (!open) {
      syncedRow.current = null;
      setConfirmReset(false);
    }
  }, [open]);

  const dirty = form && base && (Object.keys(form) as (keyof Form)[]).some((k) => form[k] !== base[k]);
  const set = (k: keyof Form) => (v: string) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form || !base || !rowId) return;
    const patch: JobApplyInfoPatch = {};
    if (form.title !== base.title) patch.title = form.title.trim();
    if (form.company !== base.company) patch.company = form.company.trim();
    if (form.workMode !== base.workMode) patch.workMode = form.workMode as JobApplyInfoPatch['workMode'];
    if (form.locations !== base.locations) patch.allowedLocations = parseLocations(form.locations);
    if (form.postedDate !== base.postedDate) patch.postedDate = form.postedDate || null;
    if (form.clearance !== base.clearance) patch.clearance = form.clearance as JobApplyInfoPatch['clearance'];
    if (form.timezoneNote !== base.timezoneNote) patch.timezoneNote = form.timezoneNote.trim() || null;
    if (form.jdText !== base.jdText) patch.jdText = form.jdText;
    setSaving(true);
    try {
      await api.updateJobApplyRowInfo(rowId, patch);
      notify.success('Saved for everyone who uses this link');
      await refresh();
      onClose();
    } catch (err) {
      notify.error(err, 'Could not save the correction');
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    if (!rowId) return;
    setResetting(true);
    try {
      await api.resetJobApplyRowInfo(rowId);
      notify.info('Reading the job again with the AI');
      await refresh();
      onClose();
    } catch (err) {
      notify.error(err, 'Could not reset the job');
    } finally {
      setResetting(false);
    }
  };

  const labelCls = 'block text-xs font-medium text-muted mb-1';
  const ro = !canEdit;

  return (
    <Modal open={open} onClose={onClose} title="Job info" size="lg">
      {isLoading || !form ? (
        error ? (
          <p className="text-sm text-red-700 dark:text-red-400">Could not load this job.</p>
        ) : (
          <p role="status" className="flex items-center gap-2 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
          </p>
        )
      ) : (
        <form onSubmit={save} className="space-y-4">
          <p className="hint">
            {data?.info && !data.info.applied
              ? 'Someone corrected this job after it was read. Updating…'
              : data?.info
              ? `Corrected by ${data.info.editedBy || 'someone'} · ${formatDate(data.info.editedAt)}. Everyone who uses this link sees it.`
              : data?.extractionSource === 'rules'
                ? 'Read by rules (the AI was unavailable), so check it.'
                : 'Read by the AI. If something is wrong, correct it: it is saved for everyone who uses this link.'}
            {data?.url && (
              <>
                {' '}
                <a href={data.url} target="_blank" rel="noreferrer" className="text-sky-700 hover:underline dark:text-sky-400">
                  Open the posting
                </a>
              </>
            )}
          </p>
          {data?.status === 'fetch_failed' && !form.jdText && (
            <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              The page couldn’t be fetched{data.statusReason ? ` (${data.statusReason})` : ''}. Paste the job description to read it.
            </p>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3">
              <div>
                <label className={labelCls} htmlFor="ji-title">Title</label>
                <input id="ji-title" className="input w-full text-sm" value={form.title} onChange={(e) => set('title')(e.target.value)} readOnly={ro} />
              </div>
              <div>
                <label className={labelCls} htmlFor="ji-company">Company</label>
                <input id="ji-company" className="input w-full text-sm" value={form.company} onChange={(e) => set('company')(e.target.value)} readOnly={ro} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Select id="ji-mode" label="Work mode" labelClassName={labelCls} value={form.workMode} onChange={set('workMode')} options={WORK_MODES} disabled={ro} />
                <div>
                  <label className={labelCls} htmlFor="ji-date">Posted</label>
                  <input id="ji-date" type="date" className="input w-full text-sm" value={form.postedDate} onChange={(e) => set('postedDate')(e.target.value)} readOnly={ro} />
                </div>
              </div>
              <div>
                <label className={labelCls} htmlFor="ji-loc">Open to (countries or regions)</label>
                <input
                  id="ji-loc"
                  className="input w-full text-sm"
                  placeholder="US, GB, EU, Worldwide"
                  value={form.locations}
                  onChange={(e) => set('locations')(e.target.value)}
                  readOnly={ro}
                />
                <p className="hint mt-1">Two-letter country codes (US, GB) or regions (EU, LATAM, Worldwide), separated by commas. Empty: not stated.</p>
              </div>
              <Select id="ji-clr" label="Security clearance" labelClassName={labelCls} value={form.clearance} onChange={set('clearance')} options={CLEARANCE} disabled={ro} />
              <div>
                <label className={labelCls} htmlFor="ji-tz">Time zone note</label>
                <input id="ji-tz" className="input w-full text-sm" value={form.timezoneNote} onChange={(e) => set('timezoneNote')(e.target.value)} readOnly={ro} />
              </div>
            </div>

            <div className="flex min-h-[18rem] flex-col">
              <label className={labelCls} htmlFor="ji-jd">Job description</label>
              <textarea
                id="ji-jd"
                className="input w-full flex-1 resize-y font-mono text-xs leading-relaxed"
                rows={18}
                value={form.jdText}
                onChange={(e) => set('jdText')(e.target.value)}
                readOnly={ro}
                placeholder={ro ? 'No description' : 'Paste the job description here'}
              />
            </div>
          </div>

          {confirmReset && (
            <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
              <span className="min-w-0 flex-1">
                This removes the correction for <strong>everyone</strong> who uses this link, and the AI reads the job again.
              </span>
              <button type="button" className="btn-outline btn-sm" onClick={() => setConfirmReset(false)} disabled={resetting}>
                Keep it
              </button>
              <button type="button" className="btn btn-sm" onClick={reset} disabled={resetting}>
                {resetting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                Remove for everyone
              </button>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div>
              {canEdit && data?.info && (
                <button type="button" className="btn-outline btn-sm" onClick={() => setConfirmReset(true)} disabled={saving || resetting}>
                  <RotateCcw className="h-4 w-4" aria-hidden />
                  Re-read with AI
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
                {canEdit ? 'Cancel' : 'Close'}
              </button>
              {canEdit && (
                <button type="submit" className="btn" disabled={saving || !dirty}>
                  {saving ? 'Saving...' : 'Save for everyone'}
                </button>
              )}
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
}
