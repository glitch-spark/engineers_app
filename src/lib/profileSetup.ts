// Profile page → Profile tab: what a profile has set up (fixed resumes, tailoring units) and whether its prompts
// have unsaved edits. Type-only imports, so Node's test runner loads this file as is (tests/profileSetup.test.mjs).
import type { PromptRole, ResumePrompt } from '../api/endpoints';

export const MAX_PROMPT_NAME = 60;

/** The profile as `GET /accounts/{id}` returns it, as far as the Profile tab reads it. */
export type ProfileDoc = {
  _id?: string;
  name?: string | null;
  country?: string | null;
  region?: string | null;
  archived?: boolean | null;
  resumes?: unknown[] | null;
  resumePromptBody?: string | null;
  styleTemplate?: string | null;
  styleTemplateName?: string | null;
  pageFormat?: string | null;
  resumePrompts?: ResumePrompt[] | null;
  defaultPromptId?: string | null;
  screeningPrompt?: string | null;
  coverLetterPrompt?: string | null;
};

/** Everything the prompt editors change, saved together by one Save. */
export type PromptsState = { prompts: ResumePrompt[]; defaultId: string; screeningPrompt: string; coverLetterPrompt: string };

/** A unit's roles; one saved before units had several roles carries a single `role`. */
export function unitRoles(p: { roles?: PromptRole[] | null; role?: PromptRole | null }): PromptRole[] {
  if (p.roles?.length) return p.roles;
  return p.role ? [p.role] : [];
}

/** A name for an older profile's single prompt: its first line when that's a markdown heading (without a trailing
 *  "(…)"), else "Default". Matches the server's naming. */
export function legacyPromptName(body: string): string {
  const first = body.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? '';
  if (!first.startsWith('#')) return 'Default';
  let name = first.replace(/^#+/, '').trim().replace(/\s*\([^)]*\)\s*$/, '').split('**').join('').trim();
  if (name.length > MAX_PROMPT_NAME) name = name.slice(0, MAX_PROMPT_NAME).replace(/\s+\S*$/, '');
  return name.replace(/[\s\-—:·]+$/, '') || 'Default';
}

/** A profile's units, default and other prompts. One saved before units existed reads as a single unit: its previous
 *  HTML template and prompt (named from the prompt's heading). */
export function promptsOf(acc: ProfileDoc): PromptsState {
  const prompts: ResumePrompt[] = acc.resumePrompts?.length
    ? acc.resumePrompts.map((p) => ({ ...p, roles: unitRoles(p) }))
    : [{
        id: 'default',
        name: legacyPromptName(acc.resumePromptBody ?? ''),
        roles: [],
        body: acc.resumePromptBody ?? '',
        templateHtml: acc.styleTemplate ?? '',
        templateName: acc.styleTemplateName ?? '',
        ...(acc.pageFormat ? { pageFormat: acc.pageFormat } : {}),
      }];
  const defaultId = prompts.some((p) => p.id === acc.defaultPromptId) ? (acc.defaultPromptId as string) : prompts[0].id;
  return { prompts, defaultId, screeningPrompt: acc.screeningPrompt ?? '', coverLetterPrompt: acc.coverLetterPrompt ?? '' };
}

const filled = (s: string | null | undefined) => !!s && s.trim().length > 0;

/** Tailoring is set up when any unit has a tailor draft (HTML template) or a tailoring prompt. */
export function tailoringSetUp(prompts: ResumePrompt[]): boolean {
  return prompts.some((p) => filled(p.templateHtml) || filled(p.body));
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The muted line under the profile's name, plus warnings about units Job Applies can't use well. */
export function setupStrip(acc: ProfileDoc, state: PromptsState): { parts: string[]; warnings: string[]; archived: boolean } {
  const parts: string[] = [];
  if (filled(acc.country)) parts.push(acc.country as string);
  if (filled(acc.region)) parts.push(acc.region as string);
  parts.push(plural(acc.resumes?.length ?? 0, 'fixed resume', 'fixed resumes'));
  const warnings: string[] = [];
  if (tailoringSetUp(state.prompts)) {
    const def = state.prompts.find((p) => p.id === state.defaultId);
    parts.push(`${plural(state.prompts.length, 'tailoring unit', 'tailoring units')} (default: ${def?.name.trim() || 'Untitled'})`);
    for (const p of state.prompts) {
      const name = p.name.trim() || 'Untitled';
      if ((unitRoles(p).length > 0 || filled(p.body)) && !filled(p.templateHtml)) {
        warnings.push(`"${name}" unit has no tailor draft`);
      }
      if (p.id !== state.defaultId && unitRoles(p).length === 0) {
        warnings.push(`"${name}" unit has no roles, so Job Applies never suggests it`);
      }
    }
  }
  return { parts, warnings, archived: !!acc.archived };
}

const unitKey = (p: ResumePrompt) => JSON.stringify([p.name, unitRoles(p), p.body, p.templateHtml ?? '', p.templateName ?? '']);

/** What differs between the saved prompts and the edited ones: units edited or added, any change at all (a unit
 *  deleted or the default moved too), and the screening / cover-letter prompts. */
export function promptsDirty(saved: PromptsState, current: PromptsState): { changed: boolean; dirtyUnitIds: string[]; moreChanged: boolean } {
  const savedKeys = new Map(saved.prompts.map((p) => [p.id, unitKey(p)]));
  const dirtyUnitIds = current.prompts.filter((p) => savedKeys.get(p.id) !== unitKey(p)).map((p) => p.id);
  const deleted = saved.prompts.some((s) => !current.prompts.some((p) => p.id === s.id));
  const moreChanged = saved.screeningPrompt !== current.screeningPrompt || saved.coverLetterPrompt !== current.coverLetterPrompt;
  const changed = dirtyUnitIds.length > 0 || deleted || saved.defaultId !== current.defaultId || moreChanged;
  return { changed, dirtyUnitIds, moreChanged };
}
