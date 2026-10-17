import type { PromptRole, ResumePrompt } from '../../api/endpoints';

/** Job roles a resume prompt can be written for, in display order. */
export const PROMPT_ROLES: PromptRole[] = ['fullstack', 'frontend', 'backend', 'devops', 'data', 'ml', 'mobile', 'qa'];

export const PROMPT_ROLE_LABEL: Record<PromptRole, string> = {
  fullstack: 'Full stack',
  frontend: 'Frontend',
  backend: 'Backend',
  devops: 'DevOps',
  data: 'Data',
  ml: 'ML / AI',
  mobile: 'Mobile',
  qa: 'QA / Test',
};

export const MAX_PROMPTS = 10;
export const MAX_PROMPT_NAME = 60;

/** A temporary id for a prompt not saved yet; the server gives it a real one. */
export function newPromptId(): string {
  return `new-${Math.random().toString(36).slice(2, 10)}`;
}

/** What's wrong with each prompt's name (id → message), for the editor; empty when all are fine. */
export function promptErrors(prompts: ResumePrompt[]): Record<string, string> {
  const out: Record<string, string> = {};
  const seen = new Map<string, number>();
  for (const p of prompts) {
    const key = p.name.trim().toLowerCase();
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  for (const p of prompts) {
    const name = p.name.trim();
    if (!name) out[p.id] = 'Give the prompt a name';
    else if (name.length > MAX_PROMPT_NAME) out[p.id] = `Keep the name under ${MAX_PROMPT_NAME} characters`;
    else if ((seen.get(name.toLowerCase()) ?? 0) > 1) out[p.id] = 'Another prompt already has this name';
  }
  return out;
}
