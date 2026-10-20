import { Loader2, RotateCcw, Save } from 'lucide-react';
import type { EvalRouteUnit } from '../../api/endpoints';
import { rolesLabel } from '../prompts/promptRoles';

/** The text a unit runs with: an edit for this run, else its saved prompt. */
export function unitText(unit: EvalRouteUnit, edits: Record<string, string>): string {
  return edits[unit.id] ?? unit.body;
}

export function isEdited(unit: EvalRouteUnit, edits: Record<string, string>): boolean {
  return edits[unit.id] !== undefined && edits[unit.id].trim() !== unit.body.trim();
}

/**
 * Whole-profile mode: every resume unit with its prompt, editable for this run only. An edited unit can be reset to
 * its saved prompt or saved back to the profile.
 */
export default function UnitPromptsEditor({
  units,
  defaultUnitId,
  edits,
  onChange,
  onSave,
  savingId,
}: {
  units: EvalRouteUnit[];
  defaultUnitId: string;
  edits: Record<string, string>;
  onChange: (unitId: string, text: string | undefined) => void;
  onSave: (unitId: string) => void;
  savingId: string | null;
}) {
  return (
    <div>
      <span className="block text-xs font-medium mb-1 text-muted">Resume units</span>
      <ul className="space-y-2">
        {units.map((u) => {
          const edited = isEdited(u, edits);
          const fieldId = `eval-unit-prompt-${u.id}`;
          return (
            <li key={u.id} className="rounded-xl border border-zinc-200 dark:border-zinc-700">
              <details>
                <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-3 py-2 text-sm">
                  <span className="font-medium text-strong">{u.name}</span>
                  {u.id === defaultUnitId && <span className="badge-neutral">default</span>}
                  {edited && <span className="badge-info">edited for this run</span>}
                  {!u.hasTemplate && <span className="badge-warning">no HTML template</span>}
                  <span className="text-xs text-muted">{rolesLabel(u.roles)}</span>
                  {u.templateName && <span className="ml-auto text-xs text-faint">{u.templateName}</span>}
                </summary>
                <div className="space-y-2 border-t border-zinc-200 p-3 dark:border-zinc-700">
                  <label htmlFor={fieldId} className="sr-only">
                    Prompt for {u.name}
                  </label>
                  <textarea
                    id={fieldId}
                    className="input min-h-[10rem] w-full font-mono text-xs"
                    value={unitText(u, edits)}
                    onChange={(e) => onChange(u.id, e.target.value)}
                    placeholder="No custom prompt: the built-in rules run alone for this unit."
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      className="btn-outline btn-sm"
                      onClick={() => onChange(u.id, undefined)}
                      disabled={!edited}
                    >
                      <RotateCcw className="h-4 w-4" aria-hidden /> Reset
                    </button>
                    <button
                      type="button"
                      className="btn-outline btn-sm"
                      onClick={() => onSave(u.id)}
                      disabled={!edited || savingId != null}
                      title="Overwrite this unit's saved prompt with this text"
                    >
                      {savingId === u.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
                      Save to profile
                    </button>
                  </div>
                </div>
              </details>
            </li>
          );
        })}
      </ul>
      <p className="hint mt-1">Edits are used for this run only unless you save them. Each unit keeps its own template.</p>
    </div>
  );
}
