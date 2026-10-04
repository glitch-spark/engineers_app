import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';

export interface ProfileOption {
  _id: string;
  name: string;
  country: string | null;
  region: string | null;
  hasTemplate: boolean;
  resumes: { id: string; filename: string }[];
}

export function toProfile(raw: Record<string, unknown>): ProfileOption {
  const resumes = Array.isArray(raw.resumes) ? (raw.resumes as Record<string, unknown>[]) : [];
  return {
    _id: String(raw._id),
    name: String(raw.name ?? ''),
    country: (raw.country as string | null | undefined) ?? null,
    region: (raw.region as string | null | undefined) ?? null,
    hasTemplate: typeof raw.styleTemplate === 'string' && raw.styleTemplate.trim().length > 0,
    resumes: resumes.filter((r) => r.id).map((r) => ({ id: String(r.id), filename: String(r.filename ?? 'resume') })),
  };
}

/** A profile can take part if it can be matched (uploaded resumes) or tailored (HTML template). */
export const usable = (p: ProfileOption) => p.resumes.length > 0 || p.hasTemplate;

/** The resumes a profile is matched with. At least one stays on: a profile with resumes is matched by them. */
export function ResumeChecklist({
  profile,
  enabled,
  unchecked,
  onToggle,
}: {
  profile: ProfileOption;
  enabled: boolean;
  unchecked: Set<string>;
  onToggle: (resumeId: string) => void;
}) {
  if (!usable(profile)) {
    return (
      <p className="hint">
        Can’t use yet: no resumes or HTML template.{' '}
        <Link to={`/accounts/${profile._id}`} className="font-medium text-sky-700 hover:underline dark:text-sky-400">
          Set up
        </Link>
      </p>
    );
  }
  if (profile.resumes.length === 0) {
    return (
      <p className="inline-flex items-center gap-1.5 text-violet-700 dark:text-violet-300">
        <Sparkles className="h-3.5 w-3.5" aria-hidden /> Tailored resumes only
      </p>
    );
  }
  const checkedCount = profile.resumes.filter((r) => !unchecked.has(r.id)).length;
  return (
    <ul className="space-y-1">
      {profile.resumes.map((r) => {
        const isOn = !unchecked.has(r.id);
        return (
          <li key={r.id}>
            <label className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={enabled && isOn}
                disabled={!enabled || (isOn && checkedCount === 1)}
                onChange={() => onToggle(r.id)}
              />
              <span className="truncate">{r.filename}</span>
            </label>
          </li>
        );
      })}
      <li className="hint">{profile.hasTemplate ? 'Can also be tailored' : 'No HTML template, so no tailoring'}</li>
    </ul>
  );
}

/** The run's selection: an empty resume list means "every resume on the profile" (and "tailor only" when it has none). */
export function selectionFor(profiles: ProfileOption[], unchecked: Set<string>) {
  return profiles.map((p) => {
    const on = p.resumes.filter((r) => !unchecked.has(r.id)).map((r) => r.id);
    return { accountId: p._id, resumeIds: on.length === p.resumes.length ? [] : on };
  });
}
