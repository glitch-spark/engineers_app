/**
 * Theme presets — color scheme + font pairing in one click.
 *
 * Themes patch every typography slot's `fontFamily` and `color` (and shift
 * accent colors for company/university). Sizes, alignment, separators,
 * margins, spacing, and section order are left untouched so users can theme
 * without losing layout tweaks they've made.
 */

import type { StyleConfig } from './resumeStyles';

export type Theme = {
  key: string;
  label: string;
  blurb: string;
  swatch: string; // accent color shown in the picker
  bodyFont: string;
  headingFont: string;
  bodyColor: string;
  accentColor: string;
};

export const THEMES: Theme[] = [
  {
    key: 'mono-black',
    label: 'Mono Black',
    blurb: 'Inter sans, all-black, no accents. Strict and clean.',
    swatch: '#000000',
    bodyFont: 'Inter',
    headingFont: 'Inter',
    bodyColor: '#000000',
    accentColor: '#000000',
  },
  {
    key: 'indigo-pro',
    label: 'Indigo Pro',
    blurb: 'Inter sans, slate body, indigo accents on company + university.',
    swatch: '#4338ca',
    bodyFont: 'Inter',
    headingFont: 'Inter',
    bodyColor: '#1f2937',
    accentColor: '#4338ca',
  },
  {
    key: 'charcoal-serif',
    label: 'Charcoal Serif',
    blurb: 'Merriweather + PT Sans pairing. Slate body, charcoal headings.',
    swatch: '#111827',
    bodyFont: 'PT Sans',
    headingFont: 'Merriweather',
    bodyColor: '#1f2937',
    accentColor: '#111827',
  },
  {
    key: 'forest',
    label: 'Forest Green',
    blurb: 'PT Sans body, deep emerald accents. Subtle, modern.',
    swatch: '#065f46',
    bodyFont: 'PT Sans',
    headingFont: 'PT Sans',
    bodyColor: '#1f2937',
    accentColor: '#065f46',
  },
  {
    key: 'burgundy',
    label: 'Burgundy',
    blurb: 'PT Serif body and headings, deep wine accent.',
    swatch: '#7f1d1d',
    bodyFont: 'PT Serif',
    headingFont: 'PT Serif',
    bodyColor: '#1f2937',
    accentColor: '#7f1d1d',
  },
  {
    key: 'royal-navy',
    label: 'Royal Navy',
    blurb: 'Lato body, navy headings + accent. Conservative finance/exec.',
    swatch: '#1e3a8a',
    bodyFont: 'Lato',
    headingFont: 'Lato',
    bodyColor: '#1f2937',
    accentColor: '#1e3a8a',
  },
];

/** Apply a theme over an existing StyleConfig — preserves sizes, alignment,
 *  spacing, separators, sectionOrder, and the title's text label. Patches
 *  fontFamily + color in place per slot so the slot's extra fields (align,
 *  text, items, separator, indentPx, etc.) survive untouched. */
export function applyTheme(cfg: StyleConfig, theme: Theme): StyleConfig {
  return {
    ...cfg,
    basicInfo: {
      name: { ...cfg.basicInfo.name, fontFamily: theme.headingFont, color: theme.accentColor, fontWeight: 'bold' },
      title: { ...cfg.basicInfo.title, fontFamily: theme.bodyFont, color: theme.bodyColor },
      contact: { ...cfg.basicInfo.contact, fontFamily: theme.bodyFont, color: theme.bodyColor },
    },
    sectionHeading: { ...cfg.sectionHeading, fontFamily: theme.headingFont, color: theme.bodyColor, fontWeight: 'bold' },
    summary: { ...cfg.summary, fontFamily: theme.bodyFont, color: theme.bodyColor },
    experience: {
      ...cfg.experience,
      companyName: { ...cfg.experience.companyName, fontFamily: theme.headingFont, color: theme.accentColor, fontWeight: 'bold' },
      role: { ...cfg.experience.role, fontFamily: theme.bodyFont, color: theme.bodyColor },
      period: { ...cfg.experience.period, fontFamily: theme.bodyFont, color: theme.bodyColor },
      bullet: { ...cfg.experience.bullet, fontFamily: theme.bodyFont, color: theme.bodyColor },
    },
    skills: { ...cfg.skills, fontFamily: theme.bodyFont, color: theme.bodyColor },
    education: {
      ...cfg.education,
      university: { ...cfg.education.university, fontFamily: theme.headingFont, color: theme.accentColor, fontWeight: 'bold' },
      degree: { ...cfg.education.degree, fontFamily: theme.bodyFont, color: theme.bodyColor },
      period: { ...cfg.education.period, fontFamily: theme.bodyFont, color: theme.bodyColor },
    },
  };
}
