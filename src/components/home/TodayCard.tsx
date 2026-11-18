import { Fragment, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import useSWR from 'swr';
import * as api from '../../api/endpoints';
import { useAuth } from '../../auth/useAuth';
import { todayInputValue } from '../../lib/week';
import ItemRow from '../report/ItemRow';

type Result = { done: boolean; value: number | null };
const DEBOUNCE_MS = 800;

/** True on Mon-Fri from 18:00 Chicago time. */
function afterSixChicago() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', hour: 'numeric', hourCycle: 'h23', weekday: 'short',
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return !['Sat', 'Sun'].includes(get('weekday')) && Number(get('hour')) >= 18;
}

const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(/ /g, ' ');

export default function TodayCard() {
  const { user } = useAuth();
  const today = todayInputValue();
  const { data: plan, mutate } = useSWR(['home-day', today], () => api.getDayPlan(today), { revalidateOnFocus: false });
  const { data: rounds } = useSWR(
    user ? ['home-rounds', today, user.id] : null,
    () => api.listInterviewRounds({ from: today, to: today, creatorId: user!.id }),
    { revalidateOnFocus: false },
  );

  const [local, setLocal] = useState<Record<string, Result>>({}); // optimistic, until saved
  const [failed, setFailed] = useState<Record<string, Result>>({}); // last attempt per failed item, for Retry
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  useEffect(() => () => Object.values(timers.current).forEach(clearTimeout), []);

  if (!plan) return null;

  const save = async (id: string, r: Result) => {
    delete timers.current[id];
    try {
      const next = await api.putDayProgress(today, { results: { [id]: r } });
      await mutate(next, false);
      setFailed(({ [id]: _, ...rest }) => rest);
      if (!timers.current[id]) setLocal(({ [id]: _, ...rest }) => rest); // keep newer typing
    } catch {
      setFailed((f) => ({ ...f, [id]: r }));
      setLocal(({ [id]: _, ...rest }) => rest); // back to the last saved result
    }
  };
  const change = (id: string, r: Result) => {
    setLocal((l) => ({ ...l, [id]: r }));
    clearTimeout(timers.current[id]);
    timers.current[id] = setTimeout(() => save(id, r), DEBOUNCE_MS);
  };
  const retry = (id: string) => {
    const r = failed[id];
    setLocal((l) => ({ ...l, [id]: r }));
    save(id, r);
  };

  const href = `/report?day=${today}`;
  const [y, m, d] = today.split('-').map(Number);
  const heading = new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const t = plan.targets;
  const intTarget = t.interviewsSelf + t.interviewsCaller;
  const intDone = plan.interviews.self + plan.interviews.caller;
  const roundsText = [...(rounds?.rounds ?? [])]
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
    .map((r) => `${clock(r.scheduledAt)} ${r.companyName ?? ''}`.trim())
    .join(' · ');
  const rows = plan.items.filter((i) => i.scope === 'routine' || plan.focus.includes(i.id));
  const disabled = !plan.weekSaved;
  const late = !plan.submitted && afterSixChicago();

  return (
    <section className="card space-y-3 p-4">
      <header className="flex items-center gap-3">
        <h2 className="text-base font-semibold text-heading">Today · {heading}</h2>
        <span className={`text-sm ${plan.submitted ? 'text-muted' : late ? 'text-amber-700 dark:text-amber-400' : 'text-muted'}`}>
          {plan.submitted ? '✓ Posted' : 'Update not posted yet'}
        </span>
        <Link to={href} className="ml-auto text-sm underline">{plan.submitted ? 'Edit update' : 'Write my update'}</Link>
      </header>

      <dl className="space-y-1 text-sm text-body">
        <div className="flex items-center gap-2">
          <dt className="w-24">Self bids</dt>
          <dd className="tabular-nums">{plan.done.bidsSelf} / {t.bidsSelf}</dd>
          <Link to={href} className="ml-auto text-xs underline">edit</Link>
        </div>
        <div className="flex items-center gap-2">
          <dt className="w-24">Bidder bids</dt>
          <dd className="tabular-nums">{plan.bidsBidderAuto} / {t.bidsBidder}</dd>
        </div>
        <div className="flex items-center gap-2">
          <dt className="w-24">Interviews</dt>
          <dd className="tabular-nums">{intTarget ? `${intDone} / ${intTarget}` : intDone}</dd>
          {roundsText && <dd className="text-muted">{roundsText}</dd>}
        </div>
      </dl>

      {disabled && (
        <p className="text-sm text-muted">
          No plan for this week yet — <Link to="/plans" className="underline">Set this week's plan</Link>
        </p>
      )}
      <ul className="space-y-2">
        {rows.map((item) => (
          <Fragment key={item.id}>
            <ItemRow
              item={item}
              result={local[item.id] ?? { done: item.result?.done ?? false, value: item.result?.value ?? null }}
              week={item.scope === 'goal' ? plan.progress[item.id] : undefined}
              disabled={disabled}
              onChange={(r) => change(item.id, r)}
            />
            {failed[item.id] && !local[item.id] && (
              <li className="text-xs text-red-600">
                Couldn't save — <button type="button" className="underline" onClick={() => retry(item.id)}>Retry</button>
              </li>
            )}
          </Fragment>
        ))}
      </ul>
    </section>
  );
}
