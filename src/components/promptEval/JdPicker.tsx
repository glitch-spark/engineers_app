import { useId, useMemo } from 'react';
import useSWR from 'swr';
import { Loader2 } from 'lucide-react';
import * as api from '../../api/endpoints';
import type { EvalJobDescription, EvalRole } from '../../api/endpoints';
import { MAX_JDS_PER_RUN, ROLE_LABEL } from './format';

/** Pick the sample job descriptions for a run: a chip per role selects all of that role, or tick single postings. */
export default function JdPicker({
  value,
  onChange,
  max = MAX_JDS_PER_RUN,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  max?: number;
}) {
  const { data, isLoading, error } = useSWR(['prompt-eval-jds', 'active'], () => api.listEvalJds());
  const id = useId();
  const jds = useMemo(() => data?.jds ?? [], [data]);
  const byRole = useMemo(() => {
    const groups = new Map<EvalRole, EvalJobDescription[]>();
    for (const jd of jds) groups.set(jd.role, [...(groups.get(jd.role) ?? []), jd]);
    return groups;
  }, [jds]);
  const roles = (data?.roles ?? []).filter((r) => byRole.has(r));
  const selected = new Set(value);
  const atCap = selected.size >= max;

  function toggle(jdId: string) {
    onChange(selected.has(jdId) ? value.filter((x) => x !== jdId) : [...value, jdId]);
  }

  function toggleRole(role: EvalRole) {
    const ids = (byRole.get(role) ?? []).map((j) => j._id);
    const allOn = ids.every((x) => selected.has(x));
    if (allOn) {
      onChange(value.filter((x) => !ids.includes(x)));
      return;
    }
    const next = [...value];
    for (const x of ids) {
      if (next.length >= max) break;
      if (!next.includes(x)) next.push(x);
    }
    onChange(next);
  }

  if (isLoading) {
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-muted">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading job descriptions…
      </p>
    );
  }
  if (error) return <p className="text-sm text-red-700 dark:text-red-400">Could not load the job descriptions.</p>;
  if (jds.length === 0) {
    return <p className="text-sm text-muted">No job descriptions yet. Add some on the Job descriptions tab.</p>;
  }

  return (
    // min-w-0 overrides the fieldset default (min-inline-size: min-content) so long titles truncate instead of overflowing.
    <fieldset className="min-w-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <legend className="block text-xs font-medium text-muted">Job descriptions</legend>
        <span className={`text-xs tabular-nums ${atCap ? 'text-amber-700 dark:text-amber-400' : 'text-faint'}`}>
          {selected.size} / {max} selected
        </span>
      </div>
      <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Select by role">
        {roles.map((role) => {
          const ids = (byRole.get(role) ?? []).map((j) => j._id);
          const on = ids.length > 0 && ids.every((x) => selected.has(x));
          return (
            <button
              key={role}
              type="button"
              aria-pressed={on}
              onClick={() => toggleRole(role)}
              className={
                'focus-ring rounded-lg border px-2.5 py-1 text-xs font-medium transition ' +
                (on
                  ? 'border-sky-700 bg-sky-700 text-white dark:border-sky-500 dark:bg-sky-600'
                  : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800')
              }
            >
              {ROLE_LABEL[role]}
              <span className="ml-1 tabular-nums opacity-70">{ids.length}</span>
            </button>
          );
        })}
      </div>
      <ul className="row-divider max-h-72 overflow-y-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
        {roles.flatMap((role) =>
          (byRole.get(role) ?? []).map((jd) => {
            const on = selected.has(jd._id);
            const disabled = !on && atCap;
            return (
              <li key={jd._id}>
                <label
                  htmlFor={`${id}-${jd._id}`}
                  className={`flex cursor-pointer items-center gap-3 px-3 py-2 text-sm ${disabled ? 'opacity-50' : 'hover:bg-zinc-50 dark:hover:bg-zinc-900/60'}`}
                >
                  <input
                    id={`${id}-${jd._id}`}
                    type="checkbox"
                    className="h-4 w-4 rounded border-zinc-300 text-sky-700 focus-ring dark:border-zinc-600"
                    checked={on}
                    disabled={disabled}
                    onChange={() => toggle(jd._id)}
                  />
                  <span className="badge-neutral shrink-0">{ROLE_LABEL[jd.role]}</span>
                  <span className="min-w-0 flex-1 truncate">
                    <span className="text-strong">{jd.title}</span>
                    <span className="text-muted"> · {jd.company}</span>
                  </span>
                  {jd.seedKey && <span className="text-[11px] text-faint">seed</span>}
                </label>
              </li>
            );
          }),
        )}
      </ul>
      <p className="hint mt-1">At most {max} per run to keep cost bounded. Each JD costs one resume generation plus one judge call.</p>
    </fieldset>
  );
}
