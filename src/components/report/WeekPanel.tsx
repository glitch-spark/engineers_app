import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import * as api from '../../api/endpoints';
import type { Counts, PlanItemIn, SatGoal } from '../../api/endpoints';
import { bidsPlan, withBids, type BidKey } from '../../lib/teamGrid';
import { messageOf } from '../../lib/notify';
import { parseDateParam, REGION_FIELD, selfRegionsTotal, SELF_REGIONS, weekLabel } from '../../lib/reportWeek';
import SidePanel from '../SidePanel';
import PlanItemsEditor, { cleanItems, hasOptionsError } from './PlanItemsEditor';

interface WeekForm {
  goal: Counts;
  routines: PlanItemIn[];
  weeklyGoals: PlanItemIn[];
  recapNotes: string;
  satGoal: SatGoal | null;
}

const BIDS: { key: BidKey; label: string; hint: string }[] = [
  { key: 'bidsSelf', label: 'Bids / day', hint: 'Mon–Fri, plus a Saturday extra' },
  { key: 'bidsBidder', label: 'Bidder bids / day', hint: 'Mon–Fri' },
];
const cleanSat = (s: SatGoal | null): SatGoal | null => (s && (s.bidsSelf != null || s.bidsBidder != null) ? s : null);

/** Set the week's targets, routines and weekly goals at the start of the week. */
export default function WeekPanel({
  weekStart,
  userId,
  mode,
  open,
  onClose,
  onSaved,
}: {
  weekStart: string;
  userId?: string;
  mode: 'own' | 'admin' | 'view';
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { data, error, isLoading, mutate } = useSWR(
    open ? ['week-plan', weekStart, userId ?? 'me'] : null,
    () => api.getWeekPlan(weekStart, userId),
    { revalidateOnFocus: false },
  );
  const { data: days } = useSWR(open ? ['day-plans', weekStart, userId ?? 'me'] : null, () => api.getDayPlans(weekStart, userId), { revalidateOnFocus: false });
  const [form, setForm] = useState<WeekForm | null>(null);
  const [initial, setInitial] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    const next: WeekForm = {
      goal: data.goal,
      routines: data.routines,
      weeklyGoals: data.weeklyGoals,
      recapNotes: data.recapNotes,
      satGoal: data.satGoal ?? null,
    };
    setForm(next);
    setInitial(JSON.stringify(next));
  }, [data]);

  useEffect(() => {
    if (!open) {
      setForm(null);
      setMessage(null);
    }
  }, [open]);

  const dirty = useMemo(() => !!form && JSON.stringify(form) !== initial, [form, initial]);

  // Planned by the admin: the person sees the plan, edits only their own items and the recap, once the week is saved.
  const adminPlans = mode === 'own' && data?.plansOwnWeek === false;
  const planEditable = mode === 'admin' || (mode === 'own' && !adminPlans);
  const ownItems = adminPlans && !!data?.exists; // the planned person edits only their own items, once the week is saved
  const recapEditable = mode === 'own' && (!adminPlans || !!data?.exists);
  const canSave = planEditable || ownItems || recapEditable;
  // The person splits the week's self bids by the regions they have profiles in (the admin sets the total).
  const splitEditable = mode === 'own' && (planEditable || !!data?.exists);
  const profileRegions = new Set((days?.profiles ?? []).filter((p) => !p.archived && p.region).map((p) => REGION_FIELD[p.region!]));
  const regions = SELF_REGIONS.filter((r) => profileRegions.has(r.field) || !!form?.goal[r.field]);
  const splitOver = !!form && selfRegionsTotal(form.goal) > form.goal.bidsSelf;

  const save = async () => {
    if (!form || !data) return;
    setSaving(true);
    setMessage(null);
    try {
      const routines = cleanItems(form.routines);
      const weeklyGoals = cleanItems(form.weeklyGoals);
      if (mode === 'admin') {
        const removedIds = [...form.routines, ...form.weeklyGoals].flatMap((i) => (i.addedBy === 'self' && i.archived && i.id ? [i.id] : []));
        const { bidsSelf, bidsBidder, interviewsSelf } = form.goal;
        const res = await api.putTeamWeek(weekStart, [
          { userId: userId!, plansOwnWeek: data.plansOwnWeek, goal: { bidsSelf, bidsBidder, interviewsSelf }, routines, weeklyGoals, exists: data.exists, removedIds, satGoal: cleanSat(form.satGoal) },
        ]);
        const failed = res.results.find((r) => !r.ok);
        if (failed) {
          setMessage(failed.error || 'Could not save the week.');
          return;
        }
      } else {
        await api.putWeekPlan(weekStart, { goal: form.goal, routines, weeklyGoals, recapNotes: form.recapNotes, ...(planEditable ? { satGoal: cleanSat(form.satGoal) } : {}) });
      }
      await mutate();
      onSaved();
      onClose();
    } catch (e) {
      setMessage(messageOf(e, 'Could not save the week.'));
    } finally {
      setSaving(false);
    }
  };

  const monday = parseDateParam(weekStart) ?? new Date();
  const footer = !canSave ? (
    <button type="button" className="btn-outline text-sm" onClick={onClose}>Close</button>
  ) : (
    <>
      <button type="button" className="btn-outline text-sm" onClick={onClose}>Cancel</button>
      <button type="button" className="btn text-sm" onClick={save} disabled={saving || !form || splitOver || hasOptionsError([...form.routines, ...form.weeklyGoals])} title={form && hasOptionsError([...form.routines, ...form.weeklyGoals]) ? 'Fix the choice options first' : undefined}>
        {saving ? 'Saving…' : 'Save week'}
      </button>
    </>
  );

  return (
    <SidePanel
      open={open}
      title={`Week ${weekLabel(monday)}`}
      subtitle={!canSave ? 'View only' : 'Targets, daily and weekly to-dos'}
      onClose={onClose}
      footer={footer}
      dirty={dirty && canSave}
      wide
    >
      {error && (
        <div className="mb-3 text-sm text-red-600 dark:text-red-400" role="alert">
          Couldn&apos;t load this week.{' '}
          <button type="button" className="underline" onClick={() => mutate()}>Retry</button>
        </div>
      )}
      {message && <p className="mb-3 text-sm text-red-600 dark:text-red-400" role="alert">{message}</p>}
      {(isLoading || !form) && !error ? (
        <div className="space-y-2" aria-busy="true">
          <div className="skeleton h-6 w-1/2" />
          <div className="skeleton h-40 w-full" />
        </div>
      ) : form && data ? (
        <div className="space-y-5">
          {data.draft && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-200" role="status">
              Copied from last week — save to keep
            </p>
          )}
          {adminPlans && (
            <p className="rounded-md bg-zinc-100 px-3 py-2 text-sm text-body dark:bg-zinc-800" role="status">Planned by your admin</p>
          )}
          <section className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800" aria-labelledby="week-targets-title">
            <h3 id="week-targets-title" className="card-title">Bids and interviews</h3>
            <p className="mb-2 text-xs text-muted">Counted automatically from bids and the Interviews page.</p>
            <div className="flex flex-wrap gap-x-6 gap-y-3">
              {BIDS.map((b) => {
                const plan = bidsPlan(form, b.key);
                const set = (patch: { daily?: number; sat?: number }) => {
                  const next = withBids(form, b.key, patch);
                  // A smaller self total drops a region split that no longer fits.
                  const goal = b.key === 'bidsSelf' && selfRegionsTotal(next.goal) > next.goal.bidsSelf
                    ? { ...next.goal, bidsSelfUs: 0, bidsSelfEu: 0, bidsSelfLatam: 0 } : next.goal;
                  setForm({ ...next, goal });
                };
                const num = (v: string) => Math.max(0, Math.floor(Number(v) || 0));
                return (
                  <div key={b.key} className="flex flex-col gap-1 text-xs text-muted">
                    <span className="form-label">{b.label}</span>
                    {planEditable ? (
                      <div className="flex items-center gap-2">
                        <input type="number" min={0} className="input w-24" aria-label={b.label} value={plan.total ? plan.daily : ''} placeholder="0"
                          onChange={(e) => set({ daily: num(e.target.value) })} />
                        {b.key === 'bidsSelf' && (
                          <label className="flex items-center gap-1">
                            Sat +
                            <input type="number" min={0} className="input w-20" aria-label="Saturday extra bids" value={plan.total ? plan.sat : ''} placeholder="0"
                              onChange={(e) => set({ sat: num(e.target.value) })} />
                          </label>
                        )}
                      </div>
                    ) : (
                      <span className="text-sm text-body">{plan.daily}{b.key === 'bidsSelf' && plan.sat ? ` + ${plan.sat} Sat` : ''}</span>
                    )}
                    <span>
                      {b.hint}{plan.total ? ` · = ${plan.total} / week` : ''}{plan.even ? ' · even split until edited' : ''} · done {data.done[b.key]}
                    </span>
                  </div>
                );
              })}
              <div className="flex flex-col gap-1 text-xs text-muted">
                <span className="form-label">Interviews this week</span>
                {planEditable ? (
                  <input type="number" min={0} className="input w-24" aria-label="Interviews this week" value={form.goal.interviewsSelf || ''} placeholder="0"
                    onChange={(e) => setForm({ ...form, goal: { ...form.goal, interviewsSelf: Math.max(0, Math.floor(Number(e.target.value) || 0)) } })} />
                ) : (
                  <span className="text-sm text-body">{form.goal.interviewsSelf}</span>
                )}
                <span>done {data.done.interviewsSelf}</span>
              </div>
            </div>
            {form.goal.bidsSelf > 0 && regions.length > 0 && (
              <div className="mt-3 border-t border-zinc-100 pt-3 dark:border-zinc-800">
                <p className="form-label">Self bids by region</p>
                <p className="mb-2 text-xs text-muted">
                  {splitEditable ? 'Split your week\'s self bids across your profiles\' regions.' : 'Set by the person.'} Week total {form.goal.bidsSelf}.
                </p>
                <div className="flex flex-wrap items-end gap-3">
                  {regions.map((r) => (
                    <label key={r.field} className="flex flex-col gap-1 text-xs text-muted">
                      {r.label}
                      {splitEditable ? (
                        <input type="number" min={0} className="input w-24" aria-label={`Self bids ${r.label} this week`} value={form.goal[r.field] || ''} placeholder="0"
                          onChange={(e) => setForm({ ...form, goal: { ...form.goal, [r.field]: Math.max(0, Math.floor(Number(e.target.value) || 0)) } })} />
                      ) : (
                        <span className="text-sm text-body">{form.goal[r.field] ?? 0}</span>
                      )}
                    </label>
                  ))}
                  <span className="pb-2 text-xs text-muted">
                    {splitOver ? <span className="text-red-600 dark:text-red-400" role="alert">{selfRegionsTotal(form.goal) - form.goal.bidsSelf} more than the total</span>
                      : `Other / no region: ${form.goal.bidsSelf - selfRegionsTotal(form.goal)}`}
                  </span>
                </div>
              </div>
            )}
          </section>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <section className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800" aria-labelledby="week-routines-title">
              <h3 id="week-routines-title" className="card-title">Daily to-dos</h3>
              <p className="mb-2 text-xs text-muted">Shown every working day; count / hours targets are per day.</p>
              <PlanItemsEditor items={form.routines} scope="routine" onChange={(routines) => setForm({ ...form, routines })} readOnly={!planEditable && !ownItems} lockedFor={ownItems ? (i) => i.addedBy !== 'self' : undefined} />
            </section>

            <section className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800" aria-labelledby="week-goals-title">
              <h3 id="week-goals-title" className="card-title">Weekly to-dos</h3>
              <p className="mb-2 text-xs text-muted">One-off outcomes; count / hours targets are for the whole week.</p>
              <PlanItemsEditor items={form.weeklyGoals} scope="goal" onChange={(weeklyGoals) => setForm({ ...form, weeklyGoals })} readOnly={!planEditable && !ownItems} lockedFor={ownItems ? (i) => i.addedBy !== 'self' : undefined} />
            </section>
          </div>

          <section>
            <label className="form-label mb-1 block" htmlFor="week-recap">Recap notes</label>
            {!recapEditable ? (
              <p className="whitespace-pre-wrap text-sm text-body">{form.recapNotes || '—'}</p>
            ) : (
              <textarea
                id="week-recap"
                className="input min-h-[5rem] w-full"
                maxLength={4000}
                value={form.recapNotes}
                onChange={(e) => setForm({ ...form, recapNotes: e.target.value })}
              />
            )}
          </section>
        </div>
      ) : null}
    </SidePanel>
  );
}
