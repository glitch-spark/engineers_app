import type { JobApplyRow } from '../../api/endpoints';
import { PROMPT_ROLE_LABEL } from '../prompts/promptRoles';

/** The job's roles (read from its title and skills, strongest first), under the job's company line. */
export function JobRoleMarks({ jobRole }: { jobRole?: JobApplyRow['jobRole'] }) {
  if (!jobRole?.roles?.length) return null;
  return (
    <ul className="mt-1 flex flex-wrap items-center gap-1" title={jobRole.reason || undefined} aria-label="Job roles">
      {jobRole.roles.slice(0, 3).map((r) => (
        <li
          key={r}
          className="rounded-md bg-violet-100 px-1.5 py-0.5 text-[11px] font-semibold text-violet-800 dark:bg-violet-950/60 dark:text-violet-200"
        >
          {PROMPT_ROLE_LABEL[r]}
        </li>
      ))}
    </ul>
  );
}
