import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import MDEditor from '@uiw/react-md-editor';
import { ArrowLeft, Save, Loader2 } from 'lucide-react';
import * as api from '../api/endpoints';
import type { PageFormat, StyleConfig, StyleMode } from '../lib/resumeStyles';
import { PAGE_FORMATS } from '../lib/resumeStyles';
import { TEMPLATE_CLASSIC } from '../lib/resumeStyleTemplates';
import StructuredStyleForm from '../components/StructuredStyleForm';
import ResumePreview from '../components/ResumePreview';
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
  styleMode?: StyleMode;
  styleMarkdown?: string;
  styles?: string;
  styleConfig?: StyleConfig | null;
  pageFormat?: PageFormat;
  previewHtml?: string;
};

export default function AccountResumeSettings() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [account, setAccount] = useState<AccountShape | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [mode, setMode] = useState<StyleMode>('markdown');
  const [markdown, setMarkdown] = useState('');
  const [structured, setStructured] = useState<StyleConfig>(TEMPLATE_CLASSIC);
  const [pageFormat, setPageFormat] = useState<PageFormat>('A4');
  const [cachedAiHtml, setCachedAiHtml] = useState<string | undefined>(undefined);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const acc = (await api.getAccount(id)) as AccountShape;
        if (cancelled) return;
        setAccount(acc);
        setMode((acc.styleMode as StyleMode) || 'markdown');
        setMarkdown(acc.styleMarkdown || acc.styles || '');
        setPageFormat((acc.pageFormat as PageFormat) || 'A4');
        if (acc.styleConfig) setStructured(acc.styleConfig);
        if (acc.previewHtml) setCachedAiHtml(acc.previewHtml);
      } catch (err) {
        notify.error(err, 'Could not load account');
        navigate('/accounts');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, navigate]);

  async function handleRefreshFromAi() {
    if (!id || !account) return;
    setRefreshing(true);
    try {
      const { html } = await api.refreshPreviewHtml(id);
      setCachedAiHtml(html);
      notify.success('Preview content refreshed from AI');
    } catch (err) {
      notify.error(err, 'Could not refresh preview');
    } finally {
      setRefreshing(false);
    }
  }

  async function handleSave() {
    if (!id) return;
    setSaving(true);
    try {
      await api.updateAccount(id, {
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
    <div className="h-full flex flex-col">
      <header className="border-b border-gray-100 bg-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/accounts" className="text-gray-500 hover:text-primary">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">
              Resume styling — {account.name}
              {account.label && <span className="text-gray-400 font-normal"> · {account.label}</span>}
            </h1>
            <p className="text-xs text-gray-500">
              Pick how you want to author the resume styling spec. Generated PDFs use what you save here.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-xs text-gray-500 flex items-center gap-2">
            Page
            <select
              value={pageFormat}
              onChange={(e) => setPageFormat(e.target.value as PageFormat)}
              className="text-sm border border-gray-200 rounded-md px-2 py-1"
            >
              {PAGE_FORMATS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
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

      <div className="flex items-center gap-1 px-6 pt-4 bg-white border-b border-gray-100">
        <ModeTab active={mode === 'markdown'} onClick={() => setMode('markdown')} label="Markdown" />
        <ModeTab active={mode === 'structured'} onClick={() => setMode('structured')} label="Structured" />
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-0 min-h-0">
        <section className="overflow-auto p-6 bg-white border-r border-gray-100">
          {mode === 'markdown' ? (
            <MarkdownPane value={markdown} onChange={(v) => setMarkdown(v ?? '')} />
          ) : (
            <StructuredStyleForm value={structured} onChange={setStructured} />
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
              onRefreshFromAi={handleRefreshFromAi}
              refreshing={refreshing}
            />
          )}
        </section>
      </div>
    </div>
  );
}

function ModeTab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
        active
          ? 'border-primary text-primary'
          : 'border-transparent text-gray-500 hover:text-gray-800'
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
        Write the styling instructions the LLM will follow. Markdown is supported — bullets, headings,
        bold for emphasis. The text is appended verbatim to the prompt under "Resume Formatting Styles".
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
        Live PDF preview is hidden in <strong>Markdown mode</strong> — the markdown here describes
        instructions to the LLM, not the resume itself. Switch to <strong>Structured</strong> mode
        to see a paginated preview as you adjust styling.
      </p>
      <p className="text-xs">
        To see how this markdown renders into a resume, go to{' '}
        <Link to="/resume" className="text-primary underline">
          Resume Generator
        </Link>{' '}
        and run a real generation against this account.
      </p>
    </div>
  );
}

function StructuredPreviewWrapper({
  structured,
  account,
  pageFormat,
  cachedAiHtml,
  onRefreshFromAi,
  refreshing,
}: {
  structured: StyleConfig;
  account: AccountShape;
  pageFormat: PageFormat;
  cachedAiHtml?: string;
  onRefreshFromAi: () => void;
  refreshing: boolean;
}) {
  const html = buildPreviewHtml({
    cfg: structured,
    account,
    pageFormat,
    cachedAiHtml,
  });
  // Force a full remount whenever anything affecting @page geometry changes —
  // paged.js caches resolved page dimensions per Previewer instance, so an
  // in-place re-render isn't enough.
  const m = structured.page.margin;
  const remountKey = `${pageFormat}-${m.top}-${m.right}-${m.bottom}-${m.left}`;
  return (
    <ResumePreview
      key={remountKey}
      html={html}
      pageFormat={pageFormat}
      onRefreshFromAi={onRefreshFromAi}
      refreshing={refreshing}
      hint={
        cachedAiHtml
          ? 'Showing AI-generated bullets. Style edits re-apply locally; click Refresh to regenerate the bullets.'
          : 'Showing template content. Click "Refresh from AI" to seed real bullets for this account.'
      }
    />
  );
}

