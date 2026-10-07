import DOMPurify from 'dompurify';
import { safeHref } from './safeHref';

// Uploaded resume templates are untrusted HTML. Opening them as a text/html
// blob: URL would run their scripts with the app's origin (and its JWT in
// localStorage), so the preview is (1) sanitized and (2) shown inside an iframe
// sandboxed without allow-scripts / allow-same-origin — an opaque origin that
// can't run script even if something slips past the sanitizer.

// Own instance so these hooks never affect DOMPurify use elsewhere in the app.
const purifier = DOMPurify(window);

// Keep only <link>s that load styles/fonts over https (e.g. Google Fonts).
const LINK_RELS = new Set(['stylesheet', 'preconnect']);
purifier.addHook('uponSanitizeElement', (node, data) => {
  if (data.tagName !== 'link' || !(node instanceof Element)) return;
  const rels = (node.getAttribute('rel') || '').toLowerCase().split(/\s+/).filter(Boolean);
  const ok = rels.length > 0 && rels.every((r) => LINK_RELS.has(r)) && !!safeHref(node.getAttribute('href'))?.toLowerCase().startsWith('https:');
  if (!ok) node.parentNode?.removeChild(node);
});

/** Sanitize a full template document, keeping its <head> styles and font links. */
export function sanitizeTemplateHtml(html: string): string {
  // DOMPurify returns <html>…</html> without the doctype; restore it so the
  // preview renders in standards mode like the real resume, not quirks mode.
  return '<!doctype html>\n' + purifier.sanitize(html || '', {
    WHOLE_DOCUMENT: true,
    ADD_TAGS: ['style', 'link'],
    ADD_ATTR: ['rel', 'crossorigin'],
    FORBID_TAGS: ['script', 'iframe', 'frame', 'frameset', 'object', 'embed', 'form', 'meta', 'base', 'noscript', 'applet'],
    // DOMPurify already strips on* handlers and javascript: URLs.
  });
}

function escapeAttr(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}

/** Open an uploaded template in a new tab, rendered with its CSS but never its scripts. */
export function openTemplatePreview(html: string, title: string): void {
  const safe = sanitizeTemplateHtml(html);
  // The wrapper holds no script of its own; its CSP also covers the srcdoc frame.
  const doc = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="script-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
  <title>${escapeAttr(title)}</title>
  <style>html, body { margin: 0; height: 100%; } iframe { display: block; width: 100%; height: 100%; border: 0; }</style>
</head>
<body>
  <iframe sandbox="" referrerpolicy="no-referrer" title="${escapeAttr(title)}" srcdoc="${escapeAttr(safe)}"></iframe>
</body>
</html>`;
  const blob = new Blob([doc], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  // No 'noopener' feature: with it, window.open() always returns null, so a real
  // popup block can't be told apart from success. Detach the opener by hand instead.
  const win = window.open(url, '_blank');
  if (!win) {
    URL.revokeObjectURL(url);
    throw new Error('Popup blocked. Allow popups for this site to preview the template.');
  }
  win.opener = null;
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
