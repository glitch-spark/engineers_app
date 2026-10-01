export interface ParsedResume {
  filename: string;
  markdown: string;
}

export const RESUME_ACCEPT = '.pdf,.txt,.md';
export const MAX_RESUME_BYTES = 200_000;

const PAGE_SEPARATOR = '\n\n';

class ResumeParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResumeParseError';
  }
}

function getExt(filename: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(filename);
  return m ? m[1].toLowerCase() : '';
}

// Lazy: pdfjs-dist + worker (~1.7 MB combined) only loads when a PDF is
// actually parsed. Users who never upload a PDF never pay the bundle cost.
let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null;
async function loadPdfjs(): Promise<typeof import('pdfjs-dist')> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const mod = await import('pdfjs-dist');
      const { default: workerSrc } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
      mod.GlobalWorkerOptions.workerSrc = workerSrc;
      return mod;
    })();
  }
  return pdfjsPromise;
}

async function pdfToMarkdown(file: File): Promise<string> {
  const { getDocument } = await loadPdfjs();
  const buf = await file.arrayBuffer();
  // Defense-in-depth: disable eval-based optimizations even though v5 defaults
  // already reject script execution for non-form PDFs.
  const pdf = await getDocument({
    data: new Uint8Array(buf),
    isEvalSupported: false,
    disableAutoFetch: true,
  }).promise;
  try {
    const pages: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      // Keep the PDF's line breaks (hasEOL) so headings, roles and dates stay on their own lines.
      const text = content.items
        .map((item) => {
          if (!('str' in item)) return '';
          const t = item as { str: string; hasEOL?: boolean };
          return t.str + (t.hasEOL ? '\n' : ' ');
        })
        .join('')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      pages.push(`--- Page ${i} ---\n\n${text}`);
    }
    return pages.join(PAGE_SEPARATOR);
  } finally {
    await pdf.destroy();
  }
}

export async function parseResume(file: File): Promise<ParsedResume> {
  const ext = getExt(file.name);
  let markdown: string;
  if (ext === 'md' || ext === 'txt') {
    markdown = await file.text();
  } else if (ext === 'pdf') {
    markdown = await pdfToMarkdown(file);
  } else {
    throw new ResumeParseError(`unsupported file type: .${ext || '(none)'}`);
  }
  const bytes = new TextEncoder().encode(markdown).length;
  if (bytes > MAX_RESUME_BYTES) {
    throw new ResumeParseError(
      `parsed markdown is ${(bytes / 1024).toFixed(1)} KB, exceeds limit of ${(MAX_RESUME_BYTES / 1024).toFixed(0)} KB`,
    );
  }
  return { filename: file.name, markdown };
}
