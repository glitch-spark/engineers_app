import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useSWRConfig } from 'swr';
import * as api from '../../api/endpoints';
import { ApiError } from '../../api/client';
import type { InterviewResumeLink, ResumeMatch } from '../../api/endpoints';
import Modal from '../Modal';
import { notify } from '../../lib/notify';
import { KIND_LABEL, shortDay } from './CompanyMatchField';

export type ResumeFile = { id: string; filename: string; uploadedAt: string | null };

/** The download answered 404: the linked resume's record is gone (deleted in Generated resumes), or the viewer may
 * not open it. */
export const isDeletedResume = (err: unknown) => err instanceof ApiError && err.status === 404;

/** Saves a profile resume's original file. Its link is a download (attachment), so the page stays where it is. */
export async function saveResumeFile(accountId: string, resumeId: string): Promise<void> {
  const { url } = await api.getAccountResumeFileUrl(accountId, resumeId);
  const a = document.createElement('a');
  a.href = url;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Radio list of a profile's stored resume files. `value` / `onChange` use the file's id. */
export function ResumeFileOptions({ files, name, value, onChange }: {
  files: ResumeFile[]; name: string; value: string; onChange: (id: string) => void;
}) {
  return (
    <>
      {files.map((f) => (
        <label key={f.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900">
          <input type="radio" name={name} value={f.id} checked={value === f.id} onChange={() => onChange(f.id)} />
          <span className="min-w-0 flex-1 truncate">{f.filename}</span>
          {f.uploadedAt && <span className="shrink-0 text-xs text-muted">{shortDay(f.uploadedAt)}</span>}
        </label>
      ))}
    </>
  );
}

export type DeletedResumeTarget = {
  interviewId: string;
  accountId: string;
  company: string;
  link: InterviewResumeLink;
  /** Admin or the interview's creator: may link another resume to the interview and generate one. */
  canRelink: boolean;
};

const POLL_MS = 3000;
const GENERATE_WAIT_MS = 5 * 60 * 1000;
const INTERVIEW_KEYS = ['interviews-list', 'interview-rounds', 'caller-rounds-list', 'interview'];

/**
 * For an interview whose linked resume was deleted: offers another resume of the same company (linked to the
 * interview, then downloaded), one of the profile's stored files (downloaded only), or generating the resume again
 * from the job description the link kept. Render `dialog` once.
 */
export function useDeletedResume(): { offer: (target: DeletedResumeTarget) => void; dialog: ReactNode } {
  const { mutate } = useSWRConfig();
  const [target, setTarget] = useState<DeletedResumeTarget | null>(null);
  const [matches, setMatches] = useState<ResumeMatch[]>([]);
  const [files, setFiles] = useState<ResumeFile[]>([]);
  const [loading, setLoading] = useState(false);
  /** `m:<matchId>` for another resume, `f:<file id>` for a profile file. */
  const [chosen, setChosen] = useState('');
  const [working, setWorking] = useState<'download' | 'generate' | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const offer = (t: DeletedResumeTarget) => {
    setTarget(t);
    setMatches([]);
    setFiles([]);
    setChosen('');
    setLoading(true);
    void (async () => {
      const [found, stored] = await Promise.all([
        t.canRelink && t.company.trim().length >= 2
          ? api.searchResumeMatches(t.accountId, t.company).then((r) => r.matches.filter((m) => m.kind !== 'uploaded')).catch(() => [])
          : Promise.resolve([] as ResumeMatch[]),
        api.listAccountResumeFiles(t.accountId).then((r) => r.resumes).catch(() => [] as ResumeFile[]),
      ]);
      if (!alive.current) return;
      setMatches(found);
      setFiles(stored);
      setChosen(found[0] ? `m:${found[0].matchId}` : stored.length ? `f:${stored[stored.length - 1].id}` : '');
      setLoading(false);
    })();
  };

  /** Links the interview to `matchId` (a generated resume) and saves its PDF. */
  const relinkAndSave = async (t: DeletedResumeTarget, matchId: string, fallbackName?: string | null) => {
    const saved = await api.updateInterview(t.interviewId, { resumeLink: { matchId } });
    void mutate((key) => Array.isArray(key) && INTERVIEW_KEYS.includes(key[0]));
    const link = saved.resumeLink as InterviewResumeLink | null | undefined;
    await api.downloadTailoredResume(matchId.slice(2), link?.filename || fallbackName || 'Resume.pdf');
  };

  const download = async () => {
    if (!target || !chosen) return;
    setWorking('download');
    try {
      if (chosen.startsWith('m:')) {
        const match = matches.find((m) => `m:${m.matchId}` === chosen);
        await relinkAndSave(target, chosen.slice(2), match?.filename);
        notify.success('Resume linked to the interview and downloaded');
      } else {
        await saveResumeFile(target.accountId, chosen.slice(2));
      }
      setTarget(null);
    } catch (err) {
      notify.error(err, 'Download failed');
    } finally {
      setWorking(null);
    }
  };

  const generate = async () => {
    if (!target?.link.jobDescription) return;
    setWorking('generate');
    try {
      const { jobId } = await api.enqueueResumeJob({
        accountId: target.accountId,
        company: target.company,
        jobDescription: target.link.jobDescription,
        jobUrl: target.link.jobUrl || undefined,
      });
      const deadline = Date.now() + GENERATE_WAIT_MS;
      for (;;) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        if (!alive.current) return;
        const job = await api.getResumeJob(jobId);
        if (job.status === 'completed') break;
        if (job.status === 'failed') throw new Error(job.errorMessage || 'The resume could not be generated');
        if (Date.now() > deadline) {
          notify.info('The resume is still in the queue. When it shows in Generated resumes, link it from the interview.');
          setTarget(null);
          return;
        }
      }
      await relinkAndSave(target, `t:${jobId}`, target.link.filename);
      notify.success('Resume generated, linked to the interview and downloaded');
      setTarget(null);
    } catch (err) {
      notify.error(err, 'Could not generate the resume');
    } finally {
      if (alive.current) setWorking(null);
    }
  };

  const canGenerate = !!target?.canRelink && !!target.link.jobDescription;
  const close = () => { if (!working) setTarget(null); };

  const dialog = target && (
    <Modal open onClose={close} title="Linked resume was deleted">
      <div className="space-y-4 text-sm">
        <p>
          The brief is saved. The resume linked to this interview
          {target.link.filename && <> (<span className="font-medium text-strong">{target.link.filename}</span>)</>} was
          deleted from Generated resumes.
        </p>
        {loading ? (
          <p className="text-muted">Looking for other resumes…</p>
        ) : (
          <>
            {matches.length > 0 && (
              <fieldset className="space-y-1.5">
                <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
                  Other resumes for {target.company} · links it to the interview
                </legend>
                {matches.map((m) => (
                  <label key={m.matchId} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-900">
                    <input type="radio" name="deleted-resume" value={`m:${m.matchId}`} checked={chosen === `m:${m.matchId}`}
                      onChange={() => setChosen(`m:${m.matchId}`)} />
                    <span className="min-w-0 flex-1 truncate">{m.filename || m.company}</span>
                    <span className="shrink-0 text-xs text-muted">
                      {[KIND_LABEL[m.kind], shortDay(m.appliedAt)].filter(Boolean).join(' · ')}
                    </span>
                  </label>
                ))}
              </fieldset>
            )}
            {files.length > 0 && (
              <fieldset className="space-y-1.5">
                <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Profile resume files</legend>
                <ResumeFileOptions files={files} name="deleted-resume" value={chosen.startsWith('f:') ? chosen.slice(2) : ''}
                  onChange={(id) => setChosen(`f:${id}`)} />
              </fieldset>
            )}
            {matches.length === 0 && files.length === 0 && (
              <p className="text-muted">
                {target.canRelink
                  ? 'The profile has no other resume for this company and no stored resume files.'
                  : 'The profile has no stored resume files.'}
              </p>
            )}
          </>
        )}
        {canGenerate && (
          <p className="text-muted">
            Or generate it again from the same job description with the profile&apos;s default prompt. It uses AI, takes
            about a minute or longer when the queue is busy, and may read differently from the resume that was sent.
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="btn-outline" onClick={() => setTarget(null)} disabled={!!working}>Skip</button>
          {canGenerate && (
            <button type="button" className="btn-outline" onClick={() => void generate()} disabled={!!working}>
              {working === 'generate' ? 'Generating…' : 'Generate again'}
            </button>
          )}
          <button type="button" className="btn" onClick={() => void download()} disabled={!!working || loading || !chosen}>
            {working === 'download' ? 'Downloading…' : 'Download resume'}
          </button>
        </div>
      </div>
    </Modal>
  );

  return { offer, dialog: dialog || null };
}
