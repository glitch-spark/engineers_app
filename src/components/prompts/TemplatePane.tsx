import { useMemo, useState } from 'react';
import { notify } from '../../lib/notify';
import { openTemplatePreview, sanitizeTemplateHtml } from '../../lib/templatePreview';

/**
 * A resume unit's HTML template: upload (.html), full preview in a new tab, remove, and a scaled inline preview.
 * Template HTML is untrusted: it is sanitized and shown in a script-less sandboxed iframe.
 */
export default function TemplatePane({
  html,
  name,
  onChange,
}: {
  html: string;
  name: string;
  onChange: (html: string, name: string) => void;
}) {
  const [status, setStatus] = useState('');
  const preview = useMemo(() => (html ? sanitizeTemplateHtml(html) : ''), [html]);

  async function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith('.html')) {
      notify.error('Only .html files are supported.');
      return;
    }
    onChange(await file.text(), file.name);
    setStatus(`${file.name} loaded. Save to keep it.`);
  }

  const upload = (
    <input
      type="file"
      accept=".html,text/html"
      className="sr-only"
      aria-label="Upload HTML template"
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) void handleFile(f);
        e.target.value = '';
      }}
    />
  );

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">HTML template</h3>
        {html && (
          <span className="flex items-center gap-3 text-xs">
            <label className="link cursor-pointer [&:has(:focus-visible)]:ring-2 [&:has(:focus-visible)]:ring-sky-600">
              Upload
              {upload}
            </label>
            <button
              type="button"
              className="link"
              onClick={() => {
                try {
                  openTemplatePreview(html, name || 'template.html');
                } catch (err) {
                  notify.error(err, 'Could not open the preview');
                }
              }}
              title="Open the template in a new tab"
            >
              Preview
            </button>
            <button
              type="button"
              className="text-red-600 hover:underline"
              onClick={() => {
                if (!window.confirm('Remove this unit’s template?')) return;
                onChange('', '');
                setStatus('Template removed. Save to keep the change.');
              }}
            >
              Remove
            </button>
          </span>
        )}
      </div>
      <div role="status" className="sr-only">
        {status}
      </div>
      {html ? (
        <>
          <p className="truncate text-sm text-zinc-700 dark:text-zinc-300" title={name}>
            <span className="font-medium">{name || 'template.html'}</span>
            <span className="ml-2 text-xs text-faint">{(new Blob([html]).size / 1024).toFixed(1)} KB</span>
          </p>
          {/* Scaled to fit: the page is laid out at 816px (letter width) and shrunk to the column. */}
          <div className="relative min-h-[18rem] flex-1 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-700">
            <iframe
              title={`Preview of ${name || 'the template'}`}
              sandbox=""
              srcDoc={preview}
              className="pointer-events-none absolute left-0 top-0 h-[250%] w-[250%] origin-top-left scale-[0.4] border-0"
            />
          </div>
        </>
      ) : (
        <label
          className="flex min-h-[18rem] flex-1 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-zinc-200 p-6 text-center transition hover:border-primary hover:bg-sky-50/40 dark:border-zinc-700 dark:hover:bg-sky-950/20 [&:has(:focus-visible)]:ring-2 [&:has(:focus-visible)]:ring-sky-600"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) void handleFile(f);
          }}
        >
          {upload}
          <span className="text-sm font-medium text-amber-700 dark:text-amber-400">No HTML template</span>
          <span className="text-xs text-muted">Job Applies can’t tailor with this unit.</span>
          <span className="mt-2 text-xs text-muted">
            Drop an <code>.html</code> file here, or click to choose
          </span>
        </label>
      )}
    </div>
  );
}
