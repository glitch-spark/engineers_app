import { useState, type ReactNode } from 'react';
import * as api from '../../api/endpoints';
import type { InterviewResumeLink } from '../../api/endpoints';
import { useAuth } from '../../auth/useAuth';
import Modal from '../Modal';
import { notify } from '../../lib/notify';
import { saveInterviewBrief } from '../../lib/interviewBriefPdf';
import type { Interview } from './types';
import { isDeletedResume, ResumeFileOptions, saveResumeFile, useDeletedResume, type ResumeFile } from './useDeletedResume';
import { canRestoreResume, isMissingFile, MISSING_FILE_FOR_CALLER, useResumeRestore } from './useResumeRestore';

const accountIdOf = (iv: Interview) => (typeof iv.accountId === 'object' ? iv.accountId._id : iv.accountId || '');
const creatorIdOf = (iv: Interview) => (typeof iv.createdBy === 'object' ? iv.createdBy._id : iv.createdBy);

/** The interview's linked resume, when it has a file: true once saved. */
async function saveLinkedResume(link: InterviewResumeLink | null, accountId: string, interviewId: string): Promise<boolean> {
  if (!link) return false;
  if ((link.kind === 'tailored' || link.kind === 'fixed') && link.resumeJobId) {
    await api.downloadTailoredResume(link.resumeJobId, link.filename || 'Resume.pdf', interviewId);
    return true;
  }
  if (link.kind === 'uploaded' && link.resumeId && accountId) {
    await saveResumeFile(accountId, link.resumeId, interviewId);
    return true;
  }
  return false;
}

/**
 * Download brief: the round's brief PDF, then the resume the interview came from as its own file. With no linked
 * resume, a picker offers the profile's stored resumes; a linked resume whose file is missing can be made again, and
 * one whose record was deleted can be replaced or generated again. Render `dialog` once in the component using it.
 * `start` resolves true when the linked resume was saved too.
 */
export function useBriefDownload(tz: string): { start: (iv: Interview, roundId: string) => Promise<boolean>; busy: boolean; dialog: ReactNode } {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState<{ accountId: string; interviewId: string; files: ResumeFile[]; chosen: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const restore = useResumeRestore();
  const deleted = useDeletedResume();

  const start = async (iv: Interview, roundId: string): Promise<boolean> => {
    if (busy) return false;
    setBusy(true);
    const accountId = accountIdOf(iv);
    try {
      const link = await saveInterviewBrief(iv, roundId, tz);
      try {
        if (await saveLinkedResume(link, accountId, iv._id)) return true;
      } catch (err) {
        // Its file is missing (made before the Nov 5 storage move): offer to make it again.
        if (isMissingFile(err)) {
          // Only the owner, admins and interview managers may make it again; the assigned caller asks one of them.
          if (canRestoreResume(user, creatorIdOf(iv))) {
            if (link && restore.offer(link)) return false;
          } else {
            notify.error(MISSING_FILE_FOR_CALLER);
            return false;
          }
        }
        if (isDeletedResume(err) && link?.resumeJobId && accountId) {
          const canRelink = user?.role === 'admin' || creatorIdOf(iv) === user?.id;
          // Those who may download any interview's resume got a 404 because its record is gone; for anyone else it
          // only means they may not open it.
          if (canRelink || user?.role === 'interview_manager') {
            deleted.offer({ interviewId: iv._id, accountId, company: iv.companyName?.trim() || '', link, canRelink });
          } else {
            notify.info("The brief is saved. You can't open this interview's resume.");
          }
          return false;
        }
        notify.error(err, 'The brief is saved, but the linked resume could not be downloaded');
        return false;
      }
      // No linked resume: offer the profile's stored ones.
      let files: ResumeFile[] = [];
      try {
        files = accountId ? (await api.listAccountResumeFiles(accountId, iv._id)).resumes : [];
      } catch {
        notify.info("The brief is saved. No resume is linked to this interview, and you can't open this profile's resumes.");
        return false;
      }
      if (files.length === 0) {
        notify.info('The brief is saved. No resume is linked to this interview, and the profile has no stored resume files.');
        return false;
      }
      setPick({ accountId, interviewId: iv._id, files, chosen: files[files.length - 1].id });
      return false;
    } catch (err) {
      notify.error(err, 'Could not create the brief');
    } finally {
      setBusy(false);
    }
    return false;
  };

  const download = async () => {
    if (!pick) return;
    setSaving(true);
    try {
      await saveResumeFile(pick.accountId, pick.chosen, pick.interviewId);
      setPick(null);
    } catch (err) {
      notify.error(err, 'Download failed');
    } finally {
      setSaving(false);
    }
  };

  const pickDialog = pick && (
    <Modal open onClose={() => setPick(null)} title="Resume to send with the brief">
      <div className="space-y-4">
        <p className="text-sm text-muted">
          The brief is saved. This interview has no linked resume: pick one of the profile&apos;s resumes to download with it.
        </p>
        <fieldset className="space-y-1.5">
          <legend className="sr-only">Profile resumes</legend>
          <ResumeFileOptions files={pick.files} name="brief-resume" value={pick.chosen}
            onChange={(id) => setPick({ ...pick, chosen: id })} />
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

  return { start, busy, dialog: pickDialog || restore.dialog || deleted.dialog || null };
}
