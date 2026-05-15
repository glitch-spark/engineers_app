import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { Loader2, Save } from 'lucide-react';
import * as api from '../api/endpoints';
import type { PageFormat } from '../lib/resumeStyles';
import { PAGE_FORMATS } from '../lib/resumeStyles';
import { notify } from '../lib/notify';

type AccountShape = {
  _id: string;
  name: string;
  title?: string;
  styleTemplate?: string;
  styleTemplateName?: string;
  pageFormat?: PageFormat;
};

export default function ResumeStylingEditor({
  accountId,
  showHeader = true,
}: {
  accountId: string;
  showHeader?: boolean;
}) {
  const { data: account, isLoading: loading } = useSWR(
    accountId ? ['styling-account', accountId] : null,
    async () => (await api.getAccount(accountId)) as AccountShape,
  );

  const [saving, setSaving] = useState(false);
  const [pageFormat, setPageFormat] = useState<PageFormat>('A4');
  const [templateHtml, setTemplateHtml] = useState('');
  const [templateName, setTemplateName] = useState('');

  useEffect(() => {
    if (!account) return;
    setPageFormat((account.pageFormat as PageFormat) || 'A4');
    setTemplateHtml(account.styleTemplate || '');
    setTemplateName(account.styleTemplateName || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?._id]);

  async function handleSave() {
    setSaving(true);
    try {
      await api.updateAccount(accountId, {
        styleMode: 'template',
        styleTemplate: templateHtml,
        styleTemplateName: templateName,
        pageFormat,
      });
      notify.success('Resume settings saved');
    } catch (err) {
      notify.error(err, 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2 text-sm text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading...
      </div>
    );
  }
  if (!account) return null;

  return (
    <div className="flex flex-col">
      {showHeader && (
        <header className="border border-gray-100 bg-white px-6 py-4 rounded-2xl flex items-center justify-between mb-3 shadow-sm">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {account.name}
              {account.title && <span className="text-gray-400 font-normal text-base"> · {account.title}</span>}
            </h2>
            <p className="text-xs text-gray-500">
              Upload an HTML resume template. The LLM fills it with your profile data when generating.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-xs text-gray-500 flex items-center gap-2">
              Page
              <select
                value={pageFormat}
                onChange={(e) => setPageFormat(e.target.value as PageFormat)}
                className="text-sm border border-gray-200 rounded-md px-2 py-1"
              >
                {PAGE_FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </label>
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white font-medium shadow-sm hover:bg-primary-dark disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save
            </button>
          </div>
        </header>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col" style={{ minHeight: '70vh' }}>
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-0 min-h-0">
          <section className="overflow-auto p-6 border-r border-gray-100">
            <HtmlTemplatePane
              html={templateHtml}
              name={templateName}
              onChange={(html, name) => { setTemplateHtml(html); setTemplateName(name); }}
            />
          </section>

          <section className="overflow-auto p-6 bg-gray-50">
            <TemplatePreview html={templateHtml} />
          </section>
        </div>
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
      <div>
        <h3 className="text-sm font-semibold text-gray-800">HTML template</h3>
        <p className="text-xs text-gray-500">
          Upload an <code>.html</code> file. The LLM uses it as the exact layout and replaces placeholder text with your profile data at generation time. Scripts and iframes are stripped on save.
        </p>
      </div>

      <label
        className="block border-2 border-dashed border-gray-200 rounded-xl p-6 text-center cursor-pointer hover:border-primary hover:bg-blue-50/30 transition"
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
        <div className="text-sm text-gray-600">
          Drop your <code>.html</code> file here, or click to choose
        </div>
      </label>

      {html ? (
        <div className="bg-white border border-gray-200 rounded-lg p-3 flex items-center justify-between gap-3">
          <div className="text-sm text-gray-700 truncate">
            <span className="font-medium">{name || 'template.html'}</span>
            <span className="text-xs text-gray-400 ml-2">
              {(new Blob([html]).size / 1024).toFixed(1)} KB
            </span>
          </div>
          <button
            type="button"
            onClick={clear}
            className="text-xs text-red-600 hover:underline"
          >
            Remove
          </button>
        </div>
      ) : (
        <div className="text-xs text-gray-400 italic">No template uploaded yet. The Generate Resume action will be blocked until one is uploaded.</div>
      )}
    </div>
  );
}

function TemplatePreview({ html }: { html: string }) {
  if (!html) {
    return (
      <div className="text-sm text-gray-500 space-y-2">
        <p className="font-medium text-gray-700">Template preview</p>
        <p>Upload an HTML file to see it rendered here. The actual resume is generated when you submit a job — the LLM fills the template with your candidate data at that time.</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500">
        Raw template render (no LLM fill). Generate a resume to see the final output.
      </p>
      <iframe
        title="Template preview"
        srcDoc={html}
        sandbox=""
        className="w-full border border-gray-200 rounded-lg bg-white"
        style={{ height: '70vh' }}
      />
    </div>
  );
}
