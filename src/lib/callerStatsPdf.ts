import type { CallerStatsCaller, CallerStatsRound } from '../api/endpoints';
import { stageLabel } from './stageBadge';

/** What the Callers tab shows for one caller (or All callers), ready to print. Rounds come in the tab's sort order. */
export interface CallerStatsExport {
  /** The caller's name, or 'All callers'. */
  name: string;
  /** All callers: the rounds tables get a Caller column and the summary one row per caller plus a total. */
  isAll: boolean;
  periodLabel: string;
  regionLabel: string;
  /** Summary rows: the one caller, or every caller. */
  callers: CallerStatsCaller[];
  /** All callers: the summed row. */
  total?: CallerStatsCaller;
  callerName: (r: CallerStatsRound) => string;
  period: CallerStatsRound[];
  outdated: CallerStatsRound[];
  scheduled: CallerStatsRound[];
}

const RESULT: Record<CallerStatsRound['result'], string> = {
  passed: 'Passed', rejected: 'Rejected', canceled: 'Canceled', awaiting: 'Awaiting result', scheduled: 'Scheduled',
};

type RGB = [number, number, number];
/** The Callers page's result badges (Tailwind 100 / 800 / 200): fill, text, border. Canceled is struck through. */
const BADGE: Record<CallerStatsRound['result'], { fill: RGB; text: RGB; border: RGB; strike?: boolean }> = {
  passed: { fill: [209, 250, 229], text: [6, 95, 70], border: [167, 243, 208] },
  rejected: { fill: [254, 226, 226], text: [153, 27, 27], border: [254, 202, 202] },
  canceled: { fill: [244, 244, 245], text: [113, 113, 122], border: [228, 228, 231], strike: true },
  awaiting: { fill: [244, 244, 245], text: [63, 63, 70], border: [228, 228, 231] },
  scheduled: { fill: [219, 234, 254], text: [30, 64, 175], border: [191, 219, 254] },
};

const pct = (r: number | null) => (r == null ? '–' : `${Math.round(r * 100)}%`);
const waited = (n: number | null) => `${n ?? 0} day${n === 1 ? '' : 's'}`;
const held = (c: CallerStatsCaller) => c.counts.passed + c.counts.rejected + c.counts.awaiting;

function day(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** `callers-<name>-<period>.pdf`, safe on every OS. */
export function callerStatsFilename(name: string, periodLabel: string): string {
  const slug = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase();
  return `callers-${slug(name) || 'caller'}-${slug(periodLabel) || 'period'}.pdf`;
}

/** Builds the PDF in the browser and saves it. jsPDF is loaded on demand, so it stays out of the main bundle. */
export async function exportCallerStatsPdf(x: CallerStatsExport): Promise<void> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const margin = 40;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const head = { fillColor: [39, 39, 42] as [number, number, number], textColor: 255, fontStyle: 'bold' as const };
  const base = { margin: { left: margin, right: margin, bottom: 50 }, styles: { fontSize: 9, cellPadding: 5 }, headStyles: head };
  const endY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(`Caller interview statistics · ${x.name}`, margin, 50);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(90);
  doc.text(`Period: ${x.periodLabel}   ·   Region: ${x.regionLabel}   ·   Generated: ${new Date().toLocaleString()}`, margin, 68);
  doc.text('Interviews = rounds held in the period (passed + rejected + awaiting). Pass rate = passed ÷ (passed + rejected).', margin, 82);
  doc.setTextColor(0);

  // Summary: one row per caller, plus the total with All callers.
  const summaryRow = (c: CallerStatsCaller) => [
    c.name, held(c), c.counts.canceled, c.counts.passed, c.counts.rejected, c.counts.awaiting, pct(c.passRate),
    c.counts.outdated, c.counts.scheduled,
  ];
  autoTable(doc, {
    ...base,
    startY: 96,
    head: [['Caller', 'Interviews', 'Canceled', 'Passed', 'Rejected', 'Awaiting', 'Pass rate', 'Outdated pending', 'Scheduled']],
    body: x.callers.map(summaryRow),
    foot: x.total ? [summaryRow(x.total)] : undefined,
    footStyles: { fillColor: [228, 228, 231], textColor: 0, fontStyle: 'bold' },
    showFoot: 'lastPage',
    // Numbers right-aligned, header and total included.
    didParseCell: (h) => { if (h.column.index > 0) h.cell.styles.halign = 'right'; },
  });

  const callerCol = x.isAll ? ['Caller'] : [];
  const callerCell = (r: CallerStatsRound) => (x.isAll ? [x.callerName(r)] : []);
  const common = (r: CallerStatsRound) => [day(r.roundDate), ...callerCell(r), r.company || 'Untitled company', stageLabel(r.stage)];

  /** `badges`: each row's last cell drawn as a colored pill, as on the Callers page. */
  const section = (
    title: string, note: string, columns: string[], rows: (string | number)[][], empty: string,
    badges?: (keyof typeof BADGE)[],
  ) => {
    let y = endY() + 28;
    if (y > pageH - 110) { doc.addPage(); y = 50; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(title, margin, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(90);
    doc.text(note, margin, y + 13);
    doc.setTextColor(0);
    autoTable(doc, {
      ...base,
      startY: y + 22,
      head: [columns],
      body: rows.length ? rows : [[{ content: empty, colSpan: columns.length, styles: { halign: 'center', textColor: 120 } }]],
      // The text stays in the cell for its width; the pill is drawn in its place.
      willDrawCell: (h) => {
        if (badges && rows.length && h.section === 'body' && h.column.index === columns.length - 1) h.cell.text = [];
      },
      didDrawCell: (h) => {
        if (!badges || !rows.length || h.section !== 'body' || h.column.index !== columns.length - 1) return;
        const b = BADGE[badges[h.row.index]];
        const label = String(rows[h.row.index][columns.length - 1]);
        doc.setFontSize(8);
        const w = doc.getTextWidth(label) + 12;
        const bh = 13;
        const bx = h.cell.x + 5;
        const by = h.cell.y + (h.cell.height - bh) / 2;
        doc.setFillColor(...b.fill);
        doc.setDrawColor(...b.border);
        doc.setLineWidth(0.6);
        doc.roundedRect(bx, by, w, bh, 3, 3, 'FD');
        doc.setTextColor(...b.text);
        doc.text(label, bx + 6, by + bh / 2, { baseline: 'middle' });
        if (b.strike) {
          doc.setDrawColor(...b.text);
          doc.line(bx + 6, by + bh / 2, bx + w - 6, by + bh / 2);
        }
        doc.setTextColor(0);
      },
    });
  };

  section(
    `Rounds held · ${x.period.length}`,
    'Caller rounds held in this period, with their result now.',
    ['Date', ...callerCol, 'Company', 'Round', 'Result'],
    x.period.map((r) => [...common(r), r.result === 'awaiting' ? `${RESULT.awaiting} · ${waited(r.daysWaiting)}` : RESULT[r.result]]),
    'No caller rounds held in this period.',
    x.period.map((r) => r.result),
  );
  section(
    `Outdated pending · ${x.outdated.length}`,
    'Held before this period and still awaiting the result.',
    ['Date', ...callerCol, 'Company', 'Round', 'Waiting'],
    x.outdated.map((r) => [...common(r), waited(r.daysWaiting)]),
    'No older rounds awaiting a result.',
  );
  section(
    `Scheduled · ${x.scheduled.length}`,
    'Not held yet.',
    ['Date', ...callerCol, 'Company', 'Round', 'Note'],
    x.scheduled.map((r) => [...common(r), r.stale ? 'Date passed, status not updated' : '']),
    'Nothing scheduled.',
  );

  // Page numbers last, once the page count is known.
  const pages = doc.getNumberOfPages();
  doc.setFontSize(8);
  doc.setTextColor(120);
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.text(`${x.name} · ${x.periodLabel}`, margin, pageH - 24);
    doc.text(`Page ${i} of ${pages}`, pageW - margin, pageH - 24, { align: 'right' });
  }

  doc.save(callerStatsFilename(x.name, x.periodLabel));
}
