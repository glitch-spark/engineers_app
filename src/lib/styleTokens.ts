/**
 * Bidirectional sync between Markdown mode and Structured mode.
 *
 * Strategy: tagged markdown. Each structured field is emitted as an HTML
 * comment token of the form `<!-- @style key.path=value -->`. Tokens roundtrip
 * losslessly. Free prose under `## User notes` survives toggles and is passed
 * to the LLM verbatim alongside the structured spec.
 */

import type { StyleConfig } from './resumeStyles';

const TOKEN_RE = /<!--\s*@style\s+([\w.]+)\s*=\s*([^>]+?)\s*-->/g;
const NOTES_HEADING = '## User notes';

const HEADER_COMMENT =
  '<!-- This file is generated from the Structured editor. Edit tokens directly to round-trip; free prose under "## User notes" is preserved. -->';

function flatten(obj: unknown, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  if (obj === null || typeof obj !== 'object') return out;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (Array.isArray(v)) {
      out[key] = JSON.stringify(v);
    } else if (v && typeof v === 'object') {
      Object.assign(out, flatten(v, key));
    } else if (v !== undefined && v !== null) {
      out[key] = String(v);
    }
  }
  return out;
}

function parseValue(raw: string): unknown {
  const v = raw.trim();
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^-?\d+$/.test(v)) return parseInt(v, 10);
  if (/^-?\d+\.\d+$/.test(v)) return parseFloat(v);
  if ((v.startsWith('[') && v.endsWith(']')) || (v.startsWith('{') && v.endsWith('}'))) {
    try { return JSON.parse(v); } catch { /* fall through */ }
  }
  return v;
}

function unflatten(flat: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [path, raw] of Object.entries(flat)) {
    const keys = path.split('.');
    let cur: Record<string, unknown> = out;
    for (let i = 0; i < keys.length - 1; i++) {
      const nxt = cur[keys[i]];
      if (!nxt || typeof nxt !== 'object' || Array.isArray(nxt)) {
        cur[keys[i]] = {};
      }
      cur = cur[keys[i]] as Record<string, unknown>;
    }
    cur[keys[keys.length - 1]] = raw;
  }
  return out;
}

export function deepMerge<T>(base: T, override: unknown): T {
  if (override === null || override === undefined) return base;
  if (Array.isArray(override)) return override as unknown as T;
  if (typeof override !== 'object') return override as unknown as T;
  if (base === null || base === undefined || typeof base !== 'object' || Array.isArray(base)) {
    return override as unknown as T;
  }
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const k of Object.keys(override as Record<string, unknown>)) {
    out[k] = deepMerge((out as Record<string, unknown>)[k], (override as Record<string, unknown>)[k]);
  }
  return out as T;
}

const NOTES_HEADING_RE = /^##\s+User notes\s*$/m;

export function extractNotes(md: string): string {
  if (!md) return '';
  const m = NOTES_HEADING_RE.exec(md);
  if (!m) return '';
  return md.slice(m.index + m[0].length).trim();
}

type TokenGroup = { title: string; blurb?: string; prefixes: string[] };

const TOKEN_GROUPS: TokenGroup[] = [
  { title: 'Page', blurb: 'Paper size and page margins (points).', prefixes: ['page.'] },
  {
    title: 'Layout',
    blurb: 'Order of sections + spacing (px) between containers, headings, and dividers.',
    prefixes: ['sectionOrder', 'sectionSpacing.'],
  },
  {
    title: 'Section headings',
    blurb: 'Shared style for SUMMARY / EXPERIENCE / SKILLS / EDUCATION headings.',
    prefixes: ['sectionHeading.'],
  },
  { title: 'Header — Name', prefixes: ['basicInfo.name.'] },
  { title: 'Header — Title', prefixes: ['basicInfo.title.'] },
  {
    title: 'Header — Contact',
    blurb: 'Contact-line items (in `items=[…]`), separator, and typography.',
    prefixes: ['basicInfo.contact.'],
  },
  { title: 'Summary', prefixes: ['summary.'] },
  {
    title: 'Experience — Company / Role / Period',
    prefixes: [
      'experience.companyName.',
      'experience.role.',
      'experience.period.',
      'experience.separator',
    ],
  },
  { title: 'Experience — Bullets', prefixes: ['experience.bullet.'] },
  { title: 'Skills', prefixes: ['skills.'] },
  { title: 'Education', prefixes: ['education.'] },
];

function tokenLine(k: string, v: string): string {
  return `<!-- @style ${k}=${v} -->`;
}

/** Build tagged markdown from structured config. Preserves user notes from
 *  prevMarkdown if present. Tokens are grouped under markdown headings so the
 *  raw markdown stays scannable; the parser ignores headings. */
export function serializeToTaggedMarkdown(cfg: StyleConfig, prevMarkdown?: string): string {
  const flat = flatten(cfg);
  const remaining = new Set(Object.keys(flat));

  const lines: string[] = [HEADER_COMMENT];

  for (const group of TOKEN_GROUPS) {
    const keys = Object.keys(flat)
      .filter((k) => group.prefixes.some((p) => k === p || k.startsWith(p)))
      .sort();
    if (!keys.length) continue;
    lines.push('', `## ${group.title}`);
    if (group.blurb) lines.push('', `<!-- ${group.blurb} -->`);
    lines.push('');
    for (const k of keys) {
      lines.push(tokenLine(k, flat[k]));
      remaining.delete(k);
    }
  }

  // Catch keys not covered by any group so nothing silently disappears.
  if (remaining.size) {
    lines.push('', '## Other');
    for (const k of [...remaining].sort()) {
      lines.push(tokenLine(k, flat[k]));
    }
  }

  const notes = extractNotes(prevMarkdown || '');
  if (notes) {
    lines.push('', NOTES_HEADING, '', notes);
  }

  return lines.join('\n');
}

export type ParseResult = {
  config: Partial<StyleConfig>;
  notes: string;
  tokenCount: number;
};

/** Parse tokens and notes from markdown. Untagged markdown returns empty
 *  config + tokenCount=0 — caller should keep existing structured config. */
export function parseTaggedMarkdown(md: string): ParseResult {
  const flat: Record<string, unknown> = {};
  let m: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(md)) !== null) {
    flat[m[1]] = parseValue(m[2]);
  }
  const config = unflatten(flat) as Partial<StyleConfig>;
  return { config, notes: extractNotes(md), tokenCount: Object.keys(flat).length };
}

/** Strip tokens + auto-header from markdown so what's left is the user's
 *  free prose (used for "do you have unsaved free prose" detection). */
export function stripTokens(md: string): string {
  return md
    .replace(TOKEN_RE, '')
    .replace(HEADER_COMMENT, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
