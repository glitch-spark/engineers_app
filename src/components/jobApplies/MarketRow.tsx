import { useId, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import type { JobApplyScreeningGroup, JobApplyScreeningProfile } from '../../api/endpoints';
import { countryFlag } from '../../lib/countries';
import { ResumeChecklist, usable, type ProfileOption } from './ProfilePicker';
import { marketLabel } from './format';

/** How a picked profile applies: "2 of 3 resumes" / "✨ tailor only". */
function modeLabel(p: ProfileOption, unchecked: Set<string>): string {
  if (p.resumes.length === 0) return 'tailor only';
  const on = p.resumes.filter((r) => !unchecked.has(r.id)).length;
  return on === p.resumes.length ? `${on} resume${on === 1 ? '' : 's'}` : `${on} of ${p.resumes.length} resumes`;
}

/**
 * Step ② (spec 2026-10-03 §4): one candidate market, its jobs, and the profiles applying there as chips. A chip opens
 * the profile's resume choices; "+ add" offers the fitting profiles first.
 */
export default function MarketRow({
  group,
  profiles,
  options,
  picked,
  unchecked,
  readOnly,
  onAdd,
  onRemove,
  onToggleResume,
}: {
  group: JobApplyScreeningGroup;
  profiles: JobApplyScreeningProfile[];
  options: Map<string, ProfileOption>;
  picked: Set<string>;
  unchecked: Set<string>;
  readOnly?: boolean;
  onAdd: (profileId: string) => void;
  onRemove: (profileId: string) => void;
  onToggleResume: (resumeId: string) => void;
}) {
  const addId = useId();
  const [openChip, setOpenChip] = useState<string | null>(null);
  const chips = profiles.filter((p) => picked.has(p.id));
  const addable = profiles
    .filter((p) => !picked.has(p.id) && options.get(p.id) && usable(options.get(p.id)!))
    .sort((a, b) => Number(group.fits.includes(b.id)) - Number(group.fits.includes(a.id)));
  const nobody = group.jobs > 0 && chips.length === 0;

  return (
    <li
      className={`rounded-xl border px-4 py-3 ${
        nobody ? 'border-amber-400 bg-amber-50/50 dark:border-amber-600 dark:bg-amber-950/20' : 'border-zinc-200 dark:border-zinc-700'
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="min-w-[11rem] text-sm">
          <span className="font-semibold text-zinc-900 dark:text-zinc-50">{marketLabel(group.key)}</span>
          <span className="text-zinc-600 dark:text-zinc-400"> · {group.jobs} job{group.jobs === 1 ? '' : 's'}</span>
          {group.check > 0 && <span className="ml-1 text-xs text-amber-700 dark:text-amber-400">({group.check} need a check)</span>}
        </p>
        {group.jobs === 0 ? (
          <span className="hint">No jobs</span>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {chips.map((p) => {
              const option = options.get(p.id);
              const open = openChip === p.id;
              return (
                <span key={p.id} className="relative">
                  <span className="inline-flex items-center rounded-full border border-emerald-300 bg-emerald-50 text-sm dark:border-emerald-700 dark:bg-emerald-950/30">
                    <button
                      type="button"
                      className="px-2.5 py-0.5"
                      aria-expanded={open}
                      onClick={() => setOpenChip(open ? null : p.id)}
                      disabled={readOnly || !option}
                      title="Choose which resumes this profile applies with"
                    >
                      {p.country ? `${countryFlag(p.country)} ` : ''}
                      <span className="font-medium">{p.name}</span>
                      {option && (
                        <span className="ml-1 text-xs text-zinc-600 dark:text-zinc-400">
                          {option.resumes.length === 0 && <Sparkles className="mr-0.5 inline h-3 w-3" aria-hidden />}
                          {modeLabel(option, unchecked)}
                        </span>
                      )}
                    </button>
                    {!readOnly && (
                      <button
                        type="button"
                        className="pr-2 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                        onClick={() => onRemove(p.id)}
                        aria-label={`Remove ${p.name} from ${marketLabel(group.key)}`}
                      >
                        <X className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    )}
                  </span>
                  {open && option && (
                    <div className="absolute left-0 top-full z-20 mt-1 w-72 rounded-xl border border-zinc-200 bg-white p-3 text-sm shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                      <p className="mb-2 font-medium text-zinc-900 dark:text-zinc-50">{p.name} applies with</p>
                      <ResumeChecklist profile={option} enabled unchecked={unchecked} onToggle={onToggleResume} />
                      <p className="hint mt-2">Applies to every market {p.name} is picked in.</p>
                    </div>
                  )}
                </span>
              );
            })}
            {nobody && <span className="text-sm text-amber-800 dark:text-amber-300">No profile — these jobs will be skipped</span>}
            {!readOnly && addable.length > 0 && (
              <>
                <label htmlFor={addId} className="sr-only">
                  Add a profile to {marketLabel(group.key)}
                </label>
                <select
                  id={addId}
                  className="input w-auto py-0.5 text-xs"
                  value=""
                  onChange={(e) => e.target.value && onAdd(e.target.value)}
                >
                  <option value="">+ add profile</option>
                  {addable.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {group.fits.includes(p.id) ? '' : ' (doesn’t fit)'}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
