import { useState } from 'react';
import { Loader2, FileDown } from 'lucide-react';
import * as api from '../api/endpoints';
import { notify } from '../lib/notify';

const MAX = 8000;

/**
 * Editable prompt field for resume or screening prompts. Empty = inherit
 * (account inherits user-level, user-level inherits the built-in default).
 * "Load default" fills the textarea with the matching built-in prompt.
 */
export default function ResumePromptField({
  value,
  onChange,
  label,
  hint,
  kind = 'resume',
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  hint: string;
  kind?: 'resume' | 'screening';
}) {
  const [loadingDefault, setLoadingDefault] = useState(false);

  async function loadDefault() {
    if (value.trim() && !window.confirm('Replace the current text with the built-in default prompt?')) {
      return;
    }
    setLoadingDefault(true);
    try {
      const res = kind === 'screening'
        ? await api.getResumeDefaultScreeningPrompt()
        : await api.getResumeDefaultPrompt();
      onChange(res.promptBody.slice(0, MAX));
    } catch (err) {
      notify.error(err, 'Failed to load default prompt');
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
          <button
            type="button"
            onClick={loadDefault}
            disabled={loadingDefault}
            className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline disabled:opacity-50"
          >
            {loadingDefault ? <Loader2 size={11} className="animate-spin" /> : <FileDown size={11} />}
            Load default
          </button>
        </div>
      </div>
      <textarea
        className="input w-full text-sm"
        rows={12}
        value={value}
        maxLength={MAX}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Leave empty to inherit. Click 'Load default' to start from the built-in prompt, then edit."
      />
      <p className="text-xs text-gray-400 mt-1">{hint}</p>
    </div>
  );
}
