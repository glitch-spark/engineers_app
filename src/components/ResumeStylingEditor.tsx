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
import {
  serializeToTaggedMarkdown,
  parseTaggedMarkdown,
  deepMerge,
  stripTokens,
  extractNotes,
} from '../lib/styleTokens';
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
  const [mode, setMode] = useState<StyleMode>('structured');
  const [markdown, setMarkdown] = useState('');
  const [structured, setStructured] = useState<StyleConfig>(TEMPLATE_CLASSIC);
  const [lastEditedMode, setLastEditedMode] = useState<StyleMode | null>(null);
  const [notes, setNotes] = useState<string>('');
  const [pageFormat, setPageFormat] = useState<PageFormat>('A4');
  const [cachedAiHtml, setCachedAiHtml] = useState<string | undefined>(undefined);

  // Initial form state from loaded account. Re-runs on accountId change so
  // switching profiles loads fresh edits. Doesn't reset on background refetch
  // (SWR revalidate) so unsaved edits aren't clobbered when user returns to tab.
  // Depend on account?._id (not accountId): on first mount the SWR fetch is
  // still in flight, so an effect keyed on accountId fires once with
  // `account` undefined, bails, and never re-runs when SWR resolves.
  // Keying on the loaded id makes it run exactly when data arrives, and
  // again only if the user switches profiles. Background SWR revalidations
  // return the same _id so unsaved edits aren't clobbered.
  useEffect(() => {
    if (!account) return;
    setMode((account.styleMode as StyleMode) || 'structured');
    setPageFormat((account.pageFormat as PageFormat) || 'A4');
    const initialStructured = account.styleConfig || TEMPLATE_CLASSIC;
    setStructured(initialStructured);
    const savedMd = (account.styleMarkdown || account.styles || '').trim();
    setMarkdown(savedMd || serializeToTaggedMarkdown(initialStructured));
    setNotes(extractNotes(savedMd));
    setCachedAiHtml(account.previewHtml || undefined);
    setLastEditedMode(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?._id]);

  function switchMode(target: StyleMode) {
    if (target === mode) return;
    if (target === 'markdown') {
      // Structured → Markdown: regenerate tagged markdown from current
      // structured config; preserve any "## User notes" prose from prior md.
      const next = serializeToTaggedMarkdown(structured, markdown);
      setMarkdown(next);
      setMode('markdown');
      notify.success('Markdown regenerated from structured config');
      return;
    }
    // Markdown → Structured: parse tokens, merge into structured.
    const parsed = parseTaggedMarkdown(markdown);
    const freeProse = stripTokens(markdown);
    if (parsed.tokenCount === 0) {
      const proceed = window.confirm(
        freeProse
          ? 'No @style tokens found in markdown. Switching to Structured will keep your current structured config and your prose will be saved as user notes only. Continue?'
          : 'No @style tokens found in markdown. Switching to Structured will keep your current structured config. Continue?'
      );
      if (!proceed) return;
      setMode('structured');
      return;
    }
    const merged = deepMerge(structured, parsed.config);
    setStructured(merged as StyleConfig);
    setMode('structured');
    notify.success(`${parsed.tokenCount} field${parsed.tokenCount === 1 ? '' : 's'} synced from markdown`);
  }

  async function handleSave() {
    setSaving(true);
    try {
      // Markdown is canonical. If user last touched structured, regenerate
      // markdown from it first (preserving any "## User notes" prose) so the
      // saved markdown reflects the latest structured edits. Then send.
      let mdToSave = markdown;
      if (lastEditedMode === 'structured') {
        // Splice in current notes textarea content under the canonical
        // "## User notes" heading so structured-mode users can edit notes
        // without ever opening the markdown tab.
        const seedMd = notes.trim() ? `## User notes\n\n${notes.trim()}` : '';
        mdToSave = serializeToTaggedMarkdown(structured, seedMd);
        setMarkdown(mdToSave);
      } else if (lastEditedMode === 'markdown') {
        // Markdown edits: keep notes textarea state in lockstep so toggling
        // back to Structured shows the up-to-date notes.
        setNotes(extractNotes(markdown));
      }
      await api.updateAccount(accountId, {
        styleMode: mode,
        styleMarkdown: mdToSave,
        styleConfig: structured,
        pageFormat,
      });
      setLastEditedMode(null);
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
              {account.label && <span className="text-gray-400 font-normal text-base"> · {account.label}</span>}
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
          <ModeTab active={mode === 'structured'} onClick={() => switchMode('structured')} label="Structured" />
          <ModeTab active={mode === 'markdown'} onClick={() => switchMode('markdown')} label="Markdown" />
        </div>

        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-0 min-h-0">
          <section className="overflow-auto p-6 border-r border-gray-100">
            {mode === 'markdown' ? (
              <MarkdownPane
                value={markdown}
                onChange={(v) => { setMarkdown(v ?? ''); setLastEditedMode('markdown'); }}
              />
            ) : (
              <>
                <StructuredStyleForm
                  value={structured}
                  onChange={(next) => { setStructured(next); setLastEditedMode('structured'); }}
                  account={account}
                  accountId={accountId}
                />
                <NotesPane
                  value={notes}
                  onChange={(v) => { setNotes(v); setLastEditedMode('structured'); }}
                />
              </>
            )}
          </section>

          <section className="overflow-auto p-6 bg-gray-50">
            {mode === 'markdown' ? (
              <MarkdownPreviewExplainer />
            ) : (
              <StructuredPreviewWrapper
                structured={structured}
                account={account}
                dirty={lastEditedMode !== null}
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

const NOTE_SNIPPETS: { label: string; text: string }[] = [
  {
    label: 'Tighten bullets',
    text: 'Reduce vertical gap between bullets to ~2px. Use line-height: 1.3 on bullet text.',
  },
  {
    label: 'Loosen body',
    text: 'Use line-height: 1.5 globally on body text and bullets so the page breathes.',
  },
  {
    label: 'Letter-spacing on headings',
    text: 'Apply letter-spacing: 0.04em on every section heading (SUMMARY, EXPERIENCE, SKILLS, EDUCATION).',
  },
  {
    label: 'Two-line company / role',
    text: 'Render company name on one line, role + period on the next line. Bold the company.',
  },
  {
    label: 'Bigger bullet indent',
    text: 'Indent each <li> by 14px. Keep the bullet glyph aligned with the section heading text.',
  },
  {
    label: 'Underline section headings',
    text: 'Add a 0.5pt underline under each section heading text (not a full-width divider).',
  },
  {
    label: 'Skills as one paragraph',
    text: 'Render the skills section as one justified paragraph with category labels in bold, separated by " · ".',
  },
  {
    label: 'Hide section divider',
    text: 'Do not render the horizontal divider line below section headings. Use spacing alone for separation.',
  },
  {
    label: 'Right-align dates',
    text: 'Right-align period dates on experience and education lines so the dates form a clean vertical column.',
  },
  {
    label: 'Smaller summary',
    text: 'Make the SUMMARY paragraph 1pt smaller than the bullet text.',
  },
];

function NotesPane({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  function appendSnippet(text: string) {
    const next = value.trim() ? `${value.trim()}\n\n${text}` : text;
    onChange(next);
  }
  return (
    <div className="mt-6 pt-5 border-t border-gray-100">
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="text-sm font-semibold text-gray-800">Additional style notes</h3>
        <span className="text-xs text-gray-400">free text · appended to LLM prompt</span>
      </div>
      <p className="text-xs text-gray-500 mb-2">
        Anything the structured form can't express (letter-spacing, line-height, layout tweaks, etc.).
      </p>

      <div className="mb-2">
        <div className="text-[11px] font-medium text-gray-500 mb-1.5">Snippet library — click to append</div>
        <div className="flex flex-wrap gap-1.5">
          {NOTE_SNIPPETS.map((s) => (
            <button
              key={s.label}
              type="button"
              className="text-[11px] px-2 py-1 rounded-full border border-gray-200 text-gray-700 hover:border-primary hover:bg-blue-50/40"
              onClick={() => appendSnippet(s.text)}
              title={s.text}
            >
              + {s.label}
            </button>
          ))}
        </div>
      </div>

      <textarea
        className="input w-full text-sm font-mono"
        rows={6}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. Set letter-spacing: 0.02em on section headings, and use line-height: 1.4 on bullets."
      />
      <p className="text-[11px] text-gray-400 mt-1">
        Saved under <code>## User notes</code> in the markdown source. Edits here and in the Markdown tab stay in sync.
      </p>
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
  dirty,
}: {
  structured: StyleConfig;
  account: AccountShape;
  pageFormat: PageFormat;
  cachedAiHtml?: string;
  dirty?: boolean;
}) {
  // While the user has unsaved edits, render the live structured config
  // instead of the cached AI HTML — otherwise theme/structured changes
  // would have no visible effect.
  const effectiveCached = dirty ? undefined : cachedAiHtml;
  const html = buildPreviewHtml({ cfg: structured, account, pageFormat, cachedAiHtml: effectiveCached });
  const m = structured.page.margin;
  const remountKey = `${pageFormat}-${m.top}-${m.right}-${m.bottom}-${m.left}`;
  return (
    <div className="space-y-2">
      <JumpToBar />
      <ResumePreview
        key={remountKey}
        html={html}
        pageFormat={pageFormat}
        hint={effectiveCached ? 'Showing AI-generated bullets.' : 'Showing template content.'}
      />
    </div>
  );
}

const JUMP_TARGETS: { label: string; anchor: string }[] = [
  { label: 'Page', anchor: 'sg-page' },
  { label: 'Sections', anchor: 'sg-sections' },
  { label: 'Basic info', anchor: 'sg-basicinfo' },
  { label: 'Section heading', anchor: 'sg-sectionheading' },
  { label: 'Summary', anchor: 'sg-summary' },
  { label: 'Experience', anchor: 'sg-experience' },
  { label: 'Skills', anchor: 'sg-skills' },
  { label: 'Education', anchor: 'sg-education' },
];

function JumpToBar() {
  function jump(anchor: string) {
    const el = document.getElementById(anchor);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // Brief highlight to show what was focused.
    el.classList.add('ring-2', 'ring-primary');
    setTimeout(() => el.classList.remove('ring-2', 'ring-primary'), 1200);
  }
  return (
    <div className="bg-white rounded-md border border-gray-100 px-3 py-2">
      <div className="text-[11px] text-gray-500 mb-1.5">Jump to a section in the form</div>
      <div className="flex flex-wrap gap-1.5">
        {JUMP_TARGETS.map((t) => (
          <button
            key={t.anchor}
            type="button"
            onClick={() => jump(t.anchor)}
            className="text-[11px] px-2 py-0.5 rounded-full border border-gray-200 text-gray-700 hover:border-primary hover:bg-blue-50/40"
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
