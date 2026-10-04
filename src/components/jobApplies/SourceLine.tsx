import { ExternalLink } from 'lucide-react';
import type { JobApplyRun } from '../../api/endpoints';

/** Step ①: where the run's links came from — the Google Sheet's URL (opens it), or the uploaded file's name. */
export default function SourceLine({ run }: { run: JobApplyRun }) {
  return (
    <p className="flex min-w-0 items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-400">
      {run.sourceUrl ? (
        <>
          <span className="shrink-0">Google Sheet:</span>
          <a
            href={run.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-w-0 items-center gap-1 font-medium text-sky-700 hover:underline dark:text-sky-400"
          >
            <span className="truncate">{run.sourceUrl}</span>
            <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        </>
      ) : (
        <>
          <span className="shrink-0">Uploaded file:</span>
          <span className="truncate font-medium text-zinc-800 dark:text-zinc-200">{run.fileName}</span>
        </>
      )}
    </p>
  );
}
