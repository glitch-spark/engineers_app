import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import * as api from '../../api/endpoints';
import type { Counts } from '../../api/endpoints';
import { messageOf } from '../../lib/notify';
import { bidsOf, dateParam, dayLabel, isToday, parseDateParam, withListedProfiles } from '../../lib/reportWeek';
import SidePanel from '../SidePanel';
import GoalDoneFields from './GoalDoneFields';
import ItemRow, { kept, resultBody } from './ItemRow';
import type { RowResult } from './ItemRow';
import { formSelfBids } from '../../lib/selfBids';

interface FollowUp {
  done: Counts;
  results: Record<string, RowResult>;
  notes: string;
  /** Set only by "change for today". */
  override: Counts | null;
}

/** Bid Track counts bidder bids from this day on (backend plan_bidder.RELEASE_DAY); earlier days keep the typed number. */
const BIDDER_AUTO_FROM = '2026-11-16';

/** Follow up a day: bids done, ticks on the daily goal lines, notes.
 *  The goal comes from the weekly plan and isn't edited here. */
export default function DayPanel({
  date,
  userId,
  readOnly,
  open,
  onClose,
  onSaved,
}: {
  date: string;
  userId?: string;
  readOnly: boolean;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const day = parseDateParam(date) ?? new Date();
  const canFollowUp = date <= dateParam(new Date());
  const editable = !readOnly && canFollowUp;

  const { data, error, isLoading, mutate } = useSWR(
    open ? ['day-plan', date, userId ?? 'me'] : null,
    () => api.getDayPlan(date, userId),
    { revalidateOnFocus: false },
  );

  const [form, setForm] = useState<FollowUp | null>(null);
  const [initial, setInitial] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Notes are optional: the box opens on request, or when the day already has a note.
  const [notesOpen, setNotesOpen] = useState(false);

  useEffect(() => {
    if (!data) return;
    // Only listed profiles: a deleted one's bids would make the save fail.
    const listed = withListedProfiles(data.done, data.profiles);
    // Profiles on tracked self bids edit "other applies"; the saved day holds tracked + other for them.
    const done = data.trackedProfiles?.length
      ? { ...listed, bidsSelfByProfile: formSelfBids(listed.bidsSelfByProfile ?? {}, data.trackedProfiles, data.selfOtherByProfile ?? {}) }
      : listed;
    const results = Object.fromEntries(
      data.items.filter(kept).map((i) => [i.id, { done: i.result?.done ?? false, value: i.result?.value ?? null, entries: i.result?.entries ?? [], text: i.result?.text ?? '', choice: i.result?.choice ?? null }]),
    );
    const next: FollowUp = { done, results, notes: data.notes, override: null };
    setForm(next);
    setInitial(JSON.stringify(next));
    setNotesOpen(!!data.notes);
  }, [data]);

  useEffect(() => {
    if (!open) {
      setForm(null);
      setSaveError(null);
    }
  }, [open]);

  const dirty = useMemo(() => !!form && JSON.stringify(form) !== initial, [form, initial]);

  const save = async () => {
    if (!form) return;
    const nothingDone = !form.done.bidsSelf && !bidder && !form.notes.trim()
      && !Object.values(form.results).some((r) => r.done || (r.value ?? 0) > 0);
    if (nothingDone
      && !window.confirm('Post the follow-up with no bids, ticks or notes? It goes to the team Slack channel.')) return;
    setSaving(true);
    setSaveError(null);
    try {
      // Entering a value (or ticking) on a weekly goal today puts it in focus.
      const touched = items.filter((i) => i.scope === 'goal' && !i.archived && (form.results[i.id]?.done || (form.results[i.id]?.value ?? 0) > 0)).map((i) => i.id);
      const { bidsBidder: _auto, ...bids } = bidsOf(form.done, data?.profiles);
      // Checks send done; counts / hours done + value (the server also ticks them at the frozen target); text / choice their answer.
      const results = Object.fromEntries(items.map((i) => [i.id, resultBody(i.kind, form.results[i.id] ?? { done: false, value: null })]));
      await api.putDayPlan(date, {
        results,
        focus: [...new Set([...(data?.focus ?? []), ...touched])],
        done: bids,
        notes: form.notes,
        ...(form.override ? { targetOverride: form.override } : {}),
      });
      await mutate();
      onSaved();
      onClose();
    } catch (e) {
      setSaveError(messageOf(e, 'Could not save the follow-up.'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete the follow-up for ${dayLabel(day)}?`)) return;
    setSaving(true);
    try {
      await api.deleteDayPlan(date);
      onSaved();
      onClose();
    } catch (e) {
      setSaveError(messageOf(e, 'Could not delete the follow-up.'));
    } finally {
      setSaving(false);
    }
  };

  const footer = !editable ? (
    <button type="button" className="btn-outline text-sm" onClick={onClose}>Close</button>
  ) : (
    <>
      {data?.loggedAt && (
        <button type="button" className="btn-outline mr-auto text-sm text-red-600 dark:text-red-400" onClick={remove} disabled={saving}>
          Delete
        </button>
      )}
      <button type="button" className="btn-outline text-sm" onClick={onClose}>Cancel</button>
      <button type="button" className="btn text-sm" onClick={save} disabled={saving || !form}>
        {saving ? 'Saving…' : data?.submitted ? 'Update post' : 'Post update'}
      </button>
    </>
  );

  const items = data?.items.filter(kept) ?? [];
  const bidder = date < BIDDER_AUTO_FROM ? data?.done.bidsBidder : data?.bidsBidderAuto;
  const hasGoal = !!data && (data.targets.bidsSelf + data.targets.bidsBidder > 0 || items.length > 0);

  return (
    <SidePanel
      open={open}
      title={`${dayLabel(day)}${isToday(day) ? ' · today' : ''}`}
      subtitle={readOnly ? 'View only' : canFollowUp ? 'Follow up what was done' : 'Upcoming — follow up on the day'}
      onClose={onClose}
      footer={footer}
      dirty={dirty && editable}
    >
      {error && (
        <div className="mb-3 text-sm text-red-600 dark:text-red-400" role="alert">
          Couldn&apos;t load this day.{' '}
          <button type="button" className="underline" onClick={() => mutate()}>Retry</button>
        </div>
      )}
      {saveError && <p className="mb-3 text-sm text-red-600 dark:text-red-400" role="alert">{saveError}</p>}
      {(isLoading || !form) && !error ? (
        <div className="space-y-2" aria-busy="true">
          <div className="skeleton h-6 w-1/2" />
          <div className="skeleton h-40 w-full" />
        </div>
      ) : form && data ? (
        <div className="space-y-5">
          {!hasGoal && (
            <p className="text-sm text-muted">
              No daily goal for this week yet — set it in the week&apos;s goals.
            </p>
          )}
          {editable && canFollowUp && (
            <button
              type="button"
              className="text-sm font-medium text-accent-700 underline-offset-2 hover:underline dark:text-accent-300"
              onClick={() => setForm({ ...form, override: form.override ? null : data.targets })}
            >
              {form.override ? "Use the week's targets" : 'Change for today'}
            </button>
          )}
          <GoalDoneFields
            goal={form.override ?? data.targets}
            onGoal={editable && form.override ? (override) => setForm({ ...form, override }) : undefined}
            bidderAuto={bidder}
            done={{ ...form.done, interviewsSelf: data.interviews.self, interviewsCaller: data.interviews.caller }}
            onDone={editable ? (done) => setForm({ ...form, done }) : undefined}
            stages={data.interviews.stages}
            profiles={data.profiles}
            tracked={data.trackedSelfByProfile}
            trackedProfiles={data.trackedProfiles}
            showDone={canFollowUp}
            readOnly={!editable}
          />
          {canFollowUp && <FollowUpsLine followUps={data.followUps} />}

          {(['routine', 'goal'] as const).map((scope) => {
            const rows = items.filter((i) => i.scope === scope);
            return rows.length > 0 && (
              <section key={scope}>
                <h3 className="form-label mb-1">{scope === 'routine' ? 'Routines' : 'Weekly goals'}</h3>
                <ul className="space-y-1.5">
                  {rows.map((item) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      result={form.results[item.id] ?? { done: false, value: null }}
                      profiles={data.profiles}
                      week={scope === 'goal' ? data.progress[item.id] : undefined}
                      disabled={!editable || item.archived}
                      onChange={(r) => setForm({ ...form, results: { ...form.results, [item.id]: r } })}
                    />
                  ))}
                </ul>
              </section>
            );
          })}

          {canFollowUp && editable && !notesOpen && (
            <button
              type="button"
              className="text-sm font-medium text-accent-700 underline-offset-2 hover:underline dark:text-accent-300"
              onClick={() => setNotesOpen(true)}
            >
              + Add a note
            </button>
          )}
          {canFollowUp && editable && notesOpen && (
            <section>
              <label className="form-label mb-1 block" htmlFor="day-notes">Note</label>
              <textarea
                id="day-notes"
                className="input min-h-[4.5rem] w-full"
                maxLength={2000}
                placeholder="Anything worth explaining — e.g. why a goal moved"
                value={form.notes}
                autoFocus={!data.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </section>
          )}
          {!editable && form.notes && (
            <section>
              <h3 className="form-label mb-1">Note</h3>
              <p className="whitespace-pre-wrap text-sm text-body">{form.notes}</p>
            </section>
          )}
        </div>
      ) : null}
    </SidePanel>
  );
}

const FOLLOW_UP_NAMES = 5;

/** The standup's read-only line about interview follow-ups; nothing when none were done and none wait. */
function FollowUpsLine({ followUps }: { followUps: api.DayPlan['followUps'] }) {
  const done = followUps?.doneToday ?? [];
  const toDo = followUps?.toDo ?? 0;
  if (!done.length && toDo <= 0) return null;
  const more = done.length - FOLLOW_UP_NAMES;
  return (
    <p className="text-xs text-muted">
      <span className="font-medium text-body">Follow-ups</span>
      {done.length > 0 && ` · done today: ${done.slice(0, FOLLOW_UP_NAMES).join(', ')}${more > 0 ? ` +${more}` : ''}`}
      {toDo > 0 && ` · still to do: ${toDo}`}
    </p>
  );
}
