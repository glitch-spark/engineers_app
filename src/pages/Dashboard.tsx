import { useId } from 'react';
import { useSearchParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import Select from '../components/Select';
import FilterBar, { FilterField } from '../components/filters/FilterBar';
import MyHome from '../components/home/MyHome';
import { useAuth } from '../auth/useAuth';
import { addDays, dayDate, dayLabel, mondayOf, monthDay, todayInputValue } from '../lib/week';
import { teamMembersAZ, useTeamLookup } from '../lib/useFirstTeamMember';

/** Sunday counts as the Saturday before it: the page shows working weeks (Mon–Sat). */
const workday = (iso: string) => (dayDate(iso).getDay() === 0 ? addDays(iso, -1) : iso);

/**
 * The day the page shows, kept in the URL as `?day=YYYY-MM-DD` (absent = today; `yesterday` from old links still
 * works; a day in the future or one that is no date falls back to today). `home` is where "Back to today" returns:
 * today, or on a Sunday the Saturday of the week just ended.
 */
function usePickedDay() {
  const [params, setParams] = useSearchParams();
  const today = todayInputValue();
  const home = workday(today);
  const raw = params.get('day') ?? '';
  const asked = raw === 'yesterday' ? addDays(today, -1)
    : /^\d{4}-\d{2}-\d{2}$/.test(raw) && todayInputValue(dayDate(raw)) === raw && raw <= today ? raw : today;
  const patch = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next, { replace: true });
  };
  return { params, patch, today, home, day: workday(asked), pickDay: (d: string) => patch({ day: d === home ? null : d }) };
}

const FIELD_LABEL = 'mb-1 block text-xs text-muted'; // as FilterField's, for a control that is a group of buttons
const ARROW = 'flex items-center px-2.5 text-body hover:bg-zinc-50 disabled:text-zinc-300 disabled:hover:bg-transparent dark:hover:bg-zinc-800 dark:disabled:text-zinc-600';

/**
 * The Week and Day filters and Back to today: step back any number of weeks (never past the current one), then one
 * of the week's six days (Mon–Sat); a day still to come cannot be picked. Picking a week picks its Saturday, or today in the
 * current week.
 */
function WeekAndDay({ today, home, day, pickDay }: { today: string; home: string; day: string; pickDay: (day: string) => void }) {
  const id = useId();
  const monday = mondayOf(day);
  const current = monday === mondayOf(home);
  const nextMonday = addDays(monday, 7);
  return (
    <>
      <div role="group" aria-labelledby={`${id}w`}>
        <span id={`${id}w`} className={FIELD_LABEL}>Week</span>
        <div data-control className="inline-flex h-[38px] items-stretch overflow-hidden rounded-xl border border-field bg-white text-sm shadow-sm dark:bg-zinc-900">
          <button type="button" aria-label="Previous week" className={`border-r border-zinc-200 dark:border-zinc-700 ${ARROW}`} onClick={() => pickDay(addDays(monday, -2))}>‹</button>
          <span className="flex items-center whitespace-nowrap px-3 font-medium text-body" aria-live="polite">{monthDay(monday)} – {monthDay(addDays(monday, 5))}</span>
          <button
            type="button" aria-label="Next week" disabled={current} className={`border-l border-zinc-200 dark:border-zinc-700 ${ARROW}`}
            onClick={() => pickDay(nextMonday === mondayOf(home) ? home : addDays(nextMonday, 5))}
          >
            ›
          </button>
        </div>
      </div>
      <div role="radiogroup" aria-labelledby={`${id}d`}>
        <span id={`${id}d`} className={FIELD_LABEL}>Day</span>
        <div className="flex gap-1.5">
          {[0, 1, 2, 3, 4, 5].map((i) => {
            const date = addDays(monday, i);
            return (
              <label key={date} className="relative">
                <input
                  type="radio" name={`${id}day`} value={date} className="peer sr-only" aria-label={dayLabel(date)}
                  aria-current={date === today ? 'date' : undefined} checked={date === day} disabled={date > today} onChange={() => pickDay(date)}
                />
                <span
                  data-control
                  className="flex h-[38px] min-w-[3.25rem] cursor-pointer items-center justify-center gap-1 rounded-xl border border-field bg-white px-2.5 text-xs text-muted shadow-sm dark:bg-zinc-900 peer-checked:border-zinc-900 peer-checked:bg-zinc-900 peer-checked:text-zinc-300 peer-focus-visible:ring-2 peer-focus-visible:ring-accent-500 peer-disabled:cursor-default peer-disabled:opacity-40 dark:peer-checked:border-zinc-100 dark:peer-checked:bg-zinc-100 dark:peer-checked:text-zinc-600"
                >
                  {date === today ? 'Today' : dayDate(date).toLocaleDateString('en-US', { weekday: 'short' })}
                  <b className="text-sm">{dayDate(date).getDate()}</b>
                </span>
              </label>
            );
          })}
        </div>
      </div>
      {day !== home && <button type="button" className="btn-outline ml-auto" onClick={() => pickDay(home)}>Back to today</button>}
    </>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  return (
    <div className="space-y-6">
      <PageHeader title="Home" />
      {user?.role === 'admin' ? <AdminHome /> : <MyHome />}
    </div>
  );
}

/**
 * An admin's Home is the team, one person at a time, picked with a User filter at the top like the other pages
 * (user, 2026-11-21: no Me / Team switch, no list down the side, no Team totals table for now). The names come from
 * the shared team lookup, so the filter is there at once; nobody is picked on arrival and a person's page is read
 * only when they are picked. The person (`?user=`) and the day (`?day=`) sit in the URL.
 */
function AdminHome() {
  const userId = useId();
  const { params, patch, today, home, day, pickDay } = usePickedDay();
  const lookup = useTeamLookup();
  const people = teamMembersAZ(lookup.data?.users).map((u) => ({ value: u._id, label: u.name?.trim() || u.email?.trim() || 'Unnamed' }));
  const picked = params.get('user') || '';
  const pickedName = people.find((p) => p.value === picked)?.label ?? '';

  return (
    <>
      <FilterBar canClear={!!picked || day !== home} onClear={() => patch({ user: null, day: null })}>
        <FilterField label="User" htmlFor={userId} width="w-52">
          {lookup.error && !lookup.data ? (
            <p className="text-sm text-muted">
              Couldn&rsquo;t load the team. <button type="button" className="underline" onClick={() => lookup.mutate()}>Retry</button>
            </p>
          ) : (
            <Select
              id={userId}
              value={picked}
              onChange={(user) => patch({ user: user || null })}
              disabled={!lookup.data}
              options={[
                { value: '', label: 'Pick a person' },
                ...people,
                // a linked person the lookup doesn't list (yet) still shows as picked
                ...(picked && !people.some((p) => p.value === picked) ? [{ value: picked, label: 'This person' }] : []),
              ]}
            />
          )}
        </FilterField>
        <WeekAndDay today={today} home={home} day={day} pickDay={pickDay} />
      </FilterBar>
      {/* the person's own Home, read for them, on the picked day (user, 2026-11-21: one view, no switch) */}
      {picked ? <MyHome key={picked} userId={picked} name={pickedName} day={day} /> : (
        <p className="panel p-6 text-sm text-muted">Pick a person to see their bids, interviews, to-dos, goals and pending items.</p>
      )}
    </>
  );
}
