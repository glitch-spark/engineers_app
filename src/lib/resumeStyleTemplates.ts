import type { ContactItem, StyleConfig } from './resumeStyles';

const DEFAULT_CONTACT_ITEMS: ContactItem[] = [
  { type: 'email', enabled: true },
  { type: 'phone', enabled: true },
  { type: 'address', enabled: true },
  { type: 'github', enabled: false },
  { type: 'linkedin', enabled: false },
  { type: 'website', enabled: false },
  { type: 'twitter', enabled: false },
];

const black = '#000000';
const purple = '#341b74';

export const TEMPLATE_CLASSIC: StyleConfig = {
  page: { format: 'A4', margin: { top: 35, right: 30, bottom: 30, left: 30 } },
  sectionOrder: ['summary', 'experience', 'skills', 'education'],
  sectionSpacing: { containerMb: 8, headingMb: 4, dividerMb: 6 },

  basicInfo: {
    name: { fontFamily: 'Arial Black', fontSize: 20, fontWeight: 'bold', color: black, align: 'center' },
    title: { fontFamily: 'Arial Black', fontSize: 12, fontWeight: 'bold', color: black, align: 'center', text: 'Senior Software Engineer' },
    contact: { fontFamily: 'Tahoma', fontSize: 11, fontWeight: 'normal', color: black, align: 'center', separator: '|', items: DEFAULT_CONTACT_ITEMS },
  },
  sectionHeading: { fontFamily: 'Arial Black', fontSize: 11, fontWeight: 'bold', color: black, align: 'center' },
  summary: { fontFamily: 'Tahoma', fontSize: 11, fontWeight: 'normal', color: black, align: 'justify', boldLabels: true },
  experience: {
    companyName: { fontFamily: 'Arial Black', fontSize: 11, fontWeight: 'bold', color: purple },
    role: { fontFamily: 'Tahoma', fontSize: 11, fontWeight: 'normal', color: black },
    period: { fontFamily: 'Tahoma', fontSize: 11, fontWeight: 'normal', color: black, format: 'YYYY/MM - YYYY/MM' },
    separator: '|',
    bullet: { fontFamily: 'Tahoma', fontSize: 11, fontWeight: 'normal', color: black, align: 'justify', indentPx: 10, boldKeywords: true },
  },
  skills: { fontFamily: 'Tahoma', fontSize: 11, fontWeight: 'normal', color: black, align: 'justify', boldCategories: true, layout: 'one-per-line' },
  education: {
    university: { fontFamily: 'Arial Black', fontSize: 11, fontWeight: 'bold', color: purple },
    degree: { fontFamily: 'Tahoma', fontSize: 11, fontWeight: 'normal', color: black },
    period: { fontFamily: 'Tahoma', fontSize: 11, fontWeight: 'normal', color: black, format: 'YYYY - YYYY' },
    separator: '|',
  },
};

export const TEMPLATE_COMPACT: StyleConfig = {
  ...TEMPLATE_CLASSIC,
  page: { format: 'A4', margin: { top: 25, right: 22, bottom: 22, left: 22 } },
  sectionSpacing: { containerMb: 5, headingMb: 3, dividerMb: 4 },
  basicInfo: {
    ...TEMPLATE_CLASSIC.basicInfo,
    name: { ...TEMPLATE_CLASSIC.basicInfo.name, fontSize: 17 },
    title: { ...TEMPLATE_CLASSIC.basicInfo.title, fontSize: 11 },
    contact: { ...TEMPLATE_CLASSIC.basicInfo.contact, fontSize: 10 },
  },
  sectionHeading: { ...TEMPLATE_CLASSIC.sectionHeading, fontSize: 10 },
  summary: { ...TEMPLATE_CLASSIC.summary, fontSize: 10 },
  experience: {
    ...TEMPLATE_CLASSIC.experience,
    bullet: { ...TEMPLATE_CLASSIC.experience.bullet, fontSize: 10, indentPx: 8 },
  },
};

export const TEMPLATE_MODERN: StyleConfig = {
  ...TEMPLATE_CLASSIC,
  basicInfo: {
    ...TEMPLATE_CLASSIC.basicInfo,
    name: { ...TEMPLATE_CLASSIC.basicInfo.name, fontFamily: 'Helvetica', align: 'left' },
    title: { ...TEMPLATE_CLASSIC.basicInfo.title, fontFamily: 'Helvetica', align: 'left' },
    contact: { ...TEMPLATE_CLASSIC.basicInfo.contact, fontFamily: 'Helvetica', align: 'left' },
  },
  sectionHeading: { ...TEMPLATE_CLASSIC.sectionHeading, fontFamily: 'Helvetica', color: purple, align: 'left' },
  summary: { ...TEMPLATE_CLASSIC.summary, fontFamily: 'Helvetica' },
  experience: {
    ...TEMPLATE_CLASSIC.experience,
    companyName: { ...TEMPLATE_CLASSIC.experience.companyName, fontFamily: 'Helvetica' },
    role: { ...TEMPLATE_CLASSIC.experience.role, fontFamily: 'Helvetica' },
    period: { ...TEMPLATE_CLASSIC.experience.period, fontFamily: 'Helvetica' },
    bullet: { ...TEMPLATE_CLASSIC.experience.bullet, fontFamily: 'Helvetica' },
  },
  skills: { ...TEMPLATE_CLASSIC.skills, fontFamily: 'Helvetica' },
  education: {
    ...TEMPLATE_CLASSIC.education,
    university: { ...TEMPLATE_CLASSIC.education.university, fontFamily: 'Helvetica' },
    degree: { ...TEMPLATE_CLASSIC.education.degree, fontFamily: 'Helvetica' },
    period: { ...TEMPLATE_CLASSIC.education.period, fontFamily: 'Helvetica' },
  },
};

const slate = '#1f2937';
const navy = '#1e3a8a';

// Minimalist — sans serif, no accent color, very clean.
export const TEMPLATE_MINIMALIST: StyleConfig = {
  ...TEMPLATE_CLASSIC,
  basicInfo: {
    ...TEMPLATE_CLASSIC.basicInfo,
    name: { fontFamily: 'Inter', fontSize: 18, fontWeight: 'bold', color: black, align: 'left' },
    title: { fontFamily: 'Inter', fontSize: 11, fontWeight: 'normal', color: slate, align: 'left', text: 'Senior Software Engineer' },
    contact: { fontFamily: 'Inter', fontSize: 10, fontWeight: 'normal', color: slate, align: 'left', separator: '·', items: DEFAULT_CONTACT_ITEMS },
  },
  sectionHeading: { fontFamily: 'Inter', fontSize: 10, fontWeight: 'bold', color: black, align: 'left' },
  summary: { fontFamily: 'Inter', fontSize: 11, fontWeight: 'normal', color: slate, align: 'justify', boldLabels: false },
  experience: {
    companyName: { fontFamily: 'Inter', fontSize: 11, fontWeight: 'bold', color: black },
    role: { fontFamily: 'Inter', fontSize: 11, fontWeight: 'normal', color: slate },
    period: { fontFamily: 'Inter', fontSize: 10, fontWeight: 'normal', color: slate, format: 'YYYY/MM - YYYY/MM' },
    separator: '·',
    bullet: { fontFamily: 'Inter', fontSize: 11, fontWeight: 'normal', color: slate, align: 'justify', indentPx: 12, boldKeywords: true },
  },
  skills: { fontFamily: 'Inter', fontSize: 11, fontWeight: 'normal', color: slate, align: 'justify', boldCategories: true, layout: 'one-per-line' },
  education: {
    university: { fontFamily: 'Inter', fontSize: 11, fontWeight: 'bold', color: black },
    degree: { fontFamily: 'Inter', fontSize: 11, fontWeight: 'normal', color: slate },
    period: { fontFamily: 'Inter', fontSize: 10, fontWeight: 'normal', color: slate, format: 'YYYY - YYYY' },
    separator: '·',
  },
};

// Executive — serif, larger headings, generous spacing, navy accent.
export const TEMPLATE_EXECUTIVE: StyleConfig = {
  ...TEMPLATE_CLASSIC,
  page: { format: 'A4', margin: { top: 40, right: 40, bottom: 40, left: 40 } },
  sectionSpacing: { containerMb: 10, headingMb: 5, dividerMb: 7 },
  basicInfo: {
    name: { fontFamily: 'Merriweather', fontSize: 22, fontWeight: 'bold', color: navy, align: 'center' },
    title: { fontFamily: 'Merriweather', fontSize: 12, fontWeight: 'normal', color: slate, align: 'center', text: 'Senior Software Engineer' },
    contact: { fontFamily: 'PT Sans', fontSize: 10, fontWeight: 'normal', color: slate, align: 'center', separator: '|', items: DEFAULT_CONTACT_ITEMS },
  },
  sectionHeading: { fontFamily: 'Merriweather', fontSize: 12, fontWeight: 'bold', color: navy, align: 'left' },
  summary: { fontFamily: 'PT Sans', fontSize: 11, fontWeight: 'normal', color: slate, align: 'justify', boldLabels: true },
  experience: {
    companyName: { fontFamily: 'Merriweather', fontSize: 11, fontWeight: 'bold', color: navy },
    role: { fontFamily: 'PT Sans', fontSize: 11, fontWeight: 'normal', color: slate },
    period: { fontFamily: 'PT Sans', fontSize: 10, fontWeight: 'normal', color: slate, format: 'YYYY/MM - YYYY/MM' },
    separator: '|',
    bullet: { fontFamily: 'PT Sans', fontSize: 11, fontWeight: 'normal', color: slate, align: 'justify', indentPx: 12, boldKeywords: true },
  },
  skills: { fontFamily: 'PT Sans', fontSize: 11, fontWeight: 'normal', color: slate, align: 'justify', boldCategories: true, layout: 'one-per-line' },
  education: {
    university: { fontFamily: 'Merriweather', fontSize: 11, fontWeight: 'bold', color: navy },
    degree: { fontFamily: 'PT Sans', fontSize: 11, fontWeight: 'normal', color: slate },
    period: { fontFamily: 'PT Sans', fontSize: 10, fontWeight: 'normal', color: slate, format: 'YYYY - YYYY' },
    separator: '|',
  },
};

// Dense ATS — small fonts, tight margins, mono-ish, optimized for keyword
// stuffing in single-column ATS parsers.
export const TEMPLATE_DENSE_ATS: StyleConfig = {
  ...TEMPLATE_CLASSIC,
  page: { format: 'A4', margin: { top: 22, right: 20, bottom: 20, left: 20 } },
  sectionSpacing: { containerMb: 4, headingMb: 2, dividerMb: 3 },
  basicInfo: {
    ...TEMPLATE_CLASSIC.basicInfo,
    name: { ...TEMPLATE_CLASSIC.basicInfo.name, fontFamily: 'Arial', fontSize: 16 },
    title: { ...TEMPLATE_CLASSIC.basicInfo.title, fontFamily: 'Arial', fontSize: 10 },
    contact: { ...TEMPLATE_CLASSIC.basicInfo.contact, fontFamily: 'Arial', fontSize: 9 },
  },
  sectionHeading: { fontFamily: 'Arial', fontSize: 10, fontWeight: 'bold', color: black, align: 'left' },
  summary: { fontFamily: 'Arial', fontSize: 10, fontWeight: 'normal', color: black, align: 'justify', boldLabels: true },
  experience: {
    companyName: { fontFamily: 'Arial', fontSize: 10, fontWeight: 'bold', color: black },
    role: { fontFamily: 'Arial', fontSize: 10, fontWeight: 'normal', color: black },
    period: { fontFamily: 'Arial', fontSize: 9, fontWeight: 'normal', color: black, format: 'YYYY/MM - YYYY/MM' },
    separator: '|',
    bullet: { fontFamily: 'Arial', fontSize: 10, fontWeight: 'normal', color: black, align: 'justify', indentPx: 8, boldKeywords: true },
  },
  skills: { fontFamily: 'Arial', fontSize: 10, fontWeight: 'normal', color: black, align: 'justify', boldCategories: true, layout: 'comma' },
  education: {
    university: { fontFamily: 'Arial', fontSize: 10, fontWeight: 'bold', color: black },
    degree: { fontFamily: 'Arial', fontSize: 10, fontWeight: 'normal', color: black },
    period: { fontFamily: 'Arial', fontSize: 9, fontWeight: 'normal', color: black, format: 'YYYY - YYYY' },
    separator: '|',
  },
};

export const TEMPLATES = {
  classic: { label: 'Classic', blurb: 'Centered name, purple accents, serif-friendly. The default.', config: TEMPLATE_CLASSIC },
  compact: { label: 'Compact', blurb: 'Smaller fonts and tighter spacing. Fits more on one page.', config: TEMPLATE_COMPACT },
  modern: { label: 'Modern', blurb: 'Helvetica, left-aligned, purple section headings.', config: TEMPLATE_MODERN },
  minimalist: { label: 'Minimalist', blurb: 'Inter sans, no accent color, slate text. Calm and clean.', config: TEMPLATE_MINIMALIST },
  executive: { label: 'Executive', blurb: 'Merriweather serif, navy accent, generous margins.', config: TEMPLATE_EXECUTIVE },
  ats: { label: 'Dense ATS', blurb: 'Arial 10pt, tight margins, inline skills. Built for keyword stuffing.', config: TEMPLATE_DENSE_ATS },
};

export type TemplateKey = keyof typeof TEMPLATES;
