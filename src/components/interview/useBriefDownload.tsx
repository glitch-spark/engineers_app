import { useState, type ReactNode } from 'react';
import * as api from '../../api/endpoints';
import type { InterviewResumeLink } from '../../api/endpoints';
import Modal from '../Modal';
import { notify } from '../../lib/notify';
import { saveInterviewBrief } from '../../lib/interviewBriefPdf';
import type { Interview } from './types';

type ResumeFile = { id: string; filename: string; uploadedAt: string | null };

const accountIdOf = (iv: Interview) => (typeof iv.accountId === 'object' ? iv.accountId._id : iv.accountId || '');

/** Saves a profile resume's original file. Its link is a download (attachment), so the page stays where it is. */
async function saveResumeFile(accountId: string, resumeId: string): Promise<void> {
  const { url } = await api.getAccountResumeFileUrl(accountId, resumeId);
  const a = document.createElement('a');
  a.href = url;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** The interview's linked resume, when it has a file: true once saved. */
async function saveLinkedResume(link: InterviewResumeLink | null, accountId: string): Promise<boolean> {
  if (!link) return false;
  if ((link.kind === 'tailored' || link.kind === 'fixed') && link.resumeJobId) {
    await api.downloadTailoredResume(link.resumeJobId, link.filename || 'Resume.pdf');
    return true;
  }
  if (link.kind === 'uploaded' && link.resumeId && accountId) {
    await saveResumeFile(accountId, link.resumeId);
    return true;
  }
  return false;
}

/**
 * Download brief: the round's brief PDF, then the resume the interview came from as its own file. With no linked
 * resume, a picker offers the profile's stored resumes. Render `dialog` once in the component using it.
 */
export function useBriefDownload(tz: string): { start: (iv: Interview, roundId: string) => Promise<void>; busy: boolean; dialog: ReactNode } {
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState<{ accountId: string; files: ResumeFile[]; chosen: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const start = async (iv: Interview, roundId: string) => {
    if (busy) return;
    setBusy(true);
    const accountId = accountIdOf(iv);
    try {
      const link = await saveInterviewBrief(iv, roundId, tz);
      try {
        if (await saveLinkedResume(link, accountId)) return;
      } catch (err) {
        notify.error(err, 'The brief is saved, but the linked resume could not be downloaded');
        return;
      }
      // No linked resume: offer the profile's stored ones.
      let files: ResumeFile[] = [];
      try {
        files = accountId ? (await api.listAccountResumeFiles(accountId)).resumes : [];
      } catch {
        notify.info("The brief is saved. No resume is linked to this interview, and you can't open this profile's resumes.");
        return;
      }
      if (files.length === 0) {
        notify.info('The brief is saved. No resume is linked to this interview, and the profile has no stored resume files.');
        return;
      }
      setPick({ accountId, files, chosen: files[files.length - 1].id });
    } catch (err) {
      notify.error(err, 'Could not create the brief');
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    if (!pick) return;
    setSaving(true);
    try {
      await saveResumeFile(pick.accountId, pick.chosen);
      setPick(null);
    } catch (err) {
      notify.error(err, 'Download failed');
    } finally {
      setSaving(false);
    }
  };

  const dialog = pick && (
    <Modal open onClose={() => setPick(null)} title="Resume to send with the brief">
      <div className="space-y-4">
        <p className="text-sm text-muted">
          The brief is saved. This interview has no linked resume: pick one of the profile&apos;s resumes to download with it.
        </p>
        <fieldset className="space-y-1.5">
          <legend className="sr-only">Profile resumes</legend>
          {pick.files.map((f) => (
            <label key={f.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900">
              <input type="radio" name="brief-resume" value={f.id} checked={pick.chosen === f.id}
                onChange={() => setPick({ ...pick, chosen: f.id })} />
              <span className="min-w-0 flex-1 truncate">{f.filename}</span>
              {f.uploadedAt && (
                <span className="shrink-0 text-xs text-muted">
                  {new Date(f.uploadedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              )}
            </label>
          ))}
        </fieldset>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-outline" onClick={() => setPick(null)}>Skip</button>
          <button type="button" className="btn" onClick={() => void download()} disabled={saving}>
            {saving ? 'Downloading…' : 'Download resume'}
          </button>
        </div>
      </div>
    </Modal>
  );

  return { start, busy, dialog };
}
