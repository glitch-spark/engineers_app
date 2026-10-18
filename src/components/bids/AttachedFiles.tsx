import type { BidAttachment, BidReviewItem, BidScreenshot } from '../../api/endpoints';

interface Seen {
  file: BidAttachment;
  steps: string[];
}

const stepName = (s: BidScreenshot) => (s.isSubmit ? 'Submit' : s.step != null ? `step ${s.step}` : 'a step');

const fileKey = (file: BidAttachment) => file.path ?? `name:${file.name}`;

/** Each file once, with the steps it was attached on, first seen first. */
function uniqueFiles(shots: BidScreenshot[]): Seen[] {
  const byKey = new Map<string, Seen>();
  for (const shot of shots) {
    for (const file of shot.attachments ?? []) {
      const seen = byKey.get(fileKey(file)) ?? { file, steps: [] };
      if (!seen.steps.includes(stepName(shot))) seen.steps.push(stepName(shot));
      byKey.set(fileKey(file), seen);
    }
  }
  return [...byKey.values()];
}

/** Where the files the bidder attached on the job page were on the bidder's computer (sent by the extension only
 *  when the bidder allowed it), next to the resume the profile says the form should use. */
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
          {files.map(({ file, steps }) => (
            <li key={fileKey(file)} className="rounded-lg border border-zinc-200 p-2 dark:border-zinc-700">
              {file.path ? (
                <p className="break-all font-mono text-xs">{file.path}</p>
              ) : (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  <span className="break-all font-medium">{file.name || 'A file'}</span>: location not recorded
                  {file.pathError ? ` (${file.pathError})` : ''}
                </p>
              )}
              <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                on {steps.join(', ')}
                {expected.has(file.name.toLowerCase()) && <span className="badge-success">Profile resume</span>}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
