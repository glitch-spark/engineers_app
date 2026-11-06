import { getInterview, type InterviewResumeLink, type InterviewStageEntry } from '../api/endpoints';
import type { Interview } from '../components/interview/types';
import { CALLER_METHOD_OPTIONS } from '../components/interview/types';
import { formatInZone, parseServerTime, zoneAbbrev, zonedDateKey } from './interviewTimezone';
import { profileText } from './interviewPanelInfo';
import { interviewStatusLabel, stageLabel } from './stageBadge';

/** What a brief shows for one round, for the person taking the interview. Left out on purpose: who applied, the
 * caller's name, the company's interviewer and the interview's owner. Empty values are skipped. */
export interface InterviewBrief {
  company: string;
  stage: string;
  /** "Thu, Nov 6, 2026 · 2:00 – 3:00 PM EST", or '' with no date. */
  when: string;
  status: string;
  details: [string, string][];
  meeting: [string, string][];
  notes: string;
  previous: [string, string, string][];
  jobDescription: string;
  /** YYYY-MM-DD of the round in `tz`, for the file name. */
  day: string;
}

function roundWhen(r: InterviewStageEntry, tz: string): string {
  if (!r.scheduledAt) return '';
  const start = parseServerTime(r.scheduledAt);
  if (isNaN(start.getTime())) return '';
  const date = formatInZone(start, tz, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const time = (d: Date) => formatInZone(d, tz, { hour: 'numeric', minute: '2-digit' });
  const end = r.endsAt ? parseServerTime(r.endsAt) : null;
  const span = end && !isNaN(end.getTime()) ? `${time(start)} – ${time(end)}` : time(start);
  return `${date} · ${span} ${zoneAbbrev(start, tz)}`;
}

function shortDay(iso: string | null | undefined, tz: string): string {
  if (!iso) return '—';
  const d = parseServerTime(iso);
  return isNaN(d.getTime()) ? '—' : formatInZone(d, tz, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** The brief's content for `roundId` of `iv`, dates in `tz`. `jobDescription` comes from the full interview (list
 * rows leave it out). */
export function interviewBrief(iv: Interview, roundId: string, tz: string, jobDescription = ''): InterviewBrief {
  const rounds = iv.stageHistory ?? [];
  const idx = rounds.findIndex((r) => r.id === roundId);
  const round = rounds[idx] ?? rounds[rounds.length - 1];
  const profile = typeof iv.accountId === 'object' ? profileText(iv.accountId) : '';
  const caller = round?.caller?.enabled ? round.caller : null;
  const method = caller?.method ? CALLER_METHOD_OPTIONS.find((m) => m.value === caller.method)?.label ?? '' : '';
  const keep = (rows: [string, string][]) => rows.filter(([, v]) => v.trim());
  const start = round?.scheduledAt ? parseServerTime(round.scheduledAt) : null;
  return {
    company: iv.companyName?.trim() || 'Untitled company',
    stage: round ? stageLabel(round.stage) : '',
    when: round ? roundWhen(round, tz) : '',
    status: round?.status ? interviewStatusLabel(round.status) : '',
    details: keep([
      ['Position', iv.appliedPosition || ''],
      ['Tech stack', iv.mainTechStack || ''],
      ['Job post', iv.jobUrl || ''],
      ['Profile', profile],
    ]),
    meeting: keep([
      ['How', method],
      [/^https?:\/\//i.test(caller?.methodValue || '') ? 'Link' : 'Details', caller?.methodValue || ''],
    ]),
    notes: (round?.note || '').trim(),
    previous: rounds.slice(0, Math.max(idx, 0)).map((r) => [
      shortDay(r.scheduledAt, tz), stageLabel(r.stage), r.status ? interviewStatusLabel(r.status) : '—',
    ]),
    jobDescription: jobDescription.trim(),
    day: start && !isNaN(start.getTime()) ? zonedDateKey(start, tz) : '',
  };
}

/** `Brief - Acme - Tech round 1 - 2026-11-06.pdf`, safe on every OS. */
export function interviewBriefFilename(b: InterviewBrief): string {
  const clean = (s: string) => s.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
  return `${['Brief', clean(b.company), clean(b.stage), b.day].filter(Boolean).join(' - ')}.pdf`;
}

/** Builds the brief in the browser and saves it. jsPDF is loaded on demand, so it stays out of the main bundle. */
export async function downloadInterviewBrief(b: InterviewBrief): Promise<void> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 48;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const width = pageW - margin * 2;
  const bottom = pageH - 56;
  const endY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  let y = 56;

  const heading = (title: string) => {
    if (y > bottom - 60) { doc.addPage(); y = 56; }
    y += 22;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.text(title, margin, y);
    y += 8;
  };
  /** Key / value rows; links stay clickable. */
  const pairs = (rows: [string, string][]) => {
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin, bottom: 56 },
      body: rows,
      theme: 'plain',
      styles: { fontSize: 10, cellPadding: { top: 3, bottom: 3, left: 0, right: 8 }, overflow: 'linebreak' },
      columnStyles: { 0: { cellWidth: 90, textColor: 110 }, 1: { cellWidth: width - 90 } },
      didDrawCell: (h) => {
        const text = String(h.cell.raw ?? '');
        if (h.section === 'body' && h.column.index === 1 && /^https?:\/\//i.test(text)) {
          doc.link(h.cell.x, h.cell.y, h.cell.width, h.cell.height, { url: text });
        }
      },
    });
    y = endY();
  };
  /** Wrapped text that runs onto new pages. */
  const paragraph = (text: string) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(30);
    y += 8;
    for (const line of doc.splitTextToSize(text, width) as string[]) {
      if (y > bottom) { doc.addPage(); y = 56; }
      y += 13;
      doc.text(line, margin, y);
    }
  };

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(110);
  doc.text('Interview brief', margin, y);
  y += 24;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(0);
  for (const line of doc.splitTextToSize(b.company, width) as string[]) {
    doc.text(line, margin, y);
    y += 22;
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.setTextColor(40);
  doc.text([b.stage, b.status].filter(Boolean).join(' · '), margin, y);
  y += 16;
  if (b.when) {
    doc.setFont('helvetica', 'bold');
    doc.text(b.when, margin, y);
    y += 4;
  }

  if (b.details.length) { heading('Job'); pairs(b.details); }
  if (b.meeting.length) { heading('Meeting'); pairs(b.meeting); }
  if (b.notes) { heading('Notes'); paragraph(b.notes); }
  if (b.previous.length) {
    heading('Previous rounds');
    autoTable(doc, {
      startY: y + 4,
      margin: { left: margin, right: margin, bottom: 56 },
      head: [['Date', 'Round', 'Result']],
      body: b.previous,
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [39, 39, 42], textColor: 255, fontStyle: 'bold' },
    });
    y = endY();
  }
  if (b.jobDescription) { heading('Job description'); paragraph(b.jobDescription); }

  const pages = doc.getNumberOfPages();
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(120);
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.text([b.company, b.stage].filter(Boolean).join(' · '), margin, pageH - 28);
    doc.text(`Page ${i} of ${pages}`, pageW - margin, pageH - 28, { align: 'right' });
  }

  doc.save(interviewBriefFilename(b));
}

/** Downloads the brief for `roundId` and returns the interview's resume link (from the full interview when it could be
 * opened). The job description needs the full interview, which only its owner, admins and interview managers can
 * open: anyone else gets the brief without it. */
export async function saveInterviewBrief(iv: Interview, roundId: string, tz: string): Promise<InterviewResumeLink | null> {
  let full: { resumeLink?: InterviewResumeLink | null } | null = null;
  try {
    full = (await getInterview(iv._id)) as { resumeLink?: InterviewResumeLink | null };
  } catch {
    /* not allowed to open it: no job description */
  }
  await downloadInterviewBrief(interviewBrief(iv, roundId, tz, full?.resumeLink?.jobDescription || ''));
  return full?.resumeLink ?? iv.resumeLink ?? null;
}
