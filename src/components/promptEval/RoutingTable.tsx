import { Loader2 } from 'lucide-react';
import type { EvalJobDescription, EvalRoute, EvalRouteUnit } from '../../api/endpoints';
import { ROLE_LABEL } from './format';

const AUTO = '';

/**
 * Whole-profile mode: the unit each picked JD will be generated with (the Job Applies pick, from the title and
 * skills), why, and a menu to pick another unit by hand.
 */
export default function RoutingTable({
  jds,
  routes,
  units,
  overrides,
  onOverride,
  loading,
}: {
  jds: EvalJobDescription[];
  routes: EvalRoute[];
  units: EvalRouteUnit[];
  overrides: Record<string, string>;
  onOverride: (jdId: string, unitId: string | undefined) => void;
  loading: boolean;
}) {
  const byJd = new Map(routes.map((r) => [r.jdId, r]));
  const manual = routes.filter((r) => r.pick === 'manual').length;

  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <span className="text-xs font-medium text-muted">Which unit each job description gets</span>
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted" aria-label="Updating" />}
        {manual > 0 && <span className="ml-auto text-xs text-muted">{manual} picked by hand</span>}
      </div>
      {jds.length === 0 ? (
        <p className="text-sm text-muted">Pick job descriptions to see which unit each one gets.</p>
      ) : (
        <div className="max-h-80 overflow-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
          <table className="min-w-full text-sm">
            <thead className="table-head sticky top-0">
              <tr>
                <th className="px-3 py-1.5 text-left font-medium">Job description</th>
                <th className="px-3 py-1.5 text-left font-medium">Unit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {jds.map((jd) => {
                const route = byJd.get(jd._id);
                const selectId = `eval-route-${jd._id}`;
                return (
                  <tr key={jd._id} className="align-top">
                    <td className="px-3 py-1.5">
                      <div className="text-strong">{jd.title}</div>
                      <div className="text-xs text-muted">
                        {ROLE_LABEL[jd.role]} · {jd.company}
                      </div>
                    </td>
                    <td className="px-3 py-1.5">
                      <label htmlFor={selectId} className="sr-only">
                        Unit for {jd.title}
                      </label>
                      <select
                        id={selectId}
                        className="input w-full py-1 text-sm"
                        value={overrides[jd._id] ?? AUTO}
                        onChange={(e) => onOverride(jd._id, e.target.value === AUTO ? undefined : e.target.value)}
                      >
                        <option value={AUTO}>
                          Auto{route && route.pick === 'auto' ? `: ${route.unitName}` : ''}
                        </option>
                        {units.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name}
                          </option>
                        ))}
                      </select>
                      {route && (
                        <p className="mt-0.5 text-xs text-muted">
                          <span className={route.pick === 'manual' ? 'badge-info' : 'badge-neutral'}>{route.pick === 'manual' ? 'manual' : 'auto'}</span>{' '}
                          {route.reason}
                        </p>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="hint mt-1">
        Auto uses the Job Applies pick: role keywords in the title and skills, matched to each unit's roles, else the
        default unit. Free, no model call.
      </p>
    </div>
  );
}
