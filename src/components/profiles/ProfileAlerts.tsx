// Profiles list banners (spec 2026-11-14-profiles-flags-and-top-design.md): red for profiles with no interview in the
// last 2 weeks, one suggested action each (not dismissible: it clears when the profile gets an interview); grey for
// profiles with no applies in the last 3 weeks, each with an Archive button. Rules and wording: lib/profileList.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { ProfileAlerts as Alerts } from '../../api/endpoints';
import { flagNumbers, flagSuggestion } from '../../lib/profileList';

const SHOWN = 8;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

type Props = {
  alerts: Alerts;
  /** The Setup column's warnings for a profile; [] when its account isn't loaded on this page. */
  warningsFor: (accountId: string) => string[];
  onArchive: (accountId: string, name: string) => void;
};

export default function ProfileAlerts({ alerts, warningsFor, onArchive }: Props) {
  const [showAll, setShowAll] = useState(false);
  const red = alerts.noInterviews;
  const grey = alerts.noApplies;
  if (!red.length && !grey.length) return null;
  const shown = showAll ? red : red.slice(0, SHOWN);
  return (
    <div className="space-y-3">
      {red.length > 0 && (
        <section
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100"
        >
          <h2 className="text-sm font-semibold">
            ⛔ {plural(red.length, 'profile', 'profiles')} got no interviews in the last 2 weeks
          </h2>
          <ul className="mt-2 space-y-2">
            {shown.map((a) => (
              <li key={a.accountId} className="text-sm">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <Link to={`/accounts/${a.accountId}`} className="font-medium hover:underline">{a.name || 'Unnamed'}</Link>
                  <span className="text-xs opacity-80">{flagNumbers(a, alerts.allTailorScore)}</span>
                </div>
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <span>→ {flagSuggestion(a, alerts.allTailorScore, warningsFor(a.accountId))}</span>
                  <Link to={`/accounts/${a.accountId}`} className="text-xs font-medium underline">Open profile</Link>
                </div>
              </li>
            ))}
          </ul>
          {red.length > SHOWN && (
            <button type="button" className="mt-2 text-xs font-medium underline" onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Show fewer' : `Show all ${red.length}`}
            </button>
          )}
        </section>
      )}
      {grey.length > 0 && (
        <section className="panel p-4" aria-label="Profiles with no applies in the last 3 weeks">
          <p className="text-sm">
            {plural(grey.length, 'profile', 'profiles')} had no applies in the last 3 weeks.{' '}
            <span className="text-muted">Archive them to keep the list focused.</span>
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {grey.map((a) => (
              <li key={a.accountId} className="inline-flex items-center gap-2 rounded border border-black/10 px-2 py-1 text-sm dark:border-white/15">
                <Link to={`/accounts/${a.accountId}`} className="hover:underline">{a.name || 'Unnamed'}</Link>
                <button type="button" className="btn-outline btn-sm" onClick={() => onArchive(a.accountId, a.name)}>
                  Archive
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
