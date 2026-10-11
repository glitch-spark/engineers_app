import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { Loader2, Play, Save } from 'lucide-react';
import * as api from '../../api/endpoints';
import { useAuth } from '../../auth/useAuth';
import { notify } from '../../lib/notify';
import { formatUsd } from '../../lib/modelCost';
import { useModelChoice } from '../../lib/useModelChoice';
import ModelSelect from '../ModelSelect';
import ResumePromptField from '../ResumePromptField';
import Select from '../Select';
import SidePanel from '../SidePanel';
import JdPicker from './JdPicker';

export interface EvalPrefill {
  accountId?: string;
  promptBody?: string;
  jdIds?: string[];
  label?: string;
}

type PromptOrigin = 'profile' | 'global' | 'none' | 'prefill';

const ORIGIN_HINT: Record<PromptOrigin, string> = {
  profile: 'Prefilled from the profile prompt. Edits are used for this run only unless you save them.',
  global: 'This profile has no prompt; prefilled from your global prompt. Edits are used for this run only.',
  none: 'No saved prompt. The built-in rules run alone unless you write one here.',
  prefill: 'Prefilled from the run you are repeating.',
};

/**
 * Start an eval: pick a profile, tweak the prompt (not saved unless asked), choose the resume and judge models,
 * tick the job descriptions. `accountId` locks the profile (profile edit page); `prefill` repeats an earlier run.
 */
export default function NewEvalPanel({
  open,
  onClose,
  accountId,
  prefill,
  onStarted,
}: {
  open: boolean;
  onClose: () => void;
  accountId?: string;
  prefill?: EvalPrefill;
  onStarted: (runId: string) => void;
}) {
  const { user } = useAuth();
  const { data: lookup } = useSWR(open ? 'resume-accounts-lookup' : null, () => api.lookupAccounts());
  const profiles = useMemo(
    () =>
      (lookup?.accounts ?? []).filter(
        (a) => a.createdBy === user?.id && a.hasTemplate && !a.archived,
      ),
    [lookup, user?.id],
  );

  const [profileId, setProfileId] = useState(accountId ?? prefill?.accountId ?? '');
  const [prompt, setPrompt] = useState('');
  const [savedPrompt, setSavedPrompt] = useState('');
  const [origin, setOrigin] = useState<PromptOrigin>('none');
  const [loadingPrompt, setLoadingPrompt] = useState(false);
  const [jdIds, setJdIds] = useState<string[]>(prefill?.jdIds ?? []);
  const [label, setLabel] = useState(prefill?.label ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [saving, setSaving] = useState(false);
  const resumeModel = useModelChoice('resume');
  const judgeModel = useModelChoice('judge');

  // Reset to the caller's intent each time the panel opens.
  useEffect(() => {
    if (!open) return;
    setProfileId(accountId ?? prefill?.accountId ?? '');
    setJdIds(prefill?.jdIds ?? []);
    setLabel(prefill?.label ?? '');
  }, [open, accountId, prefill]);

  // Prefill the prompt from the profile (then the global prompt) whenever the profile changes.
  useEffect(() => {
    if (!open || !profileId) return;
    let cancelled = false;
    setLoadingPrompt(true);
    (async () => {
      try {
        const acc = (await api.getAccount(profileId)) as { resumePromptBody?: string };
        const profilePrompt = (acc.resumePromptBody || '').trim();
        let globalPrompt = '';
        if (!profilePrompt) {
          try {
            globalPrompt = ((await api.getProfile()).user.resumePromptBody || '').trim();
          } catch {
            globalPrompt = '';
          }
        }
        if (cancelled) return;
        setSavedPrompt(profilePrompt);
        if (prefill?.promptBody != null && prefill.accountId === profileId) {
          setPrompt(prefill.promptBody);
          setOrigin('prefill');
        } else if (profilePrompt) {
          setPrompt(profilePrompt);
          setOrigin('profile');
        } else if (globalPrompt) {
          setPrompt(globalPrompt);
          setOrigin('global');
        } else {
          setPrompt('');
          setOrigin('none');
        }
      } catch (err) {
        if (!cancelled) notify.error(err, 'Could not load the profile prompt');
      } finally {
        if (!cancelled) setLoadingPrompt(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, profileId, prefill]);

  const dirty = prompt.trim() !== savedPrompt;
  const resumeOpt = resumeModel.options.find((o) => o.id === resumeModel.value);
  const judgeOpt = judgeModel.options.find((o) => o.id === judgeModel.value);
  const perJd =
    resumeOpt?.estCostUsd != null && judgeOpt?.estCostUsd != null ? resumeOpt.estCostUsd + judgeOpt.estCostUsd : null;
  const estimate = perJd == null ? null : perJd * jdIds.length;

  async function saveToProfile() {
    if (!profileId) return;
    setSaving(true);
    try {
      await api.updateAccount(profileId, { resumePromptBody: prompt });
      setSavedPrompt(prompt.trim());
      setOrigin('profile');
      notify.success('Prompt saved to the profile');
    } catch (err) {
      notify.error(err, 'Could not save the prompt');
    } finally {
      setSaving(false);
    }
  }

  async function start() {
    if (!profileId) {
      notify.warn('Pick a profile');
      return;
    }
    if (jdIds.length === 0) {
      notify.warn('Pick at least one job description');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.createPromptEvalRun({
        accountId: profileId,
        promptBody: prompt,
        resumeModel: resumeModel.value || undefined,
        judgeModel: judgeModel.value || undefined,
        jdIds,
        label: label.trim() || undefined,
      });
      notify.success(`Eval started on ${res.jdCount} job description${res.jdCount === 1 ? '' : 's'}`);
      onStarted(res.runId);
    } catch (err) {
      notify.error(err, 'Could not start the eval');
    } finally {
      setSubmitting(false);
    }
  }

  const lockedProfile = profiles.find((p) => p._id === accountId);

  return (
    <SidePanel
      open={open}
      onClose={onClose}
      title="New prompt eval"
      subtitle="Generates one resume per job description, then a judge scores match and believability."
      dirty={dirty && prompt.trim() !== ''}
      wide
      footer={
        <>
          <span className="mr-auto text-xs text-muted">
            {jdIds.length === 0
              ? 'Pick job descriptions to see the estimate.'
              : estimate == null
                ? `${jdIds.length} JD${jdIds.length === 1 ? '' : 's'} · cost n/a`
                : `${jdIds.length} JD${jdIds.length === 1 ? '' : 's'} · ~${formatUsd(estimate)} (resume + judge)`}
          </span>
          <button type="button" className="btn-outline text-sm" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="button" className="btn text-sm" onClick={start} disabled={submitting || !profileId || jdIds.length === 0}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
            Run eval
          </button>
        </>
      }
    >
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="min-w-0 space-y-5">
          {accountId ? (
            <div>
              <span className="block text-xs font-medium mb-1 text-muted">Profile</span>
              <p className="text-sm text-strong">{lockedProfile?.name ?? 'This profile'}</p>
            </div>
          ) : (
            <Select
              label="Profile"
              labelClassName="block text-xs font-medium mb-1 text-muted"
              value={profileId}
              onChange={setProfileId}
              options={profiles.map((p) => ({ value: p._id, label: p.name }))}
              placeholder={profiles.length ? 'Pick a profile' : 'No profiles with a template'}
              required
            />
          )}

          <div>
            {loadingPrompt ? (
              <p role="status" className="flex items-center gap-2 text-sm text-muted">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading prompt…
              </p>
            ) : (
              <ResumePromptField
                value={prompt}
                onChange={setPrompt}
                label="Prompt to evaluate"
                hint={profileId ? ORIGIN_HINT[origin] : 'Pick a profile to prefill its prompt.'}
                defaultSource="global"
              />
            )}
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                className="btn-outline btn-sm"
                onClick={saveToProfile}
                disabled={!profileId || !dirty || saving || loadingPrompt}
                title={dirty ? 'Overwrite the profile prompt with this text' : 'Same as the saved profile prompt'}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
                Save to profile
              </button>
            </div>
          </div>

          <ModelSelect label="Resume model" choice={resumeModel} />
          <div>
            <ModelSelect label="Judge model" choice={judgeModel} />
            <p className="hint mt-1">The judge gets a fresh context: the resume text and the JD only. Pick a model at least as strong as the resume model.</p>
          </div>
        </div>

        <div className="min-w-0 space-y-5">
          <JdPicker value={jdIds} onChange={setJdIds} />
          <div>
            <label htmlFor="prompt-eval-label" className="block text-xs font-medium mb-1 text-muted">
              Label (optional)
            </label>
            <input
              id="prompt-eval-label"
              className="input w-full text-sm"
              value={label}
              maxLength={120}
              onChange={(e) => setLabel(e.target.value)}
              placeholder='e.g. "v2: shorter bullets"'
            />
            <p className="hint mt-1">Shown in the runs list and on compare charts, so you can tell variants apart.</p>
          </div>
        </div>
      </div>
    </SidePanel>
  );
}
