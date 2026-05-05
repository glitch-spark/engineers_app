/** Build a preview HTML doc + page CSS from a styleConfig + account data,
 *  **without** calling the LLM. Used by the live preview pane.
 *
 *  Returns `{ content, stylesheets }` so the caller can pass `stylesheets`
 *  to paged.js separately — that's the canonical way to make `@page` rules
 *  re-resolve on every render (embedding them in `content` lets paged.js's
 *  Polisher cache stale margin geometry across renders).
 */

import type { Align, ContactItem, PageFormat, StyleConfig, Typography } from './resumeStyles';

export const MOCK_CANDIDATE = {
  name: 'Sample Candidate',
  email: 'candidate@example.com',
  phone: '(555) 123-4567',
  address: 'San Francisco, CA',
  experienceLines: [
    'Acme Corp | Senior Software Engineer | Aug 2020 – Present',
    'Beta Labs | Software Engineer | Jul 2016 – Jul 2020',
  ],
  education: 'State University, Bachelor of Computer Science, 2012 - 2016',
  github: '',
  linkedin: '',
  website: '',
  twitter: '',
  customLinks: [] as Array<{ label: string; url: string }>,
};

/** Explicit page dimensions. paged.js's named-keyword path (e.g. `size: A4`)
 *  is hit-or-miss across formats — explicit "WIDTH HEIGHT" works consistently
 *  and matches what Playwright's `format` keyword resolves to. */
const PAGE_DIMENSIONS: Record<PageFormat, { width: string; height: string }> = {
  A3: { width: '297mm', height: '420mm' },
  A4: { width: '210mm', height: '297mm' },
  A5: { width: '148mm', height: '210mm' },
  Letter: { width: '8.5in', height: '11in' },
};

function typoCss(t: Typography & { align?: Align }): string {
  const parts = [
    `font-family: '${t.fontFamily}', sans-serif`,
    `font-size: ${t.fontSize}pt`,
    `font-weight: ${t.fontWeight}`,
    `color: ${t.color}`,
  ];
  if (t.align) parts.push(`text-align: ${t.align}`);
  return parts.join('; ');
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function parseExperienceLines(raw: string | undefined): string[] {
  if (!raw) return MOCK_CANDIDATE.experienceLines;
  return raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

export type AccountForPreview = {
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  experience?: string;
  education?: string;
  github?: string;
  linkedin?: string;
  website?: string;
  twitter?: string;
  customLinks?: Array<{ label: string; url: string }>;
  contactLabels?: Record<string, string>;
};

/** Returns the display value for a contact type — uses custom label override
 *  if set, otherwise the underlying URL/identity value. Returns empty string
 *  when there's nothing to show. */
export function contactDisplay(type: string, account: AccountForPreview): string {
  const override = account.contactLabels?.[type];
  if (override) return override;
  switch (type) {
    case 'email': return account.email || '';
    case 'phone': return account.phone || '';
    case 'address': return account.address || '';
    case 'github': return account.github || '';
    case 'linkedin': return account.linkedin || '';
    case 'website': return account.website || '';
    case 'twitter': return account.twitter || '';
    default: return '';
  }
}

/** Returns the underlying URL for a contact type. Address and labels-only
 *  entries return empty (no link). */
export function contactUrl(type: string, account: AccountForPreview): string {
  switch (type) {
    case 'email': return account.email ? `mailto:${account.email}` : '';
    case 'phone': return account.phone ? `tel:${account.phone.replace(/\s+/g, '')}` : '';
    case 'address': return '';
    case 'github': return account.github || '';
    case 'linkedin': return account.linkedin || '';
    case 'website': return account.website || '';
    case 'twitter': return account.twitter || '';
    default: return '';
  }
}

type ResumeData = {
  name: string;
  experienceLines: string[];
  education: string;
};

function dataFromAccount(account: AccountForPreview): ResumeData {
  const hasContent = (account.experience || '').trim() || (account.education || '').trim();
  if (!hasContent) {
    return {
      name: MOCK_CANDIDATE.name,
      experienceLines: MOCK_CANDIDATE.experienceLines,
      education: MOCK_CANDIDATE.education,
    };
  }
  return {
    name: account.name || MOCK_CANDIDATE.name,
    experienceLines: parseExperienceLines(account.experience),
    education: account.education || MOCK_CANDIDATE.education,
  };
}

function renderContactItem(
  item: ContactItem,
  account: AccountForPreview,
): { rendered: string; href: string | null } | null {
  if (!item.enabled) return null;
  if (item.type === 'custom') {
    const url = item.customUrl || '';
    const label = item.customLabel || url;
    if (!url && !label) return null;
    return { rendered: escape(label), href: url || null };
  }
  const display = contactDisplay(item.type, account);
  if (!display) return null;
  const href = contactUrl(item.type, account) || null;
  return { rendered: escape(display), href };
}

function renderContactLine(
  cfg: StyleConfig,
  account: AccountForPreview,
  items: ContactItem[],
): string {
  const sep = cfg.basicInfo.contact.separator;
  const linkColor = cfg.basicInfo.contact.color;
  const rendered = items
    .map((it) => renderContactItem(it, account))
    .filter((r): r is NonNullable<typeof r> => r !== null);
  if (rendered.length === 0) return '';
  const html = rendered
    .map((r) =>
      r.href
        ? `<a href="${escape(r.href)}" style="color: ${linkColor}; text-decoration: none;">${r.rendered}</a>`
        : r.rendered,
    )
    .join(` ${sep} `);
  return `<div style="${typoCss(cfg.basicInfo.contact)}; margin: 0;">${html}</div>`;
}

function renderBody(cfg: StyleConfig, data: ResumeData, account: AccountForPreview, items: ContactItem[]): string {
  const sectionRenders: Record<string, () => string> = {
    summary: () => `
      <section style="margin-bottom: ${cfg.sectionSpacing.containerMb}px;">
        <h2 style="${typoCss(cfg.sectionHeading)}; margin: 0 0 ${cfg.sectionSpacing.headingMb}px 0;">SUMMARY</h2>
        <hr style="border: none; border-top: 0.5pt solid black; margin: 0 0 ${cfg.sectionSpacing.dividerMb}px 0;" />
        <p style="${typoCss(cfg.summary)}; margin: 0;">
          ${cfg.summary.boldLabels ? '<strong>X years</strong> ' : 'X years '}
          of experience designing and shipping product engineering systems. Strong across frontend,
          backend, and platform — comfortable owning features end-to-end.
        </p>
      </section>`,
    experience: () => {
      const sep = cfg.experience.separator;
      return `
      <section style="margin-bottom: ${cfg.sectionSpacing.containerMb}px;">
        <h2 style="${typoCss(cfg.sectionHeading)}; margin: 0 0 ${cfg.sectionSpacing.headingMb}px 0;">PROFESSIONAL EXPERIENCE</h2>
        <hr style="border: none; border-top: 0.5pt solid black; margin: 0 0 ${cfg.sectionSpacing.dividerMb}px 0;" />
        ${data.experienceLines
          .map((line) => {
            const parts = line.split('|').map((p) => p.trim());
            const [company = '', role = '', period = ''] = parts;
            return `
              <div style="text-align: left; margin: 4pt 0;">
                <span style="${typoCss(cfg.experience.companyName)}">${escape(company)}</span>
                <span> ${sep} </span>
                <span style="${typoCss(cfg.experience.role)}">${escape(role)}</span>
                <span> ${sep} </span>
                <span style="${typoCss(cfg.experience.period)}">${escape(period)}</span>
              </div>
              <ul style="margin: 0; padding-left: 1em; list-style-type: disc;">
                <li style="${typoCss(cfg.experience.bullet)}; margin-left: ${cfg.experience.bullet.indentPx}px;">
                  Drove a key initiative; ${cfg.experience.bullet.boldKeywords ? '<strong>highlighted</strong>' : 'highlighted'} a measurable outcome and the technologies used.
                </li>
                <li style="${typoCss(cfg.experience.bullet)}; margin-left: ${cfg.experience.bullet.indentPx}px;">
                  Collaborated cross-functionally on platform improvements; mentored teammates and reviewed code.
                </li>
              </ul>`;
          })
          .join('')}
      </section>`;
    },
    skills: () => {
      const lineBreak = cfg.skills.layout === 'one-per-line' ? '<br/>' : '; ';
      const cat = (name: string, items: string) =>
        cfg.skills.boldCategories ? `<strong>${name}:</strong> ${items}` : `${name}: ${items}`;
      return `
      <section style="margin-bottom: ${cfg.sectionSpacing.containerMb}px;">
        <h2 style="${typoCss(cfg.sectionHeading)}; margin: 0 0 ${cfg.sectionSpacing.headingMb}px 0;">SKILLS</h2>
        <hr style="border: none; border-top: 0.5pt solid black; margin: 0 0 ${cfg.sectionSpacing.dividerMb}px 0;" />
        <p style="${typoCss(cfg.skills)}; margin: 0;">
          ${cat('Languages', 'TypeScript, Python, Go')}${lineBreak}
          ${cat('Frontend', 'React, Vite, Tailwind')}${lineBreak}
          ${cat('Backend', 'FastAPI, Node, PostgreSQL, MongoDB')}${lineBreak}
          ${cat('Cloud & DevOps', 'AWS, Docker, Terraform')}
        </p>
      </section>`;
    },
    education: () => {
      const sep = cfg.education.separator;
      const eduParts = data.education.split(',').map((p) => p.trim());
      const [university = '', degree = '', period = ''] = eduParts;
      return `
      <section style="margin-bottom: ${cfg.sectionSpacing.containerMb}px;">
        <h2 style="${typoCss(cfg.sectionHeading)}; margin: 0 0 ${cfg.sectionSpacing.headingMb}px 0;">EDUCATION</h2>
        <hr style="border: none; border-top: 0.5pt solid black; margin: 0 0 ${cfg.sectionSpacing.dividerMb}px 0;" />
        <div style="text-align: left;">
          <span style="${typoCss(cfg.education.university)}">${escape(university)}</span>
          ${degree ? `<span> ${sep} </span><span style="${typoCss(cfg.education.degree)}">${escape(degree)}</span>` : ''}
          ${period ? `<span> ${sep} </span><span style="${typoCss(cfg.education.period)}">${escape(period)}</span>` : ''}
        </div>
      </section>`;
    },
  };

  const header = `
    <header style="margin-bottom: ${cfg.sectionSpacing.containerMb}px;">
      <h1 style="${typoCss(cfg.basicInfo.name)}; margin: 0;">${escape(data.name)}</h1>
      <div style="${typoCss(cfg.basicInfo.title)}; margin: 0;">${escape(cfg.basicInfo.title.text)}</div>
      ${renderContactLine(cfg, account, items)}
    </header>`;

  return header + cfg.sectionOrder.map((k) => sectionRenders[k]()).join('');
}

export function buildPreviewHtml(opts: {
  cfg: StyleConfig;
  account: AccountForPreview;
  pageFormat: PageFormat;
  cachedAiHtml?: string;
}): string {
  const dim = PAGE_DIMENSIONS[opts.pageFormat];
  const margin = opts.cfg.page.margin;

  const pageCss = `
    @page {
      size: ${dim.width} ${dim.height};
      margin: ${margin.top}pt ${margin.right}pt ${margin.bottom}pt ${margin.left}pt;
    }
    html, body { margin: 0; padding: 0; background: white; }
    body { line-height: 1.3; }
    ul, li { margin: 0; padding: 0; box-sizing: border-box; }
    ul { list-style-type: disc; list-style-position: outside; padding-left: 1em; }
    li { display: list-item; list-style-type: disc; }
  `;

  const items: ContactItem[] = opts.cfg.basicInfo.contact.items ?? [];

  const body = opts.cachedAiHtml
    ? opts.cachedAiHtml
    : renderBody(opts.cfg, dataFromAccount(opts.account), opts.account, items);

  return `<!DOCTYPE html>
<html>
  <head><meta charset="utf-8" /><style>${pageCss}</style></head>
  <body>${body}</body>
</html>`;
}
