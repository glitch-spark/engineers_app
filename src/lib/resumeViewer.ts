import { marked } from 'marked';
import DOMPurify from 'dompurify';

const STYLES = `
  :root { color-scheme: light dark; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    line-height: 1.6;
    max-width: 760px;
    margin: 2rem auto;
    padding: 0 1.5rem 4rem;
    color: #111827;
    background: #f9fafb;
  }
  header {
    border-bottom: 1px solid #e5e7eb;
    margin-bottom: 1.5rem;
    padding-bottom: 0.75rem;
  }
  header h1 { font-size: 1.125rem; margin: 0; color: #6b7280; font-weight: 500; }
  main { background: #fff; border: 1px solid #e5e7eb; border-radius: 0.5rem; padding: 2rem; }
  h1, h2, h3, h4, h5, h6 { font-weight: 600; margin-top: 1.5rem; margin-bottom: 0.5rem; line-height: 1.25; }
  h1 { font-size: 1.5rem; } h2 { font-size: 1.25rem; } h3 { font-size: 1.125rem; }
  p { margin: 0 0 1rem 0; }
  ul, ol { margin: 0 0 1rem 0; padding-left: 1.5rem; }
  li { margin-bottom: 0.25rem; }
  a { color: #2563eb; text-decoration: underline; }
  a:hover { color: #1d4ed8; }
  blockquote { border-left: 4px solid #e5e7eb; padding-left: 1rem; margin: 1rem 0; color: #4b5563; font-style: italic; }
  code { background: #f3f4f6; padding: 0.125rem 0.25rem; border-radius: 0.25rem; font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 0.875em; }
  pre { background: #f3f4f6; padding: 1rem; border-radius: 0.375rem; overflow-x: auto; }
  pre code { background: transparent; padding: 0; }
  hr { border: none; border-top: 1px solid #e5e7eb; margin: 2rem 0; }
  table { border-collapse: collapse; margin: 1rem 0; }
  th, td { border: 1px solid #e5e7eb; padding: 0.5rem 0.75rem; }
  th { background: #f9fafb; font-weight: 600; text-align: left; }
  @media (prefers-color-scheme: dark) {
    body { color: #fafafa; background: #09090b; }
    header { border-bottom-color: #3f3f46; }
    header h1 { color: #a1a1aa; }
    main { background: #18181b; border-color: #3f3f46; }
    a { color: #38bdf8; }
    a:hover { color: #7dd3fc; }
    blockquote { border-left-color: #52525b; color: #a1a1aa; }
    code, pre { background: #27272a; }
    hr { border-top-color: #3f3f46; }
    th, td { border-color: #3f3f46; }
    th { background: #27272a; }
  }
`;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}

export function openResumeInNewTab(filename: string, markdown: string): void {
  const html = marked.parse(markdown || '', { async: false }) as string;
  const safe = DOMPurify.sanitize(html);
  const doc = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(filename)}</title>
  <style>${STYLES}</style>
</head>
<body>
  <header><h1>${escapeHtml(filename)}</h1></header>
  <main>${safe}</main>
</body>
</html>`;
  const blob = new Blob([doc], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank', 'noopener,noreferrer');
  // Free the blob after the new tab has had time to load (browsers hold a ref while the page lives).
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  if (!win) {
    URL.revokeObjectURL(url);
    throw new Error('Popup blocked. Allow popups for this site to view resumes.');
  }
}
