import useSWR from 'swr';
import * as api from '../../api/endpoints';
import GradeBadge from './GradeBadge';

/** "What to change" card: plain-language suggestions per profile, as the server words them. */
export default function ChangesCard({ params, user }: { params: api.ConversionParams | null; user: string }) {
  const { data, error, isLoading } = useSWR(
    params ? ['stats-changes', params.period, params.date, params.to, params.region, params.scope, params.profile, user] : null,
    () => api.getChanges({ ...params!, ...(user ? { user } : {}) }),
    { keepPreviousData: true },
  );
  if (!params) return null;
  if (error) return <p className="panel p-6 text-sm text-red-700 dark:text-red-400">Couldn’t load the suggestions. Try again.</p>;
  if (!data) {
    return isLoading ? (
      <p className="panel flex items-center gap-2 p-6 text-sm text-muted" role="status">
        <span className="spinner spinner-sm" aria-hidden /> Loading suggestions…
      </p>
    ) : null;
  }
  const profiles = data.profiles.filter((p) => p.suggestions.length > 0);
  return (
    <div className="panel p-4">
      <h3 className="font-semibold">What to change</h3>
      {profiles.length === 0 ? (
        <p className="mt-2 text-sm text-muted">Nothing to change right now — no profile shows a clear problem in this period.</p>
      ) : (
        <div className="mt-2 space-y-3">
          {profiles.map((p) => (
            <div key={p.accountId}>
              <p><span className="font-medium">{p.name}</span> <GradeBadge grade={p.grade} /></p>
              <ul className="list-disc pl-5 text-sm">
                {p.suggestions.map((s) => <li key={s.pattern}>{s.text}</li>)}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
