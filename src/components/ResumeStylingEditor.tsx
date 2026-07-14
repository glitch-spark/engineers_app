import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { Loader2, Save } from 'lucide-react';
import * as api from '../api/endpoints';
import { notify } from '../lib/notify';

type AccountShape = {
  _id: string;
  name: string;
  styleTemplate?: string;
  styleTemplateName?: string;
};

export default function ResumeStylingEditor({
  accountId,
  showHeader = true,
}: {
  accountId: string;
  showHeader?: boolean;
}) {
  const { data: account, isLoading: loading, mutate } = useSWR(
    accountId ? ['styling-account', accountId] : null,
    async () => (await api.getAccount(accountId)) as AccountShape,
  );

  const [saving, setSaving] = useState(false);
  const [templateHtml, setTemplateHtml] = useState('');
  const [templateName, setTemplateName] = useState('');

  useEffect(() => {
    if (!account) return;
    setTemplateHtml(account.styleTemplate || '');
    setTemplateName(account.styleTemplateName || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?._id]);

  async function handleSave() {
    setSaving(true);
    try {
      await api.updateAccount(accountId, {
        styleTemplate: templateHtml,
        styleTemplateName: templateName,
      });
      notify.success('Template saved');
      mutate();
    } catch (err) {
      notify.error(err, 'Failed to save template');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2 text-sm text-muted">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading...
      </div>
    );
  }
  if (!account) return null;

  return (
    <div className="flex flex-col">
      {showHeader && (
        <header className="panel px-6 py-4 flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-semibold text-strong">{account.name}</h2>
            <p className="text-xs text-muted">
              Upload an HTML template. The resume LLM rewrites its text per generation while
              preserving structure and styles.
            </p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save
          </button>
        </header>
      )}

      <div className="panel p-6 space-y-4">
        <HtmlTemplatePane
          html={templateHtml}
          name={templateName}
          onChange={(html, name) => {
            setTemplateHtml(html);
            setTemplateName(name);
          }}
        />

        {/* Save always rendered here too — when showHeader=false (embedded
            in the profile page), the header Save above is hidden, so the
            template had no way to persist. */}
        {!showHeader && (
          <div className="flex justify-end pt-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save template
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function HtmlTemplatePane({
  html, name, onChange,
}: {
  html: string;
  name: string;
  onChange: (html: string, name: string) => void;
}) {
  async function handleFile(file: File) {
    const fileName = file.name;
    if (!fileName.toLowerCase().endsWith('.html')) {
      notify.error('Only .html files are supported.');
      return;
    }
    const text = await file.text();
    onChange(text, fileName);
  }

  function clear() {
    if (!html) return;
    if (!window.confirm('Remove the current template?')) return;
    onChange('', '');
  }

  return (
    <div className="space-y-3">
      <label
        className="block border-2 border-dashed border-zinc-200 dark:border-zinc-700 rounded-xl p-6 text-center cursor-pointer hover:border-primary hover:bg-sky-50/40 dark:hover:bg-sky-950/20 transition"
        onDragOver={(e) => { e.preventDefault(); }}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) handleFile(f);
        }}
      >
        <input
          type="file"
          accept=".html,text/html"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = '';
          }}
        />
        <div className="text-sm text-muted">
          Drop your <code>.html</code> file here, or click to choose
        </div>
      </label>

      {html ? (
        <div className="panel p-3 flex items-center justify-between gap-3">
          <div className="text-sm text-body truncate">
            <span className="font-medium">{name || 'template.html'}</span>
            <span className="text-xs text-faint ml-2">
              {(new Blob([html]).size / 1024).toFixed(1)} KB
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                const blob = new Blob([html], { type: 'text/html' });
                const url = URL.createObjectURL(blob);
                const w = window.open(url, '_blank');
                // Revoke after the new tab unloads so memory doesn't leak;
                // if the popup was blocked, revoke immediately.
                if (w) w.addEventListener('beforeunload', () => URL.revokeObjectURL(url));
                else URL.revokeObjectURL(url);
              }}
              className="link text-xs"
              title="Open the uploaded HTML in a new tab"
            >
              Preview
            </button>
            <button
              type="button"
              onClick={clear}
              className="text-xs text-red-600 hover:underline"
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <div className="text-xs text-faint italic">No template uploaded yet.</div>
      )}
    </div>
  );
}
