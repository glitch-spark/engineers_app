import { useState } from 'react';
import { Loader2, FileDown } from 'lucide-react';
import * as api from '../api/endpoints';
import { notify } from '../lib/notify';

const MAX = 30000;

/**
 * Editable prompt field for resume or screening prompts. Empty = inherit
 * (account inherits user-level; user-level empty = no content guidance is
 * added to the LLM call).
 *
 * `defaultSource`:
 *   - 'none' (default, Preferences page): no Load button.
 *   - 'global' (profile page): Load button fetches the user-level global
 *     prompt for this field.
 */
export default function ResumePromptField({
  value,
  onChange,
  label,
  hint,
  kind = 'resume',
  defaultSource = 'none',
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  hint: string;
  kind?: 'resume' | 'screening' | 'coverLetter';
  defaultSource?: 'none' | 'global';
}) {
  const [loadingDefault, setLoadingDefault] = useState(false);

  async function loadDefault() {
    if (value.trim() && !window.confirm('Replace the current text with your global prompt?')) {
      return;
    }
    setLoadingDefault(true);
    try {
      const { user } = await api.getProfile();
      const text = (kind === 'screening' ? user.screeningPromptBody
        : kind === 'coverLetter' ? user.coverLetterPromptBody
        : user.resumePromptBody) || '';
      if (!text.trim()) {
        notify.warn('No global prompt set yet — add one on the Prompts page first.');
        return;
      }
      onChange(text.slice(0, MAX));
    } catch (err) {
      notify.error(err, 'Failed to load global prompt');
    } finally {
      setLoadingDefault(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="block text-xs font-medium text-gray-600">{label}</label>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-gray-400">{value.length}/{MAX}</span>
          {defaultSource === 'global' && (
            <button
              type="button"
              onClick={loadDefault}
              disabled={loadingDefault}
              className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline disabled:opacity-50"
            >
              {loadingDefault ? <Loader2 size={11} className="animate-spin" /> : <FileDown size={11} />}
              Load global
            </button>
          )}
        </div>
      </div>
      <textarea
        className="input w-full text-sm"
        rows={12}
        value={value}
        maxLength={MAX}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Leave empty to inherit."
      />
      <p className="text-xs text-gray-400 mt-1">{hint}</p>
    </div>
  );
}
