import type { BidAttachment, BidReviewItem, BidScreenshot } from '../../api/endpoints';

interface Seen {
  file: BidAttachment;
  steps: string[];
}

const fmtSize = (bytes: number | null) =>
  bytes == null ? null : bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

const stepName = (s: BidScreenshot) => (s.isSubmit ? 'Submit' : s.step != null ? `step ${s.step}` : 'a step');

/** Each file once (by location, else name/size/date), with the steps it was attached on, first seen first. */
function uniqueFiles(shots: BidScreenshot[]): Seen[] {
  const byKey = new Map<string, Seen>();
  for (const shot of shots) {
    for (const file of shot.attachments ?? []) {
      const key = file.path ?? `${file.name}|${file.size}|${file.lastModified}`;
      const seen = byKey.get(key) ?? { file, steps: [] };
      if (!seen.steps.includes(stepName(shot))) seen.steps.push(stepName(shot));
      byKey.set(key, seen);
    }
  }
  return [...byKey.values()];
}

/** The files the bidder attached on the job page and where they were on the bidder's computer (sent by the
 *  extension only when the bidder allowed it), next to the resume the profile says the form should use. */
export default function AttachedFiles({ bid, shots }: { bid: BidReviewItem; shots: BidScreenshot[] | undefined }) {
  if (!shots) return null;
  const files = uniqueFiles(shots);
  const expected = new Set([...bid.resumeNames, bid.tailoredResumeName ?? ''].filter(Boolean).map((n) => n.toLowerCase()));

  return (
    <section aria-label="Attached files" className="space-y-1.5 text-sm">
      <p className="text-xs font-medium text-muted">Attached files</p>
      {files.length === 0 ? (
        <p className="text-muted">None recorded</p>
      ) : (
        <ul className="space-y-2">
          {files.map(({ file, steps }) => {
            const size = fmtSize(file.size);
            return (
              <li key={file.path ?? `${file.name}|${file.size}|${file.lastModified}`} className="rounded-lg border border-zinc-200 p-2 dark:border-zinc-700">
                <p className="flex flex-wrap items-center gap-1.5">
                  <span className="break-all font-medium">{file.name || 'Unnamed file'}</span>
                  {expected.has(file.name.toLowerCase()) && <span className="badge-success">Profile resume</span>}
                </p>
                {file.path ? (
                  <p className="mt-0.5 break-all font-mono text-xs">{file.path}</p>
                ) : (
                  <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">
                    Location not recorded{file.pathError ? `: ${file.pathError}` : ''}
                  </p>
                )}
                <p className="mt-0.5 text-xs text-muted">
                  {[file.field, size, `on ${steps.join(', ')}`].filter(Boolean).join(' · ')}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
