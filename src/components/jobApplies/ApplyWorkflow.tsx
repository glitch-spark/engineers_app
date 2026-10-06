import type { LucideIcon } from 'lucide-react';
import { CheckCheck, CheckCircle2, FileSpreadsheet, Loader2, Sparkles } from 'lucide-react';
import type { JobApplyApplicationCounts } from '../../api/endpoints';

function Step({
  n,
  icon: Icon,
  title,
  detail,
  todo,
  disabled,
  busy,
  onClick,
}: {
  n: number;
  icon: LucideIcon;
  title: string;
  detail: React.ReactNode;
  /** Something to do here: the step is highlighted. */
  todo: boolean;
  disabled?: boolean;
  busy?: boolean;
  onClick: () => void;
}) {
  const tone = disabled
    ? 'cursor-not-allowed border-zinc-200 opacity-50 dark:border-zinc-800'
    : todo
      ? 'border-sky-200 bg-sky-50/70 hover:border-sky-300 hover:bg-sky-50 dark:border-sky-900 dark:bg-sky-950/30 dark:hover:bg-sky-950/50'
      : 'border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800/60';
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`flex h-full w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${tone}`}
      >
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular-nums ${
            todo && !disabled ? 'bg-sky-600 text-white dark:bg-sky-500' : 'bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300'
          }`}
          aria-hidden
        >
          {n}
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-sm font-medium text-zinc-900 dark:text-zinc-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Icon className="h-4 w-4" aria-hidden />}
            {title}
          </span>
          <span className="block text-xs text-zinc-600 dark:text-zinc-400">{detail}</span>
        </span>
      </button>
    </li>
  );
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * What's left to do in a run, counted in applications (one job × one profile), and the three actions: export to
 * the shared sheet the applications with a resume to send (the ones waiting for tailoring go in a later export),
 * tailor resumes for applications without one, apply and mark applied.
 */
export default function ApplyWorkflow({
  counts,
  profileFilter,
  busy,
  tailorModel,
  onTailor,
  onExport,
  onMark,
}: {
  counts: JobApplyApplicationCounts;
  /** With a profile filter, Mark as applied only covers that profile's applications. */
  profileFilter?: { accountId: string; name: string };
  busy: boolean;
  /** Name of the model tailoring uses (picked in the tailor dialog); unknown until the model list loads. */
  tailorModel?: string;
  onTailor: () => void;
  onExport: () => void;
  onMark: () => void;
}) {
  const left = counts.byProfile.filter((p) => p.toGo > 0);
  const markReady = profileFilter
    ? counts.byProfile.find((p) => p.accountId === profileFilter.accountId)?.ready ?? 0
    : counts.ready;
  const toExport = counts.toExport ?? counts.toGo;
  // waiting for a tailored resume: exported once it's done
  const waiting = counts.needsResume + counts.tailoring;

  return (
    <section className="card-compact space-y-3" aria-label="Apply workflow">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        {counts.toGo > 0 ? (
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            <span className="font-semibold text-zinc-900 dark:text-zinc-50">{plural(counts.jobs, 'job')}</span> ·{' '}
            <span className="font-semibold text-zinc-900 dark:text-zinc-50">{plural(counts.toGo, 'application')}</span> to go
          </p>
        ) : (
          <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" aria-hidden />
            {counts.applied ? `All ${plural(counts.applied, 'application')} applied` : 'Nothing to apply to'}
          </p>
        )}
        {left.length > 1 && (
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-zinc-600 dark:text-zinc-400" aria-label="Applications to go per profile">
            {left.map((p) => (
              <li key={p.accountId}>
                {p.name} <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{p.toGo}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ol className="grid gap-2 sm:grid-cols-3">
        <Step
          n={1}
          icon={FileSpreadsheet}
          title="Export to sheet"
          todo={toExport > 0}
          disabled={busy || toExport === 0}
          onClick={onExport}
          detail={
            toExport > 0
              ? `${toExport} ready to export` + (waiting > 0 ? ` · ${waiting} wait for tailoring` : '')
              : waiting > 0
                ? `${waiting} wait for tailoring, then export`
                : counts.toGo > 0
                  ? `All ${counts.toGo} in the sheet`
                  : 'Nothing to export'
          }
        />
        <Step
          n={2}
          icon={Sparkles}
          title={counts.needsResume > 0 ? `Tailor ${counts.needsResume}` : 'Tailor resumes'}
          todo={counts.needsResume > 0}
          disabled={busy}
          onClick={onTailor}
          detail={
            <>
              {counts.needsResume > 0 ? `${plural(counts.needsResume, 'application')} without a resume` : 'Every application has a resume'}
              {tailorModel && ` · ${tailorModel}`}
              {counts.tailoring > 0 && (
                <span className="ml-1 inline-flex items-center gap-1">
                  · <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> {counts.tailoring} tailoring
                </span>
              )}
            </>
          }
        />
        <Step
          n={3}
          icon={CheckCheck}
          title="Apply"
          todo={markReady > 0}
          disabled={busy || markReady === 0}
          busy={busy}
          onClick={onMark}
          detail={`${markReady} ready now${profileFilter ? ` · ${profileFilter.name}` : ''} · ${counts.applied} applied · click to mark the ready ones applied`}
        />
      </ol>
    </section>
  );
}
