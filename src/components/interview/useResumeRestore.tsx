import { useState, type ReactNode } from 'react';
import * as api from '../../api/endpoints';
import { ApiError } from '../../api/client';
import type { InterviewResumeLink } from '../../api/endpoints';
import Modal from '../Modal';
import { notify } from '../../lib/notify';

/** The download answered 410: the resume's file is missing from storage (older files weren't moved on Nov 5). */
export const isMissingFile = (err: unknown) => err instanceof ApiError && err.status === 410;

type Target = { jobId: string; filename: string; copy: boolean };

/**
 * Offers to make a missing resume file again, then downloads it: a tailored resume is regenerated from its stored job
 * description and prompt; a fixed resume (a copy of the profile's upload) is copied again. Render `dialog` once.
 */
export function useResumeRestore(): { offer: (link: InterviewResumeLink) => boolean; dialog: ReactNode } {
  const [target, setTarget] = useState<Target | null>(null);
  const [working, setWorking] = useState(false);

  /** False when the link has no resume record to make again. */
  const offer = (link: InterviewResumeLink) => {
    if ((link.kind !== 'tailored' && link.kind !== 'fixed') || !link.resumeJobId) return false;
    setTarget({ jobId: link.resumeJobId, filename: link.filename || 'Resume.pdf', copy: link.kind === 'fixed' });
    return true;
  };

  const run = async () => {
    if (!target) return;
    setWorking(true);
    try {
      const out = await api.restoreResumePdf(target.jobId);
      await api.downloadTailoredResume(target.jobId, target.filename);
      notify.success(out.kind === 'copied' ? 'Resume copied again and downloaded' : 'Resume regenerated and downloaded');
      setTarget(null);
    } catch (err) {
      notify.error(err, target.copy ? 'Could not copy the resume again' : 'Could not regenerate the resume');
    } finally {
      setWorking(false);
    }
  };

  const dialog = target && (
    <Modal open onClose={() => { if (!working) setTarget(null); }} title="Resume file missing">
      <div className="space-y-4 text-sm">
        <p>
          The file for <span className="font-medium text-strong">{target.filename}</span> is missing: resumes made before
          Nov 5 weren&apos;t moved to the new storage.
        </p>
        {target.copy ? (
          <p className="text-muted">
            It was a copy of a resume uploaded to the profile. Copy it again from the profile&apos;s file and download it?
          </p>
        ) : (
          <p className="text-muted">
            Regenerate it from the same job description and tailor prompt, store it and download it? It takes about a
            minute, uses AI, and may read differently from the resume that was sent.
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-outline" onClick={() => setTarget(null)} disabled={working}>Skip</button>
          <button type="button" className="btn" onClick={() => void run()} disabled={working}>
            {working ? (target.copy ? 'Copying…' : 'Regenerating… about a minute') : target.copy ? 'Copy & download' : 'Regenerate & download'}
          </button>
        </div>
      </div>
    </Modal>
  );

  return { offer, dialog: dialog || null };
}
