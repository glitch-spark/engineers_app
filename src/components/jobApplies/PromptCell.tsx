import { useState } from 'react';
import { FileCode2, Loader2 } from 'lucide-react';
import type { JobApplyPromptOption } from '../../api/endpoints';
import { PROMPT_ROLE_LABEL, rolesLabel, unitRoles } from '../prompts/promptRoles';

/** The unit a profile tailors this job with: the user's choice, else the suggestion, else the default (if they exist). */
export function effectiveUnitId(
  options: JobApplyPromptOption[],
  defaultId: string | null | undefined,
  suggestedId: string | null | undefined,
  chosenId: string | null | undefined,
): string | undefined {
  const has = (id: string | null | undefined): id is string => !!id && options.some((o) => o.id === id);
  return has(chosenId) ? chosenId : has(suggestedId) ? suggestedId : has(defaultId) ? defaultId : options[0]?.id;
}

/**
 * The resume unit a profile tailors this job with: the user's choice, else the prompt suggested from the job, else the
 * profile's default. Changing it saves at once.
 */
export function PromptCell({
  options,
  defaultId,
  suggestedId,
  chosenId,
  onChange,
}: {
  options: JobApplyPromptOption[];
  defaultId: string | null | undefined;
  suggestedId: string | null;
  chosenId: string | null;
  onChange: (promptId: string) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const value = effectiveUnitId(options, defaultId, suggestedId, chosenId);

  if (!value) return <span className="text-xs text-zinc-400">—</span>;
  if (options.length === 1) {
    return (
      <div className="flex flex-col gap-0.5">
        <span className="block max-w-[16rem] truncate text-zinc-700 dark:text-zinc-300">{options[0].name}</span>
        <UnitDetails unit={options[0]} />
      </div>
    );
  }

  // "DevOps · DevOps" says nothing twice: the roles are shown only when the name doesn't already say them.
  const label = (o: JobApplyPromptOption) => {
    const roles = unitRoles(o);
    const said = rolesLabel(roles);
    return roles.length && o.name.trim().toLowerCase() !== said.toLowerCase() ? `${o.name} · ${said}` : o.name;
  };
  const tag = value === suggestedId && suggestedId !== defaultId ? 'Suggested' : value === defaultId ? 'Default' : '';
  const unit = options.find((o) => o.id === value);

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1.5">
        <select
          className="input w-full max-w-[16rem] py-1 text-xs"
          value={value}
          disabled={saving}
          aria-label="Resume prompt"
          onChange={async (e) => {
            setSaving(true);
            try {
              await onChange(e.target.value);
            } finally {
              setSaving(false);
            }
          }}
        >
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {label(o)}
            </option>
          ))}
        </select>
        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" aria-hidden />}
      </div>
      {tag && (
        <span
          className={`text-[11px] ${tag === 'Suggested' ? 'font-medium text-violet-700 dark:text-violet-300' : 'text-zinc-500'}`}
          title={tag === 'Suggested' ? 'Matches the job’s role' : 'No prompt matches the job’s role'}
        >
          {tag}
        </span>
      )}
      {unit && <UnitDetails unit={unit} />}
    </div>
  );
}

/** The selected unit's HTML template and its role marks (styled like the job's), under the Prompt select. */
function UnitDetails({ unit }: { unit: JobApplyPromptOption }) {
  const roles = unitRoles(unit);
  return (
    <>
      {unit.hasTemplate === false ? (
        <span
          className="text-[11px] font-medium text-amber-700 dark:text-amber-400"
          title="Add an HTML template to this resume unit on the profile page to tailor with it"
        >
          No HTML template
        </span>
      ) : (
        <span className="flex max-w-[16rem] items-center gap-1 text-xs text-zinc-600 dark:text-zinc-400" title={unit.templateName ?? undefined}>
          <FileCode2 className="h-3.5 w-3.5 shrink-0 text-zinc-400" aria-hidden />
          <span className="truncate">{unit.templateName || 'HTML template'}</span>
        </span>
      )}
      {roles.length > 0 && (
        <ul className="flex flex-wrap gap-1" aria-label="Unit roles">
          {roles.map((r) => (
            <li
              key={r}
              className="rounded-md bg-violet-100 px-1.5 py-0.5 text-[11px] font-semibold text-violet-800 dark:bg-violet-950/60 dark:text-violet-200"
            >
              {PROMPT_ROLE_LABEL[r]}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

