import type { JobApplyRow } from '../../api/endpoints';
import { PROMPT_ROLE_LABEL } from '../prompts/promptRoles';

/** The job's role and main-stack keywords (read from its title and skills), under the job's company line. */
export function JobRoleMarks({ jobRole }: { jobRole?: JobApplyRow['jobRole'] }) {
  if (!jobRole || (!jobRole.role && jobRole.marks.length === 0)) return null;
  return (
    <ul className="mt-1 flex flex-wrap items-center gap-1" title={jobRole.reason || undefined} aria-label="Role and main stack">
      {jobRole.role && (
        <li className="rounded-md bg-violet-100 px-1.5 py-0.5 text-[11px] font-semibold text-violet-800 dark:bg-violet-950/60 dark:text-violet-200">
          {PROMPT_ROLE_LABEL[jobRole.role]}
        </li>
      )}
      {jobRole.marks.slice(0, 7).map((m) => (
        <li
          key={m}
          className="rounded-md border border-zinc-200 px-1.5 py-0.5 text-[11px] text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
        >
          {m}
        </li>
      ))}
    </ul>
  );
}
