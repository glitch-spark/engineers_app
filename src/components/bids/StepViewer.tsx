import { ExternalLink, TriangleAlert } from 'lucide-react';
import type { BidScreenshot } from '../../api/endpoints';
import { messageOf } from '../../lib/notify';
import LoadingSpinner from '../LoadingSpinner';
import Kbd from './Kbd';
import { fmtTime } from './util';
import { safeHref } from '../../lib/safeHref';

const shortLabel = (s: BidScreenshot) => (s.isSubmit ? 'Submit' : s.step != null ? `Step ${s.step}` : 'Screenshot');

export const stepLabel = (s: BidScreenshot) =>
  s.isSubmit && s.step != null ? `Submit (step ${s.step})` : shortLabel(s);

/** The step shown first: the Submit screenshot (the last one if there are several), else the last step. */
export function defaultStep(shots: BidScreenshot[]): number {
  for (let i = shots.length - 1; i >= 0; i--) if (shots[i].isSubmit) return i;
  return Math.max(0, shots.length - 1);
}

function NotUploaded({ large = false }: { large?: boolean }) {
  return (
    <div
      className={`flex w-full items-center justify-center rounded-lg border border-dashed border-amber-300 bg-amber-50 text-center text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300 ${
        large ? 'min-h-[16rem] p-6 text-sm font-medium' : 'aspect-video p-1 text-[10px] leading-tight'
      }`}
    >
      Screenshot didn&apos;t upload
    </div>
  );
}

/** The selected step large and scrollable, with a strip of every step below it. */
export default function StepViewer({
  bidId,
  shots,
  error,
  index,
  onSelect,
  onRetry,
}: {
  bidId: string;
  shots: BidScreenshot[] | undefined;
  error: unknown;
  index: number;
  onSelect: (index: number) => void;
  onRetry: () => void;
}) {
  if (!shots) {
    return error ? (
      <div role="alert" className="flex min-h-[16rem] flex-col items-center justify-center gap-3 text-sm">
        <p className="text-red-600">{messageOf(error, "Couldn't load screenshots.")}</p>
        <button type="button" className="btn-outline btn-sm" onClick={onRetry}>Try again</button>
      </div>
    ) : (
      <div role="status" className="flex min-h-[16rem] items-center justify-center gap-3 text-sm text-muted">
        <LoadingSpinner size="sm" /> Loading screenshots...
      </div>
    );
  }
  if (shots.length === 0) return <p className="py-10 text-center text-sm text-muted">No screenshots.</p>;

  const shot = shots[Math.min(index, shots.length - 1)];
  const hasSubmit = shots.some((s) => s.isSubmit);

  return (
    <section aria-label="Screenshots" className="min-w-0 space-y-3">
      {!hasSubmit && (
        <p className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          <TriangleAlert size={16} aria-hidden className="shrink-0" />
          Not marked submitted: no screenshot was taken with Submit screenshot. Showing the last step.
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p>
          <span className={`font-medium ${shot.isSubmit ? 'text-emerald-700 dark:text-emerald-400' : ''}`}>{stepLabel(shot)}</span>
          <span className="text-muted"> · {index + 1} of {shots.length} · {fmtTime(shot.capturedAt)}</span>
        </p>
        {safeHref(shot.url) && (
          <a
            href={safeHref(shot.url)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sky-700 underline-offset-2 hover:underline dark:text-sky-400"
          >
            Full size <ExternalLink size={12} aria-hidden /> <Kbd>F</Kbd>
          </a>
        )}
      </div>
      {/* Keyed so a new step or bid starts scrolled to the top. */}
      <div
        key={`${bidId}:${index}`}
        tabIndex={0}
        aria-label={`${stepLabel(shot)}, scrollable`}
        className="max-h-[70vh] overflow-auto rounded-lg border border-zinc-200 bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 dark:border-zinc-700 dark:bg-zinc-900 dark:focus-visible:ring-sky-400 lg:max-h-[calc(100vh-15rem)]"
      >
        {shot.url ? (
          <img src={shot.url} alt={`${stepLabel(shot)} screenshot`} className="block h-auto w-full" />
        ) : (
          <NotUploaded large />
        )}
      </div>
      <ol aria-label="Steps" className="flex gap-2 overflow-x-auto pb-1">
        {shots.map((s, i) => {
          const selected = i === index;
          return (
            <li key={s.key} className="shrink-0">
              <button
                type="button"
                onClick={() => onSelect(i)}
                aria-current={selected ? 'step' : undefined}
                aria-label={`Show ${stepLabel(s)}${s.url ? '' : ", didn't upload"}`}
                className={`block w-24 rounded-lg border p-1 text-left transition sm:w-28 ${
                  selected
                    ? 'border-sky-600 ring-2 ring-sky-600 dark:border-sky-400 dark:ring-sky-400'
                    : 'border-zinc-200 hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-500'
                }`}
              >
                {s.url ? (
                  <img
                    src={s.url}
                    alt=""
                    loading="lazy"
                    className="aspect-video w-full rounded bg-zinc-100 object-cover object-top dark:bg-zinc-800"
                  />
                ) : (
                  <NotUploaded />
                )}
                <span
                  className={`mt-1 block truncate text-xs ${
                    s.isSubmit ? 'font-semibold text-emerald-700 dark:text-emerald-400' : 'text-muted'
                  }`}
                >
                  {shortLabel(s)}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
