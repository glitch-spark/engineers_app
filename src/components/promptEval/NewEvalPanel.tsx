import { useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { Loader2, Play, Save } from 'lucide-react';
import * as api from '../../api/endpoints';
import { useAuth } from '../../auth/useAuth';
import { notify } from '../../lib/notify';
import { formatUsd } from '../../lib/modelCost';
import { useModelChoice } from '../../lib/useModelChoice';
import Segmented from '../jobApplies/Segmented';
import ModelSelect from '../ModelSelect';
import ResumePromptField from '../ResumePromptField';
import Select from '../Select';
import SidePanel from '../SidePanel';
import JdPicker from './JdPicker';
import RoutingTable from './RoutingTable';
import ScopePicker, { roundRobinIds, type ScopeKey } from './ScopePicker';
import UnitPromptsEditor, { isEdited } from './UnitPromptsEditor';

export interface EvalPrefill {
  accountId?: string;
  promptBody?: string;
  jdIds?: string[];
  label?: string;
  judgeMode?: api.JudgeMode;
  promptMode?: api.PromptMode;
  /** Single mode: the unit to test. */
  unitId?: string;
  /** Profile mode: the edited prompts and hand-picked units of the run being repeated. */
  unitPrompts?: Record<string, string>;
  unitOverrides?: Record<string, string>;
}

const JUDGE_HINT: Record<api.JudgeMode, string> = {
  llm: 'The judge gets a fresh context: the resume text and the JD only. Pick a model at least as strong as the resume model.',
  rules:
    'Scores the way Job Applies does: required terms, keywords, years, title, education and wording overlap for match; stuffing, copied text, unbacked skills and timeline checks for believability. Each JD is read once by a cheap model and reused by later runs, so judging costs about nothing.',
};

const MODE_HINT: Record<api.PromptMode, string> = {
  single: 'Every job description is generated with one resume unit: its template and the prompt below.',
  profile:
    'Each job description gets the unit Job Applies would pick for it (or the one you choose below), with that unit’s template and prompt. Scores are shown per unit.',
};

type PromptOrigin = 'profile' | 'global' | 'none' | 'prefill';

const ORIGIN_HINT: Record<PromptOrigin, string> = {
  profile: 'Prefilled from this unit’s saved prompt. Edits are used for this run only unless you save them.',
  global: 'This unit has no prompt; prefilled from your global prompt. Edits are used for this run only.',
  none: 'No saved prompt. The built-in rules run alone unless you write one here.',
  prefill: 'Prefilled from the run you are repeating.',
};

/**
 * Start an eval: pick a profile, then one resume unit (its prompt editable for this run) or the whole profile (every
 * unit, each JD routed to one), choose the resume and judge models, tick the job descriptions. `accountId` locks the
 * profile (profile edit page); `prefill` repeats an earlier run.
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
  const [promptMode, setPromptMode] = useState<api.PromptMode>(prefill?.promptMode ?? 'single');
  const [unitId, setUnitId] = useState(prefill?.unitId ?? '');
  const [unitEdits, setUnitEdits] = useState<Record<string, string>>(prefill?.unitPrompts ?? {});
  const [overrides, setOverrides] = useState<Record<string, string>>(prefill?.unitOverrides ?? {});
  const [prompt, setPrompt] = useState('');
  const [origin, setOrigin] = useState<PromptOrigin>('none');
  const [globalPrompt, setGlobalPrompt] = useState<string | null>(null);
  const [jdIds, setJdIds] = useState<string[]>(prefill?.jdIds ?? []);
  const [scope, setScope] = useState<ScopeKey>(prefill?.jdIds?.length ? 'custom' : '5');
  // Same key as JdPicker, so SWR serves both from one request.
  const { data: library } = useSWR(open ? ['prompt-eval-jds', 'active'] : null, () => api.listEvalJds());
  const [label, setLabel] = useState(prefill?.label ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [savingUnit, setSavingUnit] = useState<string | null>(null);
  const resumeModel = useModelChoice('resume');
  const judgeModel = useModelChoice('judge');
  const [judgeMode, setJudgeMode] = useState<api.JudgeMode>(prefill?.judgeMode ?? 'rules');
  const prefilledFor = useRef('');

  // Reset to the caller's intent each time the panel opens.
  useEffect(() => {
    if (!open) return;
    setProfileId(accountId ?? prefill?.accountId ?? '');
    setJudgeMode(prefill?.judgeMode ?? 'rules');
    setPromptMode(prefill?.promptMode ?? 'single');
    setUnitId(prefill?.unitId ?? '');
    setUnitEdits(prefill?.unitPrompts ?? {});
    setOverrides(prefill?.unitOverrides ?? {});
    setJdIds(prefill?.jdIds ?? []);
    setScope(prefill?.jdIds?.length ? 'custom' : '5');
    setLabel(prefill?.label ?? '');
    prefilledFor.current = '';
  }, [open, accountId, prefill]);

  // A preset scope picks its postings from the library (round-robin across roles) whenever either changes.
  useEffect(() => {
    if (!library || scope === 'custom') return;
    const count = scope === 'all' ? library.jds.length : Number(scope);
    setJdIds(roundRobinIds(library.jds, library.roles, Math.min(count, library.jds.length)));
  }, [library, scope]);

  // The global prompt is the single-unit fallback when the unit has none.
  useEffect(() => {
    if (!open || globalPrompt != null) return;
    let cancelled = false;
    api
      .getProfile()
      .then((p) => !cancelled && setGlobalPrompt((p.user.resumePromptBody || '').trim()))
      .catch(() => !cancelled && setGlobalPrompt(''));
    return () => {
      cancelled = true;
    };
  }, [open, globalPrompt]);

  // The profile's units, and in profile mode the unit each picked JD gets. Tagged with the profile so a response
  // still on screen from the previous profile is never read as this one's.
  const routeJds = promptMode === 'profile' ? jdIds : [];
  const {
    data: routeData,
    isValidating: routing,
    mutate: refreshRouting,
  } = useSWR(
    open && profileId ? ['prompt-eval-route', profileId, routeJds.join(','), JSON.stringify(overrides)] : null,
    async () => ({ accountId: profileId, ...(await api.routeEvalJds({ accountId: profileId, jdIds: routeJds, overrides })) }),
    { keepPreviousData: true, revalidateOnFocus: false },
  );
  const route = routeData?.accountId === profileId ? routeData : undefined;
  const units = useMemo(() => route?.units ?? [], [route]);
  const defaultUnitId = route?.defaultUnitId ?? '';
  const selectedUnit = units.find((u) => u.id === unitId) ?? units.find((u) => u.id === defaultUnitId);
  const savedPrompt = (selectedUnit?.body ?? '').trim();
  const loadingPrompt = !!profileId && (!route || globalPrompt == null);

  // Single mode: prefill the prompt once per profile + unit (repeat > unit's saved prompt > global > none).
  useEffect(() => {
    if (!open || !selectedUnit || globalPrompt == null) return;
    const key = `${profileId}:${selectedUnit.id}`;
    if (prefilledFor.current === key) return;
    prefilledFor.current = key;
    const own = selectedUnit.body.trim();
    const repeating =
      prefill?.promptBody != null &&
      prefill.accountId === profileId &&
      (prefill.promptMode ?? 'single') === 'single' &&
      (prefill.unitId || defaultUnitId) === selectedUnit.id;
    if (repeating) {
      setPrompt(prefill.promptBody ?? '');
      setOrigin('prefill');
    } else if (own) {
      setPrompt(own);
      setOrigin('profile');
    } else if (globalPrompt) {
      setPrompt(globalPrompt);
      setOrigin('global');
    } else {
      setPrompt('');
      setOrigin('none');
    }
  }, [open, profileId, selectedUnit, globalPrompt, prefill, defaultUnitId]);

  function pickProfile(id: string) {
    setProfileId(id);
    setUnitId('');
    setUnitEdits({});
    setOverrides({});
  }

  const editedUnits = units.filter((u) => isEdited(u, unitEdits));
  const dirty = promptMode === 'single' ? prompt.trim() !== savedPrompt && prompt.trim() !== '' : editedUnits.length > 0;
  const resumeOpt = resumeModel.options.find((o) => o.id === resumeModel.value);
  const judgeOpt = judgeModel.options.find((o) => o.id === judgeModel.value);
  const rules = judgeMode === 'rules';
  const judgeCost = rules ? 0 : judgeOpt?.estCostUsd;
  const perJd = resumeOpt?.estCostUsd != null && judgeCost != null ? resumeOpt.estCostUsd + judgeCost : null;
  const estimate = perJd == null ? null : perJd * jdIds.length;
  const libraryById = useMemo(() => new Map((library?.jds ?? []).map((j) => [j._id, j])), [library]);
  const pickedJds = jdIds.map((id) => libraryById.get(id)).filter((j): j is api.EvalJobDescription => !!j);

  /** Overwrite one unit's saved prompt; every other unit, and every template, stays as it is. */
  async function saveUnitPrompt(id: string, text: string): Promise<boolean> {
    if (!profileId || !route) return false;
    setSavingUnit(id);
    try {
      await api.updateAccount(profileId, {
        resumePrompts: route.units.map((u) => ({ id: u.id, name: u.name, roles: u.roles, body: u.id === id ? text : u.body })),
        defaultPromptId: route.defaultUnitId,
      });
      await refreshRouting();
      notify.success('Prompt saved to the profile');
      return true;
    } catch (err) {
      notify.error(err, 'Could not save the prompt');
      return false;
    } finally {
      setSavingUnit(null);
    }
  }

  async function saveSingle() {
    if (selectedUnit && (await saveUnitPrompt(selectedUnit.id, prompt.trim()))) setOrigin('profile');
  }

  async function saveEdited(id: string) {
    const text = unitEdits[id];
    if (text == null) return;
    if (await saveUnitPrompt(id, text.trim())) {
      setUnitEdits(({ [id]: _saved, ...rest }) => rest);
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
    if (!route) {
      notify.warn('Still loading the profile’s resume units');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.createPromptEvalRun({
        accountId: profileId,
        resumeModel: resumeModel.value || undefined,
        judgeModel: rules ? undefined : judgeModel.value || undefined,
        judgeMode,
        promptMode,
        ...(promptMode === 'single'
          ? { promptBody: prompt, unitId: selectedUnit?.id }
          : {
              unitPrompts: Object.fromEntries(editedUnits.map((u) => [u.id, unitEdits[u.id]])),
              unitOverrides: overrides,
            }),
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
      subtitle="Generates one resume per job description with one resume unit or the whole profile, then a judge (a model or the Job Applies rules) scores match and believability."
      dirty={dirty}
      wide
      footer={
        <>
          <span className="mr-auto text-xs text-muted">
            {jdIds.length === 0
              ? 'Pick job descriptions to see the estimate.'
              : estimate == null
                ? `${jdIds.length} JD${jdIds.length === 1 ? '' : 's'} · cost n/a`
                : `${jdIds.length} JD${jdIds.length === 1 ? '' : 's'} · ~${formatUsd(estimate)} (${rules ? 'resume; rules judge ~$0' : 'resume + judge'})`}
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
              onChange={pickProfile}
              options={profiles.map((p) => ({ value: p._id, label: p.name }))}
              placeholder={profiles.length ? 'Pick a profile' : 'No profiles with a template'}
              required
            />
          )}

          <div className="space-y-2">
            <Segmented
              label="Prompt"
              value={promptMode}
              onChange={setPromptMode}
              options={[
                { value: 'single', label: 'One unit' },
                { value: 'profile', label: 'Whole profile', count: units.length || undefined },
              ]}
            />
            <p className="hint">{MODE_HINT[promptMode]}</p>
          </div>

          {loadingPrompt ? (
            <p role="status" className="flex items-center gap-2 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading resume units…
            </p>
          ) : !profileId ? (
            <p className="text-sm text-muted">Pick a profile to load its resume units.</p>
          ) : promptMode === 'single' ? (
            <div className="space-y-3">
              {units.length > 1 && (
                <Select
                  label="Resume unit"
                  labelClassName="block text-xs font-medium mb-1 text-muted"
                  value={selectedUnit?.id ?? ''}
                  onChange={setUnitId}
                  options={units.map((u) => ({
                    value: u.id,
                    label: `${u.name}${u.id === defaultUnitId ? ' (default)' : ''}${u.hasTemplate ? '' : ' — no HTML template'}`,
                  }))}
                />
              )}
              <div>
                <ResumePromptField
                  value={prompt}
                  onChange={setPrompt}
                  label="Prompt to evaluate"
                  hint={ORIGIN_HINT[origin]}
                  defaultSource="global"
                />
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    className="btn-outline btn-sm"
                    onClick={saveSingle}
                    disabled={!dirty || savingUnit != null}
                    title={dirty ? `Overwrite the saved prompt of ${selectedUnit?.name ?? 'this unit'} with this text` : 'Same as the saved prompt'}
                  >
                    {savingUnit ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
                    Save to profile
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <UnitPromptsEditor
              units={units}
              defaultUnitId={defaultUnitId}
              edits={unitEdits}
              onChange={(id, text) =>
                setUnitEdits(({ [id]: _old, ...rest }) => (text === undefined ? rest : { ...rest, [id]: text }))
              }
              onSave={saveEdited}
              savingId={savingUnit}
            />
          )}

          <ModelSelect label="Resume model" choice={resumeModel} />
          <div className="space-y-2">
            <Segmented
              label="Judge"
              value={judgeMode}
              onChange={setJudgeMode}
              options={[
                { value: 'rules', label: 'Job Applies rules' },
                { value: 'llm', label: 'AI model' },
              ]}
            />
            {!rules && <ModelSelect label="Judge model" choice={judgeModel} />}
            <p className="hint">{JUDGE_HINT[judgeMode]}</p>
          </div>
        </div>

        <div className="min-w-0 space-y-5">
          <ScopePicker value={scope} onChange={setScope} librarySize={library?.jds.length ?? 0} perJdCost={perJd} />
          <JdPicker
            value={jdIds}
            onChange={(ids) => {
              setScope('custom');
              setJdIds(ids);
            }}
          />
          {promptMode === 'profile' && profileId && (
            <RoutingTable
              jds={pickedJds}
              routes={route?.routes ?? []}
              units={units}
              overrides={overrides}
              onOverride={(jdId, id) =>
                setOverrides(({ [jdId]: _old, ...rest }) => (id === undefined ? rest : { ...rest, [jdId]: id }))
              }
              loading={routing}
            />
          )}
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
