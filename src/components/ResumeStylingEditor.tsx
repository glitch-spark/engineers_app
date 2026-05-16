import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { Loader2, Save, Wand2, CheckCircle2, AlertTriangle, Download } from 'lucide-react';
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
  styleTemplateAnnotated?: string;
  pageFormat?: PageFormat;
};

type Validation = {
  missingRequired: string[];
  missingRecommended: string[];
  valid: boolean;
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
  const [pageFormat, setPageFormat] = useState<PageFormat>('A4');
  const [templateHtml, setTemplateHtml] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [annotated, setAnnotated] = useState('');
  const [annotating, setAnnotating] = useState(false);
  const [validation, setValidation] = useState<Validation | null>(null);
  // True when the plain template differs from what's saved → annotation stale.
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!account) return;
    setPageFormat((account.pageFormat as PageFormat) || 'A4');
    setTemplateHtml(account.styleTemplate || '');
    setTemplateName(account.styleTemplateName || '');
    setAnnotated(account.styleTemplateAnnotated || '');
    setValidation(null);
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?._id]);

  async function handleSave() {
    setSaving(true);
    try {
      await api.updateAccount(accountId, {
        styleTemplate: templateHtml,
        styleTemplateName: templateName,
        pageFormat,
      });
      notify.success('Resume settings saved');
      setDirty(false);
      mutate();
    } catch (err) {
      notify.error(err, 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  async function convertToTemplate() {
    if (!templateHtml.trim()) {
      notify.error('Upload an HTML template first.');
      return;
    }
    if (dirty) {
      // Annotation reads the SAVED plain template — persist first.
      await handleSave();
    }
    setAnnotating(true);
    try {
      const res = await api.annotateResumeTemplate(accountId);
      setAnnotated(res.annotated);
      setValidation({
        missingRequired: res.missingRequired,
        missingRecommended: res.missingRecommended,
        valid: res.valid,
      });
      if (res.valid) {
        notify.success('Template converted — markers added.');
      } else {
        notify.warn('Converted, but some required markers are missing. See the panel.');
      }
      mutate();
    } catch (err) {
      notify.error(err, 'Conversion failed');
    } finally {
      setAnnotating(false);
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
              Upload an HTML template, convert it to a fillable template, then generate.
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

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
        <HtmlTemplatePane
          html={templateHtml}
          name={templateName}
          onChange={(html, name) => {
            setTemplateHtml(html);
            setTemplateName(name);
            setDirty(true);
          }}
        />

        <ConvertPanel
          hasTemplate={!!templateHtml.trim()}
          annotating={annotating}
          dirty={dirty}
          annotated={annotated}
          annotatedName={templateName}
          validation={validation}
          onConvert={convertToTemplate}
        />
      </div>
    </div>
  );
}

function downloadHtml(html: string, filename: string) {
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function ConvertPanel({
  hasTemplate, annotating, dirty, annotated, annotatedName, validation, onConvert,
}: {
  hasTemplate: boolean;
  annotating: boolean;
  dirty: boolean;
  annotated: string;
  annotatedName: string;
  validation: Validation | null;
  onConvert: () => void;
}) {
  const isReady = !!annotated && (validation ? validation.valid : true);

  function download() {
    const base = (annotatedName || 'template.html').replace(/\.html?$/i, '');
    downloadHtml(annotated, `${base}.data-source.html`);
  }

  return (
    <div className="border border-gray-200 rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Convert to fillable template</h3>
          <p className="text-xs text-gray-500">
            One-time conversion adds marker attributes so generation can fill the template
            deterministically. Re-run after changing the template.
          </p>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          {annotated && (
            <button
              type="button"
              onClick={download}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50"
              title="Download the converted template with data-* markers"
            >
              <Download size={14} /> Download
            </button>
          )}
          <button
            type="button"
            onClick={onConvert}
            disabled={!hasTemplate || annotating}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-black disabled:opacity-40"
          >
            {annotating ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
            {annotated ? 'Re-convert' : 'Convert to template'}
          </button>
        </div>
      </div>

      {dirty && annotated && (
        <div className="flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded p-2">
          <AlertTriangle size={13} className="mt-px shrink-0" />
          Template edited since last conversion — re-convert before generating.
        </div>
      )}

      {!annotated && hasTemplate && (
        <div className="text-xs text-gray-500">
          Not converted yet. Generation is blocked until you convert.
        </div>
      )}

      {validation && (
        <div className="space-y-1">
          {validation.valid ? (
            <div className="flex items-center gap-1.5 text-xs text-emerald-700">
              <CheckCircle2 size={13} /> All required markers present — ready to generate.
            </div>
          ) : (
            <div className="flex items-start gap-1.5 text-xs text-red-700 bg-red-50 border border-red-100 rounded p-2">
              <AlertTriangle size={13} className="mt-px shrink-0" />
              <span>
                Missing required markers: {validation.missingRequired.join(', ')}. Re-convert or fix the
                template structure.
              </span>
            </div>
          )}
          {validation.missingRecommended.length > 0 && (
            <div className="text-[11px] text-gray-400">
              Optional markers not found: {validation.missingRecommended.join(', ')}.
            </div>
          )}
        </div>
      )}

      {annotated && !validation && isReady && (
        <div className="flex items-center gap-1.5 text-xs text-emerald-700">
          <CheckCircle2 size={13} /> Converted template on file.
        </div>
      )}
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
          Upload an <code>.html</code> file. Scripts and iframes are stripped on save.
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
        <div className="text-xs text-gray-400 italic">No template uploaded yet.</div>
      )}
    </div>
  );
}

