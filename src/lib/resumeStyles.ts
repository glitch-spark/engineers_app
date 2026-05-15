/** Single source of truth for the resume styling shape.
 *  Both the structured-mode form (Phase D) and the local preview renderer
 *  (Phase E) consume this. Backend's style_serializer.py mirrors it. */

export type Align = 'left' | 'center' | 'right' | 'justify';
export type FontWeight = 'normal' | 'bold';
export type PageFormat = 'A3' | 'A4' | 'A5' | 'Letter';
export type StyleMode = 'markdown' | 'structured' | 'template';

export type Typography = {
  fontFamily: string;
  fontSize: number;
  fontWeight: FontWeight;
  color: string;
};

export type SectionKey = 'summary' | 'experience' | 'skills' | 'education';

export type ContactItemType =
  | 'email'
  | 'phone'
  | 'address'
  | 'github'
  | 'linkedin'
  | 'website'
  | 'twitter'
  | 'custom';

export type ContactItem = {
  type: ContactItemType;
  enabled: boolean;
  /** Only used when type === 'custom'. Resolved from styleConfig itself
   *  (not the account) so unique custom labels travel with the styling preset. */
  customLabel?: string;
  customUrl?: string;
};

export type StyleConfig = {
  page: {
    format: PageFormat;
    margin: { top: number; right: number; bottom: number; left: number };
  };
  sectionOrder: SectionKey[];
  sectionSpacing: { containerMb: number; headingMb: number; dividerMb: number };

  basicInfo: {
    name: Typography & { align: Align };
    title: Typography & { align: Align; text: string; autoFromJD?: boolean };
    contact: Typography & { align: Align; separator: string; items: ContactItem[] };
  };
  sectionHeading: Typography & { align: Align };
  summary: Typography & { align: Align; boldLabels: boolean };
  experience: {
    companyName: Typography;
    role: Typography;
    period: Typography & { format: 'YYYY/MM - YYYY/MM' | 'MMM YYYY - MMM YYYY' };
    separator: string;
    bullet: Typography & { align: Align; indentPx: number; boldKeywords: boolean };
  };
  skills: Typography & {
    align: Align;
    boldCategories: boolean;
    layout: 'one-per-line' | 'comma';
  };
  education: {
    university: Typography;
    degree: Typography;
    period: Typography & { format: 'YYYY - YYYY' | 'YYYY/MM - YYYY/MM' };
    separator: string;
  };
};

export const PAGE_FORMATS: PageFormat[] = ['A3', 'A4', 'A5', 'Letter'];
