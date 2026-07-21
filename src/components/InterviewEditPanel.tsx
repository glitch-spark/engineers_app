import type { Dispatch, SetStateAction } from 'react';
import { FileText, X } from 'lucide-react';
import Select from './Select';
import { notify } from '../lib/notify';
import {
  BOARD_FORM_STAGES,
  TECH_SUB_STAGES,
  getInterviewMovementEntries,
  getInterviewMovementTrail,
  resolveInterviewStage,
  stageBadgeClass,
  stageLabel,
  toBoardFormStage,
  toTechSubStage,
  type MovementEntry,
} from '../lib/stageBadge';

export type AccountRef = { _id: string; name?: string; email?: string };
export type CreatorRef = { _id: string; name?: string; email?: string };

export type Interview = {
  _id: string;
  accountId: AccountRef | string;
  createdBy: CreatorRef | string;
  scheduledAt: string;
  endsAt?: string | null;
  stage?: string | null;
  status?: string | null;
  companyName?: string | null;
  interviewerName?: string | null;
  appliedPosition?: string | null;
  jobUrl?: string | null;
  transcript?: string;
  note?: string;
  stageHistory?: Array<{ stage: string; at?: string; source?: string; scheduledAt?: string | null }>;
  ownerName?: string | null;
  ownerEmail?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type InterviewFormState = {
  accountId: string;
  date: string;
  startTime: string;
  endTime: string;
  stage: string;
  techSubStage: string;
  /** Ordered stage entries for the movement trail (editable on the form). */
  stageHistory: MovementEntry[];
  status: string;
  companyName: string;
  interviewerName: string;
  appliedPosition: string;
  jobUrl: string;
  transcript: string;
  note: string;
};

export type SelectOption = { value: string; label: string };

/** Status choices on create/edit forms (filters may use a fuller list). */
export const FORM_STATUSES = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'completed', label: 'Completed' },
];

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function blankInterviewForm(): InterviewFormState {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  const endHour = String((now.getHours() + 1) % 24).padStart(2, '0');
  return {
    accountId: '',
    date: `${yyyy}-${mm}-${dd}`,
    startTime: `${hh}:${mi}`,
    endTime: `${endHour}:${mi}`,
    stage: '',
    techSubStage: '',
    stageHistory: [],
    status: '',
    companyName: '',
    interviewerName: '',
    appliedPosition: '',
    jobUrl: '',
    transcript: '',
    note: '',
  };
}

export function splitDateTime(iso: string): { date: string; time: string } {
  if (!iso) return { date: '', time: '' };
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { date: '', time: '' };
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return { date: `${yyyy}-${mm}-${dd}`, time: `${hh}:${mi}` };
}

export function combineDateTime(date: string, time: string): string {
  // local-time interpretation, then convert to UTC ISO string
  const t = time && time.length >= 5 ? time : '00:00';
  return new Date(`${date}T${t}:00`).toISOString();
}

/** Build scheduledAt/endsAt; always keep endsAt after scheduledAt (edit form hides times). */
export function schedulePayload(
  date: string,
  startTime: string,
  endTime: string,
): { scheduledAt: string; endsAt: string } {
  const start = combineDateTime(date, startTime || '09:00');
  let end = combineDateTime(date, endTime || startTime || '10:00');
  const startMs = new Date(start).getTime();
  let endMs = new Date(end).getTime();
  if (!(endMs > startMs)) {
    endMs = startMs + 60 * 60 * 1000;
    end = new Date(endMs).toISOString();
  }
  return { scheduledAt: start, endsAt: end };
}

/** Date-only label for board cards / stage badges (no time / timezone). */
export function formatScheduledDate(iso?: string | null): string {
  if (!iso) return '—';
  // YYYY-MM-DD — parse as local calendar date (avoid UTC midnight shift).
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [, m, d] = iso.split('-').map(Number);
    return `${MONTH_NAMES[m - 1]} ${d}`;
  }
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;
}

export function interviewToForm(iv: Interview): InterviewFormState {
  const start = splitDateTime(iv.scheduledAt);
  const end = splitDateTime(iv.endsAt || '');
  const accId = typeof iv.accountId === 'string' ? iv.accountId : iv.accountId?._id ?? '';
  return {
    accountId: accId,
    date: start.date,
    startTime: start.time,
    endTime: end.time || start.time,
    stage: toBoardFormStage(iv.stage),
    techSubStage: toTechSubStage(iv.stage),
    stageHistory: getInterviewMovementEntries(iv),
    status: iv.status || '',
    companyName: iv.companyName || '',
    interviewerName: iv.interviewerName || '',
    appliedPosition: iv.appliedPosition || '',
    jobUrl: iv.jobUrl || '',
    transcript: iv.transcript || '',
    note: iv.note || '',
  };
}

/** Keep form stage fields in sync with the last movement-history entry. */
export function applyHistoryTipToForm(
  history: MovementEntry[],
): Partial<Pick<InterviewFormState, 'stage' | 'techSubStage' | 'date'>> {
  const tip = history[history.length - 1];
  const tipStage = tip?.stage || '';
  return {
    stage: toBoardFormStage(tipStage),
    techSubStage: toTechSubStage(tipStage),
    ...(tip?.scheduledAt ? { date: tip.scheduledAt } : {}),
  };
}

/** Ensure the resolved current stage is the tip of the movement history. */
export function withCurrentStageInHistory(
  history: MovementEntry[],
  currentStage: string,
  scheduledDate?: string,
): MovementEntry[] {
  if (!currentStage) return history;
  const tip = history[history.length - 1];
  if (tip?.stage === currentStage) {
    if (scheduledDate && tip.scheduledAt !== scheduledDate) {
      return [...history.slice(0, -1), { ...tip, scheduledAt: scheduledDate }];
    }
    return history;
  }
  return [
    ...history,
    { stage: currentStage, ...(scheduledDate ? { scheduledAt: scheduledDate } : {}) },
  ];
}

/** When the scheduled date changes, stamp it onto the current tip stage entry. */
export function withTipScheduledDate(history: MovementEntry[], scheduledDate: string): MovementEntry[] {
  if (!history.length || !scheduledDate) return history;
  const tip = history[history.length - 1];
  return [...history.slice(0, -1), { ...tip, scheduledAt: scheduledDate }];
}

export function buildSaveBody(f: InterviewFormState): Record<string, unknown> {
  const resolvedStage = resolveInterviewStage(f.stage, f.techSubStage);
  const { scheduledAt, endsAt } = schedulePayload(f.date, f.startTime, f.endTime);
  const history = withCurrentStageInHistory(f.stageHistory, resolvedStage, f.date);
  return {
    accountId: f.accountId,
    scheduledAt,
    endsAt,
    stage: resolvedStage,
    status: f.status,
    companyName: f.companyName,
    interviewerName: f.interviewerName,
    appliedPosition: f.appliedPosition,
    jobUrl: f.jobUrl,
    transcript: f.transcript,
    note: f.note,
    stageHistory: history.map((e) => ({
      stage: e.stage,
      ...(e.scheduledAt ? { scheduledAt: e.scheduledAt } : {}),
    })),
  };
}

/** Default Select options used by the edit panel / create-update forms. */
export function defaultInterviewFormOptions() {
  return {
    stageFormOptions: [
      { value: '', label: '— None —' },
      ...BOARD_FORM_STAGES,
    ] as SelectOption[],
    techSubStageOptions: [...TECH_SUB_STAGES] as SelectOption[],
    statusFormOptions: [
      { value: '', label: '— None —' },
      ...FORM_STATUSES,
    ] as SelectOption[],
  };
}

export function StageMovementTrail({ interview }: { interview: Interview }) {
  const trail = getInterviewMovementTrail(interview);
  // Prefer an explicit trail; fall back to current stage so Tech→Tech still shows something.
  const shown = trail.length > 0 ? trail : (interview.stage ? [interview.stage] : []);
  if (shown.length === 0) return null;
  return (
    <div className="mt-1.5 pl-1 flex flex-wrap items-center gap-1">
      {shown.map((s, i) => (
        <span key={`${s}-${i}`} className="inline-flex items-center gap-1">
          {i > 0 && <span className="text-[10px] text-zinc-400 dark:text-zinc-500">→</span>}
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded-[6px] text-[10px] font-medium border ${stageBadgeClass(s)}`}>
            {stageLabel(s)}
          </span>
        </span>
      ))}
    </div>
  );
}

export function InterviewFormFields({
  form,
  setForm,
  accountSelectOptions,
  stageFormOptions,
  techSubStageOptions,
  statusFormOptions,
  accountDisabled,
  datalistId,
  disabled,
}: {
  form: InterviewFormState;
  setForm: Dispatch<SetStateAction<InterviewFormState>>;
  accountSelectOptions: SelectOption[];
  stageFormOptions: SelectOption[];
  techSubStageOptions: SelectOption[];
  statusFormOptions: SelectOption[];
  accountDisabled?: boolean;
  datalistId: string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">
          Profile <span className="text-red-500">*</span>
        </label>
        <Select
          value={form.accountId}
          onChange={(v) => setForm({ ...form, accountId: v })}
          options={accountSelectOptions}
          placeholder="Select a profile"
          disabled={disabled || accountDisabled}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">Company Name</label>
          <input className="input" type="text" value={form.companyName} disabled={disabled} onChange={(e) => setForm((prev) => ({ ...prev, companyName: e.target.value }))} placeholder="e.g. Acme Corp" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Interviewer Name</label>
          <input className="input" type="text" value={form.interviewerName} disabled={disabled} onChange={(e) => setForm((prev) => ({ ...prev, interviewerName: e.target.value }))} placeholder="e.g. Jane Smith" />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Applied Position</label>
        <input className="input" type="text" value={form.appliedPosition} disabled={disabled} onChange={(e) => setForm((prev) => ({ ...prev, appliedPosition: e.target.value }))} placeholder="e.g. Backend, Frontend…" list={datalistId} />
        <datalist id={datalistId}>
          <option value="Backend" /><option value="Frontend" /><option value="Fullstack" />
          <option value="AI / ML" /><option value="Mobile" /><option value="DevOps" />
          <option value="Data" /><option value="QA" /><option value="Other" />
        </datalist>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Job URL <span className="text-xs text-faint font-normal">(optional)</span></label>
        <input className="input" type="url" value={form.jobUrl} disabled={disabled} onChange={(e) => setForm((prev) => ({ ...prev, jobUrl: e.target.value }))} placeholder="https://..." />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">Interview Stage</label>
          <Select
            value={form.stage}
            onChange={(v) => {
              setForm((prev) => {
                if (v === 'tech') {
                  // Board-level Tech only — wait for a concrete sub-stage before history.
                  return {
                    ...prev,
                    stage: 'tech',
                    techSubStage: '',
                  };
                }
                const resolved = resolveInterviewStage(v, '');
                return {
                  ...prev,
                  stage: v,
                  techSubStage: '',
                  stageHistory: resolved
                    ? withCurrentStageInHistory(
                        prev.stageHistory.filter((e) => e.stage !== resolved),
                        resolved,
                        prev.date,
                      )
                    : prev.stageHistory,
                };
              });
            }}
            options={stageFormOptions}
            placeholder="Select a stage"
            disabled={disabled}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">
            Scheduled date <span className="text-red-500">*</span>
          </label>
          <input
            className="input"
            type="date"
            value={form.date}
            disabled={disabled}
            onChange={(e) => {
              const nextDate = e.target.value;
              setForm((prev) => ({
                ...prev,
                date: nextDate,
                stageHistory: withTipScheduledDate(prev.stageHistory, nextDate),
              }));
            }}
          />
        </div>
      </div>

      <div className={`grid gap-3 ${form.stage === 'tech' ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <div>
          <label className="block text-sm font-medium mb-1">Status</label>
          <Select value={form.status} onChange={(v) => setForm((prev) => ({ ...prev, status: v }))} options={statusFormOptions} placeholder="Select a status" disabled={disabled} />
        </div>
        {form.stage === 'tech' && (
          <div>
            <label className="block text-sm font-medium mb-1">
              Tech sub-stage <span className="text-red-500">*</span>
            </label>
            <Select
              value={form.techSubStage}
              onChange={(v) => {
                setForm((prev) => ({
                  ...prev,
                  techSubStage: v,
                  stageHistory: v
                    ? withCurrentStageInHistory(
                        prev.stageHistory.filter((e) => e.stage !== v),
                        v,
                        prev.date,
                      )
                    : prev.stageHistory,
                }));
              }}
              options={techSubStageOptions}
              placeholder="Select a Tech sub-stage"
              disabled={disabled}
            />
          </div>
        )}
      </div>

      {(form.stageHistory.length > 0 || !disabled) && (
        <div>
          <label className="block text-sm font-medium mb-1">Stage movement</label>
          <p className="text-xs text-muted mb-2">
            Path used for pass-rate analysis. Each badge shows that round&apos;s interview date.
          </p>
          {form.stageHistory.length === 0 ? (
            <div className="text-xs text-faint italic">No stage moves yet.</div>
          ) : (
            <div className="flex flex-wrap items-end gap-1.5">
              {form.stageHistory.map((entry, i) => (
                <span key={`${entry.stage}-${i}`} className="inline-flex items-end gap-1">
                  {i > 0 && <span className="text-[10px] text-faint pb-4">→</span>}
                  <span className="inline-flex flex-col items-center gap-0.5">
                    <span className={`inline-flex items-center gap-1 pl-1.5 pr-0.5 py-0.5 rounded-[6px] text-[11px] font-medium border ${stageBadgeClass(entry.stage)}`}>
                      {stageLabel(entry.stage)}
                      {!disabled && (
                        <button
                          type="button"
                          className="ml-0.5 p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 text-current/70 hover:text-current"
                          title={`Remove ${stageLabel(entry.stage)}`}
                          aria-label={`Remove ${stageLabel(entry.stage)}`}
                          onClick={() => {
                            const next = form.stageHistory.filter((_, idx) => idx !== i);
                            setForm({
                              ...form,
                              stageHistory: next,
                              ...applyHistoryTipToForm(next),
                            });
                          }}
                        >
                          <X size={12} />
                        </button>
                      )}
                    </span>
                    <span className="text-[10px] text-muted leading-none">
                      {entry.scheduledAt ? formatScheduledDate(entry.scheduledAt) : '—'}
                    </span>
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-sm font-medium">Interview Transcript</label>
          {!disabled && (
            <label className="text-xs text-blue-600 hover:text-blue-700 cursor-pointer">
              {form.transcript ? 'Replace file' : 'Upload file'}
              <input
                type="file"
                accept=".txt,.md,.markdown,.doc,.docx,.pdf,text/plain,text/markdown,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const ext = file.name.toLowerCase().split('.').pop() || '';
                  const isPlain = ext === 'txt' || ext === 'md' || ext === 'markdown';
                  const reader = new FileReader();
                  reader.onload = () => {
                    const raw = String(reader.result || '');
                    setForm((prev) => ({ ...prev, transcript: raw }));
                    if (!isPlain) notify.error(`${ext.toUpperCase()} may not parse cleanly — prefer .txt or .md`);
                    else notify.success(`Transcript loaded: ${file.name}`);
                  };
                  reader.onerror = () => notify.error('Could not read the file');
                  reader.readAsText(file);
                  e.target.value = '';
                }}
              />
            </label>
          )}
        </div>
        {form.transcript ? (
          <div className="border border-zinc-300 dark:border-zinc-700 rounded-md p-3 max-h-40 overflow-auto bg-zinc-50 dark:bg-zinc-900/80">
            <pre className="whitespace-pre-wrap text-xs font-mono text-zinc-700 dark:text-zinc-300">{form.transcript.slice(0, 4000)}{form.transcript.length > 4000 ? '\n…(truncated)' : ''}</pre>
          </div>
        ) : (
          <div className="border border-dashed border-zinc-300 dark:border-zinc-700 rounded-md p-4 text-center text-xs text-faint">
            No transcript yet.
          </div>
        )}
        {!disabled && form.transcript && (
          <button type="button" onClick={() => setForm((p) => ({ ...p, transcript: '' }))} className="text-xs text-red-600 hover:underline mt-1">Clear transcript</button>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Note</label>
        <textarea className="input w-full" rows={4} value={form.note} disabled={disabled} onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))} placeholder="Internal notes…" />
      </div>
    </div>
  );
}

export function InterviewSidePanel({
  interview,
  form,
  setForm,
  error,
  saving,
  editable,
  accountSelectOptions,
  stageFormOptions,
  techSubStageOptions,
  statusFormOptions,
  onClose,
  onSave,
  onOpenTranscript,
}: {
  interview: Interview;
  form: InterviewFormState;
  setForm: Dispatch<SetStateAction<InterviewFormState>>;
  error: string;
  saving: boolean;
  editable: boolean;
  accountSelectOptions: SelectOption[];
  stageFormOptions: SelectOption[];
  techSubStageOptions: SelectOption[];
  statusFormOptions: SelectOption[];
  onClose: () => void;
  onSave: () => void;
  onOpenTranscript: () => void;
}) {
  const account = typeof interview.accountId === 'object' ? interview.accountId : null;
  const title = interview.companyName || account?.name || 'Interview';
  const saveDisabled = saving
    || !form.date
    || !form.accountId
    || (form.stage === 'tech' && !form.techSubStage);

  return (
    <aside className="fixed top-16 right-0 bottom-0 w-1/3 min-w-[320px] max-w-[520px] bg-white dark:bg-zinc-950 shadow-strong border-l border-zinc-200 dark:border-zinc-800 z-50 flex flex-col">
      <header className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-start justify-between gap-2 shrink-0">
        <div className="min-w-0">
          <div className="text-xs text-muted">Interview details</div>
          <div className="font-semibold text-strong truncate">{title}</div>
          {interview.stage && (
            <span className={`inline-flex mt-1 items-center px-2 py-0.5 rounded-[8px] text-[10px] font-medium border ${stageBadgeClass(interview.stage)}`}>
              {stageLabel(interview.stage)}
            </span>
          )}
          <div className="mt-1">
            <StageMovementTrail interview={interview} />
          </div>
        </div>
        <button type="button" onClick={onClose} className="btn-icon shrink-0" title="Close panel" aria-label="Close panel">
          <X size={16} />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        {error && <p className="text-red-600 dark:text-red-400 text-sm mb-3">{error}</p>}
        <InterviewFormFields
          form={form}
          setForm={setForm}
          accountSelectOptions={accountSelectOptions}
          stageFormOptions={stageFormOptions}
          techSubStageOptions={techSubStageOptions}
          statusFormOptions={statusFormOptions}
          accountDisabled={!editable}
          datalistId="applied-position-suggestions-panel"
          disabled={!editable}
        />
      </div>

      <footer className="px-4 py-3 border-t border-zinc-200 dark:border-zinc-800 flex flex-wrap gap-2 justify-end shrink-0 bg-zinc-50/80 dark:bg-zinc-900/80">
        <button type="button" className="btn-outline text-sm" onClick={onOpenTranscript}>
          <FileText size={14} className="mr-1" /> Transcript
        </button>
        <button type="button" className="btn-outline text-sm" onClick={onClose}>Close</button>
        {editable && (
          <button type="button" className="btn text-sm" onClick={onSave} disabled={saveDisabled}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        )}
      </footer>
    </aside>
  );
}
