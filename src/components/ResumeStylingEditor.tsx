import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { Link } from 'react-router-dom';
import MDEditor from '@uiw/react-md-editor';
import { Save, Loader2 } from 'lucide-react';
import * as api from '../api/endpoints';
import type { PageFormat, StyleConfig, StyleMode } from '../lib/resumeStyles';
import { PAGE_FORMATS } from '../lib/resumeStyles';
import { TEMPLATE_CLASSIC } from '../lib/resumeStyleTemplates';
import StructuredStyleForm from './StructuredStyleForm';
import ResumePreview from './ResumePreview';
import { buildPreviewHtml } from '../lib/resumePreview';
import { notify } from '../lib/notify';

type AccountShape = {
  _id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  label?: string;
  experience?: string;
  education?: string;
  github?: string;
  linkedin?: string;
  website?: string;
  twitter?: string;
  contactLabels?: Record<string, string>;
  styleMode?: StyleMode;
  styleMarkdown?: string;
  styles?: string;
  styleConfig?: StyleConfig | null;
  pageFormat?: PageFormat;
  previewHtml?: string;
};

export default function ResumeStylingEditor({
  accountId,
  showHeader = true,
}: {
  accountId: string;
  showHeader?: boolean;
}) {
  // SWR fetch revalidates on focus → if user adds/edits Profile contact URL
  // in another tab and comes back, preview picks up new values automatically.
  const { data: account, isLoading: loading } = useSWR(
    accountId ? ['styling-account', accountId] : null,
    async () => (await api.getAccount(accountId)) as AccountShape,
  );

  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<StyleMode>('markdown');
  const [markdown, setMarkdown] = useState('');
  const [structured, setStructured] = useState<StyleConfig>(TEMPLATE_CLASSIC);
  const [pageFormat, setPageFormat] = useState<PageFormat>('A4');
  const [cachedAiHtml, setCachedAiHtml] = useState<string | undefined>(undefined);

  // Initial form state from loaded account. Re-runs on accountId change so
  // switching profiles loads fresh edits. Doesn't reset on background refetch
  // (SWR revalidate) so unsaved edits aren't clobbered when user returns to tab.
  useEffect(() => {
    if (!account) return;
    setMode((account.styleMode as StyleMode) || 'markdown');
    setMarkdown(account.styleMarkdown || account.styles || '');
    setPageFormat((account.pageFormat as PageFormat) || 'A4');
    setStructured(account.styleConfig || TEMPLATE_CLASSIC);
    setCachedAiHtml(account.previewHtml || undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  async function handleSave() {
    setSaving(true);
    try {
      await api.updateAccount(accountId, {
        styleMode: mode,
        styleMarkdown: markdown,
        styleConfig: structured,
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
              {account.label && <span className="text-gray-400 font-normal"> · {account.label}</span>}
            </h2>
            <p className="text-xs text-gray-500">
              Pick how you want to author the styling spec. Generated PDFs use what you save here.
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
        <div className="flex items-center gap-1 px-6 pt-4 border-b border-gray-100">
          <ModeTab active={mode === 'markdown'} onClick={() => setMode('markdown')} label="Markdown" />
          <ModeTab active={mode === 'structured'} onClick={() => setMode('structured')} label="Structured" />
        </div>

        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-0 min-h-0">
          <section className="overflow-auto p-6 border-r border-gray-100">
            {mode === 'markdown' ? (
              <MarkdownPane value={markdown} onChange={(v) => setMarkdown(v ?? '')} />
            ) : (
              <StructuredStyleForm value={structured} onChange={setStructured} account={account} />
            )}
          </section>

          <section className="overflow-auto p-6 bg-gray-50">
            {mode === 'markdown' ? (
              <MarkdownPreviewExplainer />
            ) : (
              <StructuredPreviewWrapper
                structured={structured}
                account={account}
                pageFormat={pageFormat}
                cachedAiHtml={cachedAiHtml}
              />
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function ModeTab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
        active ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-800'
      }`}
    >
      {label}
    </button>
  );
}

function MarkdownPane({ value, onChange }: { value: string; onChange: (v: string | undefined) => void }) {
  return (
    <div className="space-y-3" data-color-mode="light">
      <p className="text-xs text-gray-500">
        Write the styling instructions the LLM will follow. Markdown is supported. Text appended to
        prompt verbatim under "Resume Formatting Styles".
      </p>
      <MDEditor value={value} onChange={onChange} height={520} preview="edit" />
    </div>
  );
}

function MarkdownPreviewExplainer() {
  return (
    <div className="text-sm text-gray-500 space-y-3">
      <h3 className="text-base font-semibold text-gray-700">Preview</h3>
      <p>
        Live PDF preview hidden in <strong>Markdown mode</strong>. Switch to <strong>Structured</strong>
        for a paginated preview as you adjust styling.
      </p>
      <p className="text-xs">
        To see how this markdown renders into a resume, go to{' '}
        <Link to="/resume" className="text-primary underline">Resume Generator</Link> and run a real generation.
      </p>
    </div>
  );
}

function StructuredPreviewWrapper({
  structured,
  account,
  pageFormat,
  cachedAiHtml,
}: {
  structured: StyleConfig;
  account: AccountShape;
  pageFormat: PageFormat;
  cachedAiHtml?: string;
}) {
  const html = buildPreviewHtml({ cfg: structured, account, pageFormat, cachedAiHtml });
  const m = structured.page.margin;
  const remountKey = `${pageFormat}-${m.top}-${m.right}-${m.bottom}-${m.left}`;
  return (
    <ResumePreview
      key={remountKey}
      html={html}
      pageFormat={pageFormat}
      hint={cachedAiHtml ? 'Showing AI-generated bullets.' : 'Showing template content.'}
    />
  );
}
